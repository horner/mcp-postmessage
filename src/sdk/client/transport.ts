/**
 * Unified PostMessage Transport for MCP Clients
 * 
 * Single transport class that handles both setup and transport phases
 * using WindowControl abstraction and handshake helpers.
 */

import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import { 
  SetupCompleteMessage,
  MCPMessage,
  isMCPMessage 
} from '$protocol/types.js';
import { WindowControl } from './window-control.js';
import { 
  SetupHandshakeMessage,
  SetupHandshakeReplyMessage,
  TransportHandshakeMessage,
  TransportHandshakeReplyMessage,
  TransportAcceptedMessage,
  isSetupMessage,
  isTransportMessage
} from '$protocol/types.js';
import { withTimeout } from '$sdk/utils/helpers.js';

export interface SetupResult {
  success: boolean;
  serverTitle?: string;
  transportVisibility?: {
    requirement: 'required' | 'optional' | 'hidden';
    optionalMessage?: string;
  };
  ephemeralMessage?: string;
  error?: Error;
}

export interface TransportOptions {
  serverUrl: string;
  sessionId: string;
}

/**
 * Unified transport that handles both setup and transport phases
 */
export class PostMessageTransport implements Transport {
  private unsubscribe?: () => void;
  private closed = false;
  private setupComplete = false;
  private transportReady = false;

  // Transport callbacks
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(
    private windowControl: WindowControl,
    private options: TransportOptions
  ) {}

  // Transport interface property  
  get sessionId(): string {
    return this.options.sessionId;
  }

  // ============================================================================
  // SETUP PHASE
  // ============================================================================

  /**
   * Perform complete setup flow with server
   */
  async setup(): Promise<SetupResult> {
    console.log('[CLIENT TRANSPORT V2 SETUP] Starting setup with sessionId:', this.options.sessionId);
    
    if (this.closed) {
      throw new Error('Transport already closed');
    }

    if (this.setupComplete) {
      throw new Error('Setup already completed');
    }

    // Navigate to setup URL first
    const setupUrl = new URL(this.options.serverUrl);
    setupUrl.hash = 'setup';
    console.log('[CLIENT TRANSPORT V2 SETUP] Setup URL:', setupUrl.href);
    
    // Navigate to setup URL (server will send handshake message after load)
    console.log('[CLIENT TRANSPORT V2 SETUP] Navigating to setup URL');
    await this.windowControl.navigate(setupUrl.href);
    console.log('[CLIENT TRANSPORT V2 SETUP] Navigation completed');
    
    // Perform setup handshake
    console.log('[CLIENT TRANSPORT V2 SETUP] Starting setup handshake');
    const requiresVisibleSetup = await this.performSetupHandshake();
    
    // Show modal if server requires visible setup
    if (requiresVisibleSetup) {
      console.log('[CLIENT TRANSPORT V2 SETUP] Server requires visible setup, showing modal');
      this.windowControl.setVisible(true);
    }

    // Wait for setup completion
    console.log('[CLIENT TRANSPORT V2 SETUP] Waiting for setup completion message');
    return new Promise((resolve, reject) => {
      // No timeout on setup - wait indefinitely for user interaction

      const cleanup = () => {
        console.log('[CLIENT TRANSPORT V2 SETUP] Cleaning up setup completion handler');
        this.unsubscribe?.();
      };

      this.unsubscribe = this.windowControl.onMessage((event) => {
        console.log('[CLIENT TRANSPORT V2 SETUP] Received message during setup completion wait:', event);
        console.log('[CLIENT TRANSPORT V2 SETUP] Message data.type:', event.data.type);
        console.log('[CLIENT TRANSPORT V2 SETUP] Checking if type === MCP_SETUP_COMPLETE:', event.data.type === 'MCP_SETUP_COMPLETE');
        
        if (event.data.type === 'MCP_SETUP_COMPLETE') {
          console.log('[CLIENT TRANSPORT V2 SETUP] Received MCP_SETUP_COMPLETE message');
          const msg = event.data as SetupCompleteMessage;
          cleanup();
          this.setupComplete = true;
          
          if (msg.status === 'success') {
            console.log('[CLIENT TRANSPORT V2 SETUP] Setup successful:', msg);
            resolve({
              success: true,
              serverTitle: msg.serverTitle,
              transportVisibility: msg.transportVisibility,
              ephemeralMessage: msg.ephemeralMessage
            });
          } else {
            console.log('[CLIENT TRANSPORT V2 SETUP] Setup failed:', msg.error);
            resolve({
              success: false,
              error: new Error(typeof msg.error === 'string' ? msg.error : msg.error?.message || 'Setup failed')
            });
          }
        } else {
          console.log('[CLIENT TRANSPORT V2 SETUP] Ignoring message during setup completion wait');
          console.log('[CLIENT TRANSPORT V2 SETUP] Ignored message details:', {
            type: event.data.type,
            data: event.data,
            origin: event.origin
          });
        }
      });
    });
  }

  // ============================================================================
  // TRANSPORT PHASE
  // ============================================================================

