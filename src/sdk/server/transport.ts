/**
 * PostMessage Transport for MCP Servers
 * @module @modelcontextprotocol/sdk/server/transport
 */

import { Transport, JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  PostMessageServerConfig,
  PostMessageServerTransportOptions,
  SetupHandlerOptions
} from '$sdk/types/postmessage.js';
import {
  SetupHandshakeMessage,
  SetupHandshakeReplyMessage,
  SetupCompleteMessage,
  TransportHandshakeMessage,
  TransportHandshakeReplyMessage,
  TransportAcceptedMessage,
  MCPMessage,
  isSetupMessage,
  isTransportMessage,
  isMCPMessage
} from '$protocol/types.js';
import {
  getMessageTarget,
  getServerPhase,
  isOriginAllowed,
  withTimeout
} from '$sdk/utils/helpers.js';

// ============================================================================
// SETUP HELPER
// ============================================================================

/**
 * Helper for PostMessage server setup
 */
export class PostMessageSetupHelper {
  private allowedOrigins: string[];
  private requiresVisibleSetup: boolean;
  private messageTarget: Window;
  private clientOrigin: string | null = null;
  private sessionId: string | null = null;
  private handshakeComplete = false;
  private messageHandler?: (event: MessageEvent) => void;
  private handshakeResolver?: () => void;

  constructor(options: { 
    allowedOrigins: string[]; 
    requiresVisibleSetup: boolean;
  }) {
    this.allowedOrigins = options.allowedOrigins;
    this.requiresVisibleSetup = options.requiresVisibleSetup;
    this.messageTarget = getMessageTarget();
  }

  /**
   * Wait for handshake to complete
   */
  async waitForHandshake(): Promise<void> {
    if (this.handshakeComplete) {
      return;
    }

    // Set up message handler
    this.messageHandler = (event: MessageEvent) => {
      this.handleMessage(event);
    };
    window.addEventListener('message', this.messageHandler);

    // Announce ready
    this.announceReady();

    // Wait for handshake
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.handshakeResolver = undefined;
        reject(new Error('Handshake timeout'));
      }, 30000);
      
      // Store the resolver to be called when handshake message arrives
      this.handshakeResolver = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  }

  /**
   * Get the session ID from handshake
   */
  get sessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Complete setup with results
   */
  async completeSetup(result: {
    serverTitle: string;
    transportVisibility: {
      requirement: 'required' | 'optional' | 'hidden';
      optionalMessage?: string;
    };
    ephemeralMessage?: string;
  }): Promise<void> {
    if (!this.handshakeComplete || !this.clientOrigin) {
      throw new Error('Cannot complete setup before handshake');
    }
    
    const message: SetupCompleteMessage = {
      type: 'MCP_SETUP_COMPLETE',
      status: 'success',
      serverTitle: result.serverTitle,
      transportVisibility: result.transportVisibility,
      ephemeralMessage: result.ephemeralMessage
    };
    
    this.messageTarget.postMessage(message, this.clientOrigin);
    this.cleanup();
  }

  private announceReady(): void {
    const message: SetupHandshakeMessage = {
      type: 'MCP_SETUP_HANDSHAKE',
      protocolVersion: '1.0',
      requiresVisibleSetup: this.requiresVisibleSetup
    };
    this.messageTarget.postMessage(message, '*');
  }

  private handleMessage(event: MessageEvent): void {
    if (!isSetupMessage(event.data)) {
      return;
    }

    const message = event.data;

    if (message.type === 'MCP_SETUP_HANDSHAKE_REPLY' && !this.handshakeComplete) {
      const reply = message as SetupHandshakeReplyMessage;
      
      if (!isOriginAllowed(event.origin, this.allowedOrigins)) {
        console.warn(`Rejected setup from unauthorized origin: ${event.origin}`);
        return;
      }

      if (reply.protocolVersion !== '1.0') {
        console.warn(`Incompatible protocol version: ${reply.protocolVersion}`);
        return;
      }

      this.clientOrigin = event.origin;
      this.sessionId = reply.sessionId;
      this.handshakeComplete = true;
      
      // Resolve the handshake promise immediately
      if (this.handshakeResolver) {
        this.handshakeResolver();
        this.handshakeResolver = undefined;
      }
    }
  }

  private cleanup(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = undefined;
    }
  }
}

// ============================================================================
// SERVER TRANSPORT
// ============================================================================

/**
 * PostMessage transport for MCP servers
 */
