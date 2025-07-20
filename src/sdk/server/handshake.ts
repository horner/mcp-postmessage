/**
 * Server-side handshake helpers for postMessage transport
 * 
 * These functions handle the handshake negotiation phases and return
 * validated ServerWindowControl instances ready for transport use.
 */

import { 
  SetupHandshakeMessage, 
  SetupHandshakeReplyMessage,
  TransportHandshakeMessage,
  TransportHandshakeReplyMessage,
  isSetupMessage,
  isTransportMessage
} from '$protocol/types.js';
import { 
  ServerWindowControl, 
  PostMessageServerWindowControl 
} from './window-control.js';
import { isOriginAllowed, withTimeout } from '$sdk/utils/helpers.js';

export interface HandshakeOptions {
  allowedOrigins: string[];
  windowRef?: Window;
  protocolVersion?: string;
  timeoutMs?: number;
}

export interface SetupHandshakeResult {
  origin: string;
  sessionId: string;
  requiresVisibleSetup: boolean;
}

export interface TransportHandshakeResult {
  origin: string;
  sessionId: string;
}

/**
 * Perform setup phase handshake using a ServerWindowControl
 */
export async function handshakeSetupPhase(
  windowControl: ServerWindowControl,
  opts: { requiresVisibleSetup: boolean; protocolVersion?: string; timeoutMs?: number; }
): Promise<SetupHandshakeResult> {
  const protocolVersion = opts.protocolVersion || '1.0';
  const timeoutMs = opts.timeoutMs || 30000;

  return withTimeout(
    new Promise<SetupHandshakeResult>((resolve, reject) => {
      let handshakeComplete = false;

      const unsubscribe = windowControl.onMessage((data) => {
        if (!isSetupMessage(data)) {
          return;
        }

        const message = data;

        if (message.type === 'MCP_SETUP_HANDSHAKE_REPLY' && !handshakeComplete) {
          const reply = message as SetupHandshakeReplyMessage;
          
          // Check protocol version compatibility
          if (reply.protocolVersion !== protocolVersion) {
            cleanup();
            reject(new Error(`Incompatible protocol version: ${reply.protocolVersion}`));
            return;
          }

          handshakeComplete = true;
          cleanup();

          resolve({
            origin: windowControl.pinnedOrigin!,
            sessionId: reply.sessionId,
            requiresVisibleSetup: opts.requiresVisibleSetup
          });
        }
      });

      const cleanup = () => {
        unsubscribe();
      };

      // Send initial handshake
      const handshakeMsg: SetupHandshakeMessage = {
        type: 'MCP_SETUP_HANDSHAKE',
        protocolVersion: '1.0',
        requiresVisibleSetup: opts.requiresVisibleSetup
      };

      windowControl.postMessage(handshakeMsg);

      // Clean up on timeout/rejection
      setTimeout(() => {
        if (!handshakeComplete) {
          cleanup();
          reject(new Error('Setup handshake timeout'));
        }
      }, timeoutMs);
    }),
    timeoutMs,
    'Setup handshake timeout'
  );
}

/**
 * Perform transport phase handshake using a ServerWindowControl
 */
export async function handshakeTransportPhase(
  windowControl: ServerWindowControl,
  opts: { protocolVersion?: string; timeoutMs?: number; } = {}
): Promise<TransportHandshakeResult> {
  const protocolVersion = opts.protocolVersion || '1.0';
  const timeoutMs = opts.timeoutMs || 30000;

  return withTimeout(
    new Promise<TransportHandshakeResult>((resolve, reject) => {
      let handshakeComplete = false;

      const unsubscribe = windowControl.onMessage((data) => {
        if (!isTransportMessage(data)) {
          return;
        }

        const message = data;

        if (message.type === 'MCP_TRANSPORT_HANDSHAKE_REPLY' && !handshakeComplete) {
          const reply = message as TransportHandshakeReplyMessage;
          
          // Check protocol version compatibility
          if (reply.protocolVersion !== protocolVersion) {
            cleanup();
            reject(new Error(`Incompatible protocol version: ${reply.protocolVersion}`));
            return;
          }

          handshakeComplete = true;
          cleanup();

          resolve({
            origin: windowControl.pinnedOrigin!,
            sessionId: reply.sessionId
          });
        }
      });

      const cleanup = () => {
        unsubscribe();
      };

      // Send initial handshake
      const handshakeMsg: TransportHandshakeMessage = {
        type: 'MCP_TRANSPORT_HANDSHAKE',
        protocolVersion: '1.0'
      };

      windowControl.postMessage(handshakeMsg);

      // Clean up on timeout/rejection
      setTimeout(() => {
        if (!handshakeComplete) {
          cleanup();
          reject(new Error('Transport handshake timeout'));
        }
      }, timeoutMs);
    }),
    timeoutMs,
    'Transport handshake timeout'
  );
}

/**
 * Convenience function that detects phase and runs appropriate handshake
 */
export async function handshakeServerWindow(opts: HandshakeOptions & {
  requiresVisibleSetup?: boolean;
}): Promise<SetupHandshakeResult | TransportHandshakeResult> {
  // Detect phase from URL hash
  const isSetupPhase = window.location.hash === '#setup';
  
  if (isSetupPhase) {
    return handshakeSetupPhase({
      ...opts,
      requiresVisibleSetup: opts.requiresVisibleSetup || false
    });
  } else {
    return handshakeTransportPhase(opts);
  }
}