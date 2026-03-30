from contextlib import asynccontextmanager
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

from fastapi import FastAPI

from chat.config import (
    GMAIL_TOKEN,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    NOTION_TOKEN,
    TAVILY_API_KEY,
    VERCEL_TOKEN,
)
from chat.integrations.registry import get_registry
from chat.routers import chat as chat_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-warm MCP connections and registry at startup.

    Eliminates the 5-15s cold start delay on first request by loading
    all integrations and tools during app initialization.
    """
    logger.info("Pre-warming MCP connections and registry")

    tokens = {
        "gmail_token": GMAIL_TOKEN,
        "notion_token": NOTION_TOKEN,
        "vercel_token": VERCEL_TOKEN,
        "tavily_api_key": TAVILY_API_KEY,
        "google_client_id": GOOGLE_CLIENT_ID,
        "google_client_secret": GOOGLE_CLIENT_SECRET,
    }

    try:
        registry = await get_registry(tokens)
        logger.info("Registry pre-warmed with %d tools", len(registry.get_all_tools()))
    except Exception as e:
        logger.exception("Failed to pre-warm registry: %s", e)

    yield

    logger.info("Shutting down")


app = FastAPI(title="Chat Agent API", lifespan=lifespan)


@app.get("/")
async def root():
    return {"status": "ok"}


app.include_router(chat_router.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
