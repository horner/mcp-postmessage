/**
 * PostMessage Transport for MCP Clients
 * @module @modelcontextprotocol/sdk/client/transport
 */

import { Transport, JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  WindowControl,
  PostMessageTransportOptions
} from '$sdk/types/postmessage.js';
import {
  TransportHandshakeMessage,
  TransportHandshakeReplyMessage,
  TransportAcceptedMessage,
  MCPMessage,
  isTransportMessage,
  isMCPMessage
} from '$protocol/types.js';
import { 
  generateSessionId, 
  getTransportUrl, 
  withTimeout 
} from '$sdk/utils/helpers.js';

/**
 * PostMessage transport implementation for MCP clients
 */
export class PostMessageTransport implements Transport {
  private serverUrl: URL;
  private windowControl: WindowControl;
  private sessionId: string;
  private protocolVersion: string;
  
  private isConnected = false;
  private messageQueue: JSONRPCMessage[] = [];
  private cleanupHandler?: () => void;
  private handshakePromise?: Promise<void>;

  // Transport callbacks
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(options: PostMessageTransportOptions) {
    this.serverUrl = new URL(options.serverUrl);
    this.windowControl = options.windowControl;
    this.sessionId = options.sessionId || generateSessionId();
    this.protocolVersion = options.protocolVersion || '2024-11-05';
  }

