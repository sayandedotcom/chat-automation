# Building an Autonomous AI Agent: A Deep Dive into the Architecture

> How I built a production AI agent that takes natural language requests, decomposes them into multi-step workflows, executes them across 10+ integrations via MCP, and handles human-in-the-loop approval for dangerous operations — all orchestrated by a LangGraph state machine powered by Gemini 2.5 Flash.

---

## What This Agent Does

You tell it _"research AI trends, create a Google Doc summary, and email it to my team"_ — and it does exactly that, autonomously. It classifies which integrations are needed (web search, Google Docs, Gmail), builds a structured execution plan, runs each step through the appropriate MCP tools, pauses for your approval before sending the email, and maintains cross-turn memory so you can follow up with _"now put that data in a spreadsheet"_ without re-explaining context.

---

## High-Level Architecture

```
User Request
     |
     v
+-----------------+     +-------------------+     +--------------------+
|  Smart Router   |---->|     Planner       |---->|  Executor Loop     |
|  (classify +    |     |  (structured LLM  |     |  (auto or HITL,    |
|   auth check)   |     |   decomposition)  |     |   multi-hop tools) |
+-----------------+     +-------------------+     +--------------------+
                                                         |
                                                         v
                                                  +-------------+
                                                  |    Done     |
                                                  +-------------+
```

Three pillars hold it up:

| Pillar             | Technology                   | Role                                                                   |
| ------------------ | ---------------------------- | ---------------------------------------------------------------------- |
| **Orchestration**  | LangGraph `StateGraph`       | Plan -> Route -> Execute -> Loop lifecycle                             |
| **Intelligence**   | Gemini 2.5 Flash             | Planning (structured output), execution (tool-calling), classification |
| **Tool Ecosystem** | Model Context Protocol (MCP) | 10+ integrations via standardized tool interfaces                      |

---

## The LangGraph State Machine

The entire agent is a compiled `StateGraph`. Here's the graph from the source code (`workflow/graph.py`):

```
        +----------+
        |  START   |
        +----+-----+
             |
             v
    +-----------------+
    |  SMART ROUTER   |  <-- Classify integrations, check auth
    +---------+-------+
              |
              v
    +-----------------+
    |     PLANNER     |  <-- LLM creates plan with HITL flags
    | (structured out)|
    +--------+--------+
             |
             v
    +--------------------+
    |   ROUTE_EXECUTOR   |  <-- Routes based on requires_human_approval
    +-------+------------+
            |
    +-------+--------------------------+
    |                                  |
    | approval=false                   | approval=true
    |                                  |
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
     | (no more tool calls)            |
     v                                 v
    +-------------------+
    |   STEP_COMPLETE   |  <-- Extract artifacts, advance index
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

### WorkflowState — The Single Source of Truth

Every node reads from and writes to a single `WorkflowState` TypedDict. Here's what lives in it and why:

```python
class WorkflowState(TypedDict):
    # --- Core message history ---
    messages: Annotated[list[BaseMessage], add_messages]  # LangGraph's built-in reducer

    # --- Planning ---
    plan: Optional[WorkflowPlan]        # The structured plan with steps
    current_step_index: int             # Which step we're executing (0-indexed)

    # --- Human-in-the-Loop ---
    awaiting_approval: bool             # True = graph paused for human decision
    approval_step_info: Optional[dict]  # Preview data sent to frontend
    approval_decision: Optional[dict]   # User's response: approve/edit/skip

    # --- Smart routing ---
    loaded_integrations: list[IntegrationInfo]  # What's active for this request
    executor_bound_tools: Optional[list[str]]   # Tool names bound to executor
    initial_integrations: Optional[list[str]]   # For tracking incremental loads

    # --- Cross-turn memory ---
    conversation_summary: Optional[str]           # Compressed prior turns
    artifacts: Annotated[list[dict], add_artifacts]  # Documents, emails, events created

    # --- Auth ---
    auth_required_integrations: Optional[list[dict]]  # Missing OAuth tokens
    connected_integrations: Optional[list[str]]       # What's already connected

    # --- Executor internals ---
    _executor_chat: Optional[list]       # Scoped conversation for current step
    _step_tool_calls: int                # Tool call counter (loop guard)
    _pending_tool_calls_message: Optional[dict]  # Serialized AIMessage for approval
