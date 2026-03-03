"""Run LangSmith evaluation using Task Arena action dataset."""

import os
from langsmith import Client
from langsmith.schemas import Example, Run
from langsmith.evaluation import evaluate
from langchain_core.messages import HumanMessage
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from chat.workflow.graph import DynamicWorkflow

from eval.download_datasets import load_dataset, download_dataset

LANGSMITH_PROJECT = os.getenv("LANGSMITH_PROJECT", "agent-evaluation")
DATASET_NAME = "task-arena-action"


def ensure_dataset():
    """Download dataset if not present."""
    try:
        load_dataset()
    except FileNotFoundError:
        download_dataset()


def create_langsmith_dataset(data: list):
    """Create or update LangSmith dataset."""
    client = Client()
    
    try:
        dataset = client.read_dataset(dataset_name=DATASET_NAME)
        print(f"Dataset '{DATASET_NAME}' exists with {dataset.example_count} examples")
    except:
        dataset = client.create_dataset(dataset_name=DATASET_NAME)
        print(f"Created dataset '{DATASET_NAME}'")
        
        for item in data:
            client.create_example(
                inputs={"prompt": item["prompt"]},
                dataset_id=dataset.id,
            )
        print(f"Added {len(data)} examples")
    
    return dataset


async def run_agent(workflow: "DynamicWorkflow", prompt: str, thread_id: str = "eval") -> str:
    """Run the agent and return the final response."""
    config = {"configurable": {"thread_id": thread_id}}
    
    state = await workflow.app.ainvoke(
        {"messages": [HumanMessage(content=prompt)]},
        config=config,
    )
    
    messages = state.get("messages", [])
    if messages:
        last_message = messages[-1]
        return getattr(last_message, "content", str(last_message))
    return ""


def evaluate_action_task(run: Run, example: Example) -> dict:
    """Evaluate action task - requires manual review or LLM-as-judge."""
    response = run.outputs.get("output", "")
    prompt = example.inputs.get("prompt", "")
    
    return {
        "key": "action_completion",
        "score": 0,
        "comment": f"Manual review needed for: {prompt[:50]}...",
    }


def run_evaluation(workflow: "DynamicWorkflow"):
    """Run evaluation on action dataset."""
    ensure_dataset()
    
    client = Client()
    data = load_dataset()
    create_langsmith_dataset(data)
    
    async def target(inputs: dict) -> dict:
        output = await run_agent(workflow, inputs["prompt"])
        return {"output": output}
    
    results = evaluate(
        target,
        data=DATASET_NAME,
        evaluators=[evaluate_action_task],
        client=client,
        project_name=LANGSMITH_PROJECT,
    )
    
    return results


if __name__ == "__main__":
    print("Ensure LANGSMITH_API_KEY is set in environment")
    print("Run with: python -m eval.run_evaluation")
