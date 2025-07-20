/**
 * PostMessage Transport for MCP Servers
 * Handles both setup and transport phases with a clean API.
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
  isMCPMessage,
  isSetupMessage,
  isTransportMessage
} from '$protocol/types.js';
import { ServerWindowControl } from './window-control.js';
import { createLogger } from '$sdk/utils/logger.js';
import { withTimeout } from '$sdk/utils/helpers.js';

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
}

export interface SetupResult {
  serverTitle: string;
  transportVisibility: {
    requirement: 'required' | 'optional' | 'hidden';
    optionalMessage?: string;
  };
  ephemeralMessage?: string;
}

export class PostMessageTransport implements Transport {
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
    private control: ServerWindowControl,
    private setupConfig?: SetupConfig
  ) {}
  
  get sessionId(): string {
    return this.setupHandshakeResult?.sessionId || this.transportHandshakeResult?.sessionId || '';
  }

  /** Prepare for setup phase - performs setup handshake */
  async prepareSetup(): Promise<void> {
    const logger = createLogger('SERVER', 'MCP-SETUP-HANDSHAKE');
    
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
      serverTitle: result.serverTitle,
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
            const reply = data as SetupHandshakeReplyMessage;
            
            if (reply.protocolVersion !== '1.0') {
              cleanup();
              reject(new Error(`Incompatible protocol version: ${reply.protocolVersion}`));
              return;
            }

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
          protocolVersion: '1.0',
          requiresVisibleSetup: this.setupConfig?.requiresVisibleSetup || false
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