```

**The engineering challenge:** LangGraph reducers are append-only by default for messages (`add_messages`). But artifacts need the same treatment — passing `artifacts=[]` in initial state would wipe accumulated artifacts from prior turns. I wrote a custom `add_artifacts` reducer to solve this:

```python
def add_artifacts(existing: list[dict], new: list[dict]) -> list[dict]:
    """Append-only reducer: never overwrites previous artifacts."""
    return (existing or []) + (new or [])
```

The graph compiles with a `MemorySaver` checkpointer — a module-level singleton shared across all `DynamicWorkflow` instances. This is critical because OAuth token refreshes create new `ChatService` instances for the same user, and checkpoint data must persist across them:

```python
_checkpointer = None  # Module-level singleton

def get_checkpointer():
    global _checkpointer
    if _checkpointer is not None:
        return _checkpointer
    _checkpointer = MemorySaver()
    return _checkpointer
```

---

## Smart Router — Integration Classification

### The Problem

The agent has 50+ MCP tools across 10 integrations. Feeding all of them into every LLM call wastes tokens and confuses the model. When you say _"send an email"_, the model doesn't need the 17 Google Drive tools or the 23 Notion API tools.

### The Solution

Before the planner even sees the request, the smart router classifies which integrations are needed and binds only those tools. This is the single biggest architectural decision for production quality — it cuts token cost and dramatically improves tool-calling accuracy.

**Classification uses Gemini Flash** (`classifier.py`). The classifier is a module-level singleton that builds an index from the YAML config at startup, then uses a single LLM call to classify:

```python
async def _llm_classify(self, request: str) -> Optional[ClassificationResult]:
    integration_list = "\n".join(
        f"- {name}: {idx.description}" for name, idx in self._indexes.items()
    )

    prompt = (
        "Classify which integrations are needed for this user request.\n\n"
        f"Available integrations:\n{integration_list}\n\n"
        f'User request: "{request}"\n\n'
        "Respond with ONLY a JSON array of integration names. "
        'Example: ["gmail", "google_docs"]\n'
        "Select the minimum set needed."
    )

    response = await self._llm.ainvoke([HumanMessage(content=prompt)])
    integrations = json.loads(response.content.strip())

    # Validate against known integrations
    valid = [i for i in integrations if i in self._indexes]
    return ClassificationResult(integrations=valid, method="llm", confidence=0.9)
```

If LLM classification fails entirely, it falls back to `web_search` — a safe default that ensures the user always gets something.

### Artifact-Aware Injection

Here's a subtlety that took real debugging to get right: what happens when a user says _"email that document"_ in turn 2, after creating a Google Doc in turn 1? The classifier sees "email" and loads Gmail — but the executor needs the Google Docs integration loaded too to resolve the artifact reference.

The `inject_artifact_integrations` function in `smart_router.py` handles this:

```python
def inject_artifact_integrations(integrations, state, user_request, registry):
    artifacts = state.get("artifacts", [])
    if not artifacts:
        return integrations

    request_lower = user_request.lower()

    # Detect continuation patterns
    is_continuation = bool(re.search(
        r"\b(similar|same|copy|duplicate|replicate|like\s+(?:that|the|this)|"
        r"based\s+on|from\s+(?:the\s+)?(?:previous|earlier|last|above))\b",
        request_lower,
    ))

    artifact_integrations = {a.get("integration") for a in artifacts if a.get("integration")}
    for name in artifact_integrations:
        if name in integrations:
            continue

        if is_continuation:
            integrations.append(name)  # Auto-include on continuation
            continue

        # Check identity keywords and artifact name references
        referenced = False
        idx = classifier._indexes.get(name)
        if idx and any(ik in request_lower for ik in idx.identity_keywords):
            referenced = True
        # ...also checks artifact names in the request
```

It detects two patterns: explicit continuation ("based on the previous document") and identity keyword references ("the google doc"). Either triggers auto-inclusion.

### Auth Pre-Flight Check

After classification, but before wasting any LLM calls on planning, the router checks whether the user has connected the required OAuth integrations:

```python
# From smart_router.py
connected_set = set(state.get("connected_integrations") or [])

unauthenticated = []
for name in integrations:
    config = registry.get_integration_config(name)
    if not (config and config.requires_auth and config.mcp_server):
        continue
    connect_id = name.replace("_", "-")
    if connect_id not in connected_set:
        unauthenticated.append({
            "mcp_server": config.mcp_server,
            "display_name": config.display_name,
            "icon": config.icon,
            "connect_id": connect_id,
        })

