/**
 * Mermaid Diagram Editor MCP Server
 * Demonstrates rich interactive UI capabilities with live diagram preview
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { 
  InnerFrameTransport,
  PostMessageInnerControl
} from '$sdk/transport/postmessage/index.js';
import { 
  getServerPhase, 
  isInWindowContext 
} from '$sdk/utils/helpers.js';

const DEFAULT_DIAGRAM = `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E`;

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
        code: z.string().describe(`The Mermaid diagram code to draw. Example: ${DEFAULT_DIAGRAM}`)
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

// Configuration  
const CONFIG = {
  origins: ['*'], // In production, lock down to specific origins
  title: 'Mermaid Diagram Editor',
  visibility: 'required' as const,
  message: 'Mermaid Editor ready!'
};

async function main() {
  if (!isInWindowContext()) throw new Error('Mermaid needs a window');
  
  const transport = new InnerFrameTransport(
    new PostMessageInnerControl(CONFIG.origins),
    { requiresVisibleSetup: false }
  );
  
  if (getServerPhase() === 'setup') {
    await transport.prepareSetup();
    await transport.completeSetup({
      displayName: CONFIG.title,
      transportVisibility: { requirement: CONFIG.visibility },
      ephemeralMessage: CONFIG.message
    });
  } else {
    await transport.prepareToConnect();
    
    document.getElementById('loading')?.classList.add('hidden');
    document.getElementById('setup-phase')?.classList.add('hidden');
    document.querySelector('.main')?.classList.remove('hidden');
    
    const ui = new MermaidEditorUI();
    const server = getMermaidEditorServer(ui);
    await server.connect(transport);
  }
}

main().catch(console.error);