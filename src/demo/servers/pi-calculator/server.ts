/**
 * Pi Calculator - Monte Carlo π estimation with live visualization
 * 
 * In random points we trust, to find π in the dust.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PostMessageTransport } from '$sdk/server/transport.js';
import { PostMessageServerWindowControl } from '$sdk/server/window-control.js';
import { getServerPhase, isInWindowContext } from '$sdk/utils/helpers.js';

// Configuration
const ALLOWED_ORIGINS = ['*']; // In production, lock down to specific origins
const SERVER_CONFIG = {
  name: 'pi-calculator',
  version: '1.0.0',
  title: 'Pi Calculator',
  visibility: 'optional' as const,
  message: 'π is ready'
};

const TOOL_CONFIG = {
  minIterations: 1000,
  maxIterations: 1000000,
  defaultIterations: 1000
};

// Monte Carlo state
let totalIterations = 0;
let totalInside = 0;

function initializeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw unit circle
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const radius = Math.max(5, Math.min(canvas.width, canvas.height)/2 - 20);
  ctx.arc(canvas.width/2, canvas.height/2, radius, 0, 2 * Math.PI);
  ctx.stroke();
}

function drawPoint(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, x: number, y: number, isInside: boolean) {
  const radius = Math.max(5, Math.min(canvas.width, canvas.height) / 2 - 20);
  const px = canvas.width/2 + x * radius;
  const py = canvas.height/2 + y * radius;
  ctx.fillStyle = isInside ? '#4CAF50' : '#ff6b6b';
  ctx.fillRect(px - 1, py - 1, 2, 2);
}

function updateDisplay(pi: number, accuracy: number) {
  const iterationsEl = document.getElementById('iteration-count');
  if (iterationsEl) {
    iterationsEl.textContent = `Iterations: ${totalIterations.toLocaleString()} | π ≈ ${pi.toFixed(6)} (${accuracy.toFixed(1)}% accurate)`;
  }
}

function calculatePi(newIterations: number): { pi: number; accuracy: number; totalIterations: number } {
  const canvas = document.getElementById('visualization') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  
  // Initialize canvas on first run
  if (ctx && totalIterations === 0) {
    initializeCanvas(canvas, ctx);
  }
  
  // Monte Carlo simulation
  for (let i = 0; i < newIterations; i++) {
    const x = Math.random() * 2 - 1;
    const y = Math.random() * 2 - 1;
    const isInside = x * x + y * y <= 1;
    
    if (isInside) totalInside++;
    totalIterations++;
    
    if (ctx) drawPoint(ctx, canvas, x, y, isInside);
  }
  
  const pi = 4 * totalInside / totalIterations;
  const accuracy = 100 - Math.abs((pi - Math.PI) / Math.PI) * 100;
  
  updateDisplay(pi, accuracy);
  return { pi, accuracy, totalIterations };
}

function reset(): void {
  const canvas = document.getElementById('visualization') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  const iterationsEl = document.getElementById('iteration-count');
  
  totalIterations = 0;
  totalInside = 0;
  
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  if (iterationsEl) {
    iterationsEl.textContent = 'Iterations: 0';
  }
}

async function createServer(): Promise<McpServer> {
  const server = new McpServer({ 
    name: SERVER_CONFIG.name, 
    version: SERVER_CONFIG.version 
  });
  
  server.registerTool('calculate_pi', {
    title: 'Calculate π',
    description: 'Monte Carlo estimation of π with visualization',
    inputSchema: {
      iterations: z.number()
        .min(TOOL_CONFIG.minIterations)
        .max(TOOL_CONFIG.maxIterations)
        .describe(`Number of random points. Example: ${TOOL_CONFIG.defaultIterations}`)
    }
  }, async ({ iterations }) => {
    const result = calculatePi(iterations);
    return {
      content: [{
        type: 'text',
        text: `Added ${iterations.toLocaleString()} iterations. π ≈ ${result.pi.toFixed(6)} (${result.accuracy.toFixed(1)}% accurate after ${result.totalIterations.toLocaleString()} total iterations)`
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
      content: [{
        type: 'text',
        text: 'Reset complete - ready for fresh π calculation'
      }]
    };
  });
  
  return server;
}

async function main() {
  if (!isInWindowContext()) throw new Error('π needs a window');
  
  const windowControl = new PostMessageServerWindowControl(ALLOWED_ORIGINS);
  const transport = new PostMessageTransport(windowControl, {
    requiresVisibleSetup: false
  });
  const phase = getServerPhase();
  
  if (phase === 'setup') {
    await transport.prepareSetup();
    await transport.completeSetup({
      serverTitle: SERVER_CONFIG.title,
      transportVisibility: { requirement: SERVER_CONFIG.visibility },
      ephemeralMessage: SERVER_CONFIG.message
    });
  } else {
    await transport.prepareToConnect();
    
    const server = await createServer();
    await server.connect(transport);
    
    // Ready state
    document.getElementById('loading')?.classList.add('hidden');
    const iterationsEl = document.getElementById('iteration-count');
    if (iterationsEl) iterationsEl.textContent = 'Iterations: 0';
  }
}

main().catch(error => {
  console.error('[PI] Fatal error:', error);
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = `Error: ${error.message}`;
});
