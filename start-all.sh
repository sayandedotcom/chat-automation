#!/bin/bash

# Startup script for chat-automation
# This script starts all three services in the correct order

echo "🚀 Starting Chat Automation Services..."
echo ""

# Check if .env.local exists for web app
if [ ! -f "apps/web/.env.local" ]; then
    echo "⚠️  Warning: apps/web/.env.local not found"
    echo "Creating it now..."
    cat > apps/web/.env.local << EOL
# API Server URL (Express + tRPC)
NEXT_PUBLIC_API_URL=http://localhost:8001

# Agent Service URL (Python FastAPI)
AGENT_API_URL=http://localhost:8000
EOL
    echo "✅ Created apps/web/.env.local"
    echo ""
fi

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Check ports
echo "🔍 Checking ports..."
if check_port 8001; then
    echo "⚠️  Warning: Port 8001 is already in use (API server may already be running)"
else
    echo "✅ Port 8001 is free (API server)"
fi

if check_port 3000; then
    echo "⚠️  Warning: Port 3000 is already in use (Web app may already be running)"
else
    echo "✅ Port 3000 is free (Web app)"
fi

if check_port 8000; then
    echo "⚠️  Warning: Port 8000 is already in use (Agent service may already be running)"
else
    echo "✅ Port 8000 is free (Agent service)"
fi

echo ""
echo "📋 Services will start in this order:"
echo "   1. API Server (Express + tRPC) → http://localhost:8001"
echo "   2. Web App (Next.js) → http://localhost:3000"
echo "   3. Agent Service (FastAPI) → http://localhost:8000"
echo ""
echo "💡 Tip: Open three separate terminals and run:"
echo "   Terminal 1: pnpm --filter api dev"
echo "   Terminal 2: pnpm --filter web dev"
echo "   Terminal 3: cd apps/agent/chat && pnpm dev"
echo ""
echo "Or run: pnpm dev (starts all at once)"
echo ""

read -p "Press Enter to start all services with 'pnpm dev', or Ctrl+C to cancel..."

echo ""
echo "🚀 Starting all services..."
pnpm dev
