/**
 * PostMessage Transport Protocol v3 - Message Interfaces
 * 
 * This protocol defines a two-phase approach to MCP server connections:
 * 1. Setup Phase - One-time configuration when adding a server
 * 2. Transport Phase - Active MCP communication with configured servers
 * 
 * PHASE DETECTION:
 * - Setup: Server URL includes #setup hash parameter
 * - Transport: Server URL has no hash parameter
 * 
 * SECURITY: Servers must always validate message origins using event.origin
 * from the browser's MessageEvent API. This is the only trusted source of
 * origin information in the postMessage security model.
 * 
 * TARGET ORIGINS:
 * - Server's first message in each phase uses targetOrigin '*' (doesn't know client yet)
 * - After receiving client's first message, server pins event.origin and uses it exclusively
 * - Client always uses server's origin (known from iframe URL) as targetOrigin
 */

// ============================================================================
// SETUP PHASE MESSAGES
// ============================================================================

/**
 * Step 1: Server → Client
 * 
 * Context: User has clicked "Add Server" in the client UI and entered a URL.
 * The client creates a hidden iframe pointing to the server URL with #setup.
 * The server detects the setup parameter and sends this handshake message.
 * 
 * This message is sent before trust is established, so it contains only
 * the minimum information needed to proceed with setup.
 * 
 * TARGET ORIGIN: The server must use '*' as the target origin for this
 * message because it doesn't yet know who is framing it. This is the ONLY
 * message where '*' is acceptable.
 */
export interface SetupHandshakeMessage {
  type: 'MCP_SETUP_HANDSHAKE';
  
  /** Version of the PostMessage transport protocol this server supports */
  protocolVersion: '1.0';
  
  /** Whether the server needs to show UI during setup */
  requiresVisibleSetup: boolean;
}

/**
 * Step 2: Client → Server
 * 
 * Context: The client has received the handshake message and validates that
 * it can work with this protocol version. If requiresVisibleSetup is true,
 * the client makes the iframe visible to the user.
 * 
 * The client sends this reply to complete the mutual handshake. The server
 * will validate the origin using event.origin from the MessageEvent.
 * 
 * TARGET ORIGIN: The client uses the server's origin (from the iframe URL)
 * as the target origin for this and all subsequent messages.
 * 
 * SECURITY: Upon receiving this message, the server must:
 * 1. Check event.origin against its allowed origins list
 * 2. If allowed, pin this origin for all future messages to this client
 * 3. Never use '*' as target origin after this point
 */
export interface SetupHandshakeReplyMessage {
  type: 'MCP_SETUP_HANDSHAKE_REPLY';
  
  /** 
   * Protocol version the client supports - allows for version negotiation
   * The server can reject if incompatible
   */
  protocolVersion: '1.0';
  
  /** 
   * Unique identifier for this server connection
   * Used to isolate data storage between different server entries
   */
  sessionId: string;
}

/**
 * Step 3: Server → Client
 * 
 * Context: Setup is now in progress. If visible, the server is showing
 * its configuration UI (auth forms, option selections, etc). The user
 * interacts with this UI until setup is complete.
 * 
 * When setup finishes (successfully or with error), the server sends
 * this message. The client saves the configuration data and can hide
 * the iframe.
 * 
 * TARGET ORIGIN: The server uses the pinned origin from Step 2.
 */
export interface SetupCompleteMessage {
  type: 'MCP_SETUP_COMPLETE';
  
  /** Whether setup succeeded or failed */
  status: 'success' | 'error';
  
  /** 
   * Display name for this server configuration
   * Examples: "OpenAI GPT-4", "John's Health Records", "Test Database"
   * This appears in the client's server list
   */
  serverTitle: string;
  
  /** 
   * Optional message to briefly show the user (toast/notification style)
   * Examples: "Successfully authenticated!", "Configuration saved"
   */
  ephemeralMessage?: string;
  
  /** 
   * Visibility behavior during transport phase
   */
  transportVisibility: {
    /** 
     * Visibility requirement:
     * - 'required': Server must be visible (e.g., shows live visualizations)
     * - 'optional': User can choose (e.g., can show logs but not necessary)
     * - 'hidden': Server should stay hidden (most common case)
     */
    requirement: 'required' | 'optional' | 'hidden';
    
    /** 
     * If requirement is 'optional', explain the tradeoff to help user decide
     * Example: "Show server to see real-time query logs and performance metrics"
     */
    optionalMessage?: string;
  };
  
  /** If status is 'error', details about what went wrong */
  error?: {
    code: 'USER_CANCELLED' | 'AUTH_FAILED' | 'TIMEOUT' | 'CONFIG_ERROR';
    message: string;
  };
}

// ============================================================================
// TRANSPORT PHASE MESSAGES
// ============================================================================

/**
 * Step 1: Server → Client
 * 
 * Context: User has clicked "Connect" on a previously configured server.
 * The client creates an iframe (visible or hidden based on saved preferences)
 * and navigates to the server URL WITHOUT #setup parameter. The server detects
 * the absence of the parameter and sends this transport handshake.
 * 
 * Note: This is a different iframe instance than during setup - the server
 * is stateless between connections.
 * 
 * TARGET ORIGIN: The server must use '*' because this is a fresh iframe
 * and it doesn't know the client origin yet. This mirrors the setup phase.
 */
