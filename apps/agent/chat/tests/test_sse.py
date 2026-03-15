"""
Tests for SSE streaming infrastructure.

Covers:
- _with_heartbeat: injects heartbeat after timeout, passes events through, stops on StopAsyncIteration
- Event ordering: integrations_ready before progress, approval_required pauses stream
"""

import asyncio
import json
import pytest

from chat.routers.chat import _with_heartbeat


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def events_from_sse(sse_lines: list[str]) -> list[dict]:
    """Parse SSE data lines into dicts."""
    events = []
    for line in sse_lines:
        if line.startswith("data: "):
            payload = line[len("data: ") :].strip()
            events.append(json.loads(payload))
    return events


async def make_async_iter(items):
    """Turn a list into an async iterator."""
    for item in items:
        yield item


# ---------------------------------------------------------------------------
# _with_heartbeat
# ---------------------------------------------------------------------------


class TestWithHeartbeat:
    @pytest.mark.asyncio
    async def test_passes_events_through_as_sse_lines(self):
        """Normal events are yielded as SSE data lines."""
        inner = make_async_iter(
            [
                {"type": "progress", "step": 1},
                {"type": "done"},
            ]
        )

        lines = [line async for line in _with_heartbeat(inner, interval=30)]
        events = await events_from_sse(lines)

        assert len(events) == 2
        assert events[0]["type"] == "progress"
        assert events[1]["type"] == "done"

    @pytest.mark.asyncio
    async def test_injects_heartbeat_on_timeout(self):
        """A delay before the first real event causes a heartbeat to be injected."""

        async def delayed_iter():
            await asyncio.sleep(0.15)  # longer than interval → heartbeat
            yield {"type": "done"}

        lines = [line async for line in _with_heartbeat(delayed_iter(), interval=0.05)]
        events = await events_from_sse(lines)
        heartbeats = [e for e in events if e["type"] == "heartbeat"]
        real_events = [e for e in events if e["type"] != "heartbeat"]

        assert len(heartbeats) >= 1
        assert len(real_events) == 1
        assert real_events[0]["type"] == "done"

    @pytest.mark.asyncio
    async def test_heartbeat_does_not_suppress_real_events(self):
        """Heartbeats are injected during delays but real events still arrive."""

        async def slow_iter():
            await asyncio.sleep(0.15)  # longer than interval → triggers heartbeat
            yield {"type": "progress"}
            yield {"type": "done"}

        lines = [line async for line in _with_heartbeat(slow_iter(), interval=0.05)]
        events = await events_from_sse(lines)
        heartbeats = [e for e in events if e["type"] == "heartbeat"]
        real = [e for e in events if e["type"] != "heartbeat"]

        assert len(heartbeats) >= 1
        assert len(real) == 2
        assert real[0]["type"] == "progress"
        assert real[1]["type"] == "done"

    @pytest.mark.asyncio
    async def test_empty_inner_yields_nothing(self):
        """Empty inner iterator yields no lines."""
        inner = make_async_iter([])
        lines = [line async for line in _with_heartbeat(inner, interval=30)]
        assert lines == []

    @pytest.mark.asyncio
    async def test_sse_format_is_correct(self):
        """Each yielded line starts with 'data: ' and ends with double newline."""
        inner = make_async_iter([{"type": "test", "value": 42}])
        lines = [line async for line in _with_heartbeat(inner, interval=30)]

        assert len(lines) == 1
        assert lines[0].startswith("data: ")
        assert lines[0].endswith("\n\n")

    @pytest.mark.asyncio
    async def test_json_serialization_of_events(self):
        """Event dicts are properly JSON-encoded in the SSE line."""
        event = {
            "type": "integrations_ready",
            "integrations": ["gmail"],
            "tool_count": 5,
        }
        inner = make_async_iter([event])
        lines = [line async for line in _with_heartbeat(inner, interval=30)]

        parsed = json.loads(lines[0][len("data: ") :].strip())
        assert parsed == event

    @pytest.mark.asyncio
    async def test_multiple_heartbeats_possible(self):
        """Long gap produces multiple heartbeat events."""

        async def very_slow_iter():
            await asyncio.sleep(0.25)  # ~5x the interval → multiple heartbeats
            yield {"type": "done"}

        lines = [
            line async for line in _with_heartbeat(very_slow_iter(), interval=0.05)
        ]
        events = await events_from_sse(lines)
        heartbeats = [e for e in events if e["type"] == "heartbeat"]

        assert len(heartbeats) >= 3


# ---------------------------------------------------------------------------
# Event ordering & SSE event types (via service mock)
# ---------------------------------------------------------------------------


class TestSSEEventOrdering:
    @pytest.mark.asyncio
    async def test_integrations_ready_before_progress(self):
        """integrations_ready event should appear before any progress events."""
        events = [
            {"type": "integrations_ready", "integrations": [], "tool_count": 3},
            {"type": "progress", "current_step": 0, "total_steps": 2},
            {"type": "done"},
        ]
        inner = make_async_iter(events)
        lines = [line async for line in _with_heartbeat(inner, interval=30)]
        result_events = await events_from_sse(lines)

        types = [e["type"] for e in result_events]
        assert types.index("integrations_ready") < types.index("progress")

    @pytest.mark.asyncio
    async def test_approval_required_is_last_event(self):
        """When approval_required is yielded, it should be the final event."""
        events = [
            {"type": "integrations_ready", "integrations": []},
            {"type": "progress"},
            {"type": "approval_required", "interrupt": {}},
            # Nothing after approval (service returns after yielding it)
        ]
        inner = make_async_iter(events)
        lines = [line async for line in _with_heartbeat(inner, interval=30)]
        result_events = await events_from_sse(lines)

        assert result_events[-1]["type"] == "approval_required"

    @pytest.mark.asyncio
    async def test_done_is_last_event_on_success(self):
        """On successful workflow, done event is the last event."""
        events = [
            {"type": "integrations_ready", "integrations": []},
            {"type": "thinking", "content": "planning..."},
            {"type": "progress", "current_step": 0},
            {"type": "progress", "current_step": 1},
            {"type": "done"},
        ]
        inner = make_async_iter(events)
        lines = [line async for line in _with_heartbeat(inner, interval=30)]
        result_events = await events_from_sse(lines)

        assert result_events[-1]["type"] == "done"

    @pytest.mark.asyncio
    async def test_heartbeat_before_real_events_ordering(self):
        """Heartbeats interleaved with real events; real event order is preserved."""

        async def staggered_iter():
            await asyncio.sleep(0.15)  # heartbeat(s) injected
            yield {"type": "thinking", "seq": 1}
            await asyncio.sleep(0.15)  # more heartbeat(s)
            yield {"type": "progress", "seq": 2}

        lines = [
            line async for line in _with_heartbeat(staggered_iter(), interval=0.05)
        ]
        result_events = await events_from_sse(lines)
        real = [e for e in result_events if e["type"] != "heartbeat"]
        heartbeats = [e for e in result_events if e["type"] == "heartbeat"]

        assert len(heartbeats) >= 2
        assert [e["seq"] for e in real] == [1, 2]
