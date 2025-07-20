/**
 * JSON Analyzer MCP Server
 * Demonstrates visible setup phase with file picker for JSON analysis
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { 
  InnerFrameTransport,
  PostMessageInnerControl
} from '$sdk/transport/postmessage/index.js';
import { 
  getServerPhase, 
  isInWindowContext,
  generateUUID 
} from '$sdk/utils/helpers.js';

// ============================================================================
// JSON FILE SERVICE
// ============================================================================

interface JSONFileData {
  filename: string;
  size: number;
  content: any;
  timestamp: number;
}

class JSONFileService {
  private static readonly STORAGE_KEY_PREFIX = 'json-analyzer-file';
  private static fileData: JSONFileData | null = null;
  private static currentSessionId: string | null = null;

  /**
   * Set the session ID for scoped storage
   */
  static setSessionId(sessionId: string) {
    this.currentSessionId = sessionId;
  }

  /**
   * Get the storage key for current session
   */
  private static getStorageKey(): string {
    if (!this.currentSessionId) {
      throw new Error('Session ID not set - call setSessionId() first');
    }
    return `${this.STORAGE_KEY_PREFIX}-${this.currentSessionId}`;
  }

  /**
   * Load JSON file from file input
   */
  static async loadFile(file: File): Promise<JSONFileData> {
    if (!file.name.toLowerCase().endsWith('.json')) {
      throw new Error('Please select a JSON file (.json extension required)');
    }

    try {
      const text = await file.text();
      const content = JSON.parse(text);
      
      const fileData: JSONFileData = {
        filename: file.name,
        size: file.size,
        content: content,
        timestamp: Date.now()
      };
      
      // Store file data in memory and localStorage (including content)
      this.fileData = fileData;
      localStorage.setItem(this.getStorageKey(), JSON.stringify(fileData));
      console.log('[JSON] File stored in session-scoped localStorage:', { filename: fileData.filename, size: fileData.size, sessionId: this.currentSessionId });
      
      return fileData;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON file - please check the syntax');
      }
      throw new Error(`Failed to load file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get loaded file data
   */
  static getFileData(): JSONFileData | null {
    if (this.fileData) {
      return this.fileData;
    }
    
    // Try to load from localStorage
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (stored) {
        const parsedData = JSON.parse(stored);
        // Check if it has the content field (new format)
        if (parsedData.content) {
          this.fileData = parsedData;
          return this.fileData;
        }
      }
    } catch (error) {
      console.error('CRITICAL: Failed to load file data from localStorage:', error);
      throw new Error(`Failed to restore JSON file data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return null;
  }

  /**
   * Get stored file metadata
   */
  static getStoredFileInfo(): { filename: string; size: number; timestamp: number } | null {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (stored) {
        const parsedData = JSON.parse(stored);
        // Return just the metadata fields
        return {
          filename: parsedData.filename,
          size: parsedData.size,
          timestamp: parsedData.timestamp
        };
      }
      return null;
    } catch (error) {
      console.error('CRITICAL: Failed to load file metadata from localStorage:', error);
      throw new Error(`Failed to restore JSON file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear stored file
   */
  static clearStoredFile(): void {
    localStorage.removeItem(this.getStorageKey());
    this.fileData = null;
  }

  /**
   * Generate example JSONPath based on file structure
   */
  static generateExample(data: any, maxDepth: number = 2): string {
    const explore = (obj: any, currentPath: string = '$', depth: number = 0): string[] => {
      if (depth >= maxDepth || obj === null || obj === undefined) {
        return [];
      }
      
      const paths: string[] = [];
      
      if (Array.isArray(obj)) {
        if (obj.length > 0) {
          paths.push(`${currentPath}[0]`);
          paths.push(...explore(obj[0], `${currentPath}[0]`, depth + 1));
        }
      } else if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        for (const key of keys.slice(0, 3)) { // Limit to first 3 keys
          const newPath = currentPath === '$' ? `$.${key}` : `${currentPath}.${key}`;
          paths.push(newPath);
          paths.push(...explore(obj[key], newPath, depth + 1));
        }
      }
      
      return paths;
    };
    
    const paths = explore(data);
    return paths.length > 0 ? paths[0] : '$.data';
  }

  /**
   * Simple JSONPath evaluation (basic implementation)
   */
  static evaluateJSONPath(path: string, data: any): any {
    // This is a simplified JSONPath implementation
    // For production, you'd want to use a proper JSONPath library
    
    // Handle root path
    if (path === '$' || path === '') {
      return data;
    }
    
    // Remove leading $ if present
    const cleanPath = path.startsWith('$') ? path.substring(1) : path;
    
    // Split path and navigate
    const parts = cleanPath.split('.').filter(part => part !== '');
    let current = data;
    
    for (const part of parts) {
      // Handle array notation like [0] or ["key"]
      if (part.includes('[') && part.includes(']')) {
        const [property, indexPart] = part.split('[');
        const index = indexPart.replace(']', '').replace(/"/g, '');
        
        if (property) {
          current = current[property];
        }
        
        if (current === undefined || current === null) {
          return undefined;
        }
        
        // Try as array index first, then as object key
        if (Array.isArray(current)) {
          const numIndex = parseInt(index);
          current = isNaN(numIndex) ? current[index] : current[numIndex];
        } else {
          current = current[index];
        }
      } else {
        current = current[part];
      }
      
      if (current === undefined || current === null) {
        return undefined;
      }
    }
    
    return current;
  }
}

// ============================================================================
// UI MANAGEMENT
// ============================================================================

class JSONAnalyzerUI {
  private fileInput: HTMLInputElement;
  private statusMessage: HTMLElement;
  private fileDisplay: HTMLElement;
  private onFileLoadedCallback?: () => void;
  
  constructor(onFileLoaded?: () => void) {
    this.onFileLoadedCallback = onFileLoaded;
    this.fileInput = document.getElementById('file-input') as HTMLInputElement;
    this.statusMessage = document.getElementById('status-message') as HTMLElement;
    this.fileDisplay = document.getElementById('file-display') as HTMLElement;
    
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    this.fileInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this.loadFile(files[0]);
      }
    });
    
    // Add click handler to the button to explicitly trigger file input
    const fileButton = document.querySelector('.file-button') as HTMLButtonElement;
    if (fileButton) {
      fileButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.fileInput.click();
      });
    }
  }
  
  private async loadFile(file: File): Promise<void> {
    this.showStatus('Loading JSON file...', 'loading');
    
    try {
      const fileData = await JSONFileService.loadFile(file);
      this.showFileSuccess(fileData);
      
      // Trigger setup completion callback
      if (this.onFileLoadedCallback) {
        console.log('[JSON UI] File loaded, triggering setup completion');
        this.onFileLoadedCallback();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load file';
      this.showStatus(message, 'error');
    }
  }
  
  private showFileSuccess(fileData: JSONFileData): void {
    this.showStatus('JSON file loaded successfully!', 'success');
    
    // Preview first few lines of JSON
    const preview = JSON.stringify(fileData.content, null, 2);
    const truncatedPreview = preview.length > 200 ? 
      preview.substring(0, 200) + '...' : preview;
    
    this.fileDisplay.innerHTML = `
      <div class="file-name">${fileData.filename}</div>
      <div class="file-size">${this.formatFileSize(fileData.size)}</div>
      <div class="json-preview">${truncatedPreview}</div>
    `;
    this.fileDisplay.classList.remove('hidden');
  }
  
  private showStatus(message: string, type: 'success' | 'error' | 'loading'): void {
    this.statusMessage.textContent = message;
    this.statusMessage.className = `status-message status-${type}`;
    this.statusMessage.classList.remove('hidden');
  }
  
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 bytes';
    const k = 1024;
    const sizes = ['bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  checkExistingFile(): boolean {
    const stored = JSONFileService.getStoredFileInfo();
    if (stored) {
      this.showStatus('Previously loaded file available - choose an option below', 'success');
      this.fileDisplay.innerHTML = `
        <div class="file-name">${stored.filename}</div>
        <div class="file-size">${this.formatFileSize(stored.size)}</div>
        <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #6b7280;">
          Loaded ${new Date(stored.timestamp).toLocaleString()}
        </div>
        <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
          <button id="use-existing-file-btn" style="
            flex: 1;
            padding: 0.75rem;
            background: #22c55e;
            color: white;
            border: none;
            border-radius: 0.5rem;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
          ">
            ✅ Use This File
          </button>
          <button id="delete-file-btn" style="
            padding: 0.75rem;
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 0.5rem;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            min-width: 100px;
          ">
            🗑️ Delete
          </button>
        </div>
      `;
      this.fileDisplay.classList.remove('hidden');
      
      // Add click handlers for buttons
      const useFileBtn = document.getElementById('use-existing-file-btn');
      const deleteFileBtn = document.getElementById('delete-file-btn');
      
      if (useFileBtn) {
        useFileBtn.addEventListener('click', () => {
          console.log('[JSON UI] User confirmed existing file, triggering setup completion');
          if (this.onFileLoadedCallback) {
            this.onFileLoadedCallback();
          }
        });
        
        // Add hover effect
        useFileBtn.addEventListener('mouseenter', () => {
          useFileBtn.style.background = '#16a34a';
          useFileBtn.style.transform = 'translateY(-2px)';
        });
        useFileBtn.addEventListener('mouseleave', () => {
          useFileBtn.style.background = '#22c55e';
          useFileBtn.style.transform = 'translateY(0)';
        });
      }
      
      if (deleteFileBtn) {
        deleteFileBtn.addEventListener('click', () => {
          console.log('[JSON UI] User deleted existing file');
          JSONFileService.clearStoredFile();
          this.showStatus('File deleted. Please select a new JSON file.', 'success');
          this.fileDisplay.classList.add('hidden');
        });
        
        // Add hover effect
        deleteFileBtn.addEventListener('mouseenter', () => {
          deleteFileBtn.style.background = '#dc2626';
          deleteFileBtn.style.transform = 'translateY(-2px)';
        });
        deleteFileBtn.addEventListener('mouseleave', () => {
          deleteFileBtn.style.background = '#ef4444';
          deleteFileBtn.style.transform = 'translateY(0)';
        });
      }
      
      return true;
    }
    return false;
  }
  
  updateTransportPhase(): void {
    const stored = JSONFileService.getStoredFileInfo();
    if (stored) {
      const fileNameEl = document.getElementById('file-name-display');
      const fileSizeEl = document.getElementById('file-size-display');
      
      if (fileNameEl) fileNameEl.textContent = stored.filename;
      if (fileSizeEl) fileSizeEl.textContent = this.formatFileSize(stored.size);
    }
  }
}

// ============================================================================
// MCP SERVER FACTORY
// ============================================================================

function getJSONAnalyzerServer(): McpServer {
  const server = new McpServer({
    name: 'json-analyzer',
    version: '1.0.0',
  });

  // Get the loaded file to generate a realistic example
  const fileData = JSONFileService.getFileData();
  const example = fileData ? JSONFileService.generateExample(fileData.content) : '$.data';

  // Register the evaluate_jsonpath tool
  server.registerTool(
    'evaluate_jsonpath',
    {
      title: 'Evaluate JSONPath',
      description: 'Evaluate a JSONPath expression against the loaded JSON file',
      inputSchema: {
        path: z.string().describe(`JSONPath expression to evaluate. Example: ${example}`)
      }
    },
    async ({ path }) => {
      console.log(`[SERVER] Tool call received: evaluate_jsonpath with path: ${path}`);
      
      try {
        const fileData = JSONFileService.getFileData();
        
        if (!fileData) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ No JSON file loaded. Please run setup again to select a file.'
              }
            ]
          };
        }
        
        const result = JSONFileService.evaluateJSONPath(path, fileData.content);
        
        if (result === undefined) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ **JSONPath Not Found**\n\nPath: \`${path}\`\nFile: ${fileData.filename}\n\nThe specified path does not exist in the JSON data.`
              }
            ]
          };
        }
        
        // Format result based on type
        let formattedResult: string;
        if (typeof result === 'object') {
          formattedResult = JSON.stringify(result, null, 2);
        } else {
          formattedResult = String(result);
        }
        
        const response = {
          content: [
            {
              type: 'text',
              text: `✅ **JSONPath Result**\n\nPath: \`${path}\`\nFile: ${fileData.filename}\n\n\`\`\`json\n${formattedResult}\n\`\`\`\n\n**Type:** ${typeof result}${Array.isArray(result) ? ' (array)' : ''}`
            }
          ]
        };
        
        console.log(`[SERVER] JSONPath evaluation successful for path: ${path}`);
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'JSONPath evaluation failed';
        console.log(`[SERVER] Tool call error:`, errorMessage);
        return {
          content: [
            {
              type: 'text',
              text: `❌ Error evaluating JSONPath: ${errorMessage}`
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
  title: 'JSON Analyzer',
  visibility: 'hidden' as const,
  message: 'JSON file ready for analysis!'
};

let transport: InnerFrameTransport;

function showPhase(phase: 'setup' | 'transport'): void {
  document.getElementById('loading')?.classList.add('hidden');
  
  if (phase === 'setup') {
    document.getElementById('setup-phase')?.classList.remove('hidden');
    document.getElementById('transport-phase')?.classList.add('hidden');
  } else {
    document.getElementById('setup-phase')?.classList.add('hidden');
    document.getElementById('transport-phase')?.classList.remove('hidden');
  }
}

async function completeSetup() {
  await transport.completeSetup({
    displayName: CONFIG.title,
    transportVisibility: { requirement: CONFIG.visibility },
    ephemeralMessage: CONFIG.message
  });
}

async function main() {
  console.log('[JSON-ANALYZER] Starting main function');
  
  if (!isInWindowContext()) throw new Error('JSON Analyzer needs a window');
  
  console.log('[JSON-ANALYZER] Creating transport with requiresVisibleSetup: true');
  transport = new InnerFrameTransport(
    new PostMessageInnerControl(CONFIG.origins),
    { requiresVisibleSetup: true }
  );
  
  const phase = getServerPhase();
  console.log('[JSON-ANALYZER] Server phase detected:', phase);
  
  if (phase === 'setup') {
    console.log('[JSON-ANALYZER] Starting setup phase');
    console.log('[JSON-ANALYZER] Calling transport.prepareSetup()');
    await transport.prepareSetup();
    console.log('[JSON-ANALYZER] prepareSetup completed, sessionId:', transport.sessionId);
    
    JSONFileService.setSessionId(transport.sessionId);
    
    console.log('[JSON-ANALYZER] Showing setup phase UI');
    showPhase('setup');
    
    // Initialize UI with setup completion callback
    console.log('[JSON-ANALYZER] Initializing UI with completion callback');
    const ui = new JSONAnalyzerUI(completeSetup);
    ui.checkExistingFile();
    console.log('[JSON-ANALYZER] Setup phase initialization complete');
  } else {
    await transport.prepareToConnect();
    JSONFileService.setSessionId(transport.sessionId);
    
    showPhase('transport');
    
    const ui = new JSONAnalyzerUI();
    ui.updateTransportPhase();
    
    const server = getJSONAnalyzerServer();
    await server.connect(transport);
  }
}

// Prevent multiple instances
if (!(window as any).jsonAnalyzerStarted) {
  console.log('[JSON-ANALYZER] Starting JSON analyzer server');
  (window as any).jsonAnalyzerStarted = true;
  main().catch((error) => {
    console.error('[JSON-ANALYZER] Fatal error in main():', error);
    throw error;
  });
} else {
  console.log('[JSON-ANALYZER] JSON analyzer already started, skipping');
}