if unauthenticated:
    return {"auth_required_integrations": unauthenticated, ...}
```

If auth is missing, the graph short-circuits to `END` with auth requirements — the frontend shows a connect button instead of running a doomed workflow. This saves the user from watching a plan execute only to fail at the tool-calling stage.

---

## The Planner — LLM-Driven Structured Decomposition

### The Problem

The user says: _"Research competitors, create a summary doc, and share it with the team."_ The agent needs to decompose this into ordered atomic steps, each annotated with whether it's dangerous (needs approval) or safe (auto-execute).

### The Solution

The planner uses Gemini 2.5 Flash with `with_structured_output()` — Pydantic schema enforcement that guarantees valid JSON output matching the schema:

```python
# From llm.py
base = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=GOOGLE_API_KEY)
_planner_llm = base.with_structured_output(WorkflowPlanOutput)
```

The output schema from `schemas.py`:

```python
class PlannedStep(BaseModel):
    description: str                    # "Search for competitor analysis reports"
    requires_human_approval: bool       # False — read-only
    approval_reason: str                # "This is a search operation with no side effects"

class WorkflowPlanOutput(BaseModel):
    thinking: str                       # Chain-of-thought reasoning
    steps: list[PlannedStep]            # Ordered execution steps
```

### HITL Classification Rules

The planner's system prompt encodes explicit rules for what needs approval:

| Requires Approval                | Does NOT Require Approval   |
| -------------------------------- | --------------------------- |
| Creating documents, pages, files | Searching or researching    |
| Sending emails or messages       | Reading documents or emails |
| Updating or deleting content     | Listing or fetching data    |
| Publishing or sharing            | Analyzing or summarizing    |

The key insight: **the LLM decides at planning time which steps are dangerous, not at execution time.** This means routing is instant — just a boolean lookup — and the user sees the full plan with approval markers before any execution begins.

### Context Injection

The planner doesn't operate in a vacuum. It receives four types of context, all injected into the system prompt:

```python
system_prompt = PLANNER_SYSTEM_PROMPT.format(
    conversation_context=conversation_summary,     # Prior turns with [SUCCESS]/[FAILED] markers
    integration_context=format_integration_context(integrations),  # "AVAILABLE INTEGRATIONS: gmail, web_search"
    artifacts_context=format_artifacts_context(artifacts),         # Prior documents/emails/events
    integration_hints=registry.get_hints(integrations, "planner"),  # Per-integration instructions
)
```

### Artifact Resolution

The planner is explicitly instructed to resolve vague references:

```
ARTIFACT RESOLUTION: When the user refers to "it", "that", "the document",
"send it", "mail this", etc.:
- Check AVAILABLE ARTIFACTS above and embed the exact URL/ID directly
  into step descriptions.
- If the most recent turn FAILED, look at EARLIER successful turns for the artifact.
```

So when the user says _"send it via email"_ and a Google Doc was created in a prior turn, the planner's step description will read: _"Send email with Google Doc 'AI Trends Report' (https://docs.google.com/d/1abc.../edit) to the team"_ — with the actual URL embedded, not a vague reference.

---

## Routing — Pure Functions, Zero LLM Calls

All routing functions in `routing.py` are pure, stateless, and instant. The LLM already made the hard decisions during planning — routing just reads the plan.

```python
MAX_TOOL_CALLS_PER_STEP = 10

def route_to_executor(state) -> Literal["executor", "executor_with_approval", "end"]:
    """The LLM decided during planning. This is just a dict lookup."""
    plan = state.get("plan")
    current_index = state.get("current_step_index", 0)
    if not plan or current_index >= len(plan.steps):
        return "end"
    if plan.steps[current_index].requires_human_approval:
        return "executor_with_approval"
    return "executor"

def should_continue(state) -> Literal["tools", "step_complete", "end"]:
    """Tool calls present? Go to tools. Awaiting approval? Exit. Otherwise, step done."""
    if state.get("awaiting_approval"):
        return "end"
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        if state.get("_step_tool_calls", 0) >= MAX_TOOL_CALLS_PER_STEP:
            return "step_complete"  # Safety: prevent infinite tool loops
        return "tools"
    return "step_complete"

