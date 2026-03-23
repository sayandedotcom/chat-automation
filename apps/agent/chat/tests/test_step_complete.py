"""
Tests for workflow/step_complete.py

Covers:
- run_step_complete: marks current step completed, extracts result from last AIMessage
- Advances current_step_index correctly
- Marks plan.is_complete when last step is done
- Resets executor state (_executor_chat, _step_tool_calls) after step
- Handles no plan / out-of-bounds index gracefully
- _extract_identifiers: URL/email extraction and text cleaning
- _summarize_tool_outputs: small bypass, large LLM summarization
"""

import pytest
from unittest.mock import AsyncMock, patch

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from chat.schemas import WorkflowPlan, WorkflowStep
from chat.workflow.step_complete import (
    _extract_identifiers,
    _scope_messages_to_current_step,
    _summarize_tool_outputs,
    run_step_complete,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_step(step_number: int = 1, description: str = "Do something") -> WorkflowStep:
    return WorkflowStep(step_number=step_number, description=description)


def make_plan(*descriptions: str) -> WorkflowPlan:
    steps = [make_step(i + 1, d) for i, d in enumerate(descriptions)]
    return WorkflowPlan(original_request="test", steps=steps)


def base_state(plan, current_index: int, messages=None) -> dict:
    return {
        "plan": plan,
        "current_step_index": current_index,
        "messages": messages or [],
        "artifacts": [],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestRunStepComplete:
    @pytest.mark.asyncio
    async def test_marks_step_completed(self):
        """Step status is set to 'completed'."""
        plan = make_plan("Search for info")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                HumanMessage(content="do it"),
                AIMessage(content="Found results."),
            ],
        )

        await run_step_complete(state)

        assert plan.steps[0].status == "completed"

    @pytest.mark.asyncio
    async def test_sets_step_result_from_last_ai_message(self):
        """Step result is set to content of last AIMessage."""
        plan = make_plan("Do something")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                HumanMessage(content="go"),
                AIMessage(content="Task completed successfully."),
            ],
        )

        await run_step_complete(state)

        assert plan.steps[0].result == "Task completed successfully."

    @pytest.mark.asyncio
    async def test_advances_current_step_index(self):
        """current_step_index increments by 1."""
        plan = make_plan("Step 1", "Step 2")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="step 1 done"),
            ],
        )

        result = await run_step_complete(state)

        assert result["current_step_index"] == 1

    @pytest.mark.asyncio
    async def test_marks_plan_complete_on_last_step(self):
        """When the last step completes, plan.is_complete is set to True."""
        plan = make_plan("Only step")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="All done!"),
            ],
        )

        await run_step_complete(state)

        assert plan.is_complete is True
        assert plan.final_summary == "All done!"

    @pytest.mark.asyncio
    async def test_not_complete_when_more_steps_remain(self):
        """plan.is_complete is NOT set when there are remaining steps."""
        plan = make_plan("Step 1", "Step 2")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="step 1 done"),
            ],
        )

        await run_step_complete(state)

        assert plan.is_complete is False

    @pytest.mark.asyncio
    async def test_resets_executor_chat_to_none(self):
        """_executor_chat is cleared after step completion."""
        plan = make_plan("Only step")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="done"),
            ],
        )

        result = await run_step_complete(state)

        assert result["_executor_chat"] is None

    @pytest.mark.asyncio
    async def test_resets_step_tool_calls_to_zero(self):
        """_step_tool_calls is reset to 0 after step completion."""
        plan = make_plan("Only step")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="done"),
            ],
        )

        result = await run_step_complete(state)

        assert result["_step_tool_calls"] == 0

    @pytest.mark.asyncio
    async def test_uses_fallback_result_when_no_ai_message(self):
        """If no AIMessage with content exists, result falls back to 'Step completed'."""
        plan = make_plan("Step 1")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                HumanMessage(content="go"),
            ],
        )

        await run_step_complete(state)

        assert plan.steps[0].result == "Step completed"

    @pytest.mark.asyncio
    async def test_no_plan_returns_empty_dict(self):
        """No plan in state → early return with empty dict."""
        state = {
            "plan": None,
            "current_step_index": 0,
            "messages": [],
            "artifacts": [],
        }

        result = await run_step_complete(state)

        assert result == {}

    @pytest.mark.asyncio
    async def test_index_beyond_plan_returns_empty_dict(self):
        """current_index >= len(steps) → early return with empty dict."""
        plan = make_plan("Step 1")
        state = base_state(plan, current_index=5, messages=[AIMessage(content="x")])

        result = await run_step_complete(state)

        assert result == {}

    @pytest.mark.asyncio
    async def test_transition_message_contains_next_step_description(self):
        """When more steps remain, transition message mentions the next step."""
        plan = make_plan("First step", "Second step")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="first done"),
            ],
        )

        result = await run_step_complete(state)

        transition_msg = result["messages"][0]
        assert "Second step" in transition_msg.content

    @pytest.mark.asyncio
    async def test_completion_message_contains_total_steps(self):
        """On final step completion, message mentions total steps count."""
        plan = make_plan("Step 1", "Step 2")
        state = base_state(
            plan,
            current_index=1,
            messages=[
                AIMessage(content="all done"),
            ],
        )

        result = await run_step_complete(state)

        completion_msg = result["messages"][0]
        assert "2" in completion_msg.content

    @pytest.mark.asyncio
    async def test_search_step_extracts_search_results(self):
        """Steps with 'search' in description trigger search results extraction."""
        plan = make_plan("Search for Python tutorials")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="Found: ..."),
            ],
        )

        with patch(
            "chat.workflow.step_complete.extract_search_results_from_messages"
        ) as mock_extract:
            mock_extract.return_value = []
            await run_step_complete(state)

        mock_extract.assert_called_once()

    @pytest.mark.asyncio
    async def test_non_search_step_still_extracts_search_results(self):
        """All steps try to extract search results (not just search-named ones)."""
        plan = make_plan("Create a document")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                AIMessage(content="Doc created."),
            ],
        )

        with patch(
            "chat.workflow.step_complete.extract_search_results_from_messages"
        ) as mock_extract:
            mock_extract.return_value = []
            await run_step_complete(state)

        mock_extract.assert_called_once()

    @pytest.mark.asyncio
    async def test_list_content_ai_message_is_joined(self):
        """AIMessage content that is a list of text blocks is joined with newlines."""
        plan = make_plan("Do task")
        ai_msg = AIMessage(
            content=[
                {"type": "text", "text": "Hello, "},
                {"type": "text", "text": "world!"},
            ]
        )
        state = base_state(plan, current_index=0, messages=[ai_msg])

        await run_step_complete(state)

        # step_complete joins text blocks with "\n"
        assert plan.steps[0].result == "Hello, \nworld!"


