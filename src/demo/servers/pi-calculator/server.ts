/**
 * Pi Calculator MCP Server
 * Demonstrates Monte Carlo method for calculating π with optional visualization
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { 
  PostMessageSetupHelper, 
  PostMessageServerTransport 
} from '$sdk/server/transport.js';
import { 
  getServerPhase, 
  isInWindowContext,
  generateUUID 
} from '$sdk/utils/helpers.js';

// ============================================================================
// MONTE CARLO PI CALCULATION
// ============================================================================

interface PiCalculationResult {
  piEstimate: number;
  accuracy: number;
  pointsInside: number;
  totalPoints: number;
  executionTime: number;
}

function calculatePi(iterations: number, onProgress?: (progress: number, current: PiCalculationResult, points?: {x: number, y: number, inside: boolean}[]) => void): PiCalculationResult {
  const startTime = Date.now();
  let pointsInside = 0;
  
  const batchSize = Math.max(1000, Math.floor(iterations / 100));
  let processed = 0;
  const currentBatchPoints: {x: number, y: number, inside: boolean}[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const x = Math.random() * 2 - 1; // Range: -1 to 1
    const y = Math.random() * 2 - 1; // Range: -1 to 1
    const distance = Math.sqrt(x * x + y * y);
    const inside = distance <= 1;
    
    if (inside) {
      pointsInside++;
    }
    
    // Store point for visualization
    currentBatchPoints.push({ x, y, inside });
    
    processed++;
    
    // Report progress periodically
    if (processed % batchSize === 0 || processed === iterations) {
      const currentEstimate = (pointsInside / processed) * 4;
      const currentAccuracy = Math.abs(currentEstimate - Math.PI) / Math.PI;
      
      const result: PiCalculationResult = {
        piEstimate: currentEstimate,
        accuracy: currentAccuracy,
        pointsInside,
        totalPoints: processed,
        executionTime: Date.now() - startTime
      };
      
      if (onProgress) {
        onProgress(processed / iterations, result, [...currentBatchPoints]);
      }
      
      // Clear batch for next progress update
      currentBatchPoints.length = 0;
    }
  }
  
  const piEstimate = (pointsInside / iterations) * 4;
  const accuracy = Math.abs(piEstimate - Math.PI) / Math.PI;
  
  return {
    piEstimate,
    accuracy,
    pointsInside,
    totalPoints: iterations,
    executionTime: Date.now() - startTime
  };
}

// ============================================================================
// VISUALIZATION
// ============================================================================

class PiVisualization {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private scale: number;
  private pointsDrawn: number = 0;
  private allPoints: {x: number, y: number, inside: boolean}[] = [];
  private resizeObserver: ResizeObserver;
  private needsRedraw: boolean = false;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.width = canvas.width;
    this.height = canvas.height;
    this.scale = Math.min(this.width, this.height) / 2;
    
    this.setupCanvas();
    this.setupResizeObserver();
  }
  
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      console.log('[PI-VIZ] ResizeObserver fired, entries:', entries.length, 'allPoints before resize:', this.allPoints.length);
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        console.log('[PI-VIZ] ResizeObserver entry - contentRect:', width, 'x', height, 'canvas size before:', this.canvas.width, 'x', this.canvas.height);
        // Update canvas size to match container
        this.canvas.width = width;
        this.canvas.height = height;
        console.log('[PI-VIZ] Canvas size after update:', this.canvas.width, 'x', this.canvas.height, 'allPoints still available:', this.allPoints.length);
        this.handleResize();
      }
    });
    this.resizeObserver.observe(this.canvas);
  }
  
  private handleResize(): void {
    // Update dimensions
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.scale = Math.min(this.width, this.height) / 2;
    
    // Don't redraw if canvas has invalid dimensions (happens during layout changes)
    if (this.width <= 0 || this.height <= 0) {
      console.log('[PI-VIZ] Skipping redraw - invalid canvas dimensions:', this.width, 'x', this.height);
      this.needsRedraw = true; // Remember we need to redraw when dimensions become valid
      
      // Set a fallback timer to retry in case ResizeObserver doesn't fire again
      setTimeout(() => {
        if (this.needsRedraw && this.canvas.width > 0 && this.canvas.height > 0) {
          console.log('[PI-VIZ] Retrying redraw after timeout - dimensions now:', this.canvas.width, 'x', this.canvas.height);
          this.handleResize();
        }
      }, 100);
      return;
    }
    
    // Redraw everything (either from resize or deferred from invalid dimensions)
    console.log('[PI-VIZ] Redrawing with valid dimensions:', this.width, 'x', this.height);
    this.setupCanvas();
    if (this.allPoints.length > 0) {
      this.redrawAllPoints();
    }
    this.needsRedraw = false; // Clear the flag
  }
  
  private setupCanvas(): void {
    // Reset transformation first to ensure we're in a clean state
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Clear canvas completely
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    // Save current transform state
    this.ctx.save();
    
    // Set up coordinate system (center at middle of canvas)
    this.ctx.translate(this.width / 2, this.height / 2);
    
    // Draw unit circle
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.scale, 0, 2 * Math.PI);
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    
    // Draw square boundary
    this.ctx.beginPath();
    this.ctx.rect(-this.scale, -this.scale, this.scale * 2, this.scale * 2);
    this.ctx.strokeStyle = '#666666';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
    
    // Restore to clean state for point drawing
    this.ctx.restore();
  }
  
  private redrawAllPoints(): void {
    console.log('[PI-VIZ] Redrawing', this.allPoints.length, 'points after resize');
    console.log('[PI-VIZ] Canvas dimensions:', this.width, 'x', this.height, 'scale:', this.scale);
    
    // Ensure canvas is in clean state before drawing points
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // Sample points for performance if we have too many
    const pointsToRedraw = this.allPoints.length > 5000 ? 
      this.allPoints.filter((_, i) => i % Math.ceil(this.allPoints.length / 5000) === 0) : 
      [...this.allPoints];
    
    this.pointsDrawn = pointsToRedraw.length;
    
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    
    let drawnCount = 0;
    for (const point of pointsToRedraw) {
      // Convert to screen coordinates
      const screenX = centerX + (point.x * this.scale);
      const screenY = centerY + (point.y * this.scale);
      
      // Only draw points that are within canvas bounds
      if (screenX >= 0 && screenX <= this.width && screenY >= 0 && screenY <= this.height) {
        // Color based on whether point is inside circle
        this.ctx.fillStyle = point.inside ? '#10b981' : '#ef4444';
        
        // Draw point
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, 1, 0, 2 * Math.PI);
        this.ctx.fill();
        
        drawnCount++;
      }
    }
    
    console.log('[PI-VIZ] Redraw complete:', drawnCount, 'of', pointsToRedraw.length, 'sampled points drawn from', this.allPoints.length, 'total stored points');
  }
  
  reset(): void {
    this.pointsDrawn = 0;
    this.allPoints = []; // Clear stored points
    this.setupCanvas();
  }
  
  addPoints(points: {x: number, y: number, inside: boolean}[]): void {
    // Store ALL points for potential redraw on resize
    this.allPoints.push(...points);
    
    // Ensure canvas is in clean state before drawing points
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // For performance, only draw a sample of new points if there are many
    const pointsToRender = points.length > 500 ? 
      points.filter((_, i) => i % Math.ceil(points.length / 500) === 0) : 
      points;
    
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    
    for (const point of pointsToRender) {
      // Convert to screen coordinates
      const screenX = centerX + (point.x * this.scale);
      const screenY = centerY + (point.y * this.scale);
      
      // Color based on whether point is inside circle
      this.ctx.fillStyle = point.inside ? '#10b981' : '#ef4444'; // Green if inside, red if outside
      
      // Draw point
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, 1, 0, 2 * Math.PI);
      this.ctx.fill();
      
      this.pointsDrawn++;
    }
  }
  
  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
}

// ============================================================================
// UI MANAGEMENT
// ============================================================================

interface ToolCall {
  id: string;
  name: string;
  params: any;
  timestamp: Date;
  result?: any;
  error?: string;
  duration?: number;
}

class PiCalculatorUI {
  private visualization: PiVisualization | null = null;
  private toolCalls: ToolCall[] = [];
  private currentExecution: ToolCall | null = null;
  private cumulativePointsInside: number = 0;
  private cumulativeTotalPoints: number = 0;
  
  constructor() {
    this.setupUI();
  }
  
  private setupUI(): void {
    const canvas = document.getElementById('visualization') as HTMLCanvasElement;
    
    if (canvas) {
      // Set canvas to full viewport size initially
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      // Create visualization once - ResizeObserver will handle size changes
      this.visualization = new PiVisualization(canvas);
      
      // The canvas resizing is now handled by ResizeObserver in PiVisualization
      // No need for window resize listener that recreates the visualization
    }
  }
  
  startToolCall(name: string, params: any): string {
    const toolCall: ToolCall = {
      id: generateUUID(),
      name,
      params,
      timestamp: new Date()
    };
    
    this.toolCalls.push(toolCall);
    this.currentExecution = toolCall;
    
    // Update iteration count display
    this.updateIterationCount(0);
    
    return toolCall.id;
  }
  
  updateToolCallProgress(id: string, progress: number, current: PiCalculationResult, points?: {x: number, y: number, inside: boolean}[]): void {
    const toolCall = this.toolCalls.find(tc => tc.id === id);
    if (toolCall && toolCall === this.currentExecution) {
      // Update iteration count display with cumulative total
      this.updateIterationCount(this.cumulativeTotalPoints + current.totalPoints);
      
      // Add visualization points using the actual calculation points
      if (this.visualization && points && points.length > 0) {
        // Store all points but only draw a sample for performance
        this.visualization.addPoints(points);
      }
    }
  }
  
  completeToolCall(id: string, result: any, error?: string): void {
    const toolCall = this.toolCalls.find(tc => tc.id === id);
    if (toolCall) {
      toolCall.result = result;
      toolCall.error = error;
      toolCall.duration = Date.now() - toolCall.timestamp.getTime();
      
      if (toolCall === this.currentExecution) {
        this.currentExecution = null;
        
        // Add to cumulative totals
        if (result && result.totalPoints && result.pointsInside) {
          this.cumulativePointsInside += result.pointsInside;
          this.cumulativeTotalPoints += result.totalPoints;
        }
        
        // Final update with cumulative total
        this.updateIterationCount(this.cumulativeTotalPoints);
      }
    }
  }
  
  private updateIterationCount(count: number): void {
    const iterationEl = document.getElementById('iteration-count');
    if (iterationEl) {
      iterationEl.textContent = `Iterations: ${count.toLocaleString()}`;
    }
  }
  
  getCumulativeStats() {
    return {
      pointsInside: this.cumulativePointsInside,
      totalPoints: this.cumulativeTotalPoints,
      estimate: this.cumulativeTotalPoints > 0 ? (this.cumulativePointsInside / this.cumulativeTotalPoints) * 4 : 0,
      accuracy: this.cumulativeTotalPoints > 0 ? Math.abs(((this.cumulativePointsInside / this.cumulativeTotalPoints) * 4) - Math.PI) / Math.PI : 0
    };
  }
  
  reset() {
    // Clear cumulative stats
    this.cumulativePointsInside = 0;
    this.cumulativeTotalPoints = 0;
    
    // Reset visualization
    if (this.visualization) {
      this.visualization.reset();
    }
    
    // Update iteration count display
    this.updateIterationCount(0);
    
    // Clear tool calls history
    this.toolCalls = [];
    this.currentExecution = null;
    
    console.log('[PI-CALC] Reset complete - all stats and visualization cleared');
  }
  
}

// ============================================================================
// MCP SERVER FACTORY
// ============================================================================

function getPiCalculatorServer(ui: PiCalculatorUI): McpServer {
  const server = new McpServer({
    name: 'pi-calculator',
    version: '1.0.0',
  });
  
  // Register the calculate_pi tool using the high-level SDK
  server.registerTool(
    'calculate_pi',
    {
      title: 'Pi Calculator',
      description: 'Calculate π using Monte Carlo method',
      inputSchema: {
        iterations: z.number()
          .min(1000)
          .max(10000000)
          .describe('Number of random points to generate. Example: 1000')
      }
    },
    async ({ iterations }) => {
      console.log(`[SERVER] Tool call received: calculate_pi with ${iterations} iterations`);
      
      // Start UI tracking
      const callId = ui.startToolCall('calculate_pi', { iterations });
      
      try {
        // Run calculation with progress updates
        const result = calculatePi(iterations, (progress, current, points) => {
          ui.updateToolCallProgress(callId, progress, current, points);
        });
        
        // Complete UI tracking
        ui.completeToolCall(callId, result);
        
        // Get cumulative stats
        const cumulative = ui.getCumulativeStats();
        
        const response = {
          content: [
            {
              type: 'text',
              text: `π calculation complete!\n\nThis run: ${result.piEstimate.toFixed(6)} (${result.totalPoints.toLocaleString()} points)\nCumulative: ${cumulative.estimate.toFixed(6)} (${cumulative.totalPoints.toLocaleString()} total points)\nCumulative accuracy: ${(cumulative.accuracy * 100).toFixed(4)}% error\nExecution time: ${result.executionTime}ms`
            }
          ]
        };
        
        console.log(`[SERVER] Tool call response prepared:`, response);
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Calculation failed';
        console.log(`[SERVER] Tool call error:`, errorMessage);
        ui.completeToolCall(callId, null, errorMessage);
        throw new Error(errorMessage);
      }
    }
  );
  
  // Register the reset tool
  server.registerTool(
    'reset_calculation',
    {
      title: 'Reset Pi Calculator',
      description: 'Clear all cumulative statistics and reset the visualization',
      inputSchema: {}
    },
    async () => {
      console.log(`[SERVER] Tool call received: reset_calculation`);
      
      try {
        // Reset the UI and stats
        ui.reset();
        
        const response = {
          content: [
            {
              type: 'text',
              text: `π calculation reset complete!\n\nAll cumulative statistics have been cleared.\nVisualization has been reset.\nReady for new calculations.`
            }
          ]
        };
        
        console.log(`[SERVER] Reset tool call response prepared:`, response);
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Reset failed';
        console.log(`[SERVER] Reset tool call error:`, errorMessage);
        throw new Error(errorMessage);
      }
    }
  );
  
  return server;
}

// ============================================================================
// MCP SERVER SETUP
// ============================================================================

class PiCalculatorServer {
  private server: McpServer | null = null;
  private ui: PiCalculatorUI;
  
  constructor() {
    this.ui = new PiCalculatorUI();
  }
  
  private createMCPServer(): McpServer {
    return getPiCalculatorServer(this.ui);
  }
  
  async start(): Promise<void> {
    const phase = getServerPhase();
    
    if (phase === 'setup') {
      await this.startSetupPhase();
    } else {
      await this.startTransportPhase();
    }
  }
  
  private async startSetupPhase(): Promise<void> {
    console.log('[PI SETUP] Starting setup phase for Pi Calculator');
    
    const setupHelper = new PostMessageSetupHelper({
      // ⚠️ SECURITY WARNING: ['*'] allows any origin - FOR DEMO ONLY!
      // Production servers MUST specify explicit origins:
      // allowedOrigins: ['https://my-client-app.com', 'https://localhost:3000']
      allowedOrigins: ['*'],
      requiresVisibleSetup: false
    });
    
    // Wait for handshake
    await setupHelper.waitForHandshake();
    console.log('[PI SETUP] Handshake completed');
    
    // Show setup UI
    this.showPhase('setup');
    
    // Complete setup immediately since no configuration needed
    await setupHelper.completeSetup({
      serverTitle: 'Pi Calculator',
      transportVisibility: {
        requirement: 'optional',
        optionalMessage: 'Show server to see real-time Monte Carlo visualization'
      },
      ephemeralMessage: 'Pi Calculator ready!'
    });
  }
  
  private async startTransportPhase(): Promise<void> {
    // Show transport UI
    this.showPhase('transport');
    
    // Create MCP server only during transport phase
    this.server = this.createMCPServer();
    
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
    const transportPhase = document.getElementById('transport-phase');
    
    if (loading) loading.classList.add('hidden');
    
    if (phase === 'setup') {
      setupPhase?.classList.remove('hidden');
      transportPhase?.classList.add('hidden');
    } else {
      setupPhase?.classList.add('hidden');
      transportPhase?.classList.remove('hidden');
    }
  }
  
  private showError(message: string): void {
    const errorDisplay = document.getElementById('error-display');
    const errorMessage = document.getElementById('error-message');
    
    if (errorDisplay && errorMessage) {
      errorMessage.textContent = message;
      errorDisplay.classList.remove('hidden');
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
    
    const server = new PiCalculatorServer();
    await server.start();
    
  } catch (error) {
    console.error('Failed to start Pi Calculator server:', error);
    
    const errorDisplay = document.getElementById('error-display');
    const errorMessage = document.getElementById('error-message');
    
    if (errorDisplay && errorMessage) {
      errorMessage.textContent = error instanceof Error ? error.message : 'Unknown error';
      errorDisplay.classList.remove('hidden');
    }
  }
}

// Start the server
main();