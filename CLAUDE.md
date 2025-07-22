# CLAUDE.md

This file provides guidance to Claude when working with code in this repository. It covers the project's architecture, key concepts, development patterns, and common tasks.

## 1. Project Overview

This is a reference implementation of a **PostMessage transport for the Model Context Protocol (MCP)**. Its primary purpose is to enable secure, zero-installation MCP servers that run directly in a web browser (within an `<iframe>` or popup window).

The core innovation is leveraging the browser's native `window.postMessage` API for communication, which allows for:
- **Zero Installation**: Servers are just URLs, eliminating security risks and setup friction for users.
- **Privacy-First Processing**: Sensitive data can be processed on the user's machine within the browser sandbox, without being sent to a remote server.
- **Rich Interactive UIs**: MCP servers can provide full graphical user interfaces, not just text-based tool responses.
- **Inverted Architectures**: Applications can provide contextual data as tools to an embedded AI client, not just the other way around.

## 2. Core Concepts

Understanding the separation between the **Window Hierarchy** and **MCP Roles** is critical to understanding this project.

### 2.1. Window Hierarchy vs. MCP Roles

The transport is designed around two independent sets of roles:

1.  **Window Hierarchy Roles (The "Physical" Layer)**: This describes the browser window relationship.
    *   **`Outer Frame`**: The main, controlling window. It embeds and manages the other window. It uses `OuterFrameTransport`.
    *   **`Inner Frame`**: The subordinate, controlled window (e.g., an `<iframe>` or popup). It uses `InnerFrameTransport`.

2.  **MCP Protocol Roles (The "Logical" Layer)**: This describes the roles defined by the Model Context Protocol itself.
    *   **MCP Client**: The entity that calls tools (e.g., `client.callTool()`).
    *   **MCP Server**: The entity that provides tools (e.g., `server.registerTool()`).

This separation allows for two powerful architectural patterns.

### 2.2. Supported Architectures

#### A. Standard Architecture (Client-in-Control)

This is the most common pattern, where a primary application consumes tools from an embedded service.

-   **Outer Frame**: **MCP Client** (e.g., the Demo Client `demo-client/app.tsx`)
-   **Inner Frame**: **MCP Server** (e.g., Pi Calculator, JSON Analyzer)
-   **Data Flow**: The Outer Frame calls tools provided by the Inner Frame.
-   **Example Use Case**: A chat application embeds a diagramming tool. The chat app is the client, the diagramming tool is the server.

#### B. Inverted Architecture (Server-in-Control)

This powerful pattern allows a primary application to securely provide its own context as tools to an embedded AI assistant.

-   **Outer Frame**: **MCP Server** (e.g., the User Dashboard `demo/inverted/server.ts`)
-   **Inner Frame**: **MCP Client** (e.g., the AI Copilot `demo/inverted/ai-copilot/client.ts`)
-   **Data Flow**: The Inner Frame calls tools provided by the Outer Frame to access application data.
-   **Example Use Case**: A user dashboard with sensitive data embeds a sandboxed AI copilot. The dashboard acts as an MCP server, providing tools like `getCurrentUser()` and `getSystemHealth()`. The embedded copilot is an MCP client that calls these tools to answer user questions.

| Transport Feature         | Standard Architecture      | Inverted Architecture   |
|:--------------------------|:---------------------------|:------------------------|
| **Outer Frame Role**      | MCP Client                 | MCP Server              |
| **Inner Frame Role**      | MCP Server                 | MCP Client              |
| **Who provides tools?**   | Inner Frame                | Outer Frame             |
| **Who calls tools?**      | Outer Frame                | Inner Frame             |

## 3. Two-Phase Protocol

The transport uses a two-phase connection model, orchestrated by URL hash parameters.

1.  **Setup Phase (`#setup` URL hash)**: A one-time configuration step when a server is first added. This is for authentication, setting API keys, user preferences, etc. The server can present a UI for this. The results (display name, visibility preferences) are persisted by the client.
2.  **Transport Phase (no `#setup` hash)**: The normal, ongoing communication phase. The server is loaded without the setup hash, performs a transport handshake, and then exchanges standard MCP JSON-RPC messages.

A server must implement logic for both phases, typically by using the `getServerPhase()` utility.

## 4. Directory & Code Architecture