  /**
   * Prepare transport connection with server
   */
  async prepareToConnect(): Promise<void> {
    console.log('[CLIENT TRANSPORT V2 TRANSPORT] prepareToConnect() called');
    
    if (this.closed) {
      throw new Error('Transport already closed');
    }

    if (this.transportReady) {
      console.log('[CLIENT TRANSPORT V2 TRANSPORT] Transport already ready, skipping');
      return;
    }

    console.log('[CLIENT TRANSPORT V2 TRANSPORT] Starting transport handshake with sessionId:', this.options.sessionId);
    try {
      await this.performTransportHandshake();
      console.log('[CLIENT TRANSPORT V2 TRANSPORT] Transport handshake completed');
      this.transportReady = true;
    } catch (error) {
      console.error('[CLIENT TRANSPORT V2 TRANSPORT] Transport handshake failed:', error);
      throw error;
    }
  }

  /**
   * Start transport and set up message handling
   */
  async start(): Promise<void> {
    console.log('[CLIENT TRANSPORT V2 TRANSPORT] start() called');
    
    console.log('[CLIENT TRANSPORT V2 TRANSPORT] Checking if closed:', this.closed);
    if (this.closed) {
      throw new Error('Transport already closed');
    }

    console.log('[CLIENT TRANSPORT V2 TRANSPORT] Checking if already started:', !!this.unsubscribe);
    if (this.unsubscribe) {
      throw new Error('Transport already started');
    }

    console.log('[CLIENT TRANSPORT V2 TRANSPORT] Checking if transport ready:', this.transportReady);
    if (!this.transportReady) {
      throw new Error('Transport not prepared - call prepareToConnect() first');
    }

    console.log('[CLIENT TRANSPORT V2 TRANSPORT] Setting up message relay');
    // Set up message relay
    this.unsubscribe = this.windowControl.onMessage((event) => {
      if (isMCPMessage(event.data)) {
        const mcpMessage = event.data as MCPMessage;
        console.log('[CLIENT TRANSPORT V2 TRANSPORT] Relaying MCP message:', mcpMessage);
        this.onmessage?.(mcpMessage.payload as JSONRPCMessage);
      }
    });

    console.log('[CLIENT TRANSPORT V2 TRANSPORT] Transport started successfully');
  }

  /**
   * Send MCP message to server
   */
  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    if (this.closed) {
      throw new Error('Transport closed');
    }

    if (!this.transportReady) {
      throw new Error('Transport not ready - call prepareToConnect() first');
    }

    try {
      const mcpMessage: MCPMessage = {
        type: 'MCP_MESSAGE',
        payload: message as any
      };
      
      this.windowControl.postMessage(mcpMessage, this.options.serverUrl);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onerror?.(err);
      throw err;
    }
  }

  // ============================================================================
  // PRIVATE HANDSHAKE METHODS
  // ============================================================================

  /**
   * Perform setup handshake - simplified inline implementation
   */
  private async performSetupHandshake(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      let handshakeComplete = false;

      const unsubscribe = this.windowControl.onMessage((event) => {
        if (!isSetupMessage(event.data)) return;

        const message = event.data;
        if (message.type === 'MCP_SETUP_HANDSHAKE' && !handshakeComplete) {
          const handshake = message as SetupHandshakeMessage;
          
          // Check protocol version
          if (handshake.protocolVersion !== '1.0') {
            cleanup();
            reject(new Error(`Incompatible protocol version: ${handshake.protocolVersion}`));
            return;
          }

          // Send reply
          const reply: SetupHandshakeReplyMessage = {
            type: 'MCP_SETUP_HANDSHAKE_REPLY',
            protocolVersion: '1.0',
            sessionId: this.options.sessionId
          };

          this.windowControl.postMessage(reply, '*');
          handshakeComplete = true;
          cleanup();
          resolve(handshake.requiresVisibleSetup);
        }
      });

      const cleanup = () => unsubscribe();
    });
  }

  /**
   * Perform transport handshake - simplified inline implementation
   */
  private async performTransportHandshake(): Promise<void> {
    return withTimeout(
      new Promise<void>((resolve, reject) => {
        let handshakeComplete = false;

        const unsubscribe = this.windowControl.onMessage((event) => {
          if (!isTransportMessage(event.data)) return;

          const message = event.data;
          if (message.type === 'MCP_TRANSPORT_HANDSHAKE' && !handshakeComplete) {
            const handshake = message as TransportHandshakeMessage;
            
            // Check protocol version
            if (handshake.protocolVersion !== '1.0') {
              cleanup();
              reject(new Error(`Incompatible protocol version: ${handshake.protocolVersion}`));
              return;
            }

            // Send reply
            const reply: TransportHandshakeReplyMessage = {
              type: 'MCP_TRANSPORT_HANDSHAKE_REPLY',
              protocolVersion: '1.0',
              sessionId: this.options.sessionId
            };

            this.windowControl.postMessage(reply, '*');
          } else if (message.type === 'MCP_TRANSPORT_ACCEPTED' && !handshakeComplete) {
            const accepted = message as TransportAcceptedMessage;
            
            if (accepted.sessionId !== this.options.sessionId) {
              cleanup();
              reject(new Error(`Session ID mismatch: ${accepted.sessionId}`));
              return;
            }

            handshakeComplete = true;
            cleanup();
            resolve();
          }
        });

        const cleanup = () => unsubscribe();
      }),
      30000,
      'Transport handshake timeout'
    );
  }

  /**
   * Close transport and clean up resources
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.unsubscribe?.();
    this.windowControl.destroy?.();
    this.onclose?.();
  }
}