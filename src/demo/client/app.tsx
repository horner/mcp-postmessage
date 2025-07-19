import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PostMessageTransport, PostMessageSetupManager } from '$sdk/client/transport.js';
import { IframeWindowControl } from '$sdk/client/window-control.js';
import { parseServerUrl, generateUUID } from '$sdk/utils/helpers.js';
import { SetupResult } from '$sdk/types/postmessage.js';
import { 
  SetupCompleteMessage,
  TransportMessage
} from '$protocol/types.js';

// ============================================================================
// TYPES
// ============================================================================

interface Server {
  id: string;
  name: string;
  url: string;
  setupComplete: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  sessionId?: string;
  transport?: PostMessageTransport;
  ephemeralMessage?: string;
  transportVisibility?: {
    requirement: 'required' | 'optional' | 'hidden';
    optionalMessage?: string;
  };
  lastError?: string;
  tools?: Array<{
    name: string;
    title?: string;
    description?: string;
    inputSchema?: any;
  }>;
  lastToolResult?: {
    toolName: string;
    result?: string;
    error?: string;
    timestamp: Date;
  };
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

// Load server examples from JSON file (will be swapped during build)
import serversData from './servers.dev.json';

// This constant will be replaced at build time with production data
const SERVER_EXAMPLES = typeof PRODUCTION_SERVERS !== 'undefined' ? PRODUCTION_SERVERS : serversData;

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

function App() {
  const [servers, setServers] = useState<Server[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [setupModalVisible, setSetupModalVisible] = useState(false);
  const [setupServerUrl, setSetupServerUrl] = useState('');
  const [newServerUrl, setNewServerUrl] = useState('');
  const [selectedExample, setSelectedExample] = useState('');
  const [toolParams, setToolParams] = useState<Record<string, Record<string, any>>>({});
  const [iframeVisibility, setIframeVisibility] = useState<Record<string, boolean>>({});
  
  const setupIframeRef = useRef<HTMLIFrameElement>(null);
  const transportIframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());
  
  // ============================================================================
  // TOAST MANAGEMENT
  // ============================================================================

  const showToast = (type: Toast['type'], message: string) => {
    const id = generateUUID();
    setToasts(prev => [...prev, { id, type, message }]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 5000);
  };

  // Initialize servers from localStorage on mount
  useEffect(() => {
    const savedServers = loadServersFromStorage();
    if (savedServers.length > 0) {
      setServers(savedServers);
      showToast('info', `Loaded ${savedServers.length} saved server(s)`);
    }
  }, []);
  
  // Save servers to localStorage whenever servers change
  useEffect(() => {
    saveServersToStorage(servers);
  }, [servers]);

  // ============================================================================
  // LOCALSTORAGE PERSISTENCE
  // ============================================================================

  const STORAGE_KEY = 'mcp-postmessage-servers';

  const saveServersToStorage = (servers: Server[]) => {
    try {
      // Only save persistent data, not runtime state
      const persistentServers = servers.map(server => ({
        id: server.id,
        name: server.name,
        url: server.url,
        setupComplete: server.setupComplete,
        transportVisibility: server.transportVisibility,
        // Don't save runtime state like connectionStatus, transport, etc.
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentServers));
    } catch (error) {
      console.warn('Failed to save servers to localStorage:', error);
    }
  };

  const loadServersFromStorage = (): Server[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const persistentServers = JSON.parse(stored);
        return persistentServers.map((server: any) => ({
          ...server,
          connectionStatus: 'disconnected' as const,
          // Runtime state will be initialized as needed
        }));
      }
    } catch (error) {
      console.warn('Failed to load servers from localStorage:', error);
    }
    return [];
  };

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const connectedServers = servers.filter(s => s.connectionStatus === 'connected');
  
  const serversWithIframes = servers.filter(server => 
    server.setupComplete && server.transportVisibility
  );
  
