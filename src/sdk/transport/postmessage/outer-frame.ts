/**
 * Outer Frame Transport for PostMessage Protocol
 * 
 * This module provides transport components for code running in the "outer frame" 
 * (controlling window) that manages subordinate windows (iframes/popups).
 * 
 * This can be used by:
 * - MCP Clients that want to connect to servers in iframes (standard architecture)
 * - MCP Servers that want to embed client UIs in iframes (inverted architecture)
 */

import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import { 
  SetupCompleteMessage,
  MCPMessage,
  isMCPMessage 
} from '$protocol/types.js';
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

// ============================================================================
// OUTER WINDOW CONTROL INTERFACE
// ============================================================================

/**
 * Interface for controlling subordinate windows (iframes/popups) from the outer frame
 */
export interface OuterWindowControl {
  /**
   * Navigate the subordinate window to a URL
   */
  navigate(url: string): Promise<void>;
  
  /**
   * Post a message to the subordinate window
   */
  postMessage(message: any, targetOrigin: string): void;
  
  /**
   * Subscribe to messages from the subordinate window
   * @returns Cleanup function
   */
  onMessage(handler: (event: MessageEvent) => void): () => void;
  
  /**
   * Control subordinate window visibility
   */
  setVisible(visible: boolean): void;
  
  /**
   * Optional cleanup when done
   */
  destroy?(): void;
}

// ============================================================================
// IFRAME WINDOW CONTROL
// ============================================================================

/**
 * Options for iframe window control
 */
export interface IframeWindowControlOptions {
  /**
   * The iframe element to control
   */
  iframe: HTMLIFrameElement;
  
  /**
   * Callback to control iframe visibility
   */
  setVisible: (visible: boolean) => void;
  
  /**
   * Optional callback when navigation starts
   */
  onNavigate?: (url: string) => void;
  
  /**
   * Optional callback when iframe loads
   */
  onLoad?: () => void;
  
  /**
   * Optional callback for errors
   */
  onError?: (error: Error) => void;
}

/**
 * Window control implementation for iframe elements
 */
export class IframeWindowControl implements OuterWindowControl {
  private iframe: HTMLIFrameElement;
  private setVisibleFn: (visible: boolean) => void;
  private onNavigateFn?: (url: string) => void;
  private onLoadFn?: () => void;
  private onErrorFn?: (error: Error) => void;
  
  private messageHandlers = new Set<(event: MessageEvent) => void>();
  private globalMessageHandler?: (event: MessageEvent) => void;
  private currentLoadHandler?: () => void;
  private currentErrorHandler?: () => void;

  constructor(options: IframeWindowControlOptions) {
    this.iframe = options.iframe;
    this.setVisibleFn = options.setVisible;
    this.onNavigateFn = options.onNavigate;
    this.onLoadFn = options.onLoad;
    this.onErrorFn = options.onError;
  }

  async navigate(url: string): Promise<void> {
    console.log('[IFRAME-CONTROL] Starting navigation to:', url);
    this.onNavigateFn?.(url);
    
    // Clean up existing handlers
    this.cleanupLoadHandlers();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cleanupLoadHandlers();
        reject(new Error('Navigation timeout'));
      }, 30000);

      this.currentLoadHandler = () => {
        console.log('[IFRAME-CONTROL] Load event fired for:', url);
        clearTimeout(timeout);
        this.cleanupLoadHandlers();
        this.onLoadFn?.();
        resolve();
      };

      this.currentErrorHandler = () => {
        console.log('[IFRAME-CONTROL] Error event fired for:', url);
        clearTimeout(timeout);
        this.cleanupLoadHandlers();
        const error = new Error('Failed to load iframe');
        this.onErrorFn?.(error);
        reject(error);
      };

      this.iframe.addEventListener('load', this.currentLoadHandler);
      this.iframe.addEventListener('error', this.currentErrorHandler);
      
      // Navigate
      console.log('[IFRAME-CONTROL] Setting iframe src to:', url);
      this.iframe.src = url;
    });
  }

  postMessage(message: any, targetOrigin: string): void {
    const window = this.iframe.contentWindow;
    if (!window) {
      throw new Error('Iframe window not available');
    }
    window.postMessage(message, targetOrigin);
  }

  onMessage(handler: (event: MessageEvent) => void): () => void {
    // Set up global handler on first subscription
    if (this.messageHandlers.size === 0) {
      this.globalMessageHandler = (event: MessageEvent) => {
        // Only forward messages from our iframe
        console.log('[IFRAME-CONTROL] Message received:', {
          eventSource: event.source,
          iframeContentWindow: this.iframe.contentWindow,
          sourcesMatch: event.source === this.iframe.contentWindow,
          origin: event.origin,
          type: event.data?.type
        });
        
        if (event.source === this.iframe.contentWindow) {
          this.messageHandlers.forEach(h => {
            try {
              h(event);
            } catch (error) {
              console.error('Error in message handler:', error);
            }
          });
        } else {
          console.log('[IFRAME-CONTROL] Message dropped - source mismatch');
        }
      };
      window.addEventListener('message', this.globalMessageHandler);
    }

    // Add handler
    this.messageHandlers.add(handler);

    // Return cleanup function
    return () => {
      this.messageHandlers.delete(handler);
      
      // Remove global handler if no more subscriptions
      if (this.messageHandlers.size === 0 && this.globalMessageHandler) {
        window.removeEventListener('message', this.globalMessageHandler);
        this.globalMessageHandler = undefined;
      }
    };
  }

  setVisible(visible: boolean): void {
    this.setVisibleFn(visible);
  }

  destroy(): void {
    this.cleanupLoadHandlers();
    
    if (this.globalMessageHandler) {
      window.removeEventListener('message', this.globalMessageHandler);
      this.globalMessageHandler = undefined;
    }
    
    this.messageHandlers.clear();
  }

  private cleanupLoadHandlers(): void {
    if (this.currentLoadHandler) {
      this.iframe.removeEventListener('load', this.currentLoadHandler);
      this.currentLoadHandler = undefined;
    }
    if (this.currentErrorHandler) {
      this.iframe.removeEventListener('error', this.currentErrorHandler);
      this.currentErrorHandler = undefined;
    }
  }
}

