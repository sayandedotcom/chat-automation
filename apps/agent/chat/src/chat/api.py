from contextlib import asynccontextmanager
import os
import logging

# Configure logging so diagnostic messages from nodes.py appear in console
logging.basicConfig(level=logging.INFO, format="%(name)s %(levelname)s %(message)s")

from fastapi import FastAPI
# from fastapi.middleware.cors import CORSMiddleware

from chat.utils.mcp_client import TAVILY_API_KEY
from chat.integrations.registry import get_registry
from chat.routers import chat as chat_router
from chat.routers import credentials as credentials_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Pre-warm MCP connections and registry at startup.

    This eliminates the 5-15s cold start delay on first request
    by loading all integrations and tools during app initialization.
    """
    print("🔥 Pre-warming MCP connections and registry...")

    # Get tokens from environment
    tokens = {
        "gmail_token": os.getenv("GMAIL_TOKEN"),
        "notion_token": os.getenv("NOTION_TOKEN"),
        "vercel_token": os.getenv("VERCEL_TOKEN"),
        "tavily_api_key": TAVILY_API_KEY,
        "google_client_id": os.getenv("GOOGLE_CLIENT_ID"),
        "google_client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
    }

    try:
        registry = await get_registry(tokens)
        print(f"✅ Registry pre-warmed with {len(registry.get_all_tools())} tools")
    except Exception as e:
        print(f"⚠️ Failed to pre-warm registry: {e}")
        import traceback

        traceback.print_exc()

    yield  # App runs here

    print("👋 Shutting down...")


app = FastAPI(title="Chat Agent API", lifespan=lifespan)

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=[origin for origin in [os.getenv("APP_URL")] if origin],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

app.include_router(credentials_router.router)
app.include_router(chat_router.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