  const visibleServerCount = serversWithIframes.filter(server => {
    if (server.transportVisibility?.requirement === 'required') {
      return true;
    }
    if (server.transportVisibility?.requirement === 'optional') {
      return iframeVisibility[server.id] !== false;
    }
    return false;
  }).length;
  
  const allTools = connectedServers.flatMap(server => 
    (server.tools || []).map(tool => ({
      ...tool,
      serverId: server.id,
      serverName: server.name
    }))
  );

  // ============================================================================
  // IFRAME MANAGEMENT
  // ============================================================================

  const getOrCreateTransportIframe = (serverId: string): HTMLIFrameElement => {
    if (!transportIframeRefs.current.has(serverId)) {
      const iframe = document.createElement('iframe');
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.style.background = 'white';
      iframe.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-forms');
      iframe.allow = 'geolocation; clipboard-read; clipboard-write';
      iframe.title = `Server ${serverId} - Transport`;
      transportIframeRefs.current.set(serverId, iframe);
    }
    return transportIframeRefs.current.get(serverId)!;
  };

  const removeTransportIframe = (serverId: string) => {
    const iframe = transportIframeRefs.current.get(serverId);
    if (iframe?.parentNode) {
      // Remove iframe from DOM and clean up resources
      iframe.parentNode.removeChild(iframe);
    }
    transportIframeRefs.current.delete(serverId);
  };

  // ============================================================================
  // SERVER MANAGEMENT
  // ============================================================================

  const handleExampleSelect = (url: string) => {
    // Absolutify the URL using browser's URL constructor
    const absoluteUrl = new URL(url, window.location.href).href;
    setNewServerUrl(absoluteUrl);
    setSelectedExample(url);
  };

  const addServer = async (url: string) => {
    if (!url.trim()) {
      showToast('error', 'Please enter a server URL');
      return;
    }

    const newServer: Server = {
      id: generateUUID(),
      name: 'New Server',
      url: url.trim(),
      setupComplete: false,
      connectionStatus: 'disconnected'
    };
    
    setServers(prev => [...prev, newServer]);
    setNewServerUrl('');
    setSelectedExample('');
    
    // Automatically start setup
    await runSetup(newServer);
  };

  const removeServer = (id: string) => {
    const server = servers.find(s => s.id === id);
    
    // Disconnect if this server is connected
    if (server?.connectionStatus === 'connected') {
      disconnect(id);
    }
    
    setServers(prev => prev.filter(server => server.id !== id));
    showToast('info', 'Server removed');
  };

  const updateServer = (id: string, updates: Partial<Server>) => {
    setServers(prev => prev.map(server => 
      server.id === id ? { ...server, ...updates } : server
    ));
  };

  // ============================================================================
  // SETUP PHASE
  // ============================================================================