-   `src/protocol/`: The formal protocol specification (`README.md`) and TypeScript type definitions (`types.ts`). **This is the source of truth.**
-   `src/sdk/`: The core transport SDK.
    -   `transport/postmessage/outer-frame.ts`: Logic for the **controlling window** (`OuterFrameTransport`, `IframeWindowControl`).
    -   `transport/postmessage/inner-frame.ts`: Logic for the **subordinate window** (`InnerFrameTransport`, `PostMessageInnerControl`).
    -   `utils/`: Helper functions (`getServerPhase`, `generateSessionId`) and the structured `Logger`.
-   `demo-client/`: The React-based **Standard Architecture** demo client.
-   `servers/`: Example **Standard Architecture** MCP servers (Pi Calculator, JSON Analyzer, Mermaid Editor).
-   `demo/inverted/`: The **Inverted Architecture** demo.
    -   `index.html` / `server.ts`: The User Dashboard (Outer Frame, MCP Server).
    -   `ai-copilot/`: The AI Copilot (Inner Frame, MCP Client).

## 5. Development

### 5.1. Key Commands

```bash
# Install all dependencies
bun install

# Run the complete standard demo (client + all servers)
bun run dev

# Run just the standard demo client
bun run demo:client

# Run just the Pi Calculator server
bun run demo:pi

# Run the inverted architecture demo
bun run demo:inverted

# Type checking
bun run type-check

# Build for production
bun run build
```

### 5.2. Testing Strategy

The demo applications serve as the primary end-to-end testing environment.

1.  **Standard Architecture**: Run `bun run dev`. Use the client at `http://localhost:3000` to add, configure, connect to, and call tools on the example servers. Test all visibility modes (hidden, optional, required).
2.  **Inverted Architecture**: Run `bun run demo:inverted`. Open `http://localhost:4000`. Verify the embedded AI copilot connects and can call tools (`getCurrentUser`, etc.) provided by the parent dashboard.

## 6. Protocol Deep Dive

The protocol defines 8 message types. The flow is critical for preventing race conditions and ensuring security.

**Key Principle**: The Outer Frame must always start listening for messages *before* navigating the Inner Frame to its URL.

### 6.1. Setup Phase Flow

1.  **`SetupHandshake` (Inner → Outer)**: The Inner Frame is loaded with `#setup`. It sends this message to `targetOrigin: '*'`, announcing its readiness and whether it needs a visible UI for setup (`requiresVisibleSetup`).
2.  **`SetupHandshakeReply` (Outer → Inner)**: The Outer Frame replies with the `sessionId` for this connection. **Security**: The Inner Frame receives this, validates `event.origin` against its allowlist, and **pins the origin** for all future communication in this session.
3.  **`SetupComplete` (Inner → Outer)**: After any internal setup logic (e.g., user input), the Inner Frame sends this message with the final configuration (`displayName`, `transportVisibility`, etc.) to the Outer Frame, which persists it.

### 6.2. Transport Phase Flow

1.  **`TransportHandshake` (Inner → Outer)**: The Inner Frame is loaded *without* `#setup`. It sends this to `targetOrigin: '*'` to initiate a connection.
2.  **`TransportHandshakeReply` (Outer → Inner)**: The Outer Frame responds with the `sessionId` associated with this server's URL. **Security**: The Inner Frame again validates and **pins `event.origin`**.
3.  **`TransportAccepted` (Inner → Outer)**: The Inner Frame confirms the handshake is complete.
4.  **`MCPMessage` (Bidirectional)**: Standard MCP JSON-RPC messages are now exchanged, wrapped in an `MCPMessage` envelope. Both sides use their pinned origins.
5.  **`SetupRequired` (Inner → Outer)**: Optional message sent by the Inner Frame if it detects a need for re-authentication or re-configuration (e.g., expired token).

## 7. Security Model

Security relies entirely on the browser's `postMessage` guarantees and correct implementation.

-   **Origin Validation**: The **only trusted source of sender identity is `event.origin`** from the `MessageEvent`. Never trust origin information in the message payload.
-   **Origin Allowlist**: The MCP Server (whether in the Inner or Outer Frame) MUST maintain an explicit list of allowed origins for its MCP Client.
-   **Origin Pinning**: The Inner Frame MUST use `targetOrigin: '*'` for its very first message in each phase. Upon receiving the first valid reply from the Outer Frame, it MUST "pin" `event.origin` and use that specific origin for all subsequent `postMessage` calls. This is implemented in `PostMessageInnerControl`.
-   **Iframe Sandboxing**: The Outer Frame should use restrictive `sandbox` attributes on iframes (e.g., `allow-scripts allow-same-origin allow-forms`) to limit the capabilities of embedded content.

