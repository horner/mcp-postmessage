/**
 * PostMessage Transport Protocol for MCP
 * 
 * This protocol defines communication between:
 * - Parent page acting as MCP Server (implements tools)
 * - Iframe acting as MCP Client (chat interface)
 * - Uses PostMessage as the transport mechanism for MCP
 */

// Base message interface
export interface MCPPostMessage {
  type: string;
  protocolVersion: '1.0';
}

// ============================================================================
// HANDSHAKE MESSAGES
// ============================================================================

/**
 * Step 1: Iframe (MCP Client) → Parent (MCP Server)
 * Client announces readiness to connect
 */
export interface ClientHandshakeMessage extends MCPPostMessage {
  type: 'MCP_CLIENT_HANDSHAKE';
  sessionId: string;
}

/**
 * Step 2: Parent (MCP Server) → Iframe (MCP Client)
 * Server responds with available tools and capabilities
 */
export interface ServerHandshakeReplyMessage extends MCPPostMessage {
  type: 'MCP_SERVER_HANDSHAKE_REPLY';
  sessionId: string;
  serverInfo: {
    name: string;
    version: string;
    description: string;
  };
  tools: ToolDefinition[];
}

/**
 * Step 3: Iframe (MCP Client) → Parent (MCP Server)
 * Client confirms connection established
 */
export interface ConnectionEstablishedMessage extends MCPPostMessage {
  type: 'MCP_CONNECTION_ESTABLISHED';
  sessionId: string;
}

// ============================================================================
// TOOL EXECUTION MESSAGES
// ============================================================================

/**
 * Iframe (MCP Client) → Parent (MCP Server)
 * Request to execute a tool
 */
export interface ToolCallRequestMessage extends MCPPostMessage {
  type: 'MCP_TOOL_CALL_REQUEST';
  sessionId: string;
  callId: string;
  toolName: string;
  parameters: any;
}

/**
 * Parent (MCP Server) → Iframe (MCP Client)
 * Tool execution result
 */
export interface ToolCallResponseMessage extends MCPPostMessage {
  type: 'MCP_TOOL_CALL_RESPONSE';
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
 * Parent (MCP Server) → Iframe (MCP Client)
 * Notify client of server state changes
 */
export interface ServerStatusMessage extends MCPPostMessage {
  type: 'MCP_SERVER_STATUS';
  sessionId: string;
  status: 'ready' | 'busy' | 'error';
  message?: string;
}

/**
 * Iframe (MCP Client) → Parent (MCP Server)
 * Notify server of client state changes
 */
export interface ClientStatusMessage extends MCPPostMessage {
  type: 'MCP_CLIENT_STATUS';
  sessionId: string;
  status: 'ready' | 'processing' | 'error';
  message?: string;
}

// ============================================================================
// SIMULATION MESSAGES
// ============================================================================

/**
 * Parent (MCP Server) → Iframe (MCP Client)
 * Start automated demo simulation
 */
export interface StartSimulationMessage extends MCPPostMessage {
  type: 'MCP_START_SIMULATION';
  sessionId: string;
  scenario: string;
}

/**
 * Iframe (MCP Client) → Parent (MCP Server)
 * Simulation step completed
 */
export interface SimulationStepCompleteMessage extends MCPPostMessage {
  type: 'MCP_SIMULATION_STEP_COMPLETE';
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
 * Parent (MCP Server) → Iframe (MCP Client)
 * Execute a specific simulation step
 */
export interface SimulationStepMessage extends MCPPostMessage {
  type: 'MCP_SIMULATION_STEP';
  sessionId: string;
  stepIndex: number;
  step: any; // SimulationStep from types.ts
}

// Union type for all MCP PostMessage protocol messages
export type MCPPostMessageType = 
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
export function isMCPPostMessage(data: any): data is MCPPostMessageType {
  return data && typeof data === 'object' && 
         typeof data.type === 'string' && 
         data.type.startsWith('MCP_') &&
         data.protocolVersion === '1.0';
}

export function isClientHandshake(msg: MCPPostMessageType): msg is ClientHandshakeMessage {
  return msg.type === 'MCP_CLIENT_HANDSHAKE';
}

export function isServerHandshakeReply(msg: MCPPostMessageType): msg is ServerHandshakeReplyMessage {
  return msg.type === 'MCP_SERVER_HANDSHAKE_REPLY';
}

export function isConnectionEstablished(msg: MCPPostMessageType): msg is ConnectionEstablishedMessage {
  return msg.type === 'MCP_CONNECTION_ESTABLISHED';
}

export function isToolCallRequest(msg: MCPPostMessageType): msg is ToolCallRequestMessage {
  return msg.type === 'MCP_TOOL_CALL_REQUEST';
}

export function isToolCallResponse(msg: MCPPostMessageType): msg is ToolCallResponseMessage {
  return msg.type === 'MCP_TOOL_CALL_RESPONSE';
}

export function isStartSimulation(msg: MCPPostMessageType): msg is StartSimulationMessage {
  return msg.type === 'MCP_START_SIMULATION';
}

export function isSimulationStep(msg: MCPPostMessageType): msg is SimulationStepMessage {
  return msg.type === 'MCP_SIMULATION_STEP';
}

export function isSimulationStepComplete(msg: MCPPostMessageType): msg is SimulationStepCompleteMessage {
  return msg.type === 'MCP_SIMULATION_STEP_COMPLETE';
}