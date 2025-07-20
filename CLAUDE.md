# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a reference implementation of a PostMessage transport for the Model Context Protocol (MCP) that enables zero-installation, browser-native MCP servers. The transport allows MCP servers to run directly in browser contexts (iframes/popups) and communicate with clients using the `window.postMessage` API.

## Development Commands

### Running the Demo
```bash
# Start both demo client and Pi calculator server
bun run demo

# Start only the demo client (port 3000)
bun run demo:client

# Start only the Pi calculator server (port 3001)
bun run demo:pi
```

### Development Tasks
```bash
# Type checking
bun run type-check

# Build for production
bun run build
```

## Core Architecture

### Two-Phase Protocol Design
The transport implements a sophisticated two-phase connection model:

1. **Setup Phase** (`#setup` URL parameter): One-time configuration when adding a server
   - Handles authentication, API keys, user preferences
   - Server can show UI for configuration
   - Results in server title and visibility preferences

2. **Transport Phase** (normal URL): Ongoing MCP communication
   - Standard MCP JSON-RPC messages wrapped in `MCPMessage` envelope
   - Maintains session state and handles tool calls
   - Supports real-time UI updates

### Directory Structure
- `src/client/`: Client-side transport implementation
  - `transport.ts`: Main client transport + setup manager
  - `window-control.ts`: Iframe/popup window abstraction
- `src/server/`: Server-side transport implementation
  - `transport.ts`: Server transport + setup handler
- `src/types/`: TypeScript interfaces and message definitions
- `src/utils/`: Helper functions and utilities
- `demo-client/`: React demo client application
- `servers/`: Example MCP servers (Pi calculator, etc.)

### Key Components

#### Client Side
- `PostMessageTransport`: Main transport for MCP communication
- `PostMessageSetupManager`: Handles server setup/configuration
- `IframeWindowControl`/`PopupWindowControl`: Window management abstractions
- React demo client with full server management UI

#### Server Side
- `PostMessageServerTransport`: Main transport for servers  
- `PostMessageSetupHandler`: Handles setup phase
- Auto-detection of setup vs transport phases via URL hash parameters

## Protocol Message Types

The protocol defines 8 message types across two phases:

### Setup Phase
1. `SetupHandshake` (Server → Client): Server announces readiness
2. `SetupHandshakeReply` (Client → Server): Client responds with protocol version
3. `SetupComplete` (Server → Client): Setup finished with results

### Transport Phase
4. `TransportHandshake` (Server → Client): Server ready for MCP communication
5. `TransportHandshakeReply` (Client → Server): Client responds with session ID
6. `TransportAccepted` (Server → Client): Connection established
7. `MCPMessage` (Bidirectional): Wraps standard MCP JSON-RPC messages
8. `SetupRequired` (Server → Client): Runtime request for re-authentication

## Security Model

- **Origin Validation**: All messages validated using `event.origin` from MessageEvent
- **Origin Pinning**: Server pins client origin after initial handshake
- **Target Origin Rules**: First message uses `'*'`, subsequent messages use pinned origins
- **Sandbox Attributes**: Iframes should include appropriate sandbox restrictions

## Server Visibility Control

Servers specify UI visibility requirements via `transportVisibility`:
- `required`: Must be visible (e.g., interactive diagram editors)
- `optional`: User can choose (e.g., debug views, real-time logs)
- `hidden`: Background operation only (most common)

## Creating New Servers

1. Create server directory in `servers/`
2. Implement HTML entry point with iframe-appropriate styling
3. Use `getServerPhase()` to detect setup vs transport phase
4. Setup phase: Use `PostMessageSetupHandler` with `onSetup` callback
5. Transport phase: Use `PostMessageServerTransport` with MCP server
6. Register MCP tools using `server.registerTool()`

### Example Server Structure
```typescript
const phase = getServerPhase();

if (phase === 'setup') {
  const setupHandler = new PostMessageSetupHandler({
    allowedOrigins: ['http://localhost:3000'],
    requiresVisibleSetup: false,
    displayName: 'My Server',
    transportVisibility: { requirement: 'hidden' },
    onSetup: async () => {
      // Handle configuration logic
    }
  });
  await setupHandler.start();
} else {
  const server = new McpServer({ name: 'my-server', version: '1.0.0' });
  
  server.registerTool('my_tool', {
    title: 'My Tool',
    description: 'Does something useful',
    inputSchema: { param: z.string() }
  }, async ({ param }) => {
    // Tool implementation
  });
  
  const transport = new PostMessageServerTransport({
    allowedOrigins: ['http://localhost:3000']
  });
  
  await server.connect(transport);
}
```

## Client Integration

To integrate with the client:
1. Add server URL to `SERVER_EXAMPLES` in `demo-client/app.tsx`
2. Client handles setup phase automatically
3. Tools appear dynamically in the UI after connection
4. Tool parameters are generated from MCP schema

## Development Patterns

### Tool Parameter Schema Design

When designing MCP tool input schemas, be careful with examples:
- **Use singular examples only** (not arrays) in schema descriptions 
- The demo client parses `Example: value` from descriptions to populate form fields
- Arrays in examples break the string parsing logic
- Generate examples by introspecting actual user data when possible

Example:
```typescript
// Good - singular example that can be parsed
path: z.string().describe('JSONPath expression. Example: $.users[0].name')

// Bad - would break client form parsing  
paths: z.array(z.string()).describe('JSONPath expressions. Example: ["$.users", "$.data"]')
```

### WindowControl Pattern
Use the `WindowControl` interface to abstract iframe/popup management:
```typescript
const windowControl = new IframeWindowControl({
  iframe: myIframe,
  setVisible: (visible) => { /* handle visibility */ },
  onNavigate: (url) => { /* handle navigation */ },
  onLoad: () => { /* handle load */ }
});
```

### Progressive Enhancement
Servers should work both headless and with rich UI:
- Start with minimal viable functionality
- Add UI progressively based on visibility requirements
- Use `requiresVisibleSetup` only when absolutely necessary

### Error Handling
- Use try/catch blocks around all async operations
- Provide user-friendly error messages
- Log detailed errors to console for debugging
- Handle network failures gracefully

## Common Issues

- **Origin Mismatches**: Ensure `allowedOrigins` matches client domain exactly
- **Iframe Sandboxing**: Include `allow-scripts allow-same-origin allow-forms` in sandbox
- **Phase Detection**: Use `getServerPhase()` instead of manual URL parsing
- **Message Timing**: Wait for handshake completion before sending MCP messages
- **Cleanup**: Always call cleanup functions when destroying transports

## Testing Strategy

The demo client serves as the primary testing environment:
1. Start demo with `bun run demo`
2. Add server URL to client
3. Test setup phase (configuration UI if needed)
4. Test transport phase (tool calls, real-time updates)
5. Test error conditions (network failures, auth errors)
6. Test multiple concurrent connections