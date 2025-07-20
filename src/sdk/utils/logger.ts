/**
 * Hierarchical logging utility for MCP PostMessage transport
 * 
 * Format: [CONTEXT:COMPONENT:OPERATION] message
 * 
 * Context: CLIENT, CLIENT-SDK, SERVER, SERVER-SDK
 * Component: APPLICATION, MCP-SETUP-HANDSHAKE, MCP-TRANSPORT-HANDSHAKE, MCP-TRANSPORT, WINDOW-CONTROL, TOOL-CALL
 * Operation: INIT, REQ, RESP, ERROR (optional)
 */

export type LogContext = 'CLIENT' | 'CLIENT-SDK' | 'SERVER' | 'SERVER-SDK';
export type LogComponent = 'APPLICATION' | 'MCP-SETUP-HANDSHAKE' | 'MCP-TRANSPORT-HANDSHAKE' | 'MCP-TRANSPORT' | 'WINDOW-CONTROL' | 'TOOL-CALL';
export type LogOperation = 'INIT' | 'REQ' | 'RESP' | 'ERROR';

export interface LoggerConfig {
  context: LogContext;
  component: LogComponent;
  enabled?: boolean;
}

export class Logger {
  private context: LogContext;
  private component: LogComponent;
  private enabled: boolean;

  constructor(config: LoggerConfig) {
    this.context = config.context;
    this.component = config.component;
    this.enabled = config.enabled ?? true;
  }

  private formatTag(operation?: LogOperation): string {
    const baseTag = `${this.context}:${this.component}`;
    return operation ? `[${baseTag}:${operation}]` : `[${baseTag}]`;
  }

  log(message: string, ...args: any[]): void;
  log(operation: LogOperation, message: string, ...args: any[]): void;
  log(operationOrMessage: LogOperation | string, messageOrArgs?: string | any, ...args: any[]): void {
    if (!this.enabled) return;

    if (typeof operationOrMessage === 'string') {
      // log(message, ...args)
      console.log(`${this.formatTag()} ${operationOrMessage}`, messageOrArgs, ...args);
    } else {
      // log(operation, message, ...args)
      console.log(`${this.formatTag(operationOrMessage)} ${messageOrArgs}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void;
  error(operation: LogOperation, message: string, ...args: any[]): void;
  error(operationOrMessage: LogOperation | string, messageOrArgs?: string | any, ...args: any[]): void {
    if (!this.enabled) return;

    if (typeof operationOrMessage === 'string') {
      // error(message, ...args)
      console.error(`${this.formatTag('ERROR')} ${operationOrMessage}`, messageOrArgs, ...args);
    } else {
      // error(operation, message, ...args)
      console.error(`${this.formatTag(operationOrMessage)} ${messageOrArgs}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void;
  warn(operation: LogOperation, message: string, ...args: any[]): void;
  warn(operationOrMessage: LogOperation | string, messageOrArgs?: string | any, ...args: any[]): void {
    if (!this.enabled) return;

    if (typeof operationOrMessage === 'string') {
      // warn(message, ...args)
      console.warn(`${this.formatTag()} ${operationOrMessage}`, messageOrArgs, ...args);
    } else {
      // warn(operation, message, ...args)
      console.warn(`${this.formatTag(operationOrMessage)} ${messageOrArgs}`, ...args);
    }
  }

  debug(message: string, ...args: any[]): void;
  debug(operation: LogOperation, message: string, ...args: any[]): void;
  debug(operationOrMessage: LogOperation | string, messageOrArgs?: string | any, ...args: any[]): void {
    if (!this.enabled) return;

    if (typeof operationOrMessage === 'string') {
      // debug(message, ...args)
      console.debug(`${this.formatTag()} ${operationOrMessage}`, messageOrArgs, ...args);
    } else {
      // debug(operation, message, ...args)
      console.debug(`${this.formatTag(operationOrMessage)} ${messageOrArgs}`, ...args);
    }
  }

  /**
   * Create a child logger with the same context but different component
   */
  child(component: LogComponent): Logger {
    return new Logger({
      context: this.context,
      component,
      enabled: this.enabled
    });
  }

  /**
   * Enable or disable this logger
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

/**
 * Convenience function to create commonly used loggers
 */
export function createLogger(context: LogContext, component: LogComponent, enabled = true): Logger {
  return new Logger({ context, component, enabled });
}

// Pre-configured loggers for common use cases
export const clientAppLogger = createLogger('CLIENT', 'APPLICATION');
export const clientSdkTransportLogger = createLogger('CLIENT-SDK', 'MCP-TRANSPORT');
export const clientSdkSetupLogger = createLogger('CLIENT-SDK', 'MCP-SETUP-HANDSHAKE');
export const clientSdkTransportHandshakeLogger = createLogger('CLIENT-SDK', 'MCP-TRANSPORT-HANDSHAKE');
export const clientSdkWindowLogger = createLogger('CLIENT-SDK', 'WINDOW-CONTROL');

export const serverToolLogger = createLogger('SERVER', 'TOOL-CALL');
export const serverSdkTransportLogger = createLogger('SERVER-SDK', 'MCP-TRANSPORT');
export const serverSdkSetupLogger = createLogger('SERVER-SDK', 'MCP-SETUP-HANDSHAKE');
export const serverSdkTransportHandshakeLogger = createLogger('SERVER-SDK', 'MCP-TRANSPORT-HANDSHAKE');
export const serverSdkWindowLogger = createLogger('SERVER-SDK', 'WINDOW-CONTROL');