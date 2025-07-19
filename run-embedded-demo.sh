#!/bin/bash

# Run the embedded demo with both parent and iframe servers
echo "🏥 Starting Medical MCP Inverted Architecture Demo..."
echo ""
echo "This will start:"
echo "  - Parent page (MCP Server) on http://localhost:3100"
echo "  - Iframe (MCP Client) on http://localhost:3101"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Function to kill all background processes on exit
cleanup() {
    echo ""
    echo "Stopping all demo servers..."
    jobs -p | xargs kill 2>/dev/null
    exit 0
}

# Set up trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Start the iframe server (MCP Client)
echo "🚀 Starting iframe server (MCP Client) on port 3101..."
cd src/demo-embedded/iframe && bun --port 3101 index.html --hot &
IFRAME_PID=$!

# Wait a moment for the iframe server to start
sleep 2

# Start the parent server (MCP Server)
echo "🚀 Starting parent server (MCP Server) on port 3100..."
cd ../../parent && bun --port 3100 index.html --hot &
PARENT_PID=$!

# Wait a moment for the parent server to start
sleep 2

echo ""
echo "✅ Demo servers started successfully!"
echo ""
echo "🌐 Open your browser and navigate to:"
echo "   http://localhost:3100"
echo ""
echo "📋 Demo features:"
echo "   • View patient data in the parent page (MCP Server)"
echo "   • Chat with AI assistant in the embedded iframe (MCP Client)"
echo "   • Click 'Run Simulation' for an automated demo"
echo "   • Try manual interactions like 'What medications is the patient taking?'"
echo ""

# Wait for background processes
wait