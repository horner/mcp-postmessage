/**
 * Mermaid Diagram Editor MCP Server
 * Refactored to use a more functional approach with immutable state management,
 * and consolidated phase handling logic.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InnerFrameTransport, PostMessageInnerControl } from '$sdk/transport/postmessage/index.js';
import { getServerPhase, isInWindowContext } from '$sdk/utils/helpers.js';

declare global {
  interface Window { mermaid: any; }
}

const DEFAULT_DIAGRAM = `sequenceDiagram
    participant C as Client
    participant S as Server
    
    Note over C,S: Setup Phase
    C<<->>S: Setup Handshake
    
    Note over C,S: Transport Phase  
    C<<->>S: Transport Handshake
    
    C<<->>S: MCP Messages`;

// --- 1. STATE MANAGEMENT (PURE) ---

interface AppState {
  readonly code: string;
  readonly status: string;
  readonly phase: 'setup' | 'transport';
}

const INITIAL_STATE: AppState = {
  code: '',
  status: 'Ready',
  phase: 'setup',
};

function updateState(currentState: AppState, changes: Partial<AppState>): AppState {
  return { ...currentState, ...changes };
}

// --- 2. UI RENDERING (IMPURE) ---

async function render(state: AppState): Promise<string | undefined> {
  document.getElementById('loading')?.classList.add('hidden');
  document.getElementById('setup-phase')?.classList.add('hidden');
  document.querySelector('.main')?.classList.toggle('hidden', state.phase !== 'transport');

  if (state.phase === 'transport') {
    const diagramOutput = document.getElementById('diagramOutput')!
    if (!state.code.trim()) {
        diagramOutput.innerHTML = '<div class="empty-state">No diagram to display. Use the \'draw\' tool.</div>';
        updateState(state, { status: 'Ready' });
    } else {
        try {
            const { svg } = await window.mermaid.render('mermaid-diagram', state.code);
            diagramOutput.innerHTML = svg;
            updateState(state, { status: 'Rendered successfully' });
        } catch (error) {
            const errorMessage = (error as Error).message;
            diagramOutput.innerHTML = `<div class="error-display">${errorMessage}</div>`;
            updateState(state, { status: `Error: ${errorMessage}` });
            return errorMessage;
        }
    }
    document.getElementById('status')!.textContent = state.status;
  }
}

// --- 3. PHASE HANDLERS ---

async function handleSetupPhase(transport: InnerFrameTransport) {
  await transport.prepareSetup();
  await transport.completeSetup({
    displayName: 'Mermaid Diagram Editor',
    transportVisibility: { requirement: 'required' },
    ephemeralMessage: 'Mermaid Editor ready!'
  });
}

async function handleTransportPhase(transport: InnerFrameTransport, getCurrentState: () => AppState, updateAppState: (changes: Partial<AppState>) => void) {
  await transport.prepareToConnect();
  const server = new McpServer({ name: 'mermaid-editor', version: '1.0.0' });

  server.registerTool('draw', {
    title: 'Draw Mermaid Diagram',
    description: 'Draw a Mermaid diagram from code',
    inputSchema: { code: z.string().describe(`The Mermaid diagram code to draw. Example: ${DEFAULT_DIAGRAM}`) }
  }, async ({ code }) => {
    updateAppState({ code });
    const renderError = await render(getCurrentState());
    if (renderError) {
      return { content: [{ type: 'text', text: `Error rendering diagram: ${renderError}` }] };
    }
    return { content: [{ type: 'text', text: 'Diagram updated.' }] };
  });

  await server.connect(transport);
  
  const mermaidModule = await import('mermaid');
  window.mermaid = mermaidModule.default;
  window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
  
  await render(getCurrentState()); // Initial render
}

// --- 4. MAIN ORCHESTRATION ---

async function main() {
  if (!isInWindowContext()) throw new Error('Mermaid needs a window');

  let appState: AppState = INITIAL_STATE;
  const getCurrentState = () => appState;
  const updateAppState = (changes: Partial<AppState>) => {
    appState = updateState(appState, changes);
  };

  const transport = new InnerFrameTransport(
    new PostMessageInnerControl(['*']),
    { 
      requiresVisibleSetup: false,
      minProtocolVersion: '1.0',
      maxProtocolVersion: '1.0'
    }
  );

  const phase = getServerPhase();
  updateAppState({ phase });

  if (phase === 'setup') {
    await handleSetupPhase(transport);
  } else {
    await handleTransportPhase(transport, getCurrentState, updateAppState);
  }
}

main().catch(console.error);