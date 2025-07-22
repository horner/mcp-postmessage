import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { OuterFrameTransport, IframeWindowControl } from '$sdk/transport/postmessage/index.js';
import { parseServerUrl, generateUUID, generateSessionId } from '$sdk/utils/helpers.js';
import { SetupResult } from '$sdk/transport/postmessage/index.js';
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
  transport?: OuterFrameTransport;
  client?: Client;
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

// Load server examples from JSON file with relative paths
import serversData from './servers.json';

// Expand relative URLs to full URLs based on current location
const SERVER_EXAMPLES = serversData.map(server => ({
  ...server,
  url: new URL(server.url, window.location.href).href
}));

// Styling constants
const STYLES = {
  input: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem'
  },
  button: {
    padding: '0.5rem 0.75rem',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontWeight: 500
  },
  card: {
    padding: '1rem',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '2rem',
    color: '#6b7280',
    border: '2px dashed #d1d5db',
    borderRadius: '0.375rem'
  }
};

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
  
  const showToast = (type: Toast['type'], message: string) => {
    const id = generateUUID();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(toast => toast.id !== id)), 5000);
  };

  // Initialize servers from localStorage on mount and auto-connect
  useEffect(() => {
    const initializeServers = async () => {
      const savedServers = loadServersFromStorage();
      if (savedServers.length > 0) {
        setServers(savedServers);
        showToast('info', `Loaded ${savedServers.length} saved server(s)`);
        
        // Auto-connect to servers that are already set up
        for (const server of savedServers) {
          if (server.setupComplete && server.connectionStatus === 'disconnected') {
            connect(server);
          }
        }
      } else {
        // If no saved servers, auto-add pi-calculator
        const piExample = SERVER_EXAMPLES.find(example => example.name === 'Pi Calculator');
        
        if (piExample) {
          showToast('info', 'Auto-adding Pi Calculator server...');
          
          const newServer: Server = {
            id: generateUUID(),
            name: piExample.name,
            url: piExample.url,
            setupComplete: false,
            connectionStatus: 'disconnected'
          };
          
          setServers(prev => [...prev, newServer]);
          runSetup(newServer);
        }
      }
    };

    initializeServers();

    // Add global postMessage debugging
    const debugHandler = (event: MessageEvent) => {
      console.log('[APP-DEBUG] Received postMessage:', {
        origin: event.origin,
        sourceType: event.source === window ? 'MAIN_WINDOW' : 'IFRAME_OR_OTHER',
        data: event.data,
        timestamp: new Date().toISOString()
      });
    };
    
    window.addEventListener('message', debugHandler);
    return () => window.removeEventListener('message', debugHandler);
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
      const persistentServers = servers.map(({ id, name, url, setupComplete, transportVisibility }) => 
        ({ id, name, url, setupComplete, transportVisibility }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentServers));
    } catch (error) {
      console.warn('Failed to save servers to localStorage:', error);
    }
  };

  const loadServersFromStorage = (): Server[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      return JSON.parse(stored).map((server: any) => ({ ...server, connectionStatus: 'disconnected' as const }));
    } catch (error) {
      console.warn('Failed to load servers from localStorage:', error);
      return [];
    }
  };

  const connectedServers = servers.filter(s => s.connectionStatus === 'connected');
  const serversWithIframes = servers.filter(s => s.setupComplete && s.transportVisibility);
  const visibleServerCount = serversWithIframes.filter(s => 
    s.transportVisibility?.requirement === 'required' || 
    (s.transportVisibility?.requirement === 'optional' && iframeVisibility[s.id] !== false)
  ).length;

  const getOrCreateTransportIframe = (serverId: string): HTMLIFrameElement => {
    if (!transportIframeRefs.current.has(serverId)) {
      const iframe = document.createElement('iframe');
      Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', background: 'white' });
      iframe.sandbox.add('allow-scripts', 'allow-same-origin', 'allow-forms');
      iframe.allow = 'geolocation; clipboard-read; clipboard-write';
      iframe.title = `Server ${serverId} - Transport`;
      transportIframeRefs.current.set(serverId, iframe);
    }
    return transportIframeRefs.current.get(serverId)!;
  };

  const removeTransportIframe = (serverId: string) => {
    const iframe = transportIframeRefs.current.get(serverId);
    iframe?.parentNode?.removeChild(iframe);
    transportIframeRefs.current.delete(serverId);
  };

  // ============================================================================
  // SERVER MANAGEMENT
  // ============================================================================

  const handleExampleSelect = (url: string) => {
    const absoluteUrl = new URL(url, window.location.href).href;
    setNewServerUrl(absoluteUrl);
    setSelectedExample(url);
  };

  const addServer = async (url: string) => {
    if (!url.trim()) return showToast('error', 'Please enter a server URL');

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
    await runSetup(newServer);
  };

  const removeServer = (id: string) => {
    const server = servers.find(s => s.id === id);
    if (server?.connectionStatus === 'connected') disconnect(id);
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
    updateServer(server.id, { connectionStatus: 'connecting' });
    setSetupServerUrl(server.url);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!setupIframeRef.current) throw new Error('Setup iframe not available');

      const windowControl = new IframeWindowControl({
        iframe: setupIframeRef.current,
        setVisible: (visible) => visible && setSetupModalVisible(true),
        onError: () => showToast('error', 'Failed to load setup page')
      });

      const transport = new OuterFrameTransport(windowControl, {
        serverUrl: server.url,
        sessionId: server.id
      });

      const result = await transport.setup();
      
      if (result.success) {
        const updatedServer = {
          ...server,
          name: result.displayName || server.name,
          setupComplete: true,
          connectionStatus: 'disconnected' as const,
          transportVisibility: result.transportVisibility
        };
        
        updateServer(server.id, updatedServer);
        showToast('success', result.ephemeralMessage || 'Setup completed successfully');
        
        // Always auto-connect after successful setup
        connect(updatedServer);
      } else {
        setServers(prev => prev.filter(s => s.id !== server.id));
        showToast('error', result.error?.message || 'Setup failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Setup failed';
      setServers(prev => prev.filter(s => s.id !== server.id));
      showToast('error', errorMessage);
    } finally {
      setSetupModalVisible(false);
      setSetupServerUrl('');
      if (setupIframeRef.current) setupIframeRef.current.src = 'about:blank';
    }
  };

  // ============================================================================
  // TRANSPORT PHASE
  // ============================================================================

  const connect = async (server: Server) => {
    if (!server.setupComplete) return showToast('error', 'Server setup required before connecting');
    
    updateServer(server.id, { connectionStatus: 'connecting' });
    
    try {
      const iframe = getOrCreateTransportIframe(server.id);
      iframe.style.visibility = 'visible';
      
      const windowControl = new IframeWindowControl({
        iframe,
        setVisible: () => {},
        onError: () => showToast('error', 'Failed to load server')
      });

      const transport = new OuterFrameTransport(windowControl, {
        serverUrl: server.url,
        sessionId: server.id
      });

      transport.onerror = (error) => {
        showToast('error', error.message);
        updateServer(server.id, { connectionStatus: 'error', lastError: error.message });
      };

      await windowControl.navigate(server.url);
      await transport.prepareToConnect();
      
      const client = new Client({ name: 'mcp-postmessage-demo-client', version: '1.0.0' });
      await client.connect(transport);
      
      try {
        const toolsResult = await client.listTools();
        const tools = (toolsResult.tools || []).map(({ name, title, description, inputSchema }) => 
            ({ name, title, description, inputSchema }));
        
        // Set default params for the new tools
        setToolParams(prev => {
          const newParams = { ...prev };
          for (const tool of tools) {
            const key = getToolParamKey(server.id, tool.name);
            if (!newParams[key]) {
              newParams[key] = getDefaultParamsForTool(tool);
            }
          }
          return newParams;
        });

        updateServer(server.id, { tools });
        
      } catch (error) {
        console.warn('Failed to request tools list:', error);
      }
      
      updateServer(server.id, {
        connectionStatus: 'connected',
        sessionId: transport.sessionId,
        transport,
        client
      });
      
      const requirement = server.transportVisibility?.requirement;
      setIframeVisibility(prev => ({ 
        ...prev, 
        [server.id]: requirement === 'required' || requirement === 'optional' 
      }));
      
      showToast('success', `Connected to ${server.name}`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      showToast('error', errorMessage);
      updateServer(server.id, { connectionStatus: 'error', lastError: errorMessage });
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
        client: undefined,
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
    const server = servers.find(s => s.id === serverId);
    if (!server?.client) return showToast('error', 'No active connection to this server');

    try {
      const result = await server.client.callTool({ name: toolName, arguments: params });
      const resultText = (Array.isArray(result.content) && result.content.length > 0 && result.content[0]?.text) || JSON.stringify(result, null, 2);
      
      showToast('success', `${toolName} completed`);
      updateServer(serverId, {
        lastToolResult: { toolName, result: resultText, timestamp: new Date() }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Tool call failed';
      showToast('error', errorMessage);
      updateServer(serverId, {
        lastToolResult: { toolName, error: errorMessage, timestamp: new Date() }
      });
    }
  };

  const getDefaultParamsForTool = (tool: any) => {
    const params: Record<string, any> = {};
    if (!tool.inputSchema?.properties) return params;
    
    Object.entries(tool.inputSchema.properties).forEach(([key, schema]: [string, any]) => {
      let example = schema.examples?.[0] || schema.example;
      
      if (example === undefined && schema.description) {
        const exampleMatch = schema.description.match(/Example:\s*(.+)/s);
        if (exampleMatch) {
          example = exampleMatch[1].trim();
          if ((schema.type === 'number' || schema.type === 'integer') && !isNaN(Number(example))) {
            example = Number(example);
          }
        }
      }
      
      params[key] = example !== undefined ? example : 
        (schema.type === 'number' || schema.type === 'integer') ? (schema.default || 1000) :
        schema.type === 'string' ? (schema.default || '') :
        schema.type === 'boolean' ? (schema.default || false) : undefined;
    });
    return params;
  };

  const getToolParamKey = (serverId: string, toolName: string) => `${serverId}-${toolName}`;
  const getToolParams = (serverId: string, toolName: string) => 
    toolParams[getToolParamKey(serverId, toolName)] || {};
  
  const updateToolParams = (serverId: string, toolName: string, params: any) => 
    setToolParams(prev => ({ ...prev, [getToolParamKey(serverId, toolName)]: params }));

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="app-container" style={{ 
      fontFamily: 'system-ui, sans-serif'
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
        <div className="sidebar" style={{ 
          gridArea: 'sidebar',
          background: '#f9fafb', 
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
                style={{ ...STYLES.input, background: 'white' }}
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
                style={{ ...STYLES.input, boxSizing: 'border-box' }}
              />
            </div>

            <button
              onClick={() => addServer(newServerUrl)}
              disabled={!newServerUrl.trim()}
              style={{
                ...STYLES.button,
                width: '100%',
                padding: '0.75rem',
                background: newServerUrl.trim() ? '#3b82f6' : '#9ca3af',
                color: 'white',
                cursor: newServerUrl.trim() ? 'pointer' : 'not-allowed'
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
              <div style={STYLES.emptyState}>
                <p>No servers configured</p>
                <p style={{ fontSize: '0.875rem' }}>Add a server URL above to get started</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {servers.map(server => (
                  <div key={server.id} style={STYLES.card}>
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
        <div className="tools" style={{ 
          gridArea: 'tools',
          background: 'white', 
          padding: '1.5rem',
          overflowY: 'auto'
        }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem' }}>Available Tools</h2>
          {connectedServers.length === 0 ? (
            <div style={STYLES.emptyState}>
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
                        const currentParams = getToolParams(server.id, tool.name);
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
                                          const value = schema.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value);
                                          updateToolParams(server.id, tool.name, { ...currentParams, [paramName]: value });
                                        }}
                                        style={STYLES.input}
                                        placeholder={`Example: ${schema.examples?.[0] || schema.example || schema.default || 1000}`}
                                      />
                                    )}
                                    
                                    {schema.type === 'string' && (
                                      <textarea
                                        value={currentParams[paramName] || ''}
                                        onChange={(e) => updateToolParams(server.id, tool.name, { ...currentParams, [paramName]: e.target.value })}
                                        style={{ ...STYLES.input, minHeight: '100px', resize: 'vertical', fontFamily: 'Monaco, Consolas, monospace' }}
                                        placeholder={schema.examples?.[0] || schema.example || schema.default || 'Enter text...'}
                                      />
                                    )}
                                    
                                    {schema.type === 'boolean' && (
                                      <input
                                        type="checkbox"
                                        checked={currentParams[paramName] || false}
                                        onChange={(e) => updateToolParams(server.id, tool.name, { ...currentParams, [paramName]: e.target.checked })}
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
        <div className="content" style={{ 
          gridArea: 'content',
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {/* Empty state overlay when no servers visible */}
          {visibleServerCount === 0 && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280',
              background: '#f3f4f6',
              zIndex: 10
            }}>
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ margin: '0 0 1rem 0' }}>No Server Interfaces</h2>
                <p>Setup servers with visible interfaces to see them here</p>
              </div>
            </div>
          )}
          
          {/* Always render iframe containers - never remove them */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {serversWithIframes.map((server, index) => {
              const isVisible = server.transportVisibility?.requirement === 'required' || 
                              (server.transportVisibility?.requirement === 'optional' && iframeVisibility[server.id] !== false);
              
              return (
                <div 
                  key={server.id}
                  style={{ 
                    flex: isVisible ? 1 : 0,
                    borderBottom: isVisible ? '1px solid #e5e7eb' : 'none',
                    position: 'relative',
                    minHeight: isVisible ? 'auto' : '0',
                    opacity: isVisible ? 1 : 0,
                    overflow: 'hidden'
                  }}
                >
                  <div 
                    data-server-id={server.id}
                    ref={el => {
                      if (el) {
                        const iframe = getOrCreateTransportIframe(server.id);
                        if (!iframe.parentNode) {
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

      {/* Footer */}
      <footer style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'rgba(31, 41, 55, 0.95)',
        color: 'white',
        padding: '0.75rem 1rem',
        fontSize: '0.875rem',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '1rem',
        backdropFilter: 'blur(10px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 1000
      }}>
        <span>🔄 Standard Architecture Demo</span>
        <span style={{ color: '#9ca3af' }}>•</span>
        <a 
          href="./inverted" 
          target="_blank"
          style={{ color: '#60a5fa', textDecoration: 'none' }}
          onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
          onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
        >
          🔄 Try Inverted Architecture
        </a>
        <span style={{ color: '#9ca3af' }}>•</span>
        <a 
          href="https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1005" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#60a5fa', textDecoration: 'none' }}
          onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
          onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
        >
          📋 SEP Discussion
        </a>
        <span style={{ color: '#9ca3af' }}>•</span>
        <a 
          href="https://github.com/jmandel/mcp-postmessage" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#60a5fa', textDecoration: 'none' }}
          onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
          onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
        >
          📦 Source Code
        </a>
      </footer>

      <style>{`
        .app-container {
          display: grid;
          grid-template-rows: auto 1fr;
          grid-template-columns: 350px 500px 1fr;
          grid-template-areas: "header header header" "sidebar tools content";
          height: 100vh;
          overflow: hidden;
          padding-bottom: 60px; /* Account for fixed footer */
          box-sizing: border-box;
        }
        
        .sidebar {
          border-right: 1px solid #e5e7eb;
        }
        
        .tools {
          border-right: 1px solid #e5e7eb;
        }
        
        
        /* Mobile Layout */
        @media (max-width: 999px) {
          .app-container {
            display: block;
            height: auto;
            overflow: visible;
            padding-bottom: 0;
          }
          
          .sidebar {
            border-right: none;
            border-bottom: 1px solid #e5e7eb;
            padding: 1rem;
            max-height: none;
            overflow-y: visible;
          }
          
          .tools {
            border-right: none;
            border-bottom: 1px solid #e5e7eb;
            padding: 1rem;
            max-height: none;
            overflow-y: visible;
          }
          
          .content {
            display: block !important;
            min-height: auto;
            flex-direction: column !important;
            overflow: visible !important;
          }
          
          .content > div {
            min-height: 60vh !important;
            flex: none !important;
            height: auto !important;
            position: static !important;
            overflow: visible !important;
          }
          
          .content > div > div {
            height: 60vh !important;
          }
          
          .content iframe {
            height: 60vh !important;
          }
          
          header {
            position: static !important;
          }
          
          footer {
            position: static !important;
            margin-top: 2rem;
            flex-direction: column !important;
            gap: 0.5rem !important;
            text-align: center !important;
            padding: 1rem !important;
          }
        }
        
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