def route_after_tools(state) -> Literal["executor", "executor_with_approval"]:
    """After tools run, route BACK to the correct executor (multi-hop)."""
    plan = state.get("plan")
    current_index = state.get("current_step_index", 0)
    if plan and plan.steps[current_index].requires_human_approval:
        return "executor_with_approval"
    return "executor"

def should_execute_next_step(state) -> Literal["executor", "executor_with_approval", "end"]:
    """After step complete: more steps? Loop. Otherwise, end."""
    plan = state.get("plan")
    current_index = state.get("current_step_index", 0)
    if not plan or plan.is_complete or current_index >= len(plan.steps):
        return "end"
    if plan.steps[current_index].requires_human_approval:
        return "executor_with_approval"
    return "executor"
```

The `MAX_TOOL_CALLS_PER_STEP = 10` safety cap prevents a runaway LLM from looping forever. Without it, a confused model could generate tool calls indefinitely, burning tokens and time.

---

## Executor (Auto) — Multi-Hop Tool Calling

### The Problem

A single "step" often requires multiple tool calls. Creating a formatted spreadsheet means: `create_spreadsheet` -> `modify_sheet_values` -> `format_sheet_range`. The executor needs to chain these automatically while keeping its conversation isolated from the main message history.

### Scoped Conversations

Each step gets its own `_executor_chat` — a separate message list that the executor LLM uses for multi-hop reasoning. This prevents tool results from one step from leaking into another:

```python
async def start_step_execution(step, plan, previous_results, ...):
    system_prompt = EXECUTOR_SYSTEM_PROMPT.format(
        current_step=step.description,
        step_number=step.step_number,
        total_steps=len(plan.steps),
        previous_results=previous_results,
        conversation_context=conversation_summary,
        integration_context=format_integration_context(initial_integrations),
        artifacts_context=format_artifacts_context(artifacts or []),
        integration_hints=registry.get_hints(initial_integrations, "executor"),
    )

    executor_chat = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"Execute step {step.step_number}: {step.description}"),
    ]
    response = await executor_with_tools.ainvoke(executor_chat)
    executor_chat.append(response)
    return response, executor_chat
```

### Multi-Hop Continuation

When the LLM generates tool calls, the graph routes through `tools` -> `route_after_tools` -> back to `executor`. The executor sees the tool results and decides: need more calls, or done?

```python
async def continue_after_tools(state, executor_with_tools):
    """Continue the scoped conversation after tool results come back."""
    executor_chat = list(state["_executor_chat"])

    # Collect new ToolMessages from the main history
    new_tool_msgs = []
    for msg in reversed(state["messages"]):
        if isinstance(msg, ToolMessage):
            new_tool_msgs.insert(0, msg)
        else:
            break

    executor_chat.extend(new_tool_msgs)
    response = await executor_with_tools.ainvoke(executor_chat)
    executor_chat.append(response)

    return {
        "messages": [response],
        "_executor_chat": executor_chat,
        "_step_tool_calls": state.get("_step_tool_calls", 0) + len(new_tool_msgs),
    }
```

### Incremental Tool Loading

Sometimes the classifier misses an integration. The user says _"create a doc and add a table"_ — the classifier loads Google Docs, but the executor tries to call a tool from Google Sheets. Instead of failing, the executor catches the tool-not-found error and dynamically loads the missing integration:

```python
async def try_incremental_load(exc, state, ..., registry, tools, executor_llm, ...):
    error_msg = str(exc).lower()
    if not ("tool" in error_msg and ("not found" in error_msg or "unknown" in error_msg)):
        raise exc

    missing_tool = extract_tool_name_from_error(str(exc))
    missing_integration = registry.get_integration_for_tool(missing_tool)

    # Load the missing integration's tools
    new_tools_for_integration = registry.get_toolset([missing_integration])
    updated_tools = list(tools) + list(new_tools_for_integration)
    new_executor_with_tools = executor_llm.bind_tools(updated_tools)

    # Retry the step with the expanded toolset
    response, executor_chat = await start_step_execution_fn(...)
    return response, executor_chat, ...
```

This means the classifier doesn't need to be perfect — incremental loading acts as a safety net. The user never sees the error; they just see the step succeed.

---

## Executor with Approval — State-Based Human-in-the-Loop

This is the most architecturally interesting part of the system. Most LangGraph tutorials use `interrupt()` for HITL. I chose a state-based approach instead, and here's why.

### Three-Phase Lifecycle

```
Phase 1: PREVIEW (request_approval)
  +-- Run LLM to generate tool_calls
  +-- Serialize the AIMessage (tool names, args)
  +-- Extract structured preview for the frontend
  +-- Set awaiting_approval = True
  +-- Graph exits cleanly (checkpoint saved)