  /**
   * Start the transport connection
   */
  async start(): Promise<void> {
    if (this.cleanupHandler) {
      throw new Error('Transport already started');
    }

    // Set up message handler
    this.cleanupHandler = this.windowControl.onMessage((event) => {
      this.handleMessage(event);
    });

    try {
      // Navigate to transport URL (without setup parameters)
      const transportUrl = getTransportUrl(this.serverUrl);
      await this.windowControl.navigate(transportUrl.href);
      
      // Perform handshake
      this.handshakePromise = this.performHandshake();
      await this.handshakePromise;
      this.handshakePromise = undefined; // Clear handshake promise after completion
      
      // Process queued messages
      this.processMessageQueue();
      
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  /**
   * Send a message to the server
   */
  async send(message: JSONRPCMessage): Promise<void> {
    console.log(`[CLIENT TRANSPORT] Sending message:`, message);
    
    if (!this.isConnected) {
      // Queue messages until connected
      console.log(`[CLIENT TRANSPORT] Not connected, queueing message`);
      this.messageQueue.push(message);
      return;
    }

    try {
      const mcpMessage: MCPMessage = {
        type: 'MCP_MESSAGE',
        payload: message as any
      };
      
      const transportUrl = getTransportUrl(this.serverUrl);
      console.log(`[CLIENT TRANSPORT] Posting MCP message to ${transportUrl.origin}:`, mcpMessage);
      this.windowControl.postMessage(mcpMessage, transportUrl.origin);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.log(`[CLIENT TRANSPORT] Send error:`, err);
      this.onerror?.(err);
      throw err;
    }
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    this.isConnected = false;
    this.cleanup();
    this.onclose?.();
  }

  /**
   * Perform handshake with server
   */
  private async performHandshake(): Promise<void> {
    const transportUrl = getTransportUrl(this.serverUrl);
    
    return withTimeout(
      new Promise<void>((resolve, reject) => {
        let handshakeComplete = false;
        let serverReady = false;

        const tempHandler = this.windowControl.onMessage((event) => {
          // Validate origin
          if (event.origin !== transportUrl.origin) {
            return;
          }

          if (!isTransportMessage(event.data)) {
            return;
          }

          const message = event.data;

          // Handle transport ready
          if (message.type === 'MCP_TRANSPORT_HANDSHAKE' && !handshakeComplete) {
            const handshakeMsg = message as TransportHandshakeMessage;
            
            // Check protocol version compatibility
            if (handshakeMsg.protocolVersion !== '1.0') {
              tempHandler();
              reject(new Error(`Incompatible protocol version: ${handshakeMsg.protocolVersion}`));
              return;
            }
            
            serverReady = true;
            
            // Send handshake reply
            const reply: TransportHandshakeReplyMessage = {
              type: 'MCP_TRANSPORT_HANDSHAKE_REPLY',
              sessionId: this.sessionId,
              protocolVersion: '1.0'
            };
            
            this.windowControl.postMessage(reply, transportUrl.origin);
            return;
          }

          // Handle transport accepted
          if (message.type === 'MCP_TRANSPORT_ACCEPTED' && serverReady) {
            const acceptedMsg = message as TransportAcceptedMessage;
            
            if (acceptedMsg.sessionId !== this.sessionId) {
              tempHandler();
              reject(new Error('Session ID mismatch'));
              return;
            }

            handshakeComplete = true;
            this.isConnected = true;
            tempHandler(); // Clean up temporary handler
            resolve();
          }
        });
      }),
      30000,
      'Transport handshake timeout'
    );
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(event: MessageEvent): void {
    console.log(`[CLIENT TRANSPORT] Received message from ${event.origin}:`, event.data);
    
    // Skip if still in handshake
    if (this.handshakePromise) {
      console.log(`[CLIENT TRANSPORT] Skipping message during handshake`);
      return;
    }

    // Validate origin
    const transportUrl = getTransportUrl(this.serverUrl);
    if (event.origin !== transportUrl.origin) {
      console.log(`[CLIENT TRANSPORT] Origin mismatch: expected ${transportUrl.origin}, got ${event.origin}`);
      return;
    }

    // Handle MCP messages
    if (this.isConnected && isMCPMessage(event.data)) {
      const mcpMessage = event.data as MCPMessage;
      console.log(`[CLIENT TRANSPORT] Processing MCP message payload:`, mcpMessage.payload);
      this.onmessage?.(mcpMessage.payload as JSONRPCMessage);
    } else {
      console.log(`[CLIENT TRANSPORT] Not processing message - connected: ${this.isConnected}, isMCPMessage: ${isMCPMessage(event.data)}`);
    }
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    const queue = [...this.messageQueue];
    this.messageQueue = [];
    
    for (const message of queue) {
      this.send(message).catch(error => {
        this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      });
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.cleanupHandler) {
      this.cleanupHandler();
      this.cleanupHandler = undefined;
    }
    this.messageQueue = [];
    this.handshakePromise = undefined;
  }
}

// ============================================================================
// SETUP MANAGER
// ============================================================================

import {
  SetupManagerOptions,
  SetupResult
} from '$sdk/types/postmessage.js';
import {
  SetupHandshakeMessage,
  SetupHandshakeReplyMessage,
  SetupCompleteMessage,
  isSetupMessage
} from '$protocol/types.js';
import { getSetupUrl } from '$sdk/utils/helpers.js';

/**
 * Manages the setup phase for PostMessage servers
 */
export class PostMessageSetupManager {
  private windowControl: WindowControl;
  private sessionId: string;
  private setupTimeout?: number;

  constructor(options: SetupManagerOptions) {
    this.windowControl = options.windowControl;
    this.sessionId = options.sessionId;
    this.setupTimeout = options.setupTimeout;
  }

  /**
   * Perform setup for a server
   */
  async performSetup(serverUrl: string | URL): Promise<SetupResult> {
    const startTime = Date.now();
    console.log(`[SETUP MANAGER] Starting performSetup at ${startTime}`);
    
    const setupUrl = getSetupUrl(serverUrl);
    console.log(`[SETUP MANAGER] Setup URL: ${setupUrl.href} at ${Date.now() - startTime}ms`);
    
    // Set up message handler
    const cleanup = this.windowControl.onMessage((event) => {
      // Setup messages are handled in performSetupHandshake
    });

    try {
      // Navigate to setup URL
      console.log(`[SETUP MANAGER] Starting navigation at ${Date.now() - startTime}ms`);
      await this.windowControl.navigate(setupUrl.href);
      console.log(`[SETUP MANAGER] Navigation completed at ${Date.now() - startTime}ms`);
      
      // Perform setup handshake and wait for completion
      console.log(`[SETUP MANAGER] Starting setup process at ${Date.now() - startTime}ms`);
      const result = await this.performSetupHandshake(setupUrl);
      console.log(`[SETUP MANAGER] Setup completed at ${Date.now() - startTime}ms`);
      
      return result;
    } finally {
      cleanup();
    }
  }

  /**
   * Perform setup handshake
   */
  private async performSetupHandshake(setupUrl: URL): Promise<SetupResult> {
    const startTime = Date.now();
    console.log(`[HANDSHAKE] Starting handshake at ${startTime}`);
    
    return withTimeout(
      new Promise<SetupResult>((resolve, reject) => {
        let handshakeComplete = false;
        let serverReady = false;

        const tempHandler = this.windowControl.onMessage((event) => {
          // Validate origin
          if (event.origin !== setupUrl.origin) {
            return;
          }

          if (!isSetupMessage(event.data)) {
            return;
          }

          const message = event.data;
          console.log(`[HANDSHAKE] Received message: ${message.type} at ${Date.now() - startTime}ms`);

          // Handle setup ready
          if (message.type === 'MCP_SETUP_HANDSHAKE' && !handshakeComplete) {
            const handshakeMsg = message as SetupHandshakeMessage;
            console.log(`[HANDSHAKE] Server ready, sending reply at ${Date.now() - startTime}ms`);
            
            // Check protocol version compatibility
            if (handshakeMsg.protocolVersion !== '1.0') {
              tempHandler();
              reject(new Error(`Incompatible protocol version: ${handshakeMsg.protocolVersion}`));
              return;
            }
            
            serverReady = true;
            
            // Show window if setup requires visibility
            if (handshakeMsg.requiresVisibleSetup) {
              this.windowControl.setVisible(true);
            }
            
            // Send handshake reply
            const reply: SetupHandshakeReplyMessage = {
              type: 'MCP_SETUP_HANDSHAKE_REPLY',
              protocolVersion: '1.0',
              sessionId: this.sessionId
            };
            
            this.windowControl.postMessage(reply, setupUrl.origin);
            handshakeComplete = true;
            console.log(`[HANDSHAKE] Handshake reply sent at ${Date.now() - startTime}ms`);
            return;
          }

          // Handle setup complete
          if (message.type === 'MCP_SETUP_COMPLETE' && serverReady) {
            const completeMsg = message as SetupCompleteMessage;
            console.log(`[HANDSHAKE] Setup complete received at ${Date.now() - startTime}ms`);
            
            tempHandler(); // Clean up temporary handler
            
            if (completeMsg.status === 'success') {
              resolve({
                success: true,
                serverTitle: completeMsg.serverTitle,
                transportVisibility: completeMsg.transportVisibility
              });
            } else {
              resolve({
                success: false,
                error: completeMsg.error
              });
            }
          }
        });
      }),
      this.setupTimeout || 300000, // Default 5 minutes
      'Setup timeout'
    );
  }

}