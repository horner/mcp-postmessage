/**
 * Pi Calculator - Monte Carlo π estimation with live visualization
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PostMessageTransport } from '$sdk/server/transport.js';
import { PostMessageServerWindowControl } from '$sdk/server/window-control.js';
import { getServerPhase, isInWindowContext } from '$sdk/utils/helpers.js';

let totalIterations = 0, totalInside = 0;
let allPoints: Array<{ x: number; y: number; isInside: boolean }> = [];

function setupCanvas() {
  const canvas = document.getElementById('visualization') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return { ctx: null, rect: { width: 0, height: 0 } };
  
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.scale(ratio, ratio);
  
  // Clear and draw circle
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.strokeStyle = '#333';
  ctx.beginPath();
  const radius = Math.min(rect.width, rect.height) / 2 - 20;
  ctx.arc(rect.width / 2, rect.height / 2, radius, 0, 2 * Math.PI);
  ctx.stroke();
  
  return { ctx, rect };
}

function drawPoint(
  ctx: CanvasRenderingContext2D, 
  rect: DOMRect, 
  x: number, 
  y: number, 
  isInside: boolean
) {
  const radius = Math.min(rect.width, rect.height) / 2 - 20;
  const px = rect.width / 2 + x * radius;
  const py = rect.height / 2 + y * radius;
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
  const { ctx, rect } = setupCanvas();
  if (!ctx) return;
  
  allPoints.forEach(point => drawPoint(ctx, rect, point.x, point.y, point.isInside));
  if (totalIterations > 0) updateDisplay();
}

function calculatePi(iterations: number) {
  const canvas = document.getElementById('visualization') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return { pi: 0, accuracy: 0, totalIterations: 0 };
  
  const rect = canvas.getBoundingClientRect();
  
  // Only setup canvas if it's the first calculation
  if (totalIterations === 0) {
    setupCanvas();
  }
  
  for (let i = 0; i < iterations; i++) {
    const x = Math.random() * 2 - 1;
    const y = Math.random() * 2 - 1;
    const isInside = x * x + y * y <= 1;
    
    allPoints.push({ x, y, isInside });
    if (isInside) totalInside++;
    totalIterations++;
    
    // Draw new point on existing canvas
    drawPoint(ctx, rect, x, y, isInside);
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
  
  const windowControl = new PostMessageServerWindowControl(['*']);
  const transport = new PostMessageTransport(windowControl, { requiresVisibleSetup: false });
  
  if (getServerPhase() === 'setup') {
    await transport.prepareSetup();
    await transport.completeSetup({
      serverTitle: 'Pi Calculator',
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
    
    // Resize handling
    let resizeTimeout: number;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(redrawCanvas, 100);
    });
    
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