#!/bin/bash

# MCP PostMessage Transport Demo Runner
# This script starts all the demo servers and client

echo "🚀 Starting MCP PostMessage Transport Demo"
echo "=========================================="

# Function to start a server in the background
start_server() {
    local name=$1
    local port=$2
    local path=$3
    
    echo "Starting $name on port $port..."
    cd "$path"
    bun --port $port index.html --hot &
    local pid=$!
    echo "$pid" > "/tmp/mcp-demo-$name.pid"
    cd - > /dev/null
    sleep 1
}

# Function to clean up background processes
cleanup() {
    echo ""
    echo "🛑 Shutting down demo servers..."
    
    # Kill all background processes
    for pidfile in /tmp/mcp-demo-*.pid; do
        if [ -f "$pidfile" ]; then
            pid=$(cat "$pidfile")
            kill $pid 2>/dev/null
            rm "$pidfile"
        fi
    done
    
    exit 0
}

# Set up cleanup trap
trap cleanup SIGINT SIGTERM

# Start demo servers using Bun's multi-page support
echo "Starting all servers on port 3001..."
bun src/demo/servers/**/index.html --port 3001 --hot &
SERVER_PID=$!
echo "$SERVER_PID" > "/tmp/mcp-demo-servers.pid"

echo "Starting client and inverted demo on port 3000..."
# Serve multiple entry points to get all routes
bun src/demo/index.html src/demo/inverted/index.html src/demo/servers/**/*.html --port 3000 --hot &
CLIENT_PID=$!
echo "$CLIENT_PID" > "/tmp/mcp-demo-client.pid"

echo ""
echo "✅ Demo servers started successfully!"
echo ""
echo "🌐 Open your browser to:"
echo ""
echo "   📱 STANDARD ARCHITECTURE DEMO:"
echo "     Client:           http://localhost:3000"
echo "     Client (alt):     http://localhost:3000/client"  
echo "     Pi Calculator:    http://localhost:3001/pi-calculator"
echo "     Mermaid Editor:   http://localhost:3001/mermaid-editor"
echo "     JSON Analyzer:    http://localhost:3001/json-analyzer"
echo ""
echo "   🔄 INVERTED ARCHITECTURE DEMO:"
echo "     User Dashboard:   http://localhost:3000/inverted"
echo ""
echo "📋 Demo Instructions:"
echo ""
echo "   🔄 STANDARD ARCHITECTURE (Client controls Server):"
echo "   1. Open http://localhost:3000 in your browser"
echo "   2. Add servers from the examples dropdown"
echo "   3. Click 'Setup' to configure each server"
echo "   4. Click 'Connect' to start using MCP tools"
echo ""
echo "   🔄 INVERTED ARCHITECTURE (Server controls Client):"
echo "   1. Open http://localhost:3000/inverted in your browser"
echo "   2. The AI Copilot will automatically load in the sidebar"
echo "   3. Chat with the copilot to access dashboard data"
echo "   4. Try asking 'Who am I?' or 'What are my projects?'"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for user interrupt
while true; do
    sleep 1
done