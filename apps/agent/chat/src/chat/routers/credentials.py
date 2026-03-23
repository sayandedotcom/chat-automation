"""
Credentials Router

Handles health check and OAuth credential sync endpoints.
"""

import json
import logging

from fastapi import APIRouter, HTTPException

from chat.config import GOOGLE_MCP_CREDENTIALS_DIR as MCP_CREDENTIALS_DIR
from chat.schemas import GoogleCredentialsSyncSchema

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/sync-google-credentials")
async def sync_google_credentials(data: GoogleCredentialsSyncSchema):
    """
    Sync Google OAuth credentials from frontend to MCP's credential store.
    Called ONLY from the OAuth callback — not during token refresh.
    The token and scopes must come from the same OAuth flow.
    """
    try:
        MCP_CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)

        cred_file = MCP_CREDENTIALS_DIR / "user_frontend_oauth.json"

        # Load existing to preserve refresh_token if incoming is empty
        existing = {}
        if cred_file.exists():
            try:
                with open(cred_file) as f:
                    existing = json.load(f)
            except (json.JSONDecodeError, OSError):
                existing = {}

        # Merge scopes: keep existing scopes + add incoming scopes.
        # This prevents losing scopes when a different Google service is re-authorized.
        # With include_granted_scopes=true on the frontend, the incoming scopes should
        # already include previously granted ones, but this is a safety net.
        existing_scopes = set(existing.get("scopes", []))
        incoming_scopes = set(data.scopes) if data.scopes else set()
        merged_scopes = sorted(existing_scopes | incoming_scopes)

        credentials = {
            "token": data.access_token,
            "refresh_token": data.refresh_token or existing.get("refresh_token", ""),
            "token_uri": data.token_uri,
            "client_id": data.client_id,
            "client_secret": data.client_secret,
            "scopes": merged_scopes,
        }

        if data.expiry:
            credentials["expiry"] = data.expiry

        with open(cred_file, "w") as f:
            json.dump(credentials, f, indent=2)

        logger.info("Google credentials synced to %s", cred_file)
        return {"status": "success", "message": "Google credentials synced to MCP"}

    except Exception as e:
        logger.exception("Failed to sync Google credentials")
        raise HTTPException(status_code=500, detail=str(e))
