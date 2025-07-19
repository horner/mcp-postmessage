/**
 * PostMessage Transport Type Definitions
 * @module @modelcontextprotocol/sdk/types/postmessage
 */

// ============================================================================
// WINDOW CONTROL INTERFACE
// ============================================================================

/**
 * Window control interface for managing iframe/popup windows
 */
export interface WindowControl {
  /**
   * Navigate the window to a URL
   */
  navigate(url: string): Promise<void>;
  
  /**
   * Post a message to the window
   */
  postMessage(message: any, targetOrigin: string): void;
  
  /**
   * Subscribe to messages from the window
   * @returns Cleanup function
   */
  onMessage(handler: (event: MessageEvent) => void): () => void;
  
  /**
   * Control window visibility
   */
  setVisible(visible: boolean): void;
  
  /**
   * Optional cleanup when done
   */
  destroy?(): void;
}


// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Options for PostMessage client transport
 */
export interface PostMessageTransportOptions {
  /**
   * Server URL
   */
  serverUrl: string | URL;
  
  /**
   * Window control implementation
   */
  windowControl: WindowControl;
  
  /**
   * Optional session ID (will be generated if not provided)
   */
  sessionId?: string;
  
  /**
   * Protocol version
   */
  protocolVersion?: string;
}

/**
 * Options for setup manager
 */
export interface SetupManagerOptions {
  /**
   * Window control implementation
   */
  windowControl: WindowControl;
  
  /**
   * Session ID for this server connection
   */
  sessionId: string;
  
  /**
   * Optional timeout for setup completion (ms)
   */
  setupTimeout?: number;
}

/**
 * Result from setup completion
 */
export interface SetupResult {
  success: boolean;
  serverTitle?: string;
  transportVisibility?: {
    requirement: 'required' | 'optional' | 'hidden';
    optionalMessage?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// SERVER TYPES
// ============================================================================

/**
 * Configuration for PostMessage servers
 */
export interface PostMessageServerConfig {
  /**
   * List of allowed client origins
   */
  allowedOrigins: string[];
  
  /**
   * Optional server info
   */
  serverInfo?: {
    name: string;
    version: string;
  };
}

/**
 * Options for setup handler
 */
export interface SetupHandlerOptions extends PostMessageServerConfig {
  /**
   * Whether setup requires visible UI
   */
  requiresVisibleSetup: boolean;
  
  /**
   * Server title for client display
   */
  serverTitle: string;
  
  /**
   * Transport visibility requirements
   */
  transportVisibility: {
    requirement: 'required' | 'optional' | 'hidden';
    optionalMessage?: string;
  };
  
  /**
   * Callback to handle setup logic
   */
  onSetup: () => Promise<void>;
}

/**
 * Options for server transport
 */
export interface PostMessageServerTransportOptions extends PostMessageServerConfig {
  /**
   * Optional custom message target (defaults to window.parent || window.opener)
   */
  messageTarget?: Window;
}
