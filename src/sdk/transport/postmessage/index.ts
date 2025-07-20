/**
 * PostMessage Transport for MCP - Unified Export
 * 
 * This module provides bidirectional PostMessage transport support for MCP.
 * It generalizes the transport layer based on window hierarchy position rather
 * than MCP protocol roles, enabling both standard and inverted architectures.
 * 
 * ARCHITECTURE PATTERNS:
 * 
 * Standard Architecture (Client controls Server):
 * - MCP Client (Outer Frame) uses OuterFrameTransport + IframeWindowControl
 * - MCP Server (Inner Frame) uses InnerFrameTransport + PostMessageInnerControl
 * 
 * Inverted Architecture (Server controls Client):
 * - MCP Server (Outer Frame) uses OuterFrameTransport + IframeWindowControl  
 * - MCP Client (Inner Frame) uses InnerFrameTransport + PostMessageInnerControl
 * 
 * The transport components are protocol-agnostic and work with any MCP role.
 */

// Outer Frame Components (for controlling windows)
export {
  OuterFrameTransport,
  OuterWindowControl,
  IframeWindowControl,
  IframeWindowControlOptions,
  PopupWindowControl,
  PopupWindowControlOptions,
  SetupResult,
  TransportOptions
} from './outer-frame.js';

// Inner Frame Components (for subordinate windows)
export {
  InnerFrameTransport,
  InnerWindowControl,
  PostMessageInnerControl,
  SetupConfig,
  SetupResult as InnerSetupResult
} from './inner-frame.js';

// Protocol types and utilities (re-exported for convenience)
export {
  SetupHandshakeMessage,
  SetupHandshakeReplyMessage,
  SetupCompleteMessage,
  TransportHandshakeMessage,
  TransportHandshakeReplyMessage,
  TransportAcceptedMessage,
  MCPMessage,
  SetupRequiredMessage,
  SetupMessage,
  TransportMessage,
  PostMessageProtocolMessage,
  isPostMessageProtocol,
  isSetupMessage,
  isTransportMessage,
  isMCPMessage
} from '$protocol/types.js';