// ============================================================================
// POPUP WINDOW CONTROL
// ============================================================================

/**
 * Options for popup window control
 */
export interface PopupWindowControlOptions {
  /**
   * Window features string
   */
  features?: string;
  
  /**
   * Callback when popup closes
   */
  onClose?: () => void;
  
  /**
   * Callback for errors
   */
  onError?: (error: Error) => void;
}

/**
 * Window control implementation for popup windows
 */
export class PopupWindowControl implements OuterWindowControl {
  private popup: Window | null = null;
  private features: string;
  private onCloseFn?: () => void;
  private onErrorFn?: (error: Error) => void;
  
  private messageHandlers = new Set<(event: MessageEvent) => void>();
  private globalMessageHandler?: (event: MessageEvent) => void;
  private closeCheckInterval?: number;

  constructor(options: PopupWindowControlOptions = {}) {
    this.features = options.features || this.getDefaultFeatures();
    this.onCloseFn = options.onClose;
    this.onErrorFn = options.onError;
  }

  private getDefaultFeatures(): string {
    const width = 800;
    const height = 600;
    const left = Math.round((window.screen.width - width) / 2);
    const top = Math.round((window.screen.height - height) / 2);
    
    return `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no`;
  }

  async navigate(url: string): Promise<void> {
    // Close existing popup
    if (this.popup && !this.popup.closed) {
      this.popup.close();
    }

    // Open new popup
    this.popup = window.open(url, 'mcp-server', this.features);
    
    if (!this.popup) {
      const error = new Error('Failed to open popup window (may be blocked)');
      this.onErrorFn?.(error);
      throw error;
    }

    // Set up close detection
    this.startCloseDetection();

    // Wait for popup to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Popup navigation timeout'));
      }, 30000);

      const checkReady = () => {
        try {
          if (this.popup && !this.popup.closed) {
            // Try to access location to see if navigated
            if (this.popup.location.href !== 'about:blank') {
              clearTimeout(timeout);
              clearInterval(interval);
              resolve();
              return;
            }
          }
        } catch {
          // Cross-origin - assume ready immediately
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
          return;
        }
      };

      const interval = setInterval(checkReady, 100);
      checkReady();
    });
  }

  postMessage(message: any, targetOrigin: string): void {
    if (!this.popup || this.popup.closed) {
      throw new Error('Popup window not available');
    }
    this.popup.postMessage(message, targetOrigin);
  }

  onMessage(handler: (event: MessageEvent) => void): () => void {
    // Set up global handler on first subscription
    if (this.messageHandlers.size === 0) {
      this.globalMessageHandler = (event: MessageEvent) => {
        // Only forward messages from our popup
        if (event.source === this.popup) {
          this.messageHandlers.forEach(h => {
            try {
              h(event);
            } catch (error) {
              console.error('Error in message handler:', error);
            }
          });
        }
      };
      window.addEventListener('message', this.globalMessageHandler);
    }

    // Add handler
    this.messageHandlers.add(handler);

    // Return cleanup function
    return () => {
      this.messageHandlers.delete(handler);
      
      // Remove global handler if no more subscriptions
      if (this.messageHandlers.size === 0 && this.globalMessageHandler) {
        window.removeEventListener('message', this.globalMessageHandler);
        this.globalMessageHandler = undefined;
      }
    };
  }

  setVisible(visible: boolean): void {
    if (this.popup && !this.popup.closed) {
      if (visible) {
        this.popup.focus();
      } else {
        window.focus();
      }
    }
  }

  destroy(): void {
    if (this.popup && !this.popup.closed) {
      this.popup.close();
    }
    this.popup = null;

    this.stopCloseDetection();

    if (this.globalMessageHandler) {
      window.removeEventListener('message', this.globalMessageHandler);
      this.globalMessageHandler = undefined;
    }

    this.messageHandlers.clear();
  }

  private startCloseDetection(): void {
    this.stopCloseDetection();
    
    this.closeCheckInterval = window.setInterval(() => {
      if (this.popup && this.popup.closed) {
        this.handlePopupClosed();
      }
    }, 1000);
  }

  private stopCloseDetection(): void {
    if (this.closeCheckInterval) {
      clearInterval(this.closeCheckInterval);
      this.closeCheckInterval = undefined;
    }
  }

  private handlePopupClosed(): void {
    this.stopCloseDetection();
    this.onCloseFn?.();
  }
}

// ============================================================================
// OUTER FRAME TRANSPORT
// ============================================================================

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

/** Transport that handles both setup and transport phases for the outer frame */
export class OuterFrameTransport implements Transport {
  private unsubscribe?: () => void;
  private closed = false;
  private setupComplete = false;
  private transportReady = false;

  // Transport callbacks
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(
    private windowControl: OuterWindowControl,
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
    const logger = createLogger('OUTER', 'MCP-SETUP-HANDSHAKE');
    
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
    const logger = createLogger('OUTER', 'MCP-TRANSPORT-HANDSHAKE');
    
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