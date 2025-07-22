/**
 * Inner Frame Transport for PostMessage Protocol
 * 
 * This module provides transport components for code running in the "inner frame" 
 * (subordinate window) that communicates with its controlling parent.
 * 
 * This can be used by:
 * - MCP Servers running in iframes controlled by clients (standard architecture)
 * - MCP Clients running in iframes controlled by servers (inverted architecture)
 */

import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { 
  SetupCompleteMessage, 
  SetupHandshakeMessage,
  SetupHandshakeReplyMessage,
  TransportAcceptedMessage,
  TransportHandshakeMessage,
  TransportHandshakeReplyMessage,
  MCPMessage,
  PermissionRequirement,
  isMCPMessage,
  isSetupMessage,
  isTransportMessage,
  isVersionInRange
} from '$protocol/types.js';
import { createLogger } from '$sdk/utils/logger.js';
import { withTimeout } from '$sdk/utils/helpers.js';

// ============================================================================
// INNER WINDOW CONTROL INTERFACE
// ============================================================================

/**
 * Interface for communicating with the parent window from an inner frame
 */
export interface InnerWindowControl {
  /** Send a message to the parent window */
  postMessage(msg: any): void;

  /** Subscribe to messages from the parent window.
      Returns an unsubscribe function. */
  onMessage(cb: (msg: any) => void): () => void;

  /** Get the currently pinned origin, if any */
  get pinnedOrigin(): string | undefined;

  /** Close underlying window / detach listeners, idempotent */
  destroy(): void;
}

// ============================================================================
// POSTMESSAGE INNER CONTROL
// ============================================================================

/**
 * Implementation of InnerWindowControl that manages postMessage communication
 * with progressive origin pinning during handshake
 */
export class PostMessageInnerControl implements InnerWindowControl {
  private messageHandler?: (event: MessageEvent) => void;
  private messageCallbacks: Set<(msg: any) => void> = new Set();
  private destroyed = false;
  private _pinnedOrigin?: string;

  constructor(
    private allowedOrigins: string[],
    private windowRef: Window = window.parent
  ) {}

  get pinnedOrigin(): string | undefined {
    return this._pinnedOrigin;
  }

  postMessage(msg: any): void {
    if (this.destroyed) {
      throw new Error('WindowControl has been destroyed');
    }
    
    // Use pinned origin if available, otherwise '*' for initial handshake
    const targetOrigin = this._pinnedOrigin || '*';
    this.windowRef.postMessage(msg, targetOrigin);
  }

  onMessage(callback: (msg: any) => void): () => void {
    if (this.destroyed) {
      throw new Error('WindowControl has been destroyed');
    }

    // Set up global message handler on first subscription
    if (!this.messageHandler) {
      this.messageHandler = (event: MessageEvent) => {
        // Only accept messages from our specific window reference
        if (event.source !== this.windowRef) {
          return;
        }

        // If no pinned origin yet, validate against allowed list and auto-pin on first valid message
        if (!this._pinnedOrigin) {
          const isOriginAllowed = this.allowedOrigins.includes('*') || 
                                 this.allowedOrigins.includes(event.origin);
          
          if (!isOriginAllowed) {
            console.warn(`Message rejected from unauthorized origin: ${event.origin}`);
            return;
          }

          // Auto-pin the origin on first valid message
          this._pinnedOrigin = event.origin;
          console.log(`[InnerWindowControl] Auto-pinned origin: ${event.origin}`);
        } else {
          // We have a pinned origin, only accept messages from that exact origin
          if (event.origin !== this._pinnedOrigin) {
            return;
          }
        }

        // Forward validated message to all callbacks
        this.messageCallbacks.forEach(cb => {
          try {
            cb(event.data);
          } catch (error) {
            console.error('Error in message callback:', error);
          }
        });
      };

      window.addEventListener('message', this.messageHandler);
    }

    this.messageCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.messageCallbacks.delete(callback);
      
      // Clean up global handler if no more callbacks
      if (this.messageCallbacks.size === 0 && this.messageHandler) {
        window.removeEventListener('message', this.messageHandler);
        this.messageHandler = undefined;
      }
    };
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.messageCallbacks.clear();

    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = undefined;
    }
  }
}

// ============================================================================
// INNER FRAME TRANSPORT
// ============================================================================

interface SetupHandshakeResult {
  origin: string;
  sessionId: string;
  requiresVisibleSetup: boolean;
}

interface TransportHandshakeResult {
  origin: string;
  sessionId: string;
}

export interface SetupConfig {
  requiresVisibleSetup: boolean;
  minProtocolVersion?: string;
  maxProtocolVersion?: string;
  requestedPermissions?: PermissionRequirement[];
}

export interface SetupResult {
  displayName: string;
  transportVisibility: {
    requirement: 'required' | 'optional' | 'hidden';
    description?: string;
  };
  ephemeralMessage?: string;
}

export class InnerFrameTransport implements Transport {
  private unsubscribe?: () => void;
  private closed = false;
  private setupHandshakeResult?: SetupHandshakeResult;
  private transportHandshakeResult?: TransportHandshakeResult;
  private phase: 'setup' | 'transport' | 'idle' = 'idle';

  // Transport callbacks
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(
    private control: InnerWindowControl,
    private setupConfig?: SetupConfig
  ) {}
  
  get sessionId(): string {
    return this.setupHandshakeResult?.sessionId || this.transportHandshakeResult?.sessionId || '';
  }

