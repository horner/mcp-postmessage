/**
 * Unified PostMessage Transport for MCP Servers
 * 
 * Handles both setup and transport phases with a clean API:
 * - Setup: prepareSetup() → user interaction → completeSetup()
 * - Transport: prepareToConnect() → server creation → connect()
 */

import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { 
  SetupCompleteMessage, 
  TransportAcceptedMessage,
  MCPMessage,
  isMCPMessage 
} from '$protocol/types.js';
import { ServerWindowControl } from './window-control.js';
import { handshakeSetupPhase, handshakeTransportPhase, SetupHandshakeResult, TransportHandshakeResult } from './handshake.js';

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

  /**
   * Prepare for setup phase - performs setup handshake
   */
  async prepareSetup(): Promise<void> {
    console.log('[SERVER TRANSPORT V2 SETUP] prepareSetup() called');
    console.log('[SERVER TRANSPORT V2 SETUP] Current phase:', this.phase);
    console.log('[SERVER TRANSPORT V2 SETUP] requiresVisibleSetup:', this.setupConfig?.requiresVisibleSetup || false);
    
    if (this.phase !== 'idle') {
      throw new Error('Transport already in use');
    }
    
    console.log('[SERVER TRANSPORT V2 SETUP] Starting setup handshake');
    try {
      this.setupHandshakeResult = await handshakeSetupPhase(this.control, {
        requiresVisibleSetup: this.setupConfig?.requiresVisibleSetup || false
      });
      console.log('[SERVER TRANSPORT V2 SETUP] Setup handshake completed:', this.setupHandshakeResult);
      this.phase = 'setup';
      console.log('[SERVER TRANSPORT V2 SETUP] Phase updated to setup');
    } catch (error) {
      console.error('[SERVER TRANSPORT V2 SETUP] Setup handshake failed:', error);
      throw error;
    }
  }

  /**
   * Complete setup phase - sends setup completion message
   */
  async completeSetup(result: SetupResult): Promise<void> {
    console.log('[SERVER TRANSPORT V2 SETUP] completeSetup() called');
    console.log('[SERVER TRANSPORT V2 SETUP] Current phase:', this.phase);
    console.log('[SERVER TRANSPORT V2 SETUP] Setup result:', result);
    
    if (this.phase !== 'setup') {
      throw new Error('Must call prepareSetup() first');
    }

    if (this.closed) {
      throw new Error('Transport already closed');
    }

    console.log('[SERVER TRANSPORT V2 SETUP] Setting up message relay');
    // Set up message relay for any potential MCP messages during setup
    this.unsubscribe = this.control.onMessage((data) => {
      if (isMCPMessage(data)) {
        const mcpMessage = data as MCPMessage;
        this.onmessage?.(mcpMessage.payload as JSONRPCMessage);
      }
    });

    // Send setup completion
    const completeMsg: SetupCompleteMessage = {
      type: 'MCP_SETUP_COMPLETE',
      status: 'success',
      serverTitle: result.serverTitle,
      transportVisibility: result.transportVisibility,
      ephemeralMessage: result.ephemeralMessage
    };

    console.log('[SERVER TRANSPORT V2 SETUP] Sending setup completion message:', completeMsg);
    this.control.postMessage(completeMsg);
    console.log('[SERVER TRANSPORT V2 SETUP] Setup completion message sent');
  }

  /**
   * Prepare for transport phase - performs transport handshake
   */
  async prepareToConnect(): Promise<void> {
    if (this.phase !== 'idle') {
      throw new Error('Transport already in use');
    }
    
    this.transportHandshakeResult = await handshakeTransportPhase(this.control);
    this.phase = 'transport';
  }

  /**
   * Start transport phase - sends transport accepted and sets up message relay
   */
  async start(): Promise<void> {
    if (this.phase !== 'transport') {
      throw new Error('Must call prepareToConnect() first');
    }

    if (this.closed) {
      throw new Error('Transport already closed');
    }

    if (this.unsubscribe) {
      throw new Error('Transport already started');
    }

    // Set up message relay
    this.unsubscribe = this.control.onMessage((data) => {
      if (isMCPMessage(data)) {
        const mcpMessage = data as MCPMessage;
        this.onmessage?.(mcpMessage.payload as JSONRPCMessage);
      }
    });

    // Send transport accepted
    const acceptedMsg: TransportAcceptedMessage = {
      type: 'MCP_TRANSPORT_ACCEPTED',
      sessionId: this.transportHandshakeResult!.sessionId
    };

    this.control.postMessage(acceptedMsg);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) {
      throw new Error('Transport closed');
    }

    try {
      const mcpMessage: MCPMessage = {
        type: 'MCP_MESSAGE',
        payload: message as any
      };
      
      this.control.postMessage(mcpMessage);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onerror?.(err);
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.unsubscribe?.();
    this.control.destroy();
    this.onclose?.();
  }
}