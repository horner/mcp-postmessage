/**
 * Window Control implementations for PostMessage transport
 * @module @modelcontextprotocol/sdk/client/window-control
 */

import { WindowControl } from '$sdk/types/postmessage.js';

export { WindowControl };

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
export class IframeWindowControl implements WindowControl {
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
export class PopupWindowControl implements WindowControl {
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
// SIMPLE WINDOW CONTROL