Phase 2: USER DECISION (external — frontend)
  +-- Frontend renders approval UI with editable fields
  +-- User picks: Approve / Edit / Skip

Phase 3: RESUME (handle_approval_decision)
  +-- approval_decision injected via graph.aupdate_state()
  +-- "approve" -> replay the serialized AIMessage (tool calls execute)
  +-- "edit"    -> apply user's edits to args, then replay
  +-- "skip"    -> mark step skipped, advance
```

### Phase 1: Generating the Preview

The key trick: run the LLM to generate tool calls, but don't execute them yet. Instead, serialize the AIMessage and extract a structured preview:

```python
async def request_approval(state, plan, current_step, ...):
    current_step.status = "awaiting_approval"

    # Run the LLM — it generates tool calls but they won't execute
    response, executor_chat = await start_step_execution_fn(
        current_step, plan, previous_results, ...
    )

    tool_calls_preview = []
    if hasattr(response, "tool_calls") and response.tool_calls:
        for tc in response.tool_calls:
            tool_calls_preview.append({
                "id": tc.get("id", ""),
                "tool_name": tc.get("name", ""),
                "integration": resolve_tool_integration_fn(tc.get("name", "")),
                "arguments": tc.get("args", {}),
            })

        # Serialize the AIMessage for later replay
        from langchain_core.messages import message_to_dict
        pending_message = message_to_dict(response)

    return {
        "awaiting_approval": True,
        "approval_step_info": {
            "type": "approval_required",
            "step_number": current_step.step_number,
            "description": current_step.description,
            "reason": current_step.approval_reason,
            "actions": ["approve", "edit", "skip"],
            "tool_calls": tool_calls_preview,
        },
        "_pending_tool_calls_message": pending_message,
    }
```

For spreadsheet creation, there's an extra enrichment step — a lightweight LLM call generates sheet/column structure for the preview:

```python
if tc_preview["tool_name"] == "create_spreadsheet":
    args = tc_preview.get("arguments", {})
    if not (args.get("sheets") or args.get("headers")):
        structure = await generate_spreadsheet_structure_fn(current_step, previous_results)
        # Returns: {"title": "Q4 Data", "sheets": [{"name": "Revenue", "columns": [...]}]}
```

### Phase 3: Handling the Decision

When the user approves (with or without edits), the serialized AIMessage is deserialized and replayed. For edits, user-modified arguments are merged:

```python
async def handle_approval_decision(state, plan, current_step, approval_decision, ...):
    action = approval_decision.get("action", "approve")

    if action == "skip":
        current_step.status = "skipped"
        return {"awaiting_approval": False, "approval_decision": None, ...}

    pending_msg_data = state.get("_pending_tool_calls_message")
    if pending_msg_data:
        ai_message = messages_from_dict([pending_msg_data])[0]
        if action == "edit":
            ai_message = apply_edited_args_fn(ai_message, approval_decision.get("content", {}))

        return {
            "messages": [ai_message],  # Replays the tool calls
            "awaiting_approval": False,
            "approval_decision": None,
            "_pending_tool_calls_message": None,
        }
```

The `apply_edited_args` function merges edits into tool call arguments:

```python
def apply_edited_args(ai_message: AIMessage, edited_content: dict) -> AIMessage:
    edits_by_id = {tc["id"]: tc["arguments"] for tc in edited_content.get("tool_calls", [])}

    new_tool_calls = []
    for tc in ai_message.tool_calls:
        new_tc = dict(tc)
        if edited := edits_by_id.get(tc.get("id")):
            new_tc["args"] = {**tc.get("args", {}), **edited}
        new_tool_calls.append(new_tc)

    return AIMessage(content=ai_message.content, tool_calls=new_tool_calls, id=ai_message.id)