# ---------------------------------------------------------------------------
# _extract_identifiers
# ---------------------------------------------------------------------------


class TestExtractIdentifiers:
    def test_extracts_urls(self):
        text = "Check https://docs.google.com/document/d/abc123 for details."
        identifiers, cleaned = _extract_identifiers(text)
        assert "URL: https://docs.google.com/document/d/abc123" in identifiers
        assert "[URL_REMOVED]" in cleaned
        assert "https://docs.google.com" not in cleaned

    def test_extracts_emails(self):
        text = "Contact alice@example.com and bob+tag@company.org for info."
        identifiers, cleaned = _extract_identifiers(text)
        assert "Email: alice@example.com" in identifiers
        assert "Email: bob+tag@company.org" in identifiers
        assert "[EMAIL_REMOVED]" in cleaned
        assert "alice@example.com" not in cleaned

    def test_deduplicates_urls(self):
        text = "Visit https://example.com twice: https://example.com"
        identifiers, _ = _extract_identifiers(text)
        url_entries = [i for i in identifiers if i.startswith("URL:")]
        assert len(url_entries) == 1

    def test_no_identifiers_in_plain_text(self):
        text = "Just a plain text message with no links or emails."
        identifiers, cleaned = _extract_identifiers(text)
        assert identifiers == []
        assert cleaned == text

    def test_mixed_urls_and_emails(self):
        text = (
            "See https://drive.google.com/file/d/xyz and email "
            "support@test.com for help."
        )
        identifiers, cleaned = _extract_identifiers(text)
        assert len(identifiers) == 2
        assert any("URL:" in i for i in identifiers)
        assert any("Email:" in i for i in identifiers)
        assert "https://" not in cleaned
        assert "support@test.com" not in cleaned


# ---------------------------------------------------------------------------
# _summarize_tool_outputs
# ---------------------------------------------------------------------------