  const runSetup = async (server: Server) => {
    console.log(`[SETUP] Starting setup for ${server.name}`);
    
    updateServer(server.id, { connectionStatus: 'connecting' });
    setSetupServerUrl(server.url);
    
    try {
      // Wait for modal iframe to be ready
      await new Promise(resolve => setTimeout(resolve, 0));
      
      if (!setupIframeRef.current) {
        throw new Error('Setup iframe not available');
      }

      const windowControl = new IframeWindowControl({
        iframe: setupIframeRef.current,
        setVisible: (visible) => {
          if (visible) {
            // Server requires visible setup - show modal
            setSetupModalVisible(true);
          }
        },
        onNavigate: (url) => {
          console.log(`[SETUP] Setup navigating to: ${url}`);
        },
        onLoad: () => {
          console.log(`[SETUP] Setup iframe loaded`);
        },
        onError: (error) => {
          console.error(`[SETUP] Setup iframe error:`, error);
          showToast('error', 'Failed to load setup page');
        }
      });

      const setupManager = new PostMessageSetupManager({
        windowControl,
        sessionId: server.id,  // Use server.id as sessionId for consistency
        setupTimeout: 300000 // 5 minutes
      });

      const result = await setupManager.performSetup(server.url);
      
      if (result.success) {
        updateServer(server.id, {
          setupComplete: true,
          name: result.serverTitle || server.name,
          transportVisibility: result.transportVisibility,
          ephemeralMessage: result.ephemeralMessage
        });
        
        showToast('success', result.ephemeralMessage || 'Setup completed successfully');
        
        // Show ephemeral message briefly
        if (result.ephemeralMessage) {
          setTimeout(() => {
            updateServer(server.id, { ephemeralMessage: undefined });
          }, 10000);
        }
        
        // Reset connection status to disconnected after successful setup
        updateServer(server.id, { connectionStatus: 'disconnected' });
      } else {
        updateServer(server.id, {
          lastError: result.error?.message || 'Setup failed'
        });
        
        showToast('error', result.error?.message || 'Setup failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Setup failed';
      updateServer(server.id, { 
        lastError: errorMessage,
        connectionStatus: 'error'
      });
      showToast('error', errorMessage);
    } finally {
      setSetupModalVisible(false);
      setSetupServerUrl('');
      
      // Clean up setup iframe
      if (setupIframeRef.current) {
        setupIframeRef.current.src = 'about:blank';
      }
    }
  };

  // ============================================================================
  // TRANSPORT PHASE
  // ============================================================================

  const connect = async (server: Server) => {
    if (!server.setupComplete) {
      showToast('error', 'Server setup required before connecting');
      return;
    }
    
    console.log(`[TRANSPORT] Starting connection to ${server.name} at ${server.url}`);
    
    updateServer(server.id, { connectionStatus: 'connecting' });
    
    try {
      console.log(`[TRANSPORT] Creating iframe for server ${server.id}`);
      const iframe = getOrCreateTransportIframe(server.id);
      
      // The iframe should already be in the right column container by React
      // We just need to make sure it's visible for transport to work
      console.log(`[TRANSPORT] Iframe should be in right column container`);
      iframe.style.visibility = 'visible';
      
      console.log(`[TRANSPORT] Creating window control for iframe`);
      const windowControl = new IframeWindowControl({
        iframe,
        setVisible: () => {}, // Visibility controlled by layout
        onNavigate: (url) => {
          console.log(`[TRANSPORT] Transport navigating to: ${url}`);
        },
        onLoad: () => {
          console.log(`[TRANSPORT] Transport iframe loaded`);
        },
        onError: (error) => {
          console.error(`[TRANSPORT] Transport iframe error:`, error);
          showToast('error', 'Failed to load server');
        }
      });

      console.log(`[TRANSPORT] Creating PostMessageTransport`);
      const transport = new PostMessageTransport({
        serverUrl: server.url,
        windowControl,
        sessionId: server.id  // Use server.id as sessionId for persistence
      });

      transport.onmessage = (message) => {
        console.log(`[TRANSPORT] Received MCP message:`, message);
        
        // Handle tools/list response to update server tools
        if (message.method === 'tools/list' || 
            (message.id && message.result && message.result.tools)) {
          updateServer(server.id, {
            tools: message.result?.tools || []
          });
        }
        
        // Tool call responses are now handled directly in the callTool function
        // via Promise-based response handlers, so no need to process them here
      };

      transport.onerror = (error) => {
        console.error(`[TRANSPORT] Transport error:`, error);
        showToast('error', error.message);
        updateServer(server.id, { 
          connectionStatus: 'error',
          lastError: error.message 
        });
      };

      console.log(`[TRANSPORT] Starting transport...`);
      await transport.start();
      console.log(`[TRANSPORT] Transport started successfully`);
      
      // Request tools list after connection
      try {
        await transport.send({
          jsonrpc: '2.0',
          id: generateUUID(),
          method: 'tools/list'
        });
      } catch (error) {
        console.warn('Failed to request tools list:', error);
      }
      
      updateServer(server.id, {
        connectionStatus: 'connected',
        sessionId: transport.sessionId,
        transport: transport
      });
      
      // Configure iframe visibility based on server requirements
      if (server.transportVisibility?.requirement === 'required') {
        console.log(`[TRANSPORT] Server visibility is required, always visible`);
        setIframeVisibility(prev => ({ ...prev, [server.id]: true }));
      } else if (server.transportVisibility?.requirement === 'optional') {
        console.log(`[TRANSPORT] Server visibility is optional, visible by default`);
        setIframeVisibility(prev => ({ ...prev, [server.id]: true }));
      } else {
        console.log(`[TRANSPORT] Server should be hidden, not shown in layout`);
        setIframeVisibility(prev => ({ ...prev, [server.id]: false }));
      }
      
      showToast('success', `Connected to ${server.name}`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      showToast('error', errorMessage);
      updateServer(server.id, { 
        connectionStatus: 'error',
        lastError: errorMessage 
      });
    }
  };

  const disconnect = async (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (server?.transport) {
      await server.transport.close();
      
      // Remove iframe
      removeTransportIframe(serverId);
      
      // Update server state
      updateServer(serverId, {
        connectionStatus: 'disconnected',
        sessionId: undefined,
        transport: undefined,
        tools: undefined
      });
      
      // Clean up visibility state
      setIframeVisibility(prev => {
        const newState = { ...prev };
        delete newState[serverId];
        return newState;
      });
      
      showToast('info', `Disconnected from ${server.name}`);
    }
  };

  // ============================================================================
  // TOOL CALL INTERFACE
  // ============================================================================

  const callTool = async (serverId: string, toolName: string, params: any) => {
    console.log(`[TOOL-CALL] Starting tool call for ${toolName} on server ${serverId}`);
    
    const server = servers.find(s => s.id === serverId);
    if (!server?.transport) {
      showToast('error', 'No active connection to this server');
      return;
    }

    try {
      const messageId = generateUUID();
      const message = {
        jsonrpc: '2.0' as const,
        id: messageId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: params
        }
      };

      console.log(`[TOOL-CALL] Calling ${toolName} with params:`, params);
      
      // Create a promise that will resolve when we get the response
      const responsePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Tool call timeout'));
        }, 30000); // 30 second timeout
        
        const originalOnMessage = server.transport!.onmessage;
        
        const responseHandler = (msg: any) => {
          // Call original handler first
          if (originalOnMessage) {
            originalOnMessage(msg);
          }
          
          // Check if this is our response
          if (msg.id === messageId && msg.jsonrpc === '2.0') {
            clearTimeout(timeout);
            server.transport!.onmessage = originalOnMessage; // Restore original handler
            
            if (msg.error) {
              reject(new Error(msg.error.message || 'Tool call failed'));
            } else {
              resolve(msg.result);
            }
          }
        };
        
        server.transport!.onmessage = responseHandler;
      });