  /** Prepare for setup phase - performs setup handshake */
  async prepareSetup(): Promise<void> {
    const logger = createLogger('INNER', 'MCP-SETUP-HANDSHAKE');
    
    if (this.phase !== 'idle') throw new Error('Transport already in use');
    
    try {
      this.setupHandshakeResult = await this.performSetupHandshake();
      this.phase = 'setup';
      logger.log('Setup handshake completed');
    } catch (error) {
      logger.error('Setup handshake failed:', error);
      throw error;
    }
  }

  /** Complete setup phase - sends setup completion message */
  async completeSetup(result: SetupResult): Promise<void> {
    if (this.phase !== 'setup') throw new Error('Must call prepareSetup() first');
    if (this.closed) throw new Error('Transport already closed');

    this.unsubscribe = this.control.onMessage((data) => {
      if (isMCPMessage(data)) {
        this.onmessage?.((data as MCPMessage).payload as JSONRPCMessage);
      }
    });

    this.control.postMessage({
      type: 'MCP_SETUP_COMPLETE',
      status: 'success',
      displayName: result.displayName,
      transportVisibility: result.transportVisibility,
      ephemeralMessage: result.ephemeralMessage
    });
  }

  /** Prepare for transport phase - performs transport handshake */
  async prepareToConnect(): Promise<void> {
    if (this.phase !== 'idle') throw new Error('Transport already in use');
    
    this.transportHandshakeResult = await this.performTransportHandshake();
    this.phase = 'transport';
  }

  /** Start transport phase - sends transport accepted and sets up message relay */
  async start(): Promise<void> {
    if (this.phase !== 'transport') throw new Error('Must call prepareToConnect() first');
    if (this.closed) throw new Error('Transport already closed');
    if (this.unsubscribe) throw new Error('Transport already started');

    this.unsubscribe = this.control.onMessage((data) => {
      if (isMCPMessage(data)) {
        this.onmessage?.((data as MCPMessage).payload as JSONRPCMessage);
      }
    });

    this.control.postMessage({
      type: 'MCP_TRANSPORT_ACCEPTED',
      sessionId: this.transportHandshakeResult!.sessionId
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) throw new Error('Transport closed');

    try {
      this.control.postMessage({
        type: 'MCP_MESSAGE',
        payload: message as any
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onerror?.(err);
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;

    this.closed = true;
    this.unsubscribe?.();
    this.control.destroy();
    this.onclose?.();
  }

  // ============================================================================
  // PRIVATE HANDSHAKE METHODS
  // ============================================================================

  /** Perform setup handshake */
  private async performSetupHandshake(): Promise<SetupHandshakeResult> {
    return withTimeout(
      new Promise<SetupHandshakeResult>((resolve, reject) => {
        let handshakeComplete = false;

        const unsubscribe = this.control.onMessage((data) => {
          if (!isSetupMessage(data)) return;

          if (data.type === 'MCP_SETUP_HANDSHAKE_REPLY' && !handshakeComplete) {
            console.log('[INNER-FRAME] Received setup handshake reply');
            const reply = data as SetupHandshakeReplyMessage;
            
            const minVersion = this.setupConfig?.minProtocolVersion || '1.0';
            const maxVersion = this.setupConfig?.maxProtocolVersion || '1.0';
            
            console.log('[INNER-FRAME] Checking version compatibility:', reply.protocolVersion, 'vs', minVersion, '-', maxVersion);
            
            if (!isVersionInRange(reply.protocolVersion, minVersion, maxVersion)) {
              cleanup();
              reject(new Error(`Incompatible protocol version: ${reply.protocolVersion}. Expected range: ${minVersion}-${maxVersion}`));
              return;
            }

            console.log('[INNER-FRAME] Setup handshake completed, resolving');
            handshakeComplete = true;
            cleanup();
            resolve({
              origin: this.control.pinnedOrigin!,
              sessionId: reply.sessionId,
              requiresVisibleSetup: this.setupConfig?.requiresVisibleSetup || false
            });
          }
        });

        const cleanup = () => unsubscribe();

        this.control.postMessage({
          type: 'MCP_SETUP_HANDSHAKE',
          minProtocolVersion: this.setupConfig?.minProtocolVersion || '1.0',
          maxProtocolVersion: this.setupConfig?.maxProtocolVersion || '1.0',
          requiresVisibleSetup: this.setupConfig?.requiresVisibleSetup || false,
          requestedPermissions: this.setupConfig?.requestedPermissions || []
        });
      }),
      30000,
      'Setup handshake timeout'
    );
  }

  /** Perform transport handshake */
  private async performTransportHandshake(): Promise<TransportHandshakeResult> {
    return withTimeout(
      new Promise<TransportHandshakeResult>((resolve, reject) => {
        let handshakeComplete = false;

        const unsubscribe = this.control.onMessage((data) => {
          if (!isTransportMessage(data)) return;

          if (data.type === 'MCP_TRANSPORT_HANDSHAKE_REPLY' && !handshakeComplete) {
            const reply = data as TransportHandshakeReplyMessage;
            
            if (reply.protocolVersion !== '1.0') {
              cleanup();
              reject(new Error(`Incompatible protocol version: ${reply.protocolVersion}`));
              return;
            }

            handshakeComplete = true;
            cleanup();
            resolve({
              origin: this.control.pinnedOrigin!,
              sessionId: reply.sessionId
            });
          }
        });

        const cleanup = () => unsubscribe();

        this.control.postMessage({
          type: 'MCP_TRANSPORT_HANDSHAKE',
          protocolVersion: '1.0'
        });
      }),
      30000,
      'Transport handshake timeout'
    );
  }
}
