/**
 * Mermaid Diagram Editor MCP Server
 * Demonstrates rich interactive UI capabilities with live diagram preview
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { 
  PostMessageSetupHelper, 
  PostMessageServerTransport 
} from '$sdk/server/transport.js';
import { 
  getServerPhase, 
  isInWindowContext 
} from '$sdk/utils/helpers.js';

// ============================================================================
// MERMAID DIAGRAM EXAMPLES
// ============================================================================

const DIAGRAM_EXAMPLES = {
  flowchart: {
    title: 'Basic Flowchart',
    description: 'Simple decision flow',
    code: `flowchart TD
    A[Start] --> B{Is it?}
    B -->|Yes| C[OK]
    B -->|No| D[End]
    C --> D`
  },
  sequence: {
    title: 'Sequence Diagram',
    description: 'API interaction flow',
    code: `sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>+B: Hello Bob, how are you?
    B-->>-A: Great!
    A->>+B: How about the weather?
    B-->>-A: It's sunny!`
  },
  class: {
    title: 'Class Diagram',
    description: 'Object-oriented design',
    code: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +bark()
    }
    Animal <|-- Dog`
  },
  state: {
    title: 'State Diagram',
    description: 'State machine example',
    code: `stateDiagram-v2
    [*] --> Still
    Still --> [*]
    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]`
  },
  gantt: {
    title: 'Gantt Chart',
    description: 'Project timeline',
    code: `gantt
    title A Gantt Diagram
    dateFormat  YYYY-MM-DD
    section Section
    A task           :a1, 2014-01-01, 30d
    Another task     :after a1  , 20d
    section Another
    Task in sec      :2014-01-12  , 12d
    another task     : 24d`
  },
  pie: {
    title: 'Pie Chart',
    description: 'Data visualization',
    code: `pie title Pets adopted by volunteers
    "Dogs" : 386
    "Cats" : 85
    "Rats" : 15`
  },
  git: {
    title: 'Git Graph',
    description: 'Branch visualization',
    code: `gitgraph
    commit
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit`
  },
  journey: {
    title: 'User Journey',
    description: 'User experience flow',
    code: `journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Go upstairs: 3: Me
      Do work: 1: Me, Cat
    section Go home
      Go downstairs: 5: Me
      Sit down: 5: Me`
  }
};

// ============================================================================
// MERMAID INTEGRATION
// ============================================================================

declare global {
  interface Window {
    mermaid: any;
  }
}

class MermaidRenderer {
  private mermaid: any;
  private initialized = false;
  private currentId = 0;

  constructor() {
    this.initMermaid();
  }

  private async initMermaid(): Promise<void> {
    try {
      // Import Mermaid from CDN
      const mermaidModule = await import('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs');
      this.mermaid = mermaidModule.default;
      
      // Initialize Mermaid
      this.mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: 'system-ui, sans-serif'
      });
      
      this.initialized = true;
      console.log('[MERMAID] Mermaid initialized successfully');
    } catch (error) {
      console.error('[MERMAID] Failed to initialize Mermaid:', error);
      throw new Error('Failed to initialize Mermaid renderer');
    }
  }

  async renderDiagram(code: string, containerId: string = 'diagramOutput'): Promise<{ svg: string; success: boolean; error?: string }> {
    if (!this.initialized) {
      await this.initMermaid();
    }

    try {
      const container = document.getElementById(containerId);
      if (!container) {
        throw new Error(`Container with id '${containerId}' not found`);
      }

      // Generate unique ID for this diagram
      const diagramId = `mermaid-diagram-${++this.currentId}`;
      
      // Clear previous content (including empty state)
      container.innerHTML = '';
      
      // Validate and render the diagram
      const { svg } = await this.mermaid.render(diagramId, code);
      
      // Insert the SVG into the container
      container.innerHTML = svg;
      
      console.log('[MERMAID] Diagram rendered successfully');
      return { svg, success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown rendering error';
      console.error('[MERMAID] Rendering error:', errorMessage);
      
      // Show error in container
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = `
          <div class="error-display">
            <strong>Rendering Error:</strong>
            <div>${errorMessage}</div>
          </div>
        `;
      }
      
      return { svg: '', success: false, error: errorMessage };
    }
  }

  getDiagramTypes(): string[] {
    return Object.keys(DIAGRAM_EXAMPLES);
  }

  getExample(type: string): { title: string; description: string; code: string } | null {
    return DIAGRAM_EXAMPLES[type as keyof typeof DIAGRAM_EXAMPLES] || null;
  }

  getAllExamples(): Record<string, { title: string; description: string; code: string }> {
    return DIAGRAM_EXAMPLES;
  }
}

// ============================================================================
// UI MANAGEMENT
// ============================================================================

class MermaidEditorUI {
  private renderer: MermaidRenderer;
  private currentCode: string = '';
  private currentType: string = 'flowchart';
  private autoRender: boolean = true;
  private renderTimeout: number | null = null;

  constructor() {
    this.renderer = new MermaidRenderer();
    this.setupUI();
  }

  private setupUI(): void {
    this.setupEventListeners();
    this.populateExamples();
  }

  private setupEventListeners(): void {
    // No UI event listeners needed - diagram is controlled via MCP tools
  }

  private populateExamples(): void {
    // No examples panel needed - diagram is controlled via MCP tools
  }


  private debounceRender(): void {
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }
    this.renderTimeout = window.setTimeout(() => {
      this.renderDiagram();
    }, 500);
  }

  private async renderDiagram(): Promise<{ svg: string; success: boolean; error?: string }> {
    if (!this.currentCode.trim()) {
      return { svg: '', success: false, error: 'No code to render' };
    }

    try {
      const result = await this.renderer.renderDiagram(this.currentCode);
      this.updateStatus(result.success ? 'Rendered successfully' : `Error: ${result.error}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateStatus(`Error: ${errorMessage}`);
      return { svg: '', success: false, error: errorMessage };
    }
  }

  private downloadSVG(): void {
    const diagramOutput = document.getElementById('diagramOutput');
    if (!diagramOutput) return;

    const svgElement = diagramOutput.querySelector('svg');
    if (!svgElement) {
      alert('No diagram to download');
      return;
    }

    // Create a blob with the SVG content
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mermaid-diagram-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private updateStatus(message: string): void {
    const status = document.getElementById('status');
    if (status) {
      status.textContent = message;
    }
  }

  // Methods for MCP server integration
  getCurrentCode(): string {
    return this.currentCode;
  }

  setCode(code: string): void {
    this.currentCode = code;
  }

  async renderCode(code: string): Promise<{ svg: string; success: boolean; error?: string }> {
    this.setCode(code);
    return await this.renderDiagram();
  }

  getDiagramTypes(): string[] {
    return this.renderer.getDiagramTypes();
  }

  getExample(type: string): { title: string; description: string; code: string } | null {
    return this.renderer.getExample(type);
  }
}

// ============================================================================
// MCP SERVER FACTORY
// ============================================================================

function getMermaidEditorServer(ui: MermaidEditorUI): McpServer {
  const server = new McpServer({
    name: 'mermaid-editor',
    version: '1.0.0',
  });

  // Register the draw tool
  server.registerTool(
    'draw',
    {
      title: 'Draw Mermaid Diagram',
      description: 'Draw a Mermaid diagram from code',
      inputSchema: {
        code: z.string().describe('The Mermaid diagram code to draw. Example: flowchart TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action 1]\n    B -->|No| D[Action 2]\n    C --> E[End]\n    D --> E')
      }
    },
    async ({ code }) => {
      console.log(`[SERVER] Tool call received: draw with ${code.length} characters`);
      
      try {
        const result = await ui.renderCode(code);
        
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `✅ Diagram drawn successfully!\n\nThe diagram is now visible in the editor with ${code.length} characters of Mermaid code.`
              }
            ]
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Error drawing diagram: ${result.error || 'Unknown error'}\n\nPlease check your Mermaid syntax and try again.`
              }
            ]
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Drawing failed';
        console.log(`[SERVER] Tool call error:`, errorMessage);
        return {
          content: [
            {
              type: 'text',
              text: `❌ Error drawing diagram: ${errorMessage}\n\nPlease check your Mermaid syntax and try again.`
            }
          ]
        };
      }
    }
  );

  return server;
}

// ============================================================================
// MERMAID EDITOR SERVER
// ============================================================================

class MermaidEditorServer {
  private server: McpServer | null = null;
  private ui: MermaidEditorUI | null = null;
  
  async start(): Promise<void> {
    const phase = getServerPhase();
    
    if (phase === 'setup') {
      await this.startSetupPhase();
    } else {
      await this.startTransportPhase();
    }
  }
  
  private async startSetupPhase(): Promise<void> {
    console.log('[MERMAID SETUP] Starting setup phase for Mermaid Diagram Editor');
    
    const setupHelper = new PostMessageSetupHelper({
      // ⚠️ SECURITY WARNING: ['*'] allows any origin - FOR DEMO ONLY!
      // Production servers MUST specify explicit origins:
      // allowedOrigins: ['https://my-client-app.com', 'https://localhost:3000']
      allowedOrigins: ['*'],
      requiresVisibleSetup: false
    });
    
    // Wait for handshake
    await setupHelper.waitForHandshake();
    console.log('[MERMAID SETUP] Handshake completed');
    
    // Show setup UI
    this.showPhase('setup');
    
    // Complete setup immediately since no configuration needed
    await setupHelper.completeSetup({
      serverTitle: 'Mermaid Diagram Editor',
      transportVisibility: {
        requirement: 'required',
        optionalMessage: 'Editor interface is required for diagram creation and editing'
      },
      ephemeralMessage: 'Mermaid Editor ready!'
    });
    console.log('[MERMAID SETUP] Setup phase completed');
  }
  
  private async startTransportPhase(): Promise<void> {
    // Show transport UI
    this.showPhase('transport');
    
    // Initialize UI
    this.ui = new MermaidEditorUI();
    
    // Create MCP server
    this.server = getMermaidEditorServer(this.ui);
    
    const transport = new PostMessageServerTransport({
      // ⚠️ SECURITY WARNING: ['*'] allows any origin - FOR DEMO ONLY!
      // Production servers MUST specify explicit origins:
      // allowedOrigins: ['https://my-client-app.com', 'https://localhost:3000']
      allowedOrigins: ['*']
    });
    
    await this.server.connect(transport);
  }
  
  private showPhase(phase: 'setup' | 'transport'): void {
    const loading = document.getElementById('loading');
    const setupPhase = document.getElementById('setup-phase');
    const main = document.querySelector('.main') as HTMLElement;
    
    if (loading) loading.classList.add('hidden');
    
    if (phase === 'setup') {
      setupPhase?.classList.remove('hidden');
      main?.classList.add('hidden');
    } else {
      setupPhase?.classList.add('hidden');
      main?.classList.remove('hidden');
    }
  }
  
  private showError(message: string): void {
    const container = document.querySelector('.container');
    if (container) {
      container.innerHTML = `
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 2rem;
          border-radius: 0.5rem;
          max-width: 500px;
          text-align: center;
        ">
          <h2 style="margin: 0 0 1rem 0; color: #dc2626;">Error</h2>
          <p style="margin: 0;">${message}</p>
        </div>
      `;
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function main() {
  try {
    // Ensure we're in a window context (iframe/popup)
    if (!isInWindowContext()) {
      throw new Error('This server must run in an iframe or popup window');
    }
    
    const server = new MermaidEditorServer();
    await server.start();
    
  } catch (error) {
    console.error('Failed to start Mermaid Editor server:', error);
    
    const server = new MermaidEditorServer();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    (server as any).showError(errorMessage);
  }
}

// Start the server
main();