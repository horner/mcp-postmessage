/**
 * Server-side window control for postMessage communication
 * 
 * This interface represents a validated, pinned connection to a client window
 * after successful handshake completion. Unlike client WindowControl, this is
 * focused purely on message exchange with an already-established connection.
 */

import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export interface ServerWindowControl {
  /** Send a message to the client window */
  postMessage(msg: any): void;

  /** Subscribe to messages from the client window.
      Returns an unsubscribe function. */
  onMessage(cb: (msg: any) => void): () => void;

  /** Get the currently pinned origin, if any */
  get pinnedOrigin(): string | undefined;

  /** Close underlying window / detach listeners, idempotent */
  destroy(): void;
}

/**
 * Implementation of ServerWindowControl that manages postMessage communication
 * with progressive origin pinning during handshake
 */
export class PostMessageServerWindowControl implements ServerWindowControl {
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
          console.log(`[WindowControl] Auto-pinned origin: ${event.origin}`);
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