```

### Why State-Based Over interrupt()

LangGraph provides `interrupt()` for HITL flows. I deliberately chose a state-based approach because:

1. **Rich previews**: `interrupt()` pauses mid-execution. With state-based HITL, the graph exits cleanly, and the full tool-call preview (with structured arguments) is available for the frontend to render as an editable form.
2. **Edit support**: Users can modify email recipients, document titles, or spreadsheet data before approving. `interrupt()` doesn't naturally support argument editing.
3. **Clean checkpointing**: The graph state is fully serialized at the approval point. Resuming means injecting `approval_decision` via `aupdate_state()` and re-entering the graph — no dangling coroutines or half-executed nodes.
4. **Frontend independence**: The graph doesn't know or care how long the user takes to decide. It exited cleanly. The frontend can take its time rendering the approval UI.

---

## MCP Tool Ecosystem

### IntegrationRegistry — Config-Driven Tool Management

The `IntegrationRegistry` is the bridge between YAML configuration and runtime MCP tools. At startup, it:

1. Loads `integration_config.yaml`
2. Creates MCP clients for each server
3. Loads all tools from all servers
4. Indexes tools by integration using explicit `tool_names` from config

```python
class IntegrationRegistry:
    def __init__(self):
        self._integrations: dict[str, IntegrationConfig] = {}       # YAML config
        self._tools_by_integration: dict[str, list[BaseTool]] = {}  # Runtime tools
        self._tool_to_integration: dict[str, str] = {}              # Reverse lookup

    async def load_all(self, tokens: dict):
        self._load_config()  # Parse YAML, build classifier index
        client = create_mcp_client(**tokens)
        self._all_tools = await load_mcp_tools(client)

        # Index tools by integration
        for tool in self._all_tools:
            integration_name = self._tool_name_to_integration.get(tool.name)
            if integration_name:
                self._tools_by_integration[integration_name].append(tool)
                self._tool_to_integration[tool.name] = integration_name

    def get_toolset(self, integrations: list[str]) -> list[BaseTool]:
        """Instant filtered tool retrieval — no LLM call."""
        tools = []
        for integration in integrations:
            tools.extend(self._tools_by_integration.get(integration, []))
        return tools if tools else self._all_tools  # Fallback
```

### The YAML Config

Each integration is defined declaratively. Here's a representative entry:

```yaml
gmail:
  tool_names:
    - "search_gmail_messages"
    - "send_gmail_message"
    - "draft_gmail_message"
    # ... 12 more tools
  display_name: "Gmail"
  icon: "gmail"
  requires_auth: true
  mcp_server: "google_workspace"
  description: "Email operations via Gmail: sending, drafting, reading, searching..."
  identity_keywords: ["gmail", "email", "mail"]
  planner_hints: |
    GMAIL: When user says "mail/send/email this", check AVAILABLE ARTIFACTS for the
    most recent document or content. Embed its URL and title into the step description.
  executor_hints: |
    GMAIL: Use artifact title as email subject if user did not specify one. Include
    artifact URL in the email body. NEVER ask for the user's email address.
```

### Dynamic Hints Injection

Different stages of the pipeline need different instructions. The planner needs to know _what_ to plan; the executor needs to know _how_ to execute. The registry injects stage-specific hints:

```python
def get_hints(self, integrations: list[str], hint_type: str = "planner") -> str:
    parts = []
    for name in integrations:
        config = self._integrations.get(name)
        hint = config.planner_hints if hint_type == "planner" else config.executor_hints
        if hint and hint.strip():
            parts.append(hint.strip())
    return "INTEGRATION-SPECIFIC GUIDELINES:\n" + "\n\n".join(parts) + "\n"
