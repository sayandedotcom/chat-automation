# How I Reduced Token Cost While Building With Many MCPs

My agent connects to 9 MCP servers -- Gmail, Google Docs, Sheets, Slides, Calendar, Drive, Notion, Vercel, and web search. That's 80+ tools. Every tool schema gets serialized into the LLM's context window on every call. Naively binding all of them meant burning tokens on tool definitions the model would never use, and worse, the model got confused picking from 80 options when it only needed 3.

Here's how I fixed it at three levels.

---

## The Problem: 80 Tool Schemas in Every LLM Call

Each MCP tool has a name, description, and a JSON schema for its parameters. Multiply that by 80+ tools, and you're looking at thousands of tokens of tool definitions injected into every single LLM call -- even when the user just wants to send an email (5 tools).

The LLM pays for those tokens twice: once reading them, once reasoning over which to pick. Accuracy drops as the tool count rises.

---

## Level 1: Request-Level Scoping (Smart Router)

Before the planner runs, a classifier identifies which integrations the request needs.

User says _"research AI trends and email a summary to my team"_ -- the classifier returns `["web_search", "gmail"]`. Only those integrations' tools get bound to the executor LLM. 80 tools become 12.

```python
# smart_router.py — after classification
integrations = await classify_integrations(user_request, registry)

# Filter the full tool registry to just what's needed
scoped_tools = registry.get_toolset(integrations)  # ["web_search", "gmail"] → 12 tools

# Bind only those tools to the executor
executor_with_tools = executor_llm.bind_tools(scoped_tools)
tool_node = ToolNode(scoped_tools, handle_tool_errors=True)
```

This single change was the biggest win. Token cost per request dropped significantly, and tool-calling accuracy improved because the model wasn't distracted by 70 irrelevant options.

**Safety net:** If the classifier misses an integration and the executor hits a tool-not-found error at runtime, it loads the missing integration on-the-fly, rebinds, and retries. The user never sees the error.

---

## Level 2: Per-Step Scoping (Planner Annotations)

Request-level scoping still has a problem. That _"research + email"_ request loads both web search and Gmail tools for every step. But step 1 (research) will never call `send_gmail_message`, and step 2 (email) will never call `web_search`.

The fix: the planner annotates each step with exactly which integrations it uses.

```python
# schemas.py
class PlannedStep(BaseModel):
    description: str
    requires_human_approval: bool
    integrations: list[str]   # ["web_search"] for research, ["gmail"] for email
```

At execution time, the executor rebinds tools per step:

```python
# nodes.py — per-step scoping
def _get_step_scoped_bindings(self, step):
    if step.integrations and self.registry:
        scoped = self.registry.get_toolset(step.integrations)
        if scoped:
            return (
                self.executor_llm.bind_tools(scoped),
                self.executor_llm.bind_tools(scoped, tool_choice="any"),
            )
    # Fallback to full request-level toolset
    return self.executor_with_tools, self.executor_with_tools_forced
```

A three-step plan using web search, Google Docs, and Gmail means each executor call sees 5-8 tools instead of 20-30. The planner prompt makes this straightforward:

```
For EACH step, specify which integration(s) from AVAILABLE INTEGRATIONS
the step will use. Use the exact integration names.
A web search step uses ["web_search"], creating a Notion page uses ["notion"].
```

The system prompt and hints also scope down -- a Gmail step doesn't see Google Sheets executor hints.

```python
# executor/nodes.py — system prompt uses step integrations, not request integrations
step_integrations = step.integrations if step.integrations else initial_integrations

system_prompt = EXECUTOR_SYSTEM_PROMPT.format(
    integration_context=format_integration_context(step_integrations),
    integration_hints=registry.get_hints(step_integrations, "executor"),
    # ...
)
```

---

## Level 3: Truncating Conversation History

Tool scoping handles the _input_ side. But there's a second token drain: the executor's multi-hop conversation history.

When a step needs multiple tool calls (search → read → create), each round-trip accumulates in the executor's chat. The problem: tool-call arguments and tool results stay in the conversation verbatim. A single `create_notion_page` call can have 17K characters of JSON in its args -- and that blob gets re-sent to the LLM on every subsequent call in the same step.

**Tool-call argument truncation:**

```python
_TOOL_CALL_ARGS_CHAR_LIMIT = 2_000

def _truncate_tool_call_args(executor_chat: list) -> list:
    result = []
    for msg in executor_chat:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            truncated_calls = []
            for tc in msg.tool_calls:
                args_str = json.dumps(tc.get("args", {}))
                if len(args_str) > _TOOL_CALL_ARGS_CHAR_LIMIT:
                    truncated_calls.append({
                        **tc,
                        "args": {"_summary": args_str[:_TOOL_CALL_ARGS_CHAR_LIMIT] + "... [truncated]"},
                    })
                else:
                    truncated_calls.append(tc)
            msg = AIMessage(content=msg.content, tool_calls=truncated_calls, id=msg.id)
        result.append(msg)
    return result
```

**Tool result truncation** (same idea, different cap):

```python
_TOOL_RESULT_CHAR_LIMIT = 12_000

# In continue_after_tools — before feeding results back to the LLM
for msg in new_tool_msgs:
    if len(msg.content) > _TOOL_RESULT_CHAR_LIMIT:
        truncated = msg.content[:_TOOL_RESULT_CHAR_LIMIT] + "\n\n[... truncated]"
        chat_tool_msgs.append(ToolMessage(content=truncated, tool_call_id=msg.tool_call_id))
    else:
        chat_tool_msgs.append(msg)
```

The key detail: **truncation only affects the executor's conversation (`_executor_chat`)**. The full data stays in `state["messages"]` so downstream nodes (artifact extraction, result parsing) still have access to everything. The LLM just doesn't need to re-read 17K of JSON it already processed.

---

## Level 4: Step Isolation

Each step gets its own scoped conversation (`_executor_chat`). Step 3's executor doesn't see step 1's raw tool results. It only gets a structured summary:

```
PREVIOUS STEPS COMPLETED:
Step 1 [completed]: Searched for AI trends → Found 12 articles
Step 2 [completed]: Created Google Doc "AI Trends Summary"
  → URL: https://docs.google.com/document/d/1abc.../edit
```

This prevents token accumulation across steps. Without it, a 5-step plan would have the step 5 executor carrying the full conversation history of all previous steps.

---

## The Numbers

| Level         | What it does                            | Tool schemas sent |
| ------------- | --------------------------------------- | ----------------- |
| No scoping    | All tools, every call                   | 80+               |
| Request-level | Filter by classified integrations       | 15-25             |
| Per-step      | Filter by step's annotated integrations | 5-10              |

The multi-hop truncation is harder to quantify but prevents the worst-case scenario: a step that chains 5 tool calls with large payloads would previously send 50K+ chars of stale history on the final call. Now it stays under 15K.

---

## Takeaways

1. **Scope tools before binding.** LangGraph's `bind_tools()` accepts a filtered list. Use it. Don't dump every MCP tool into every call.
2. **Scope at multiple levels.** Request-level gets you 80%, per-step gets the rest.
3. **Make the planner do the work.** Structured output with an `integrations` field means routing is a dict lookup, not another LLM call.
4. **Truncate conversation history, not source data.** Keep full data in state for downstream extraction. Only truncate what the LLM re-reads.
5. **Build a safety net.** If scoping is too aggressive, catch tool-not-found errors and load incrementally. The system self-heals.

---

_Built with [LangGraph](https://github.com/langchain-ai/langgraph) and [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)._