export interface TransportHandshakeMessage {
  type: 'MCP_TRANSPORT_HANDSHAKE';
  
  /** Protocol version for compatibility checking */
  protocolVersion: '1.0';
}

/**
 * Step 2: Client → Server
 * 
 * Context: The client received the handshake message and wants to establish
 * the MCP transport connection. It sends this reply with session details.
 * The server validates the origin using event.origin from the MessageEvent.
 * 
 * TARGET ORIGIN: The client uses the server's origin (from the iframe URL).
 * 
 * SECURITY: Upon receiving this message, the server must:
 * 1. Check event.origin against its allowed origins list
 * 2. If allowed, pin this origin for all messages in this session
 * 3. Use only the pinned origin (never '*') for the rest of the session
 */
export interface TransportHandshakeReplyMessage {
  type: 'MCP_TRANSPORT_HANDSHAKE_REPLY';
  
  /** Unique identifier for this connection session */
  sessionId: string;
  
  /** Protocol version for compatibility checking */
  protocolVersion: '1.0';
}

/**
 * Step 3: Server → Client
 * 
 * Context: The server has validated the client's origin and is ready
 * to begin MCP protocol communication. After this message, both sides
 * can exchange standard MCP messages.
 * 
 * TARGET ORIGIN: The server uses the pinned origin from Step 2.
 */
export interface TransportAcceptedMessage {
  type: 'MCP_TRANSPORT_ACCEPTED';
  
  /** Echo back the session ID to confirm */
  sessionId: string;
}

/**
 * After the transport handshake is complete, the client and server exchange
 * standard MCP protocol messages (JSON-RPC 2.0 format). All MCP messages
 * use the pinned origins established during handshake:
 * - Server → Client: Uses the pinned client origin from Step 2
 * - Client → Server: Uses the server origin from the iframe URL
 */

/**
 * MCP Message Wrapper (Bidirectional)
 * 
 * Context: After TransportAccepted, all MCP protocol messages are wrapped
 * in this message type. This allows the transport to distinguish between
 * transport control messages and MCP protocol messages.
 * 
 * TARGET ORIGIN: Both parties use their respective pinned origins.
 */
export interface MCPMessage {
  type: 'MCP_MESSAGE';
  
  /** The complete MCP JSON-RPC 2.0 message */
  payload: {
    jsonrpc: '2.0';
    id?: string | number;
    method?: string;
    params?: any;
    result?: any;
    error?: any;
  };
}

// ============================================================================
// RUNTIME MESSAGES (During Active Transport)
// ============================================================================

/**
 * Server → Client (Optional)
 * 
 * Context: During an active MCP session, the server realizes it needs
 * the user to run setup again. For example:
 * - OAuth token has expired
 * - API key is no longer valid  
 * - Server configuration has changed
 * - User permissions have changed
 * 
 * The client should prompt the user to re-run setup for this server.
 * 
 * TARGET ORIGIN: The server uses the pinned origin from the session.
 */
export interface SetupRequiredMessage {
  type: 'MCP_SETUP_REQUIRED';
  
  /** Why setup is needed again */
  reason: 'AUTH_EXPIRED' | 'CONFIG_CHANGED' | 'PERMISSIONS_CHANGED' | 'OTHER';
  
  /** Human-readable explanation */
  message: string;
  
  /** 
   * Whether the current session can continue working
   * - true: Session works but setup recommended soon
   * - false: Session will fail, setup required immediately
   */
  canContinue: boolean;
}

// ============================================================================
// TYPE GUARDS AND UTILITIES
// ============================================================================

/** All setup phase messages */
export type SetupMessage = 
  | SetupHandshakeMessage 
  | SetupHandshakeReplyMessage 
  | SetupCompleteMessage;

/** All transport phase messages */
export type TransportMessage = 
  | TransportHandshakeMessage 
  | TransportHandshakeReplyMessage 
  | TransportAcceptedMessage
  | SetupRequiredMessage
  | MCPMessage;

/** All PostMessage protocol messages */
export type PostMessageProtocolMessage = 
  | SetupMessage 
  | TransportMessage;

/** Check if a message is a PostMessage protocol message */
export function isPostMessageProtocol(message: any): message is PostMessageProtocolMessage {
  return message?.type?.startsWith('MCP_');
}

/** Check if a message is from setup phase */
export function isSetupMessage(message: any): message is SetupMessage {
  return message?.type?.startsWith('MCP_SETUP_') && 
         message.type !== 'MCP_SETUP_REQUIRED';
}

/** Check if a message is from transport phase */
export function isTransportMessage(message: any): message is TransportMessage {
  return message?.type?.startsWith('MCP_TRANSPORT_') ||
         message?.type === 'MCP_SETUP_REQUIRED' ||
         message?.type === 'MCP_MESSAGE';
}

/** Check if a message is an MCP message wrapper */
export function isMCPMessage(message: any): message is MCPMessage {
  return message?.type === 'MCP_MESSAGE';
}
