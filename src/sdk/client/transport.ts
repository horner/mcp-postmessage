/**
 * PostMessage Transport for MCP Clients
 * Handles both setup and transport phases using WindowControl abstraction.
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
import { createLogger } from '$sdk/utils/logger.js';

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

/** Transport that handles both setup and transport phases */
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

  /** Perform complete setup flow with server */
  async setup(): Promise<SetupResult> {
    const logger = createLogger('CLIENT', 'MCP-SETUP-HANDSHAKE');
    
    if (this.closed) throw new Error('Transport already closed');
    if (this.setupComplete) throw new Error('Setup already completed');

    const setupUrl = new URL(this.options.serverUrl);
    setupUrl.hash = 'setup';
    logger.log('Navigating to setup URL:', setupUrl.href);
    await this.windowControl.navigate(setupUrl.href);
    
    const requiresVisibleSetup = await this.performSetupHandshake();
    if (requiresVisibleSetup) {
      logger.log('Server requires visible setup, showing modal');
      this.windowControl.setVisible(true);
    }

    return new Promise((resolve) => {
      const cleanup = () => this.unsubscribe?.();

      this.unsubscribe = this.windowControl.onMessage((event) => {
        if (event.data.type === 'MCP_SETUP_COMPLETE') {
          const msg = event.data as SetupCompleteMessage;
          cleanup();
          this.setupComplete = true;
          
          if (msg.status === 'success') {
            logger.log('Setup successful');
            resolve({
              success: true,
              serverTitle: msg.serverTitle,
              transportVisibility: msg.transportVisibility,
              ephemeralMessage: msg.ephemeralMessage
            });
          } else {
            logger.error('Setup failed:', msg.error);
            resolve({
              success: false,
              error: new Error(typeof msg.error === 'string' ? msg.error : msg.error?.message || 'Setup failed')
            });
          }
        }
      });
    });
  }

  // ============================================================================
  // TRANSPORT PHASE
  // ============================================================================

  /** Prepare transport connection with server */
  async prepareToConnect(): Promise<void> {
    const logger = createLogger('CLIENT', 'MCP-TRANSPORT-HANDSHAKE');
    
    if (this.closed) throw new Error('Transport already closed');
    if (this.transportReady) return;

    try {
      await this.performTransportHandshake();
      this.transportReady = true;
      logger.log('Transport handshake completed');
    } catch (error) {
      logger.error('Transport handshake failed:', error);
      throw error;
    }
  }

  /** Start transport and set up message handling */
  async start(): Promise<void> {
    if (this.closed) throw new Error('Transport already closed');
    if (this.unsubscribe) throw new Error('Transport already started');
    if (!this.transportReady) throw new Error('Transport not prepared - call prepareToConnect() first');

    this.unsubscribe = this.windowControl.onMessage((event) => {
      if (isMCPMessage(event.data)) {
        this.onmessage?.((event.data as MCPMessage).payload as JSONRPCMessage);
      }
    });
  }

  /** Send MCP message to server */
  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    if (this.closed) throw new Error('Transport closed');
    if (!this.transportReady) throw new Error('Transport not ready - call prepareToConnect() first');

    try {
      this.windowControl.postMessage({
        type: 'MCP_MESSAGE',
        payload: message as any
      }, this.options.serverUrl);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onerror?.(err);
      throw err;
    }
  }

  // ============================================================================
  // PRIVATE HANDSHAKE METHODS
  // ============================================================================

  /** Perform setup handshake */
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

  /** Perform transport handshake */
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

  /** Close transport and clean up resources */
  async close(): Promise<void> {
    if (this.closed) return;
    
    this.closed = true;
    this.unsubscribe?.();
    this.windowControl.destroy?.();
    this.onclose?.();
  }
}