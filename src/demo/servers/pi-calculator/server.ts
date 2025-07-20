/**
 * Pi Calculator - Monte Carlo π estimation with live visualization
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InnerFrameTransport, PostMessageInnerControl } from '$sdk/transport/postmessage/index.js';
import { getServerPhase, isInWindowContext } from '$sdk/utils/helpers.js';

let totalIterations = 0, totalInside = 0;
let allPoints: Array<{ x: number; y: number; isInside: boolean }> = [];

function setupCanvas() {
  const canvas = document.getElementById('visualization') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return { ctx: null, rect: { width: 0, height: 0 }, scale: 1 };
  
  // Force canvas to fill its container
  const container = canvas.parentElement;
  if (container) {
    const containerRect = container.getBoundingClientRect();
    console.log(`[PI] Container size: ${containerRect.width}x${containerRect.height}`);
    
    // Set canvas to exactly fill container
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
  
  const rect = canvas.getBoundingClientRect();
  console.log(`[PI] Canvas rect: ${rect.width}x${rect.height}`);
  
  const ratio = window.devicePixelRatio || 1;
  
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx.scale(ratio, ratio);
  
  // Calculate scale to make unit circle fill most of the space
  const margin = 10; // Minimal margin
  const availableSize = Math.min(rect.width, rect.height) - margin;
  const scale = Math.max(10, availableSize / 2); // Ensure minimum radius of 10px
  
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  
  // Clear canvas
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, rect.width, rect.height);
  
  // Draw unit circle (represents the 1x1 square's inscribed circle)
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, scale, 0, 2 * Math.PI);
  ctx.stroke();
  
  return { ctx, rect, scale };
}

function drawPoint(
  ctx: CanvasRenderingContext2D, 
  rect: DOMRect, 
  scale: number,
  x: number, 
  y: number, 
  isInside: boolean
) {
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const px = centerX + x * scale;
  const py = centerY + y * scale;
  ctx.fillStyle = isInside ? '#4CAF50' : '#ff6b6b';
  ctx.fillRect(px - 1, py - 1, 2, 2);
}

function updateDisplay() {
  const pi = 4 * totalInside / totalIterations;
  const accuracy = 100 - Math.abs((pi - Math.PI) / Math.PI) * 100;
  const el = document.getElementById('iteration-count');
  if (el) {
    el.textContent = `Iterations: ${totalIterations.toLocaleString()} | ` +
      `π ≈ ${pi.toFixed(6)} (${accuracy.toFixed(1)}% accurate)`;
  }
}

function redrawCanvas() {
  console.log('[PI] Redrawing canvas...');
  const { ctx, rect, scale } = setupCanvas();
  if (!ctx) return;
  
  // Skip drawing if canvas is too small
  if (rect.width < 20 || rect.height < 20) {
    console.log(`[PI] Canvas too small (${rect.width}x${rect.height}), skipping draw`);
    return;
  }
  
  console.log(`[PI] Canvas size: ${rect.width}x${rect.height}, scale: ${scale}`);
  
  allPoints.forEach(point => 
    drawPoint(ctx, rect, scale, point.x, point.y, point.isInside)
  );
  if (totalIterations > 0) updateDisplay();
}

function calculatePi(iterations: number) {
  const canvas = document.getElementById('visualization') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return { pi: 0, accuracy: 0, totalIterations: 0 };
  
  let scale: number;
  
  // Setup canvas and get current scale
  if (totalIterations === 0) {
    const setup = setupCanvas();
    scale = setup.scale;
  } else {
    // Get current scale for existing canvas
    const rect = canvas.getBoundingClientRect();
    const margin = 10;
    const availableSize = Math.min(rect.width, rect.height) - margin;
    scale = Math.max(10, availableSize / 2);
  }
  
  const rect = canvas.getBoundingClientRect();
  
  for (let i = 0; i < iterations; i++) {
    const x = Math.random() * 2 - 1;
    const y = Math.random() * 2 - 1;
    const isInside = x * x + y * y <= 1;
    
    allPoints.push({ x, y, isInside });
    if (isInside) totalInside++;
    totalIterations++;
    
    // Draw new point on existing canvas with current scale
    drawPoint(ctx, rect, scale, x, y, isInside);
  }
  
  updateDisplay();
  const pi = 4 * totalInside / totalIterations;
  const accuracy = 100 - Math.abs((pi - Math.PI) / Math.PI) * 100;
  return { pi, accuracy, totalIterations };
}

function reset() {
  totalIterations = totalInside = 0;
  allPoints = [];
  redrawCanvas();
  const el = document.getElementById('iteration-count');
  if (el) el.textContent = 'Iterations: 0';
}

async function main() {
  if (!isInWindowContext()) throw new Error('π needs a window');
  
  const windowControl = new PostMessageInnerControl(['*']);
  const transport = new InnerFrameTransport(windowControl, { requiresVisibleSetup: false });
  
  if (getServerPhase() === 'setup') {
    await transport.prepareSetup();
    await transport.completeSetup({
      displayName: 'Pi Calculator',
      transportVisibility: { requirement: 'optional' },
      ephemeralMessage: 'π is ready'
    });
  } else {
    await transport.prepareToConnect();
    
    const server = new McpServer({ name: 'pi-calculator', version: '1.0.0' });
    
    server.registerTool('calculate_pi', {
      title: 'Calculate π',
      description: 'Monte Carlo estimation of π with visualization',
      inputSchema: {
        iterations: z.number()
          .min(1000)
          .max(1000000)
          .describe('Number of random points. Example: 1000')
      }
    }, async ({ iterations }) => {
      const result = calculatePi(iterations);
      return {
        content: [{
          type: 'text',
          text: `Added ${iterations.toLocaleString()} iterations. π ≈ ${result.pi.toFixed(6)} ` +
            `(${result.accuracy.toFixed(1)}% accurate after ` +
            `${result.totalIterations.toLocaleString()} total iterations)`
        }]
      };
    });
    
    server.registerTool('reset', {
      title: 'Reset Everything',
      description: 'Clear canvas, reset π estimate and iteration count',
      inputSchema: {}
    }, async () => {
      reset();
      return {
        content: [{ type: 'text', text: 'Reset complete - ready for fresh π calculation' }]
      };
    });
    
    await server.connect(transport);
    
    // Resize handling - multiple event sources for better detection
    let resizeTimeout: number;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        console.log('[PI] Resize detected, redrawing canvas');
        redrawCanvas();
      }, 100);
    };
    
    // Listen to window resize
    window.addEventListener('resize', handleResize);
    
    // Use ResizeObserver on the container, not just canvas
    if (window.ResizeObserver) {
      const canvas = document.getElementById('visualization');
      const container = canvas?.parentElement;
      if (container) {
        console.log('[PI] Setting up ResizeObserver on container');
        const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            console.log(`[PI] Container resized to: ${entry.contentRect.width}x${entry.contentRect.height}`);
            handleResize();
          }
        });
        resizeObserver.observe(container);
      }
    }
    
    // Initialize UI
    document.getElementById('loading')?.classList.add('hidden');
    const el = document.getElementById('iteration-count');
    if (el) el.textContent = 'Iterations: 0';
    redrawCanvas();
  }
}

main().catch(error => {
  console.error('[PI] Fatal error:', error);
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = `Error: ${error.message}`;
});