export class PostMessageServerTransport implements Transport {
  private config: PostMessageServerConfig;
  private messageTarget: Window;
  private clientOrigin: string | null = null;
  private sessionId: string | null = null;
  private protocolVersion?: string;
  private isConnected = false;
  private messageHandler?: (event: MessageEvent) => void;
  private connectionResolver?: () => void;

  // Transport callbacks
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options: PostMessageServerTransportOptions) {
    this.config = {
      allowedOrigins: options.allowedOrigins,
      serverInfo: options.serverInfo
    };
    this.messageTarget = options.messageTarget || getMessageTarget();
  }

  /**
   * Start the transport
   */
  async start(): Promise<void> {
    if (this.messageHandler) {
      throw new Error('Transport already started');
    }

    // Set up message handler
    this.messageHandler = (event: MessageEvent) => {
      this.handleMessage(event);
    };
    window.addEventListener('message', this.messageHandler);

    try {
      // Announce ready
      this.announceReady();

      // Wait for handshake
      await this.waitForConnection();
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  /**
   * Send a message to the client
   */
  async send(message: JSONRPCMessage): Promise<void> {
    console.log(`[SERVER TRANSPORT] Sending message to client:`, message);
    
    if (!this.isConnected || !this.clientOrigin) {
      console.log(`[SERVER TRANSPORT] Cannot send - not connected or no client origin`);
      throw new Error('Not connected to client');
    }

    try {
      const mcpMessage: MCPMessage = {
        type: 'MCP_MESSAGE',
        payload: message as any
      };
      
      console.log(`[SERVER TRANSPORT] Posting MCP message to ${this.clientOrigin}:`, mcpMessage);
      this.messageTarget.postMessage(mcpMessage, this.clientOrigin);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.log(`[SERVER TRANSPORT] Send error:`, err);
      this.onerror?.(err);
      throw err;
    }
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    this.isConnected = false;
    this.clientOrigin = null;
    this.sessionId = null;
    this.cleanup();
    this.onclose?.();
  }

  /**
   * Get session ID
   */
  get sessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get protocol version
   */
  get protocolVersion(): string | undefined {
    return this.protocolVersion;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  private announceReady(): void {
    const message: TransportHandshakeMessage = {
      type: 'MCP_TRANSPORT_HANDSHAKE',
      protocolVersion: '1.0'
    };
    this.messageTarget.postMessage(message, '*');
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data;
    console.log(`[SERVER TRANSPORT] Received message:`, data);

    // Handle transport handshake reply
    if (data.type === 'MCP_TRANSPORT_HANDSHAKE_REPLY' && !this.isConnected) {
      const reply = data as TransportHandshakeReplyMessage;
      
      // Validate origin
      if (!isOriginAllowed(event.origin, this.config.allowedOrigins)) {
        console.warn(`Rejected transport from unauthorized origin: ${event.origin}`);
        
        this.onerror?.(new Error(`Unauthorized origin: ${event.origin}`));
        return;
      }

      // Check protocol version
      if (reply.protocolVersion !== '1.0') {
        console.warn(`Incompatible protocol version: ${reply.protocolVersion}`);
        this.onerror?.(new Error(`Incompatible protocol version: ${reply.protocolVersion}`));
        return;
      }

      // Accept handshake
      this.clientOrigin = event.origin;
      this.sessionId = reply.sessionId;
      this.protocolVersion = reply.protocolVersion;
      this.isConnected = true;

      // Send transport accepted
      const response: TransportAcceptedMessage = {
        type: 'MCP_TRANSPORT_ACCEPTED',
        sessionId: this.sessionId
      };
      this.messageTarget.postMessage(response, this.clientOrigin);
      
      // Resolve the connection promise immediately
      if (this.connectionResolver) {
        this.connectionResolver();
        this.connectionResolver = undefined;
      }
      return;
    }

    // Handle MCP messages
    if (this.isConnected && event.origin === this.clientOrigin && isMCPMessage(event.data)) {
      const mcpMessage = event.data as MCPMessage;
      console.log(`[SERVER TRANSPORT] Processing MCP message payload:`, mcpMessage.payload);
      this.onmessage?.(mcpMessage.payload as JSONRPCMessage);
    } else {
      console.log(`[SERVER TRANSPORT] Not processing message - connected: ${this.isConnected}, origin match: ${event.origin === this.clientOrigin}, isMCPMessage: ${isMCPMessage(event.data)}`);
    }
  }

  private async waitForConnection(): Promise<void> {
    if (this.isConnected) {
      return;
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connectionResolver = undefined;
        reject(new Error('Connection timeout'));
      }, 30000);
      
      // Store the resolver to be called when connection message arrives
      this.connectionResolver = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  }

  private cleanup(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = undefined;
    }
  }
}

