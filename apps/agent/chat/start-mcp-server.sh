#!/bin/bash
# Start Google Workspace MCP Server with External OAuth 2.1 Provider mode
# This allows frontend OAuth tokens to be used for Gmail, Drive, Calendar, etc.

# Required environment variables
export GOOGLE_OAUTH_CLIENT_ID="${GOOGLE_OAUTH_CLIENT_ID:?Set GOOGLE_OAUTH_CLIENT_ID}"
export GOOGLE_OAUTH_CLIENT_SECRET="${GOOGLE_OAUTH_CLIENT_SECRET:?Set GOOGLE_OAUTH_CLIENT_SECRET}"

# Enable External OAuth 2.1 Provider mode
export MCP_ENABLE_OAUTH21=true
export EXTERNAL_OAUTH21_PROVIDER=true
export WORKSPACE_MCP_STATELESS_MODE=true
export OAUTHLIB_INSECURE_TRANSPORT=1  # Allow HTTP for localhost (dev only)

echo "🚀 Starting Google Workspace MCP Server..."
echo "   Mode: External OAuth 2.1 Provider"
echo "   URL: http://localhost:8000/mcp/"
echo ""

uvx workspace-mcp --transport streamable-http
