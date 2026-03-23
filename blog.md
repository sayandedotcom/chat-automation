# Building an Autonomous AI Agent: Architecture & Design Decisions

> How I designed an AI agent that takes natural language requests, decomposes them into multi-step workflows, executes them across integrations via MCP, and gives humans control over every write operation -- all orchestrated as a LangGraph state machine.

---

## Table of Contents

1. [What This Agent Does](#what-this-agent-does)
2. [The Core Idea: Plan-Route-Execute-Loop](#the-core-idea-plan-route-execute-loop)
3. [The State Machine](#the-state-machine)
4. [Node 1: Smart Router](#node-1-smart-router)
5. [Node 2: Planner](#node-2-planner)
6. [The Routing Layer](#the-routing-layer)
7. [Node 3: Executor (Auto)](#node-3-executor-auto)
8. [Node 4: Executor with Approval (HITL)](#node-4-executor-with-approval-hitl)
9. [Node 5: Step Complete](#node-5-step-complete)
10. [The Integration Layer: MCP + YAML Config](#the-integration-layer-mcp--yaml-config)
11. [Design Decisions & Tradeoffs](#design-decisions--tradeoffs)

---

## What This Agent Does

You tell it _"research AI trends, create a Google Doc summary, and email it to my team"_ and it does exactly that. It figures out which integrations are needed, builds a structured execution plan, runs each step through the appropriate MCP tools, and pauses for your approval before any write operation.

---

## The Core Idea: Plan-Route-Execute-Loop

The agent follows a four-phase lifecycle for every request:

```
  PLAN          ROUTE           EXECUTE              LOOP
    |              |                |                   |
    v              v                v                   v
 Decompose    Route each      Run tools via        Advance to
 request      step to auto    multi-hop LLM        next step
 into steps   or approval     tool calling         or finish
              executor
```

**Plan:** An LLM decomposes the user's request into ordered, atomic steps. Each step is annotated with whether it's safe (auto-execute) or dangerous (needs human approval).

**Route:** A pure function reads the plan and routes to the right executor. No LLM call -- the routing decision was already made during planning.

**Execute:** The executor runs the current step. It can call tools, inspect results, and decide if more calls are needed (multi-hop). For approval steps, the graph pauses, the user reviews, and execution resumes with their decision.

**Loop:** After a step completes, the graph checks if there are more steps. If yes, route the next one. If all steps are done, end.

This architecture means the LLM does the hard thinking once (during planning), and the runtime is a tight, deterministic loop.

---

## The State Machine

The entire agent is a compiled LangGraph `StateGraph`. Every node reads from and writes to a shared `WorkflowState`, a typed dictionary that carries everything through the graph.

```
        +----------+
        |  START   |
        +----+-----+
             |
             v
    +-----------------+
    |  SMART ROUTER   |  <-- Classify integrations, check auth, bind tools
    +---------+-------+
              |
              v
    +-----------------+
    |     PLANNER     |  <-- LLM decomposes request into steps + HITL flags
    | (structured out)|
    +--------+--------+
             |
             v
    +--------------------+
    |   ROUTE_EXECUTOR   |  <-- Pure function: reads requires_human_approval
    +-------+------------+
            |
    +-------+--------------------------+
    |                                  |
    | approval=false                   | approval=true
    v                                  v
+----------+                +------------------------+
| EXECUTOR |<---+           | EXECUTOR_WITH_APPROVAL |<---+
| (auto)   |    |           | (state-based HITL)     |    |
+----+-----+    |           +-----------+------------+    |
     |          |                       |                 |
     | should_  |                       | should_         |
     | continue |                       | continue        |
     v          |                       v                 |
+--------+     |                  +--------+              |
| TOOLS  |-----+                  | TOOLS  |--------------+
+--------+ route_after_tools      +--------+ route_after_tools
     |                                 |
     v                                 v
    +-------------------+
    |   STEP_COMPLETE   |  <-- Extract results, advance step index
    +---------+---------+
              |
    +---------v-----------+
    | should_execute_next |
    +---------+-----------+
              |
      +-------+-------+
      |               |
  route_executor     end
      |               |
      v               v
    (loop)         +-----+
                   | END |
                   +-----+
```

### The State

The `WorkflowState` is the single source of truth. Key fields:

- **`messages`** -- Full message history. Uses LangGraph's `add_messages` reducer (append-only).
- **`plan`** -- The structured plan with step statuses, results, and HITL flags.
- **`current_step_index`** -- Which step the executor is working on.
- **`awaiting_approval` / `approval_step_info` / `approval_decision`** -- The three state fields that implement Human-in-the-Loop without using `interrupt()`.
- **`loaded_integrations` / `initial_integrations`** -- What the smart router classified and loaded.
- **`executor_bound_tools` / `total_tool_count`** -- Tool names bound to the executor, set by the smart router after dynamic binding.
- **`_executor_chat`** -- The executor's scoped conversation for the current step, isolated from the main message history.
- **`_step_tool_calls`** -- Counter that prevents infinite tool-call loops (capped at 10).
- **`_pending_tool_calls_message`** -- Serialized `AIMessage` with tool calls, stored before approval so it can be replayed after the user decides.

---

## Node 1: Smart Router

### Problem

The agent supports 80+ MCP tools across 9 integrations. Feeding all of them into every LLM call wastes tokens and confuses the model -- tool-calling accuracy drops when the LLM has to choose among dozens of irrelevant options.

### Solution

Before the planner runs, the smart router classifies which integrations are needed and binds **only those tools** to the executor LLM.

**How it works:**

1. **Classify** -- An LLM classifier (`temperature=0`, structured output) takes the user request and the list of available integrations, and returns the minimum set needed.

2. **Auth pre-flight check** -- Before wasting LLM calls on planning, verify the user has auth tokens for every required integration. If not, exit the graph immediately -- the frontend shows a connect button.

3. **Bind tools** -- Filter the full tool registry to just the classified integrations, bind them to the executor LLM, and create a fresh `ToolNode`. This is request-level scoping; **per-step scoping** narrows the toolset even further at execution time.

**Why this matters:** Without it, every request would dump 80+ tool schemas into the context window. With it, a "send an email" request gets 5-8 tools, not the full set. Token cost drops, accuracy improves, and latency decreases.

**The safety net:** If the classifier under-classifies and the executor tries to call a tool from an unloaded integration, the executor catches the tool-not-found error, loads the missing integration on-the-fly, rebinds the LLM, and retries. The user never sees the error.

---

## Node 2: Planner

### Problem

The user says: _"Research competitors, create a summary doc, and share it with the team."_ The agent needs to decompose this into ordered atomic steps, each annotated with whether it's dangerous (needs approval) or safe (auto-execute).

### Solution

The planner uses `with_structured_output(WorkflowPlanOutput)` -- Pydantic schema enforcement that guarantees valid output:

```python
class PlannedStep(BaseModel):
    description: str                 # "Search for competitor analysis reports"
    requires_human_approval: bool    # False -- read-only operation
    approval_reason: str             # "Search is a read-only operation"
    integrations: list[str]          # ["web_search"] -- per-step tool scoping

class WorkflowPlanOutput(BaseModel):
    thinking: str                    # Chain-of-thought reasoning
    steps: list[PlannedStep]         # Ordered execution steps
```

The `integrations` field enables **per-step tool scoping**. The planner annotates each step with exactly which integrations it needs. At execution time, the executor binds only those tools to the LLM. A three-step plan that uses web search, Google Docs, and Gmail means each executor call sees only 5-10 tools instead of 20-30.

### HITL Classification

The planner's system prompt encodes explicit rules:

| Requires Approval                | Does NOT Require Approval   |
| -------------------------------- | --------------------------- |
| Creating documents, pages, files | Searching or researching    |
| Sending emails or messages       | Reading documents or emails |
| Updating or deleting content     | Listing or fetching data    |
| Publishing or sharing            | Analyzing or summarizing    |

The key insight: **the LLM classifies danger at planning time, not execution time.** This means routing is instant -- just a boolean lookup -- and the user sees the full plan with approval markers before any step executes.

---

## The Routing Layer

All routing is handled by pure functions. No LLM calls, no async, no side effects -- just conditional branches reading the plan:

- **`route_after_smart_router`** -- Routes to `planner` if auth passed, or `end` if auth is missing.
- **`route_to_executor`** -- Reads `requires_human_approval` on the current step. Routes to auto executor or approval executor.
- **`should_continue`** -- After an executor runs: has tool calls? Go to tools. Awaiting approval? Exit graph. Otherwise, step complete. Also enforces `MAX_TOOL_CALLS_PER_STEP = 10` to prevent runaway loops.
- **`route_after_tools`** -- After tools execute, route back to the correct executor for multi-hop continuation.
- **`should_execute_next_step`** -- More steps in the plan? Route to the next one. All done? End.

**The planner did all the hard thinking.** Routing is O(1) -- read a boolean, return a string.

---

## Node 3: Executor (Auto)

### Problem

A single "step" often requires multiple tool calls. _"Create a formatted spreadsheet with Q4 data"_ might need: `create_spreadsheet` -> `write_values` -> `format_range`. The executor needs to chain these while keeping its conversation isolated from other steps.

### Solution: Scoped Conversations + Multi-Hop

Each step gets its own `_executor_chat` -- a separate conversation with a system prompt scoped to the step's integrations. A Gmail step doesn't see Google Sheets hints.

The executor invokes the LLM, which generates tool calls. The graph routes to the `tools` node, executes them, then sends results **back to the executor**. The executor reasons about results and either generates more tool calls or finishes. This loop continues until the LLM produces a final text response or the safety cap of 10 tool calls is hit.

**Step isolation** is critical: the executor for step 3 doesn't see step 1's raw tool results (which could be thousands of tokens). It only sees a structured summary of prior steps' outcomes.

### Incremental Tool Loading

Sometimes the classifier misses an integration. The executor catches tool-not-found errors, identifies the missing tool via regex, looks up which integration owns it via a reverse index, loads that integration's tools, rebinds the LLM, and retries.

### Tool-Call Argument Truncation

Multi-hop steps create a token problem: every subsequent LLM call re-sends prior tool-call arguments verbatim. A single `create_page` call can have 17K+ characters of JSON in its `args` -- and that payload repeats on every follow-up call, causing exponential token growth.

The fix: before each LLM call, oversized tool-call args are capped at 2,000 characters. This only affects the executor's conversation -- `state["messages"]` keeps the full data for downstream extraction.

---

## Node 4: Executor with Approval (HITL)

Most LangGraph tutorials use `interrupt()` for HITL. I chose a **state-based approach** instead.

### Three-Phase Lifecycle

**Phase 1: PREVIEW** -- The executor runs the LLM to generate tool calls but **doesn't execute the dangerous ones.** Instead, it extracts a structured preview (tool names, arguments), serializes the `AIMessage`, sets `awaiting_approval = True`, and the graph exits cleanly.

**Phase 2: USER DECISION** -- The frontend renders the approval preview as an editable form. The user can approve, edit arguments, or skip the step.

**Phase 3: RESUME** -- The user's decision is injected into state via `graph.aupdate_state()`. The graph re-enters the node and:

- **Approve**: deserializes the pending `AIMessage` -- the `tools` node executes the calls
- **Edit**: deserializes the message, merges user-edited arguments, then executes
- **Skip**: marks the step skipped and advances

The key technique: **the AIMessage is serialized before approval and deserialized on resume.** The ToolNode executes the exact (or edited) tool calls without re-running the LLM.

### Why State-Based Over `interrupt()`

1. **Rich previews** -- `interrupt()` pauses mid-node. State-based HITL exits the graph cleanly, making structured preview data available for the frontend.
2. **Edit support** -- Users can modify tool arguments before execution. With `interrupt()`, there's no natural mechanism to inject edits.
3. **Clean checkpointing** -- The graph state is fully serialized at the approval point. No dangling coroutines.
4. **Frontend independence** -- The graph doesn't know how long the user takes to decide. It exited cleanly.

---

## Node 5: Step Complete

After an executor finishes, the graph routes to `step_complete`. This node:

1. **Scopes messages to the current step** -- walks backward from the end of the message history until it hits a step boundary. This prevents cross-step bleed.
2. **Marks the current step as completed** -- stores the executor's final text as `result` (for the frontend) and builds a separate `executor_context` (enriched with tool outputs) for cross-step context passing.
3. **Summarizes large tool outputs** -- tool outputs exceeding 3000 characters get an LLM summarization pass. URLs and identifiers are extracted first and appended verbatim to prevent corruption.
4. **Advances `current_step_index`** and resets executor state so the next step starts fresh.

---

## The Integration Layer: MCP + YAML Config

### Config-Driven Architecture

Every integration is defined declaratively in YAML:

```yaml
gmail:
  tool_names:
    ["search_gmail_messages", "send_gmail_message", "draft_gmail_message", ...]
  display_name: "Gmail"
  requires_auth: true
  mcp_server: "google_workspace"
  description: "Email operations via Gmail..."
  identity_keywords: ["gmail", "email", "mail"]
  planner_hints: |
    For email steps, plan a single send_gmail_message call.
  executor_hints: |
    NEVER ask for the user's email address.
```

### The IntegrationRegistry

At startup, the registry parses the YAML, creates MCP clients, loads tools, indexes them by integration, and builds a reverse index (tool name -> integration) for incremental loading.

At runtime, `get_toolset(["gmail", "web_search"])` returns only those integrations' tools -- instant filtering, no LLM call.

### Dynamic Hints

The planner needs to know **what** to plan. The executor needs to know **how** to execute. The YAML config separates `planner_hints` from `executor_hints`, and the registry injects the right ones at the right stage.

### Zero-Code Integration Addition

Adding a new integration requires no code changes. Add a YAML entry with `tool_names`, `mcp_server`, keywords, and hints. The registry picks it up at startup, the classifier indexes it, the smart router can classify it, and the executor can use its tools.

---

## Design Decisions & Tradeoffs

### 1. LLM-Driven HITL Classification (not rule-based)

A rule-based approach ("all Gmail tools need approval") is too coarse. _Searching_ emails is safe; _sending_ them is dangerous. The planner LLM classifies each step based on intent, not tool name.

### 2. State-Based HITL (not `interrupt()`)

The graph exits cleanly at approval points. The frontend gets structured preview data, users can edit arguments, and resuming is a clean state injection. More state fields to manage, but complete frontend independence.

### 3. Structured Output Everywhere

The planner, classifier, and their outputs all use `with_structured_output()` with Pydantic schemas. No regex parsing, no "```json" stripping.

### 4. Scoped Executor Conversations

Each step's executor gets its own isolated conversation. Step 3's executor doesn't see step 1's raw tool results -- only a structured summary. Better focus and token efficiency.

### 5. Config-Driven Integration Management

Integration knowledge lives in YAML, not code. Adding an integration = adding a config entry.

### 6. Two-Level Tool Scoping: Request + Step

The smart router narrows to request-relevant integrations. The planner's per-step `integrations` annotation narrows further to step-relevant tools. A "research + create doc + email" request means each executor call sees only 5-10 tools instead of 80+.

### 7. Multi-Hop with Safety Bounds

The executor can chain tool calls within a step, but `MAX_TOOL_CALLS_PER_STEP = 10` prevents runaway loops. In practice, no legitimate step needs more than 5-6 calls.

### 8. Thinking Where It Matters, Speed Where It Doesn't

The planner uses a thinking model for complex decomposition. The executor, classifier, and summarizer use non-thinking models -- they don't benefit from deep reasoning. This split keeps latency and cost low without sacrificing planning quality.

---

_Built with [LangGraph](https://github.com/langchain-ai/langgraph) and [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)._
