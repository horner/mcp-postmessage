/**
 * Helper functions for PostMessage transport
 * @module @modelcontextprotocol/sdk/utils/helpers
 */

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  // Use crypto.randomUUID() if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback implementation for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `mcp-${generateUUID()}`;
}

/**
 * Check if current context is in an iframe or popup
 */
export function isInWindowContext(): boolean {
  try {
    return window.self !== window.top || !!window.opener;
  } catch {
    // Cross-origin iframe - access denied means we're in iframe
    return true;
  }
}

/**
 * Detect current phase from URL hash
 */
export function getServerPhase(): 'setup' | 'transport' {
  return window.location.hash.includes('setup') ? 'setup' : 'transport';
}

/**
 * Resolve a URL (relative or absolute) to an absolute URL
 */
export function resolveUrl(url: string | URL, base?: string | URL): URL {
  if (typeof url === 'object' && url instanceof URL) {
    return url;
  }
  
  // If no base provided, use current window location
  const baseUrl = base || (typeof window !== 'undefined' ? window.location.href : 'http://localhost:3000');
  
  return new URL(url, baseUrl);
}

/**
 * Parse URL hash to determine server requirements
 */
export function parseServerUrl(url: string | URL): {
  cleanUrl: URL;
  requiresSetup: boolean;
  requiresVisible: boolean;
} {
  const parsedUrl = resolveUrl(url);
  const hash = parsedUrl.hash.slice(1); // Remove #
  const params = new Set(hash.split(',').filter(Boolean));
  
  const requiresSetup = params.has('setup');
  const requiresVisible = params.has('visible');
  
  // Create clean URL without hash parameters
  const cleanUrl = new URL(parsedUrl);
  cleanUrl.hash = '';
  
  return {
    cleanUrl,
    requiresSetup,
    requiresVisible
  };
}

/**
 * Get setup URL from server URL
 */
export function getSetupUrl(serverUrl: string | URL): URL {
  const url = resolveUrl(serverUrl);
  url.hash = 'setup';
  return url;
}

/**
 * Get transport URL from server URL (removes setup parameter)
 */
export function getTransportUrl(serverUrl: string | URL): URL {
  const parsed = parseServerUrl(serverUrl);
  const url = new URL(parsed.cleanUrl);
  
  // Add back non-setup parameters
  const originalUrl = resolveUrl(serverUrl);
  const originalHash = originalUrl.hash.slice(1);
  const params = originalHash.split(',').filter(Boolean);
  const nonSetupParams = params.filter(p => p !== 'setup');
  
  if (nonSetupParams.length > 0) {
    url.hash = nonSetupParams.join(',');
  }
  
  return url;
}

/**
 * Validate origin against allowed origins list
 */
export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

/**
 * Get appropriate message target for server contexts
 */
export function getMessageTarget(): Window {
  const target = window.opener || window.parent;
  if (!target || target === window) {
    throw new Error('PostMessage server must run in iframe or popup');
  }
  return target;
}



/**
 * Create a timeout promise
 */
export function createTimeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message || `Timeout after ${ms}ms`));
    }, ms);
  });
}

/**
 * Race a promise against a timeout
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T> {
  return Promise.race([
    promise,
    createTimeout(timeoutMs, message)
  ]);
}