## 8. How to Create a New Server (Standard Architecture)

1.  **Create Directory**: Add a new directory in `servers/`, e.g., `servers/my-new-server/`.
2.  **Create `index.html` and `server.ts`**:
3.  **Implement Phase Logic in `server.ts`**:
    *   Use `getServerPhase()` to detect if you are in `'setup'` or `'transport'`.
    *   Create an `InnerFrameTransport` instance.
    *   **If `phase === 'setup'`**:
        *   Call `transport.prepareSetup()`.
        *   (Optional) Present a UI for configuration.
        *   Use the `sessionId` from the transport to scope any data saved to `localStorage`.
        *   Call `transport.completeSetup()` with the results (`displayName`, `transportVisibility`, etc.).
    *   **If `phase === 'transport'`**:
        *   Call `transport.prepareToConnect()`.
        *   Use the `sessionId` to load any previously saved configuration.
        *   Create an `McpServer` instance.
        *   Register your tools using `server.registerTool()`.
        *   Connect the server: `await server.connect(transport)`.
        *   (Optional) Implement the runtime UI.
4.  **Add to Demo**: Add the server's URL to `demo-client/servers.json` to make it appear in the demo client's examples.

### Example Server Structure

```typescript
// in servers/my-new-server/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InnerFrameTransport, PostMessageInnerControl } from '$sdk/transport/postmessage/index.js';
import { getServerPhase } from '$sdk/utils/helpers.js';
import { z } from 'zod';

const phase = getServerPhase();
const transport = new InnerFrameTransport(
  new PostMessageInnerControl(['http://localhost:3000']), // IMPORTANT: Use real client origin in production
  { requiresVisibleSetup: true } // Set to true if setup requires a UI
);

if (phase === 'setup') {
  // === SETUP PHASE LOGIC ===
  await transport.prepareSetup();
  const sessionId = transport.sessionId; // Use this to scope localStorage

  // ... (Optional: show UI, get user input, etc.) ...

  // Example: after user clicks a "Save" button
  const userApiKey = '...'; // Get from user input
  localStorage.setItem(`my-server-api-key-${sessionId}`, userApiKey);

  await transport.completeSetup({
    displayName: 'My New Awesome Server',
    transportVisibility: { requirement: 'hidden' }, // or 'optional'/'required'
    ephemeralMessage: 'Configuration saved!'
  });

} else {
  // === TRANSPORT PHASE LOGIC ===
  await transport.prepareToConnect();
  const sessionId = transport.sessionId;
  const apiKey = localStorage.getItem(`my-server-api-key-${sessionId}`);

  if (!apiKey) {
    // If config is missing, we can force a re-setup
    // This requires a `SetupRequired` message implementation (see protocol).
    console.error("API Key not found for session", sessionId);
    // In a real app, you might send a SetupRequired message here.
    return;
  }

  const server = new McpServer({ name: 'my-new-server', version: '1.0.0' });

  server.registerTool('my_tool', {
    title: 'My Awesome Tool',
    description: 'Does something awesome. Example: someValue',
    inputSchema: { some_param: z.string() }
  }, async ({ some_param }) => {
    // Use apiKey and some_param to do work
    const result = `Used API key ending in ...${apiKey.slice(-4)} with param: ${some_param}`;
    return { content: [{ type: 'text', text: result }] };
  });

  await server.connect(transport);
  console.log('My New Server is connected and ready.');
}
```

## 9. Common Issues & Gotchas

-   **Origin Mismatches**: The most common error. Ensure `allowedOrigins` in the server's `PostMessageInnerControl` exactly matches the client's origin, including protocol (`http`/`https`), domain, and port.
-   **Message Timing Race Condition**: The Outer Frame must add its `'message'` event listener *before* it sets the `src` of the iframe. Otherwise, the Inner Frame's initial handshake message may be missed. The demo client and SDK handle this correctly.
-   **Blocked Popups**: If using `PopupWindowControl`, browsers may block the popup. This must be initiated from a user gesture (e.g., a button click).
-   **Broken Tool Forms**: The demo client parses `Example: value` from a tool's `description` to pre-fill forms. If this parsing fails, the form might be empty. Ensure examples are simple and singular.
-   **State Lost on Reload**: Server state must be persisted, typically in `localStorage`. This state **must be keyed by the `sessionId`** provided by the client during the handshake to ensure data is correctly isolated and retrieved across page loads.