class TestSummarizeToolOutputs:
    @pytest.mark.asyncio
    async def test_empty_messages_returns_empty_string(self):
        result = await _summarize_tool_outputs([], make_step(), None)
        assert result == ""

    @pytest.mark.asyncio
    async def test_small_outputs_bypass_llm(self):
        """Tool outputs under the threshold are returned verbatim without LLM."""
        msgs = [
            ToolMessage(
                content="Found 3 documents matching your query in Google Drive.",
                tool_call_id="call_1",
                name="search_drive",
            ),
        ]
        step = make_step(description="Search Google Drive")
        # Pass None as LLM — it should not be called for small outputs
        result = await _summarize_tool_outputs(msgs, step, None)
        assert "Found 3 documents" in result
        assert "[search_drive]" in result

    @pytest.mark.asyncio
    async def test_large_outputs_call_llm_with_cleaned_text(self):
        """Large outputs trigger LLM summarization with URLs stripped."""
        large_content = (
            "Result from search: "
            + "x" * 4000
            + " https://docs.google.com/document/d/abc123"
            + " contact: user@example.com"
        )
        msgs = [
            ToolMessage(
                content=large_content,
                tool_call_id="call_1",
                name="search_tool",
            ),
        ]
        step = make_step(description="Search for documents")

        mock_llm = AsyncMock()
        mock_response = AsyncMock()
        mock_response.content = "Found search results with relevant documents."
        mock_llm.ainvoke = AsyncMock(return_value=mock_response)

        result = await _summarize_tool_outputs(msgs, step, mock_llm)

        # LLM was called
        mock_llm.ainvoke.assert_awaited_once()
        # The text sent to LLM should NOT contain the URL
        call_args = mock_llm.ainvoke.call_args[0][0]
        human_msg = call_args[1]  # second message is the HumanMessage
        assert "https://docs.google.com" not in human_msg.content
        assert "[URL_REMOVED]" in human_msg.content

        # Result should contain LLM summary + verbatim identifiers
        assert "Found search results" in result
        assert "--- Extracted Data (verbatim) ---" in result
        assert "URL: https://docs.google.com/document/d/abc123" in result
        assert "Email: user@example.com" in result

    @pytest.mark.asyncio
    async def test_skips_short_tool_messages(self):
        """ToolMessages with content < 50 chars are skipped."""
        msgs = [
            ToolMessage(content="OK", tool_call_id="call_1", name="tool_a"),
        ]
        result = await _summarize_tool_outputs(msgs, make_step(), None)
        assert result == ""

    @pytest.mark.asyncio
    async def test_skips_non_tool_messages(self):
        """Non-ToolMessages are ignored."""
        msgs = [
            AIMessage(content="I found the results."),
            HumanMessage(content="Thanks"),
        ]
        result = await _summarize_tool_outputs(msgs, make_step(), None)
        assert result == ""


# ---------------------------------------------------------------------------
# run_step_complete with summarizer_llm
# ---------------------------------------------------------------------------


class TestRunStepCompleteWithSummarizer:
    @pytest.mark.asyncio
    async def test_uses_summarizer_when_provided(self):
        """When summarizer_llm is provided and there are tool outputs, it's used."""
        large_content = (
            "Detailed results: " + "data " * 1000 + " https://example.com/doc/123"
        )
        plan = make_plan("Search for info")
        state = base_state(
            plan,
            current_index=0,
            messages=[
                ToolMessage(
                    content=large_content, tool_call_id="call_1", name="search"
                ),
                AIMessage(content="Found the info."),
            ],
        )

        mock_llm = AsyncMock()
        mock_response = AsyncMock()
        mock_response.content = "Summary of search results."
        mock_llm.ainvoke = AsyncMock(return_value=mock_response)

        await run_step_complete(state, summarizer_llm=mock_llm)

        # executor_context should contain LLM summary + AI message
        ctx = plan.steps[0].executor_context
        assert "Found the info." in ctx
        assert "Summary of search results." in ctx
        assert "URL: https://example.com/doc/123" in ctx

    @pytest.mark.asyncio
    async def test_falls_back_to_build_rich_result_without_summarizer(self):
        """Without summarizer_llm, falls back to _build_rich_result truncation."""
        plan = make_plan("Do something")
        content = "Tool output content that is at least 50 chars long for testing."
        state = base_state(
            plan,
            current_index=0,
            messages=[
                ToolMessage(content=content, tool_call_id="call_1", name="some_tool"),
                AIMessage(content="Done."),
            ],
        )

        await run_step_complete(state)

        ctx = plan.steps[0].executor_context
        assert "Done." in ctx
        assert "[some_tool]" in ctx


# ---------------------------------------------------------------------------
# _scope_messages_to_current_step & cross-step/turn bleed prevention
# ---------------------------------------------------------------------------