      await server.transport.send(message);
      const result = await responsePromise;
      
      // Display result
      const resultText = result?.content?.[0]?.text || JSON.stringify(result, null, 2);
      showToast('success', `${toolName} completed`);
      
      // Update a simple last result display
      updateServer(serverId, {
        lastToolResult: {
          toolName,
          result: resultText,
          timestamp: new Date()
        }
      });
      
      console.log(`[TOOL-CALL] ${toolName} completed:`, resultText);
      
    } catch (error) {
      console.error(`[TOOL-CALL] Error in callTool:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Tool call failed';
      showToast('error', errorMessage);
      
      // Update with error
      updateServer(serverId, {
        lastToolResult: {
          toolName,
          error: errorMessage,
          timestamp: new Date()
        }
      });
    }
  };

  const getDefaultParamsForTool = (tool: any) => {
    const params: Record<string, any> = {};
    
    if (tool.inputSchema && tool.inputSchema.properties) {
      Object.entries(tool.inputSchema.properties).forEach(([key, schema]: [string, any]) => {
        // Try to extract example from description using pattern "Example: (.*)"
        let example = schema.examples?.[0] || schema.example;
        
        if (example === undefined && schema.description) {
          const exampleMatch = schema.description.match(/Example:\s*(.+)/s);
          if (exampleMatch) {
            example = exampleMatch[1].trim();
            // Convert to number if it's a numeric field
            if ((schema.type === 'number' || schema.type === 'integer') && !isNaN(Number(example))) {
              example = Number(example);
            }
          }
        }
        
        if (example !== undefined) {
          params[key] = example;
        } else if (schema.type === 'number' || schema.type === 'integer') {
          params[key] = schema.default || 1000;
        } else if (schema.type === 'string') {
          params[key] = schema.default || '';
        } else if (schema.type === 'boolean') {
          params[key] = schema.default || false;
        }
      });
    }
    
    return params;
  };

  const getToolParamKey = (serverId: string, toolName: string) => `${serverId}-${toolName}`;

  const getToolParams = (serverId: string, toolName: string, tool: any) => {
    const key = getToolParamKey(serverId, toolName);
    return toolParams[key] || getDefaultParamsForTool(tool);
  };

  const updateToolParams = (serverId: string, toolName: string, params: any) => {
    const key = getToolParamKey(serverId, toolName);
    setToolParams(prev => ({
      ...prev,
      [key]: params
    }));
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={{ 
      fontFamily: 'system-ui, sans-serif', 
      height: '100vh', 
      display: 'grid',
      gridTemplateRows: 'auto 1fr',
      gridTemplateColumns: '350px 500px 1fr',
      gridTemplateAreas: '"header header header" "sidebar tools content"',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <header style={{ 
        gridArea: 'header',
        background: '#1f2937', 
        color: 'white', 
        padding: '1rem 2rem',
        borderBottom: '1px solid #374151'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>MCP PostMessage Demo Client</h1>
        <p style={{ margin: '0.5rem 0 0 0', opacity: 0.8 }}>
          Model Context Protocol with PostMessage Transport
        </p>
      </header>
        {/* LEFT: Server Management Sidebar */}
        <div style={{ 
          gridArea: 'sidebar',
          background: '#f9fafb', 
          borderRight: '1px solid #e5e7eb',
          padding: '1.5rem',
          overflowY: 'auto'
        }}>
          {/* Add Server Section */}
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem' }}>Add Server</h2>
            
            {/* Examples Dropdown */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Examples:
              </label>
              <select 
                value={selectedExample}
                onChange={(e) => handleExampleSelect(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '0.5rem', 
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  background: 'white'
                }}
              >
                <option value="">Select an example...</option>
                {SERVER_EXAMPLES.map(example => (
                  <option key={example.url} value={example.url}>
                    {example.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Server URL Input */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Server URL:
              </label>
              <input
                type="url"
                value={newServerUrl}
                onChange={(e) => setNewServerUrl(e.target.value)}
                placeholder=""
                style={{ 
                  width: '100%', 
                  padding: '0.5rem', 
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              onClick={() => addServer(newServerUrl)}
              disabled={!newServerUrl.trim()}
              style={{
                width: '100%',
                padding: '0.75rem',
                background: newServerUrl.trim() ? '#3b82f6' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: newServerUrl.trim() ? 'pointer' : 'not-allowed',
                fontWeight: 500
              }}
            >
              Add & Setup Server
            </button>
          </section>

          {/* Configured Servers */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Configured Servers</h2>
              {servers.length > 0 && (
                <button
                  onClick={() => {
                    // Disconnect all servers first
                    servers.forEach(server => {
                      if (server.connectionStatus === 'connected') {
                        disconnect(server.id);
                      }
                    });
                    // Clear servers
                    setServers([]);
                    // Clear localStorage
                    localStorage.removeItem(STORAGE_KEY);
                    showToast('info', 'All servers cleared');
                  }}
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500
                  }}
                >
                  Clear All
                </button>
              )}
            </div>
            
            {servers.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '2rem', 
                color: '#6b7280',
                border: '2px dashed #d1d5db',
                borderRadius: '0.375rem'
              }}>
                <p>No servers configured</p>
                <p style={{ fontSize: '0.875rem' }}>Add a server URL above to get started</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {servers.map(server => (
                  <div key={server.id} style={{
                    padding: '1rem',
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.125rem' }}>{server.name}</h3>
                      <button
                        onClick={() => removeServer(server.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '1.25rem'
                        }}
                      >
                        ×
                      </button>
                    </div>
                    
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                      {server.url}
                    </p>

                    {server.ephemeralMessage && (
                      <div style={{
                        padding: '0.5rem',
                        background: '#dcfce7',
                        border: '1px solid #22c55e',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        color: '#166534',
                        marginBottom: '0.5rem'
                      }}>
                        {server.ephemeralMessage}
                      </div>
                    )}

                    {server.lastError && (
                      <div style={{
                        padding: '0.5rem',
                        background: '#fee2e2',
                        border: '1px solid #ef4444',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        color: '#dc2626',
                        marginBottom: '0.5rem'
                      }}>
                        {server.lastError}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {!server.setupComplete ? (
                        <button
                          onClick={() => runSetup(server)}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            background: '#f59e0b',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            fontWeight: 500
                          }}
                        >
                          Setup
                        </button>
                      ) : server.connectionStatus === 'connected' ? (
                        <>
                          <button
                            onClick={() => disconnect(server.id)}
                            style={{
                              flex: 1,
                              padding: '0.5rem',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontWeight: 500
                            }}
                          >
                            Disconnect
                          </button>
                          {server.transportVisibility?.requirement === 'optional' && (
                            <button
                              onClick={() => {
                                const isCurrentlyVisible = iframeVisibility[server.id] !== false;
                                // Just toggle the visibility state - don't modify iframe
                                setIframeVisibility(prev => ({ ...prev, [server.id]: !isCurrentlyVisible }));
                              }}
                              style={{
                                padding: '0.5rem',
                                background: '#6b7280',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.375rem',
                                cursor: 'pointer',
                                fontWeight: 500,
                                fontSize: '0.875rem'
                              }}
                            >
                              {iframeVisibility[server.id] === false ? 'Show' : 'Hide'}
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => connect(server)}
                          disabled={server.connectionStatus === 'connecting'}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            background: server.connectionStatus === 'connecting' ? '#9ca3af' : '#22c55e',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.375rem',
                            cursor: server.connectionStatus === 'connecting' ? 'not-allowed' : 'pointer',
                            fontWeight: 500
                          }}
                        >
                          {server.connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
                        </button>
                      )}
                    </div>

                    {server.transportVisibility?.requirement === 'optional' && (
                      <p style={{ 
                        margin: '0.5rem 0 0 0', 
                        fontSize: '0.75rem', 
                        color: '#6b7280',
                        fontStyle: 'italic'
                      }}>
                        {server.transportVisibility.optionalMessage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Hidden iframes for servers with requirement: 'hidden' */}
          {serversWithIframes.filter(server => 
            server.transportVisibility?.requirement === 'hidden'
          ).map(server => (
            <div 
              key={`hidden-${server.id}`}
              data-server-id={server.id}
              style={{ display: 'none' }}
              ref={el => {
                if (el) {
                  const iframe = getOrCreateTransportIframe(server.id);
                  if (!el.contains(iframe)) {
                    el.appendChild(iframe);
                  }
                }
              }}
            />
          ))}
        </div>

        {/* MIDDLE: Combined Tools Column */}
        <div style={{ 
          gridArea: 'tools',
          background: 'white', 
          borderRight: '1px solid #e5e7eb',
          padding: '1.5rem',
          overflowY: 'auto'
        }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem' }}>Available Tools</h2>
          {connectedServers.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem', 
              color: '#6b7280',
              border: '2px dashed #d1d5db',
              borderRadius: '0.375rem'
            }}>
              <p>No servers connected</p>
              <p style={{ fontSize: '0.875rem' }}>Connect to servers to see their tools</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {connectedServers.map(server => (
                <div key={server.id} style={{
                  padding: '1rem',
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem'
                }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem' }}>{server.name}</h3>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                    Session: {server.sessionId}
                  </p>
                  
                  {server.tools && server.tools.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {server.tools.map(tool => {
                        const currentParams = getToolParams(server.id, tool.name, tool);
                        const lastResult = server.lastToolResult?.toolName === tool.name ? server.lastToolResult : null;
                        
                        return (
                          <div key={tool.name} style={{ 
                            border: '1px solid #e5e7eb',
                            borderRadius: '0.375rem',
                            padding: '0.75rem',
                            background: 'white'
                          }}>
                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
                              {tool.title || tool.name}
                            </h4>
                            
                            {tool.description && (
                              <p style={{ 
                                margin: '0 0 0.75rem 0', 
                                fontSize: '0.875rem', 
                                color: '#6b7280',
                                fontStyle: 'italic'
                              }}>
                                {tool.description}
                              </p>
                            )}
                            
                            {/* Dynamic parameter inputs */}
                            {tool.inputSchema && tool.inputSchema.properties && (
                              <div style={{ marginBottom: '0.75rem' }}>
                                {Object.entries(tool.inputSchema.properties).map(([paramName, schema]: [string, any]) => (
                                  <div key={paramName} style={{ marginBottom: '0.5rem' }}>
                                    <label style={{ 
                                      display: 'block', 
                                      fontSize: '0.875rem', 
                                      fontWeight: 500,
                                      marginBottom: '0.25rem'
                                    }}>
                                      {paramName}
                                      {schema.description && (
                                        <span style={{ fontWeight: 400, color: '#6b7280' }}>
                                          {' - ' + schema.description.replace(/\.\s*Example:\s*(.+)/s, '')}
                                        </span>
                                      )}
                                    </label>
                                    
                                    {(schema.type === 'number' || schema.type === 'integer') && (
                                      <input
                                        type="number"
                                        value={currentParams[paramName] || ''}
                                        onChange={(e) => {
                                          const newParams = { ...currentParams };
                                          newParams[paramName] = schema.type === 'integer' 
                                            ? parseInt(e.target.value) 
                                            : parseFloat(e.target.value);
                                          updateToolParams(server.id, tool.name, newParams);
                                        }}
                                        style={{
                                          width: '100%',
                                          padding: '0.5rem',
                                          border: '1px solid #d1d5db',
                                          borderRadius: '0.375rem',
                                          fontSize: '0.875rem'
                                        }}
                                        placeholder={(() => {
                                          const exampleMatch = schema.description?.match(/Example:\s*(.+)/s);
                                          const example = schema.examples?.[0] || schema.example || (exampleMatch ? exampleMatch[1].trim() : null) || schema.default || 1000;
                                          return `Example: ${example}`;
                                        })()}
                                      />
                                    )}
                                    
                                    {schema.type === 'string' && (
                                      <textarea
                                        value={currentParams[paramName] || ''}
                                        onChange={(e) => {
                                          const newParams = { ...currentParams };
                                          newParams[paramName] = e.target.value;
                                          updateToolParams(server.id, tool.name, newParams);
                                        }}
                                        style={{
                                          width: '100%',
                                          padding: '0.5rem',
                                          border: '1px solid #d1d5db',
                                          borderRadius: '0.375rem',
                                          fontSize: '0.875rem',
                                          minHeight: '100px',
                                          resize: 'vertical',
                                          fontFamily: 'Monaco, Consolas, monospace'
                                        }}
                                        placeholder={(() => {
                                          const exampleMatch = schema.description?.match(/Example:\s*(.+)/s);
                                          return schema.examples?.[0] || schema.example || (exampleMatch ? exampleMatch[1].trim() : null) || schema.default || 'Enter text...';
                                        })()}
                                      />
                                    )}
                                    
                                    {schema.type === 'boolean' && (
                                      <input
                                        type="checkbox"
                                        checked={currentParams[paramName] || false}
                                        onChange={(e) => {
                                          const newParams = { ...currentParams };
                                          newParams[paramName] = e.target.checked;
                                          updateToolParams(server.id, tool.name, newParams);
                                        }}
                                        style={{ marginRight: '0.5rem' }}
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            <button
                              onClick={() => callTool(server.id, tool.name, currentParams)}
                              style={{
                                width: '100%',
                                padding: '0.75rem',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.375rem',
                                cursor: 'pointer',
                                fontWeight: 500,
                                marginBottom: '0.5rem'
                              }}
                            >
                              Call {tool.title || tool.name}
                            </button>
                            
                            {/* Show last result */}
                            {lastResult && (
                              <div style={{
                                padding: '0.5rem',
                                background: lastResult.error ? '#fee2e2' : '#dcfce7',
                                border: `1px solid ${lastResult.error ? '#fecaca' : '#bbf7d0'}`,
                                borderRadius: '0.375rem',
                                fontSize: '0.875rem'
                              }}>
                                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                                  {lastResult.error ? 'Error:' : 'Result:'}
                                </div>
                                <pre style={{ 
                                  margin: 0, 
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  fontSize: '0.875rem'
                                }}>
                                  {lastResult.error || lastResult.result}
                                </pre>
                                <div style={{ 
                                  marginTop: '0.5rem', 
                                  fontSize: '0.75rem', 
                                  color: '#6b7280',
                                  fontStyle: 'italic'
                                }}>
                                  {lastResult.timestamp.toLocaleTimeString()}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic' }}>
                      No tools available
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Server Iframes */}
        <div style={{ 
          gridArea: 'content',
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {visibleServerCount === 0 ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280',
              background: '#f3f4f6'
            }}>
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ margin: '0 0 1rem 0' }}>No Server Interfaces</h2>
                <p>Setup servers with visible interfaces to see them here</p>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {serversWithIframes.map((server, index) => {
                const isVisible = server.transportVisibility?.requirement === 'required' || 
                                (server.transportVisibility?.requirement === 'optional' && iframeVisibility[server.id] !== false);
                
                return (
                  <div 
                    key={server.id}
                    style={{ 
                      display: isVisible ? 'flex' : 'none',
                      flex: 1,
                      borderBottom: isVisible ? '1px solid #e5e7eb' : 'none',
                      position: 'relative'
                    }}
                  >
                    <div 
                      data-server-id={server.id}
                      ref={el => {
                        if (el) {
                          const iframe = getOrCreateTransportIframe(server.id);
                          if (!el.contains(iframe)) {
                            el.appendChild(iframe);
                          }
                        }
                      }} 
                      style={{ height: '100%', width: '100%' }} 
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

      {/* Setup Modal */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: setupModalVisible ? 'flex' : 'none',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          background: 'white',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80%',
          overflow: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>Server Setup</h2>
            <button
              onClick={() => setSetupModalVisible(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>
          <p style={{ marginBottom: '1rem', color: '#6b7280' }}>
            Setting up: {setupServerUrl}
          </p>
          <iframe
            ref={setupIframeRef}
            style={{
              width: '100%',
              height: '500px',
              border: '1px solid #e5e7eb',
              borderRadius: '0.375rem'
            }}
            sandbox="allow-scripts allow-same-origin allow-forms"
            allow="geolocation; clipboard-read; clipboard-write"
            title="Server Setup"
          />
        </div>
      </div>

      {/* Toast Notifications */}
      <div style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}>
        {toasts.map(toast => (
          <div key={toast.id} style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            color: 'white',
            background: toast.type === 'success' ? '#22c55e' : toast.type === 'error' ? '#ef4444' : '#3b82f6',
            maxWidth: '300px',
            animation: 'slideIn 0.3s ease-out'
          }}>
            {toast.message}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

// Mount the app
const root = createRoot(document.getElementById('root')!);
root.render(<App />);