```

### Zero-Code Integration Addition

Adding a new integration requires no Python code changes. You add a YAML entry with `tool_names`, `mcp_server`, keywords, and hints. The registry picks it up at startup, the classifier indexes it, the smart router can classify it, and the executor can use its tools.

### Supported Integrations

| Integration     | Tools | Capabilities                                      |
| --------------- | ----- | ------------------------------------------------- |
| Gmail           | 15    | Send, draft, search, read, label, filter emails   |
| Google Docs     | 18    | Create, edit, comment, export, format documents   |
| Google Sheets   | 11    | Create, read, write, format spreadsheets          |
| Google Slides   | 9     | Create, edit, comment on presentations            |
| Google Calendar | 6     | Create, modify, delete events, check availability |
| Google Drive    | 17    | Search, manage, share, permission files           |
| Notion          | 21    | Create pages, manage databases, search workspace  |
| Vercel          | 12    | Deploy, manage domains, view build logs           |
| Web Search      | 5     | Search, extract, crawl, research web content      |

---

## Artifact System — Cross-Turn Memory

### The Problem

Multi-turn conversations need memory. When the user says _"now email that to the team"_ in turn 3, the agent needs to know "that" refers to the Google Doc created in turn 1. LLM context windows aren't enough — message histories get truncated, tool call results are verbose, and resource IDs are long alphanumeric strings easily corrupted during copying.

### Two-Phase Artifact Extraction

After every step completes, `extract_artifacts_from_step()` in `artifacts.py` runs a two-phase extraction:

**Phase 1a: Structured JSON with unique ID fields**

Each integration has specific ID fields (`documentId` for Docs, `spreadsheetId` for Sheets) that match unambiguously:

```python
_INTEGRATION_EXTRACTORS = {
    "google_docs": {
        "id_fields": ["documentId"],  # Unique — matches without ambiguity
        "url_fields": [],
        "type": "document",
    },
    "google_sheets": {
        "id_fields": ["spreadsheetId"],
        "url_fields": ["spreadsheetUrl"],
        "type": "spreadsheet",
    },
    "gmail": {
        "id_fields": ["messageId", "id"],
        "url_fields": [],
        "type": "email",
    },
    # ... more integrations
}
```

The extraction algorithm does two passes:

- **Pass 1**: Check unique ID fields (e.g., `documentId`). These match exactly one integration.
- **Pass 2**: For generic `id` fields, require a confirming URL field (e.g., `htmlLink`, `webViewLink`) to disambiguate.

```python
# Pass 1: unique id fields
for ext_name, ext_config in _INTEGRATION_EXTRACTORS.items():
    for id_field in ext_config["id_fields"]:
        if id_field == "id":
            continue  # Skip generic — handled in pass 2
        artifact_id = _find_field_recursive(data, id_field)
        if artifact_id:
            result = _build_artifact_from_match(ext_name, ext_config, data, ...)

# Pass 2: generic "id" + confirming URL
generic_id = _find_field_recursive(data, "id")
if generic_id:
    for ext_name, ext_config in _INTEGRATION_EXTRACTORS.items():
        if ext_config["url_fields"]:
            if any(_find_field_recursive(data, uf) for uf in ext_config["url_fields"]):
                result = _build_artifact_from_match(...)
```

**Phase 1b: Regex extraction from plain text**

Some MCP servers return plain text instead of JSON. The extractor falls back to URL pattern matching:

```python
# Phase 1b: regex on raw text
for ext_name, ext_config in _INTEGRATION_EXTRACTORS.items():
    url_pattern = ext_config.get("url_pattern")
    if url_pattern:
        url_match = re.search(url_pattern, raw_text)
        if url_match:
            artifact_id = url_match.group(1)
            # Build artifact from matched URL
```

**Phase 2: URL regex on AIMessage (last resort)**

If nothing was extracted from tool messages, scan the LLM's response text for URLs and classify them by domain:

```python
_DOMAIN_TO_TYPE = {
    "docs.google.com/document": "document",
    "docs.google.com/spreadsheets": "spreadsheet",
    "notion.so": "page",
    # ...
}

# Phase 2: last resort
if not artifacts:
    for msg in messages:
        if isinstance(msg, AIMessage):
            for url in re.findall(r"https?://[^\s\)\"\'>\]]+", content):
                artifact_type = _classify_url_type(url)
                if artifact_type:
                    artifacts.append(Artifact(type=artifact_type, url=url, ...))
```

### Conversation Summary Builder

The `build_conversation_summary()` function in `context.py` compresses prior turns into a structured format:

```python
def build_conversation_summary(messages, artifacts=None):
    # Find turn boundaries (HumanMessage entries)
    human_indices = [i for i, msg in enumerate(messages) if isinstance(msg, HumanMessage)]

    for turn_idx in range(len(human_indices) - 1):
        # Extract user request and final result for this turn
        user_msg = messages[start_idx].content

        # Determine success/failure
        success = "FAILED" if any(kw in turn_result.lower()
                                   for kw in ["can't", "cannot", "failed"]) else "SUCCESS"

        summary = f"Turn {turn_number} [{success}]:\n  User request: {user_msg}\n  Outcome: {turn_result}"

        # Attach artifacts created in this turn
        turn_artifacts = artifacts_by_turn.get(turn_number, [])
        if turn_artifacts:
            summary += "\n  ARTIFACTS CREATED:"
            for a in turn_artifacts:
                summary += f'\n    - [{a["type"]}] "{a["name"]}"'
                summary += f"\n      URL: {a['url']}" if a.get("url") else ""
                summary += f"\n      ID: {a['id']}" if a.get("id") else ""