class TestScopeMessagesToCurrentStep:
    def test_tools_used_scoped_to_current_step(self):
        """Prior step's ToolMessage behind a boundary should not appear in scoped list."""
        messages = [
            # --- prior step ---
            ToolMessage(
                content='{"results": [{"title": "Python tutorial", "url": "https://example.com"}]}',
                tool_call_id="call_old",
                name="tavily_search",
            ),
            AIMessage(content="Here are the search results."),
            # --- boundary: step transition ---
            AIMessage(content="Step 1 complete. Moving to step 2: Read Notion page\n"),
            # --- current step ---
            ToolMessage(
                content="Page content: Introduction to Python...",
                tool_call_id="call_new",
                name="API-get-block-children",
            ),
            AIMessage(content="I read the Notion page."),
        ]
        scoped = _scope_messages_to_current_step(messages)

        tool_names = [msg.name for msg in scoped if isinstance(msg, ToolMessage)]
        assert "API-get-block-children" in tool_names
        assert "tavily_search" not in tool_names

    def test_search_results_not_leaked_across_steps(self):
        """Tavily ToolMessage behind a step boundary must not appear in scoped messages."""
        tavily_content = (
            '{"results": [{"title": "Result 1", "url": "https://r1.com", '
            '"content": "Some content here about the topic"}]}'
        )
        messages = [
            # --- prior step with search ---
            ToolMessage(
                content=tavily_content,
                tool_call_id="call_search",
                name="tavily_search",
            ),
            AIMessage(content="Found search results."),
            AIMessage(content="Step 1 complete. Moving to step 2: Create document\n"),
            # --- current step (no search) ---
            ToolMessage(
                content="Document created successfully with ID doc_123.",
                tool_call_id="call_create",
                name="create_document",
            ),
            AIMessage(content="Created the document."),
        ]
        scoped = _scope_messages_to_current_step(messages)

        # No tavily message should be in scoped messages
        tavily_msgs = [
            msg
            for msg in scoped
            if isinstance(msg, ToolMessage) and msg.name == "tavily_search"
        ]
        assert tavily_msgs == []

    def test_scope_messages_across_turns(self):
        """Full prior turn behind a HumanMessage boundary is excluded."""
        messages = [
            # --- Turn 1 ---
            HumanMessage(content="Search for Python tutorials"),
            ToolMessage(
                content='{"results": [{"title": "Tutorial"}]}',
                tool_call_id="call_t1",
                name="tavily_search",
            ),
            AIMessage(content="Here are results from turn 1."),
            AIMessage(content="All 2 steps completed.\n"),
            # --- Turn 2 ---
            HumanMessage(content="Now create a Google Doc"),
            ToolMessage(
                content="Doc created.",
                tool_call_id="call_t2",
                name="create_document",
            ),
            AIMessage(content="Created the document in turn 2."),
        ]
        scoped = _scope_messages_to_current_step(messages)

        # Only turn 2 messages after the last HumanMessage
        assert len(scoped) == 2  # ToolMessage + AIMessage
        tool_names = [msg.name for msg in scoped if isinstance(msg, ToolMessage)]
        assert tool_names == ["create_document"]

    def test_scope_with_list_content_ai_message(self):
        """AIMessage with list content (tool_use blocks) is NOT a boundary."""
        messages = [
            AIMessage(content="Step 1 complete. Moving to step 2: Do more\n"),
            # AIMessage with list content (e.g. tool_use blocks) — not a boundary
            AIMessage(
                content=[
                    {"type": "text", "text": "Let me help."},
                    {
                        "type": "tool_use",
                        "id": "call_1",
                        "name": "some_tool",
                        "input": {},
                    },
                ]
            ),
            ToolMessage(
                content="Tool result here with enough content to be meaningful.",
                tool_call_id="call_1",
                name="some_tool",
            ),
            AIMessage(content="Done with the task."),
        ]
        scoped = _scope_messages_to_current_step(messages)

        # The list-content AIMessage + ToolMessage + final AIMessage should all be included
        assert len(scoped) == 3
        assert any(
            isinstance(msg, AIMessage) and isinstance(msg.content, list)
            for msg in scoped
        )


class TestRunStepCompleteScoping:
    @pytest.mark.asyncio
    async def test_tools_used_excludes_prior_step_tools(self):
        """run_step_complete should only report tools from the current step."""
        plan = make_plan("Search web", "Read Notion page")
        # Simulate: step 1 done, now completing step 2 (index=1)
        # Messages include step 1's tool + boundary + step 2's tool
        state = base_state(
            plan,
            current_index=1,
            messages=[
                HumanMessage(content="do research"),
                ToolMessage(
                    content='{"results": [{"title": "Result", "url": "https://example.com", "content": "blah"}]}',
                    tool_call_id="call_s1",
                    name="tavily_search",
                ),
                AIMessage(content="Found results."),
                AIMessage(
                    content="Step 1 complete. Moving to step 2: Read Notion page\n"
                ),
                ToolMessage(
                    content="Notion page content: some long text here that is meaningful enough.",
                    tool_call_id="call_s2",
                    name="API-get-block-children",
                ),
                AIMessage(content="I read the Notion page."),
            ],
        )

        await run_step_complete(state)

        step = plan.steps[1]
        assert step.tools_used == ["API-get-block-children"]
        assert step.search_results is None
