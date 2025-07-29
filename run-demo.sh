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
bun --port 3001 src/demo/servers/**/index.html --hot &
SERVER_PID=$!
echo "$SERVER_PID" > "/tmp/mcp-demo-servers.pid"

echo "Starting client on port 3000..."
cd src/demo/client
bun index.html --port 3000 --hot &
CLIENT_PID=$!
echo "$CLIENT_PID" > "/tmp/mcp-demo-client.pid"
cd - > /dev/null

echo ""
echo "✅ Demo servers started successfully!"
echo ""
echo "🌐 Open your browser to:"
echo "   Client:           http://localhost:3000"
echo "   Pi Calculator:    http://localhost:3001/pi-calculator"
echo "   Mermaid Editor:   http://localhost:3001/mermaid-editor"
echo "   JSON Analyzer:    http://localhost:3001/json-analyzer"
echo ""
echo "📋 Demo Instructions:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. The Pi Calculator should already be in the server list"
echo "3. Click 'Setup' to configure the server"
echo "4. Click 'Connect' to start using the MCP server"
echo "5. Try the interactive Pi calculation with visualization"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for user interrupt
while true; do
    sleep 1
done
