/**
 * JSON Analyzer MCP Server
 * Refactored to use a more functional approach with immutable state management,
 * and consolidated phase handling logic.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InnerFrameTransport, PostMessageInnerControl } from '$sdk/transport/postmessage/index.js';
import { getServerPhase, isInWindowContext } from '$sdk/utils/helpers.js';
import { JSONPath } from 'jsonpath-plus';

// --- 1. EXAMPLE DATA ---

const EXAMPLE_JSON = {
  protocol: "postMessage Transport for MCP",
  version: "1.0",
  phases: ["setup", "transport"],
  exampleServers: ["Pi Calculator", "JSON Analyzer", "Mermaid Editor"]
};

// --- 2. STATE MANAGEMENT (PURE) ---

interface JsonFile {
  readonly filename: string;
  readonly size: number;
  readonly content: any;
  readonly timestamp: number;
}

interface AppState {
  readonly file: JsonFile | null;
  readonly status: {
    readonly message: string;
    readonly type: 'success' | 'error' | 'loading' | 'idle';
  };
  readonly phase: 'setup' | 'transport';
  readonly sessionId: string | null;
}

const INITIAL_STATE: AppState = {
  file: null,
  status: { message: '', type: 'idle' },
  phase: 'setup',
  sessionId: null,
};

function updateState(currentState: AppState, changes: Partial<AppState>): AppState {
  return { ...currentState, ...changes };
}

function evaluateJSONPath(path: string, data: any): any {
  return JSONPath({ path, json: data });
}

function generateExamplePath(data: any): string {
    const explore = (obj: any, path: string): string | undefined => {
        if (!obj) return;
        if (Array.isArray(obj)) {
            if (obj.length > 0) return explore(obj[0], `${path}[0]`);
        } else if (typeof obj === 'object') {
            const key = Object.keys(obj)[0];
            if (key) return explore(obj[key], `${path}.${key}`);
        }
        return path;
    };
    return explore(data, '$') || '$.data';
}

// --- 2. UI RENDERING (IMPURE) ---

function render(state: AppState) {
  // Show/hide phases
  document.getElementById('loading')?.classList.add('hidden');
  document.getElementById('setup-phase')?.classList.toggle('hidden', state.phase !== 'setup');
  document.getElementById('transport-phase')?.classList.toggle('hidden', state.phase !== 'transport');

  // Render status message
  const statusEl = document.getElementById('status-message')!;
  statusEl.textContent = state.status.message;
  statusEl.className = `status-message status-${state.status.type}`;
  statusEl.classList.toggle('hidden', state.status.type === 'idle');

  // Render file display
  const fileDisplayEl = document.getElementById('file-display')!;
  if (state.file) {
    const preview = JSON.stringify(state.file.content, null, 2);
    fileDisplayEl.innerHTML = `\n      <div class="file-name">${state.file.filename}</div>\n      <div class="file-size">${(state.file.size / 1024).toFixed(2)} KB</div>\n      <div class="json-preview">${preview.substring(0, 200)}...</div>\n    `;
    fileDisplayEl.classList.remove('hidden');
  } else {
    fileDisplayEl.classList.add('hidden');
  }
  
  // Update transport phase display
  if (state.phase === 'transport' && state.file) {
      document.getElementById('file-name-display')!.textContent = state.file.filename;
      document.getElementById('file-size-display')!.textContent = `${(state.file.size / 1024).toFixed(2)} KB`;
  }
}

// --- 3. PHASE HANDLERS ---

async function handleSetupPhase(transport: InnerFrameTransport, getCurrentState: () => AppState, updateAppState: (changes: Partial<AppState>) => void) {
  await transport.prepareSetup();
  console.log("Session ID", transport, transport.sessionId);
  updateAppState({ sessionId: transport.sessionId });

  const currentState = getCurrentState();
  const storageKey = `json-analyzer-file-${currentState.sessionId}`;

  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  fileInput.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    updateAppState({ status: { message: 'Loading...', type: 'loading' } });
    render(getCurrentState());

    try {
      const content = JSON.parse(await file.text());
      const newFile: JsonFile = { filename: file.name, size: file.size, content, timestamp: Date.now() };
      localStorage.setItem(storageKey, JSON.stringify(newFile));
      updateAppState({ file: newFile, status: { message: 'File loaded!', type: 'success' } });
      await transport.completeSetup({
        displayName: `JSON Analyzer: ${newFile.filename}`,
        transportVisibility: { requirement: 'hidden' },
        ephemeralMessage: 'JSON file ready for analysis!'
      });
    } catch (error) {
      updateAppState({ status: { message: (error as Error).message, type: 'error' } });
    }
    render(getCurrentState());
  });
  document.querySelector('.file-button')?.addEventListener('click', () => fileInput.click());

  // Example file handler
  document.querySelector('.example-button')?.addEventListener('click', async () => {
    updateAppState({ status: { message: 'Loading example...', type: 'loading' } });
    render(getCurrentState());

    try {
      const exampleData = JSON.stringify(EXAMPLE_JSON);
      const newFile: JsonFile = { 
        filename: 'mcp-postmessage-transport.json', 
        size: exampleData.length, 
        content: EXAMPLE_JSON, 
        timestamp: Date.now() 
      };
      localStorage.setItem(storageKey, JSON.stringify(newFile));
      updateAppState({ file: newFile, status: { message: 'Example file loaded!', type: 'success' } });
      await transport.completeSetup({
        displayName: `JSON Analyzer: ${newFile.filename}`,
        transportVisibility: { requirement: 'hidden' },
        ephemeralMessage: 'Example JSON file ready for analysis!'
      });
    } catch (error) {
      updateAppState({ status: { message: (error as Error).message, type: 'error' } });
    }
    render(getCurrentState());
  });

  // Attempt to load from storage
  const storedFile = localStorage.getItem(storageKey);
  if (storedFile) {
    try {
      const loadedFile = JSON.parse(storedFile);
      updateAppState({ file: loadedFile });
    } catch {}
  }
  render(getCurrentState());
}

async function handleTransportPhase(transport: InnerFrameTransport, getCurrentState: () => AppState, updateAppState: (changes: Partial<AppState>) => void) {
  await transport.prepareToConnect();
  updateAppState({ sessionId: transport.sessionId });

  const currentState = getCurrentState();
  const storageKey = `json-analyzer-file-${currentState.sessionId}`;
  console.log('Transport Phase - storageKey:', storageKey);
  const storedFile = localStorage.getItem(storageKey);
  if (storedFile) {
    try {
      updateAppState({ file: JSON.parse(storedFile) });
    } catch {}
  }

  const server = new McpServer({ name: 'json-analyzer', version: '1.0.0' });
  const updatedState = getCurrentState();
  const examplePath = updatedState.file ? generateExamplePath(updatedState.file.content) || '$' : '$';

  server.registerTool('evaluate_jsonpath', {
    title: 'Evaluate JSONPath',
    description: 'Evaluate a JSONPath expression against the loaded JSON file',
    inputSchema: { path: z.string().describe(`JSONPath expression. Example: ${examplePath}`) }
  }, async ({ path }) => {
    const state = getCurrentState();
    if (!state.file) return { content: [{ type: 'text', text: 'No JSON file loaded.' }] };
    
    try {
      // Test path validity with empty object first to catch syntax errors
      JSONPath({ path, json: {} });
      
      const result = evaluateJSONPath(path, state.file.content);
      if (result.length === 0) {
        return { content: [{ type: 'text', text: `No results found for path: ${path}` }] };
      }
      const text = JSON.stringify(result, null, 2);
      return { content: [{ type: 'text', text }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Invalid JSONPath expression: ${(error as Error).message}` }] };
    }
  });
  await server.connect(transport);
  render(getCurrentState());
}

// --- 4. MAIN ORCHESTRATION ---

async function main() {
  if (!isInWindowContext()) throw new Error('JSON Analyzer needs a window');

  let appState: AppState = INITIAL_STATE;
  const getCurrentState = () => appState;
  const updateAppState = (changes: Partial<AppState>) => {
    appState = updateState(appState, changes);
    console.log("Updated state", changes, appState)
  };

  const transport = new InnerFrameTransport(
    new PostMessageInnerControl(['*']),
    { requiresVisibleSetup: true }
  );

  const phase = getServerPhase();
  updateAppState({ phase });

  if (phase === 'setup') {
    await handleSetupPhase(transport, getCurrentState, updateAppState);
  } else {
    await handleTransportPhase(transport, getCurrentState, updateAppState);
  }
}

main().catch(console.error);
