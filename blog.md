# Building an Autonomous AI Agent: Architecture & Design Decisions

> How I designed and built an AI agent that takes natural language requests, decomposes them into multi-step workflows, executes them across 10+ integrations via MCP, and gives humans fine-grained control over every write operation, all orchestrated as a LangGraph state machine.

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
11. [Cross-Turn Memory: The Artifact System](#cross-turn-memory-the-artifact-system)
12. [Design Decisions & Tradeoffs](#design-decisions--tradeoffs)

---

## What This Agent Does

You tell it _"research AI trends, create a Google Doc summary, and email it to my team"_ and it does exactly that. It figures out which integrations are needed (web search, Google Docs, Gmail), builds a structured execution plan, runs each step through the appropriate MCP tools, pauses for your approval before sending the email, and maintains cross-turn memory so you can follow up with _"now put that data in a spreadsheet"_ without re-explaining context.

The system supports Gmail, Google Docs, Sheets, Slides, Calendar, Drive, Notion, Vercel, and web search, all pluggable via a YAML config.

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
    |   STEP_COMPLETE   |  <-- Extract artifacts, advance step index
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

The `WorkflowState` is the single source of truth. Key fields and why they exist:

- **`messages`** -- Full LangChain message history. Uses LangGraph's `add_messages` reducer (append-only).
- **`plan`** -- The structured plan with step statuses, results, and HITL flags.
- **`current_step_index`** -- Which step the executor is working on (0-indexed).
- **`awaiting_approval` / `approval_step_info` / `approval_decision`** -- The three state fields that implement Human-in-the-Loop without using `interrupt()`.
- **`loaded_integrations` / `initial_integrations`** -- What the smart router classified and loaded.
- **`executor_bound_tools` / `total_tool_count`** -- Tool names bound to the executor and the total count, set by the smart router after dynamic binding.
- **`connected_integrations`** -- Per-request list of the user's authenticated integration IDs, used for pre-flight auth checks.
- **`artifacts`** -- Cross-turn memory. Documents, emails, events created by prior steps/turns. Uses a custom `add_artifacts` reducer so passing `artifacts=[]` in initial state never wipes accumulated data.
- **`_executor_chat`** -- The executor's scoped conversation for the current step, isolated from the main message history.
- **`_step_tool_calls`** -- Counter that prevents infinite tool-call loops (capped at 10).
- **`_pending_tool_calls_message`** -- Serialized `AIMessage` with tool calls, stored before approval so it can be replayed (with or without edits) after the user decides.
- **`incremental_load_events`** -- Queue for notifying the frontend when integrations are loaded on-the-fly during execution.

---

## Node 1: Smart Router

### Problem

The agent supports 80+ MCP tools across 9 integrations. Feeding all of them into every LLM call wastes tokens and confuses the model -- tool-calling accuracy drops when the LLM has to choose among dozens of irrelevant options.

### Solution

Before the planner runs, the smart router classifies which integrations are needed and binds **only those tools** to the executor LLM.

**How it works:**

1. **Classify** -- An LLM classifier (Gemini 2.5 Flash, `temperature=0`, structured output) takes the user request and the list of available integrations, and returns the minimum set needed. The classifier uses `with_structured_output(ClassifierOutput)` -- no manual JSON parsing, no edge cases around markdown code fences.

2. **Inject artifact integrations** -- If the user says _"email that document"_ and a Google Doc was created last turn, the classifier might only pick Gmail. The smart router detects continuation patterns ("based on the previous...", "send that...") and auto-includes integrations from prior artifacts.

3. **Auth pre-flight check** -- Before wasting LLM calls on planning, verify the user has OAuth tokens for every required integration. If not, return `auth_required_integrations` and exit the graph immediately -- the frontend shows a connect button.

4. **Bind tools** -- Filter the full tool registry to just the classified integrations, bind them to the executor LLM, and create a fresh `ToolNode`. The bound tool names and count are stored in `executor_bound_tools` and `total_tool_count` for observability.

**Why this matters:** This is the single biggest decision for production quality. Without it, every request would dump 80+ tool schemas into the context window. With it, a "send an email" request gets 5-8 Gmail tools, not the full set. Token cost drops, accuracy improves, and latency decreases.

**The safety net:** If the classifier under-classifies and the executor tries to call a tool from an unloaded integration, the executor catches the tool-not-found error, loads the missing integration on-the-fly, rebinds the executor LLM, and retries. The frontend is notified via `incremental_load_events`. The user never sees the error.

---

## Node 2: Planner

### Problem

The user says: _"Research competitors, create a summary doc, and share it with the team."_ The agent needs to decompose this into ordered atomic steps, each annotated with whether it's dangerous (needs approval) or safe (auto-execute).

### Solution

The planner uses Gemini 2.5 Flash with `with_structured_output(WorkflowPlanOutput)` -- Pydantic schema enforcement that guarantees valid output:

```python
class PlannedStep(BaseModel):
    description: str                 # "Search for competitor analysis reports"
    requires_human_approval: bool    # False -- read-only operation
    approval_reason: str             # "Search is a read-only operation"

class WorkflowPlanOutput(BaseModel):
    thinking: str                    # Chain-of-thought reasoning
    steps: list[PlannedStep]         # Ordered execution steps
```

### HITL Classification

The planner's system prompt encodes explicit rules:

| Requires Approval                | Does NOT Require Approval   |
| -------------------------------- | --------------------------- |
| Creating documents, pages, files | Searching or researching    |
| Sending emails or messages       | Reading documents or emails |
| Updating or deleting content     | Listing or fetching data    |
| Publishing or sharing            | Analyzing or summarizing    |

The key insight: **the LLM classifies danger at planning time, not execution time.** This means routing is instant -- just a boolean lookup -- and the user sees the full plan with approval markers before any step executes.

### Context Injection

The planner doesn't work in a vacuum. Four context blocks are injected into its system prompt:

1. **Conversation summary** -- compressed prior turns with `[SUCCESS]`/`[FAILED]` markers
2. **Integration context** -- "AVAILABLE INTEGRATIONS: gmail, web_search" with a constraint to only use listed integrations
3. **Artifacts context** -- structured list of every document, email, and event from prior steps/turns, with exact URLs and IDs
4. **Integration hints** -- per-integration planning guidance from the YAML config (e.g., "For calendar events, always plan to call create_event directly -- the frontend shows an editable form")

### Artifact Resolution

When the user says _"send it"_, the planner resolves the pronoun. Its prompt instructs: check AVAILABLE ARTIFACTS, embed the exact URL/ID into the step description, and if the most recent turn failed, look at earlier successful turns. The result is a step like: _"Send email with Google Doc 'AI Trends' (https://docs.google.com/d/1abc.../edit) to the team"_ -- concrete, not vague.

---

## The Routing Layer

All routing is handled by pure functions in `routing.py`. No LLM calls, no async, no side effects -- just conditional branches reading the plan:

- **`route_after_smart_router`** -- Routes to `planner` if auth passed, or `end` if auth is required and missing.
- **`route_to_executor`** -- Reads `requires_human_approval` on the current step. Routes to auto executor or approval executor.
- **`should_continue`** -- After an executor runs: has tool calls? Go to tools. Awaiting approval? Exit graph. Otherwise, step complete. Also enforces `MAX_TOOL_CALLS_PER_STEP = 10` to prevent runaway loops.
- **`route_after_tools`** -- After tools execute, route back to the correct executor (auto or approval) for multi-hop continuation.
- **`should_execute_next_step`** -- After step complete: more steps in the plan? Route to the next step's executor. All done? End.

The elegance: **the planner did all the hard thinking.** Routing is O(1) -- read a boolean, return a string.

---

## Node 3: Executor (Auto)

### Problem

A single "step" often requires multiple tool calls. _"Create a formatted spreadsheet with Q4 data"_ might need: `create_spreadsheet` -> `write_values` -> `format_range`. The executor needs to chain these while keeping its conversation isolated from other steps.

### Solution: Scoped Conversations + Multi-Hop + Streaming

Each step gets its own `_executor_chat` -- a separate conversation with a system prompt tailored to this specific step, including its description, previous step results, available artifacts, and integration-specific executor hints.

The executor invokes the LLM via `_astream_collect()`, which streams tokens through LangGraph for real-time display on the frontend. The LLM generates tool calls, the graph routes to the `tools` node, which executes them. Then `route_after_tools` sends the results **back to the executor**. The executor sees the tool results, reasons about them, and either generates more tool calls or finishes. This loop continues until the LLM produces a final text response (no more tool calls) or the safety cap of 10 tool calls per step is hit.

**Step isolation** is critical: the executor for step 3 doesn't see step 1's raw tool results (which could be thousands of tokens of search results). It only sees a structured summary of prior steps' outcomes and their artifacts, injected via `get_previous_results()`.

**Thinking capture:** When the LLM generates both reasoning text and tool calls in the same response, the executor extracts and stores the reasoning as `thinking` on the step, along with `thinking_duration_ms`. The frontend can display this reasoning chain to give users visibility into the agent's decision-making.

### Incremental Tool Loading

Sometimes the classifier misses an integration. The executor catches tool-not-found errors, identifies the missing tool via regex, looks up which integration owns it via the registry's reverse index, loads that integration's tools, rebinds the executor LLM, and retries the step. The user never sees the error.

---

## Node 4: Executor with Approval (HITL)

This is the most architecturally interesting part of the agent. Most LangGraph tutorials use `interrupt()` for HITL. I chose a **state-based approach** instead.

### Pre-Execution of Preparatory Tools

Before showing the approval preview, the approval executor runs a **pre-execution loop**. Many approval steps require preparatory work (searching for data, reading a document) before the main action (sending an email, creating a doc). The executor distinguishes between these using `ui_components` from the YAML config: tools mapped to a UI component (like `send_gmail_message` -> `email_composer`) are user-facing actions; tools without a mapping are preparatory.

The pre-execution loop runs up to 3 rounds of non-UI tool calls automatically. When it encounters a tool call that has a UI component, it stops and presents that call for approval. If the entire step completes during pre-execution (all tools were preparatory), it skips approval entirely and routes to step complete.

### Three-Phase Lifecycle

**Phase 1: PREVIEW** -- The executor runs the LLM to generate tool calls (after any pre-execution), but **doesn't execute the UI-facing ones.** Instead, it:

- Extracts a structured preview (tool names, integration names, arguments -- like email recipients, document titles, spreadsheet data)
- Serializes the `AIMessage` with its `tool_calls` into a dict (for checkpoint-safe storage)
- Sets `awaiting_approval = True` and populates `approval_step_info` with the preview data
- The graph routes to `END` via `should_continue` -- a clean exit, no suspended coroutines

**Phase 2: USER DECISION** -- The frontend renders the approval preview as an editable form. The `ui_component` field on the step tells the frontend which editor to show (email composer, document editor, spreadsheet structure, calendar event form, Notion page editor). The user can:

- **Approve** -- execute as-is
- **Edit** -- modify arguments (change email body, fix a title, add spreadsheet columns)
- **Skip** -- skip this step entirely

**Phase 3: RESUME** -- The user's decision is injected into state via `graph.aupdate_state()`. The graph re-enters the `executor_with_approval` node, which:

- **Approve**: deserializes the pending `AIMessage` and returns it as-is -- the `tools` node executes the calls
- **Edit**: deserializes the message, merges user-edited arguments into each tool call, then returns it
- **Skip**: marks the step skipped and advances

The key technique: **the AIMessage is serialized before approval and deserialized on resume.** This means the ToolNode executes the exact (or edited) tool calls without re-running the LLM. The user gets deterministic execution of what they reviewed.

### Why State-Based Over `interrupt()`

1. **Rich previews** -- `interrupt()` pauses mid-node. State-based HITL exits the graph cleanly, making the full tool-call preview available for the frontend to render as an editable form (email composer, document editor, spreadsheet structure).
2. **Edit support** -- Users can modify tool arguments before execution. With `interrupt()`, there's no natural mechanism to inject edits.
3. **Clean checkpointing** -- The graph state is fully serialized at the approval point. No dangling coroutines, no half-executed nodes.
4. **Frontend independence** -- The graph doesn't know how long the user takes to decide. It exited cleanly. The frontend takes its time.

---

## Node 5: Step Complete

After an executor finishes (its LLM response has no more tool calls), the graph routes to `step_complete`. This node:

1. **Scopes messages to the current step** -- walks backward from the end of the message history until it hits a step boundary (transition marker, plan-created marker, or HumanMessage). This prevents cross-step and cross-turn bleed.
2. **Marks the current step as completed** -- stores the executor's final text as `result` (clean response for the frontend) and builds a separate `executor_context` (enriched with tool outputs) for cross-step context passing.
3. **Summarizes large tool outputs** -- if a summarizer LLM is available and tool outputs exceed 3000 characters, the node runs an LLM summarization pass. URLs and email addresses are extracted first and appended verbatim after the summary to prevent the LLM from corrupting them. Small outputs are passed through unchanged.
4. **Extracts structured artifacts** -- scans tool message responses for document URLs, email IDs, spreadsheet IDs, event links. Uses domain-based type inference (`docs.google.com/document` -> document) and integration-specific field matching.
5. **Extracts structured results** -- parses Tavily tool messages into `SearchResultItem` objects (title, URL, domain, favicon) and Gmail tool messages into `EmailResultItem` objects (sender, subject, snippet, date). These are stored on the step for the frontend to render as rich cards.
6. **Resolves UI component** -- looks up the last tool used in the step against the YAML `ui_components` mapping and sets `ui_component` on the step so the frontend knows which result renderer to use.
7. **Records `tools_used`** -- collects all tool names from ToolMessages in this step's scope.
8. **Advances `current_step_index`** -- moves to the next step.
9. **Resets executor state** -- clears `_executor_chat` and `_step_tool_calls` so the next step starts fresh.

The artifacts extracted here persist across turns (via the `add_artifacts` reducer) and are injected into future planner/executor prompts -- enabling the multi-turn memory that makes _"now send that document"_ work.

---

## The Integration Layer: MCP + YAML Config

### Config-Driven Architecture

Every integration is defined declaratively in `integration_config.yaml`. A representative entry:

```yaml
gmail:
  tool_names:
    ["search_gmail_messages", "send_gmail_message", "draft_gmail_message", ...]
  display_name: "Gmail"
  icon: "gmail"
  requires_auth: true
  mcp_server: "google_workspace"
  description: "Email operations via Gmail..."
  identity_keywords: ["gmail", "email", "mail"]
  ui_components:
    send_gmail_message: "email_composer"
    draft_gmail_message: "email_composer"
  planner_hints: |
    When user says "mail this", check AVAILABLE ARTIFACTS for the most recent document.
  executor_hints: |
    Use artifact title as email subject if user did not specify one.
    NEVER ask for the user's email address.
```

### The IntegrationRegistry

At startup, the registry:

1. Parses the YAML config
2. Creates MCP clients for each server
3. Loads all tools from all servers
4. Indexes tools by integration using the explicit `tool_names` mapping
5. Builds a reverse index (tool name -> integration name) for incremental loading
6. Feeds identity keywords into the classifier's index

At runtime, `get_toolset(["gmail", "web_search"])` returns only those integrations' tools -- instant filtering, no LLM call. `get_ui_component_for_tool("send_gmail_message")` returns `"email_composer"` -- used by both the approval executor (to resolve which editor to show) and step_complete (to tag the step's result renderer).

### Dynamic Hints

Different pipeline stages need different instructions. The planner needs to know **what** to plan ("when user says 'mail this', embed the artifact URL in the step description"). The executor needs to know **how** to execute ("Google Docs text must be plain text, no markdown"). The YAML config separates `planner_hints` from `executor_hints`, and the registry injects the right ones at the right stage.

### Zero-Code Integration Addition

Adding a new integration requires no Python changes. Add a YAML entry with `tool_names`, `mcp_server`, keywords, hints, and `ui_components`. The registry picks it up at startup, the classifier indexes it, the smart router can classify it, and the executor can use its tools. This was a deliberate architectural choice -- integration knowledge lives in config, not in code.

### Supported Integrations

| Integration         | Capabilities                                      |
| ------------------- | ------------------------------------------------- |
| Gmail               | Send, draft, search, read, label, filter emails   |
| Google Docs         | Create, edit, format, comment, export documents   |
| Google Sheets       | Create, read, write, format, comment spreadsheets |
| Google Slides       | Create, edit, comment presentations               |
| Google Calendar     | Create, list, update, delete events               |
| Google Drive        | Search, share, manage, permission files           |
| Notion              | Create pages, search, manage databases            |
| Vercel              | Deploy apps, manage projects, view build logs     |
| Web Search (Tavily) | Search, extract, crawl, research web content      |

---

## Cross-Turn Memory: The Artifact System

### Problem

Multi-turn conversations need memory. When the user says _"now email that to the team"_ in turn 3, the agent needs to know "that" refers to the Google Doc created in turn 1.

### Solution: Structured Artifact Extraction

After every step, the `step_complete` node runs artifact extraction -- a two-phase process that scans tool responses:

**Phase 1: Domain-based type inference** -- URLs found in tool responses are classified by domain (`docs.google.com/document` -> document, `sheets.google.com` -> spreadsheet, `notion.so` -> page). Integration-specific ID fields (`documentId`, `spreadsheetId`, `messageId`) are matched against tool response JSON.

**Phase 2: Regex fallback** -- If structured matching finds nothing, regex patterns extract URLs from raw tool response text.

Extracted artifacts are stored as structured dicts with type, name, URL, ID, integration, step number, and turn number. They accumulate across turns via the `add_artifacts` reducer (append-only, never overwrites).

### Conversation Summary

For multi-turn context, a summary builder compresses prior turns into a structured format injected into planner/executor prompts:

```
PREVIOUS CONVERSATION:
Turn 1 [SUCCESS]:
  User request: Research AI competitors
  Outcome: Found 12 competitor profiles...
  ARTIFACTS CREATED:
    - [document] "Competitor Analysis"
      URL: https://docs.google.com/document/d/1abc.../edit
      ID: 1abc...
      Integration: google_docs
```

The `[SUCCESS]`/`[FAILED]` markers are critical -- when the user says _"send that"_ and the most recent turn failed, the planner knows to look at earlier turns for the artifact.

---

## Design Decisions & Tradeoffs

### 1. LLM-Driven HITL Classification (not rule-based)

A rule-based approach ("all Gmail tools need approval") is too coarse. _Searching_ emails is safe; _sending_ them is dangerous -- even though both use Gmail tools. The planner LLM classifies each step individually based on intent, not tool name. This is more flexible but means the agent's safety depends on prompt quality.

### 2. State-Based HITL (not `interrupt()`)

LangGraph's `interrupt()` pauses execution mid-node. I chose state-based HITL -- the graph exits cleanly, the frontend gets structured preview data, users can edit tool arguments, and resuming is a clean state injection. The tradeoff: more state fields to manage, but complete frontend independence.

### 3. Structured Output Everywhere

The planner, classifier, and their outputs all use `with_structured_output()` with Pydantic schemas. This eliminates malformed JSON bugs and makes downstream code type-safe. No regex parsing of LLM responses, no "```json" stripping.

### 4. Scoped Executor Conversations

Each step's executor gets its own conversation (`_executor_chat`), isolated from the main message history. Step 3's executor doesn't see step 1's raw tool results (which could be thousands of tokens). It only sees a structured summary of prior results and their artifacts. Tradeoff: slightly more complex state management, but dramatically better executor focus and token efficiency.

### 5. Config-Driven Integration Management

Integration knowledge lives in YAML, not Python. Adding an integration = adding a config entry. The registry, classifier, and hint system all derive from the same file. This keeps integration-specific logic out of the core agent code.

### 6. Smart Routing as a First-Class Node

Most agent architectures load all tools upfront. Putting classification before planning means: fewer tokens per LLM call, better tool-calling accuracy, and early auth failure detection (before wasting planning LLM calls). The tradeoff: an extra LLM call per request for classification. Worth it.

### 7. Multi-Hop with Safety Bounds

The executor can chain tool calls within a step (search -> read -> create), but `MAX_TOOL_CALLS_PER_STEP = 10` prevents runaway loops. This is a pragmatic cap -- in practice, no legitimate step needs more than 5-6 calls. The cap exists purely as a safety net against LLM confusion.

### 8. Artifact-Aware Smart Routing

The classifier doesn't need to be perfect. Continuation detection auto-includes integrations from prior artifacts, and incremental loading catches anything the classifier missed at runtime. The system is self-healing for classification errors.

### 9. Pre-Execution for Smoother Approvals

The approval executor auto-runs preparatory tools (searches, reads) before pausing for the main action. This means the user sees a fully populated approval form (email with content from a prior search, spreadsheet with fetched data) rather than being asked to approve a tool call that still needs inputs from earlier tools. The tradeoff: slightly more complex approval flow, but a much better user experience.

### 10. Dual-Layer Step Results

Each step stores two versions of its output: `result` (clean AI text for the frontend) and `executor_context` (enriched with tool outputs and optional LLM summarization for cross-step context). This prevents the frontend from showing raw tool JSON while still giving subsequent executors rich context. Large tool outputs (>3000 chars) are summarized by a dedicated Gemini Flash call with URL/email extraction to prevent identifier corruption.

---

_Built with [LangGraph](https://github.com/langchain-ai/langgraph), [Gemini 2.5 Flash](https://deepmind.google/technologies/gemini/), and [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)._