```

This produces output like:

```
PREVIOUS CONVERSATION:
Turn 1 [SUCCESS]:
  User request: Research AI competitors
  Outcome: Workflow Complete! Found 12 competitor profiles...
  ARTIFACTS CREATED:
    - [document] "Competitor Analysis"
      URL: https://docs.google.com/document/d/1abc.../edit
      ID: 1abc...
      Integration: google_docs
```

The `[SUCCESS]`/`[FAILED]` markers are critical — when the user says _"send that"_ and the most recent turn failed, the planner knows to look at earlier turns for the artifact.

### Artifact Context in Prompts

Both the planner and executor receive the full artifact list:

```python
def format_artifacts_context(artifacts: list[dict]) -> str:
    lines = ["AVAILABLE ARTIFACTS (from previous steps/turns -- use exact URLs and IDs):"]
    for a in artifacts:
        lines.append(f'  - [{a["type"]}] "{a["name"]}" (step {a["step_number"]}, turn {a["turn_number"]})')
        if a.get("url"):
            lines.append(f"    URL: {a['url']}")
        if a.get("id"):
            lines.append(f"    ID: {a['id']}")
    return "\n".join(lines)
```

The executor prompt explicitly instructs: _"NEVER manually copy document IDs or URLs from text. ALWAYS use the exact ID from AVAILABLE ARTIFACTS."_ This prevents the LLM from hallucinating or corrupting long alphanumeric IDs.

---

## State Management & Checkpointing

The `MemorySaver` singleton is shared across all workflow instances within the process. Thread-based persistence means multi-turn conversations maintain full state:

```python
# Graph compiled with checkpointer
self.app = workflow.compile(checkpointer=self.checkpointer)

# Each invocation uses a thread_id for persistence
config = {"configurable": {"thread_id": thread_id}}
async for event in self.app.astream(initial_state, config):
    ...

# Resuming after approval: inject decision into existing state
await self.app.aupdate_state(config, {"approval_decision": decision})
async for event in self.app.astream(None, config):  # None = continue from checkpoint
    ...
```

The `WorkflowState` is the single source of truth. Every node receives it, reads what it needs, and returns a partial update. LangGraph's reducer system handles merging — `add_messages` for conversation history, `add_artifacts` for accumulated artifacts.

---

## Key Design Decisions

### 1. LLM-Driven HITL Classification

Rule-based systems (e.g., "all Gmail tools need approval") are too coarse. _Searching_ emails is safe; _sending_ emails is dangerous. The planner LLM understands intent and classifies each step individually.

### 2. State-Based HITL Over interrupt()

The graph exits cleanly at approval points. The frontend renders rich, editable previews. Users can modify tool arguments before execution. Resuming is a clean state injection, not a coroutine resume.

### 3. Singleton LLM Instances

Three singletons — planner, executor, classifier — initialized lazily, reused across all requests. No cold-start per request.

```python
_planner_llm = None
def get_planner_llm():
    global _planner_llm
    if _planner_llm is None:
        base = ChatGoogleGenerativeAI(model="gemini-2.5-flash")
        _planner_llm = base.with_structured_output(WorkflowPlanOutput)
    return _planner_llm
```

### 4. Config-Driven Integration Management

Adding a new integration = adding a YAML entry. Zero Python code changes. The registry, classifier, and hint system all derive from the same config file.

### 5. Multi-Hop Tool Calling with Safety Bounds

The executor chains multiple tool calls per step (search -> read -> create), but `MAX_TOOL_CALLS_PER_STEP = 10` prevents runaway loops. The scoped `_executor_chat` keeps step conversations isolated.

### 6. Scoped Executor Conversations

Each step gets its own conversation (`_executor_chat`) separate from the main `messages` history. This prevents tool result bleed between steps and keeps executor context focused.

### 7. Artifact-Aware Smart Routing

The classifier doesn't need to be perfect. Continuation detection and identity keyword matching auto-include integrations from prior turns, and incremental loading catches anything the classifier missed at runtime.

---

_Built with [LangGraph](https://github.com/langchain-ai/langgraph), [Gemini 2.5 Flash](https://deepmind.google/technologies/gemini/), and [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)._
