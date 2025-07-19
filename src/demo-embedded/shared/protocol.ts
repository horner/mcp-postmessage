/**
 * Inverted PostMessage Protocol
 * 
 * In the inverted architecture:
 * - Parent page acts as MCP Server (implements tools)
 * - Iframe acts as MCP Client (chat interface)
 * - Messages flow opposite to the standard SDK
 */

// Base message interface
export interface InvertedMessage {
  type: string;
  protocolVersion: '1.0';
}

// ============================================================================
// HANDSHAKE MESSAGES
// ============================================================================

/**
 * Step 1: Iframe (Client) → Parent (Server)
 * Client announces readiness to connect
 */
export interface ClientHandshakeMessage extends InvertedMessage {
  type: 'INVERTED_CLIENT_HANDSHAKE';
  sessionId: string;
}

/**
 * Step 2: Parent (Server) → Iframe (Client)
 * Server responds with available tools and capabilities
 */
export interface ServerHandshakeReplyMessage extends InvertedMessage {
  type: 'INVERTED_SERVER_HANDSHAKE_REPLY';
  sessionId: string;
  serverInfo: {
    name: string;
    version: string;
    description: string;
  };
  tools: ToolDefinition[];
}

/**
 * Step 3: Iframe (Client) → Parent (Server)
 * Client confirms connection established
 */
export interface ConnectionEstablishedMessage extends InvertedMessage {
  type: 'INVERTED_CONNECTION_ESTABLISHED';
  sessionId: string;
}

// ============================================================================
// TOOL EXECUTION MESSAGES
// ============================================================================

/**
 * Iframe (Client) → Parent (Server)
 * Request to execute a tool
 */
export interface ToolCallRequestMessage extends InvertedMessage {
  type: 'INVERTED_TOOL_CALL_REQUEST';
  sessionId: string;
  callId: string;
  toolName: string;
  parameters: any;
}

/**
 * Parent (Server) → Iframe (Client)
 * Tool execution result
 */
export interface ToolCallResponseMessage extends InvertedMessage {
  type: 'INVERTED_TOOL_CALL_RESPONSE';
  sessionId: string;
  callId: string;
  success: boolean;
  result?: any;
  error?: string;
}

// ============================================================================
// STATUS MESSAGES
// ============================================================================

/**
 * Parent (Server) → Iframe (Client)
 * Notify client of server state changes
 */
export interface ServerStatusMessage extends InvertedMessage {
  type: 'INVERTED_SERVER_STATUS';
  sessionId: string;
  status: 'ready' | 'busy' | 'error';
  message?: string;
}

/**
 * Iframe (Client) → Parent (Server)
 * Notify server of client state changes
 */
export interface ClientStatusMessage extends InvertedMessage {
  type: 'INVERTED_CLIENT_STATUS';
  sessionId: string;
  status: 'ready' | 'processing' | 'error';
  message?: string;
}

// ============================================================================
// SIMULATION MESSAGES
// ============================================================================

/**
 * Parent (Server) → Iframe (Client)
 * Start automated demo simulation
 */
export interface StartSimulationMessage extends InvertedMessage {
  type: 'INVERTED_START_SIMULATION';
  sessionId: string;
  scenario: string;
}

/**
 * Iframe (Client) → Parent (Server)
 * Simulation step completed
 */
export interface SimulationStepCompleteMessage extends InvertedMessage {
  type: 'INVERTED_SIMULATION_STEP_COMPLETE';
  sessionId: string;
  stepIndex: number;
  success: boolean;
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Parent (Server) → Iframe (Client)
 * Execute a specific simulation step
 */
export interface SimulationStepMessage extends InvertedMessage {
  type: 'INVERTED_SIMULATION_STEP';
  sessionId: string;
  stepIndex: number;
  step: any; // SimulationStep from types.ts
}

// Union type for all inverted messages
export type InvertedMessageType = 
  | ClientHandshakeMessage
  | ServerHandshakeReplyMessage
  | ConnectionEstablishedMessage
  | ToolCallRequestMessage
  | ToolCallResponseMessage
  | ServerStatusMessage
  | ClientStatusMessage
  | StartSimulationMessage
  | SimulationStepCompleteMessage
  | SimulationStepMessage;

// Type guards
export function isInvertedMessage(data: any): data is InvertedMessageType {
  return data && typeof data === 'object' && 
         typeof data.type === 'string' && 
         data.type.startsWith('INVERTED_') &&
         data.protocolVersion === '1.0';
}

export function isClientHandshake(msg: InvertedMessageType): msg is ClientHandshakeMessage {
  return msg.type === 'INVERTED_CLIENT_HANDSHAKE';
}

export function isServerHandshakeReply(msg: InvertedMessageType): msg is ServerHandshakeReplyMessage {
  return msg.type === 'INVERTED_SERVER_HANDSHAKE_REPLY';
}

export function isConnectionEstablished(msg: InvertedMessageType): msg is ConnectionEstablishedMessage {
  return msg.type === 'INVERTED_CONNECTION_ESTABLISHED';
}

export function isToolCallRequest(msg: InvertedMessageType): msg is ToolCallRequestMessage {
  return msg.type === 'INVERTED_TOOL_CALL_REQUEST';
}

export function isToolCallResponse(msg: InvertedMessageType): msg is ToolCallResponseMessage {
  return msg.type === 'INVERTED_TOOL_CALL_RESPONSE';
}

export function isStartSimulation(msg: InvertedMessageType): msg is StartSimulationMessage {
  return msg.type === 'INVERTED_START_SIMULATION';
}

export function isSimulationStep(msg: InvertedMessageType): msg is SimulationStepMessage {
  return msg.type === 'INVERTED_SIMULATION_STEP';
}

export function isSimulationStepComplete(msg: InvertedMessageType): msg is SimulationStepCompleteMessage {
  return msg.type === 'INVERTED_SIMULATION_STEP_COMPLETE';
}