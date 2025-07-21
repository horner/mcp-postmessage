/**
 * Pi Calculator - Monte Carlo π estimation with live visualization
 *
 * Refactored to use a more functional approach with immutable state management,
 * and consolidated phase handling logic.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InnerFrameTransport, PostMessageInnerControl } from '$sdk/transport/postmessage/index.js';
import { getServerPhase, isInWindowContext } from '$sdk/utils/helpers.js';

// --- 1. STATE MANAGEMENT (PURE) ---

interface Point {
  readonly x: number;
  readonly y: number;
  readonly isInside: boolean;
}

interface PiCalculatorState {
  readonly totalIterations: number;
  readonly totalInside: number;
  readonly allPoints: readonly Point[];
  readonly pi: number;
  readonly accuracy: number;
}

const INITIAL_STATE: PiCalculatorState = {
  totalIterations: 0,
  totalInside: 0,
  allPoints: [],
  pi: 0,
  accuracy: 0,
};

function calculateNewPiState(currentState: PiCalculatorState, iterations: number): PiCalculatorState {
  let newInside = 0;
  const newPoints: Point[] = [];

  for (let i = 0; i < iterations; i++) {
    const x = Math.random() * 2 - 1;
    const y = Math.random() * 2 - 1;
    const isInside = x * x + y * y <= 1;
    if (isInside) {
      newInside++;
    }
    newPoints.push({ x, y, isInside });
  }

  const totalInside = currentState.totalInside + newInside;
  const totalIterations = currentState.totalIterations + iterations;
  const allPoints = [...currentState.allPoints, ...newPoints];
  const pi = totalIterations > 0 ? 4 * totalInside / totalIterations : 0;
  const accuracy = totalIterations > 0 ? 100 - Math.abs((pi - Math.PI) / Math.PI) * 100 : 0;

  return { totalInside, totalIterations, allPoints, pi, accuracy };
}

// --- 2. UI RENDERING (IMPURE) ---

interface CanvasContext {
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: DOMRect;
  readonly scale: number;
}

function setupCanvas(): CanvasContext | null {
  const canvas = document.getElementById('visualization') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return null;

  const container = canvas.parentElement!
  const rect = container.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;

  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  
  ctx.scale(ratio, ratio);

  const margin = 10;
  const availableSize = Math.min(rect.width, rect.height) - margin;
  const scale = Math.max(10, availableSize / 2);
  
  return { ctx, rect, scale };
}

function renderUi(state: PiCalculatorState) {
  const canvasCtx = setupCanvas();
  if (!canvasCtx) return;

  const { ctx, rect, scale } = canvasCtx;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, scale, 0, 2 * Math.PI);
  ctx.stroke();

  for (const point of state.allPoints) {
    const px = centerX + point.x * scale;
    const py = centerY + point.y * scale;
    ctx.fillStyle = point.isInside ? '#4CAF50' : '#ff6b6b';
    ctx.fillRect(px - 1, py - 1, 2, 2);
  }

  const el = document.getElementById('iteration-count');
  if (el) {
    el.textContent = state.totalIterations === 0 ? 'Iterations: 0' : `Iterations: ${state.totalIterations.toLocaleString()} | π ≈ ${state.pi.toFixed(6)} (${state.accuracy.toFixed(1)}% accurate)`;
  }
}

// --- 3. PHASE HANDLERS ---

async function handleSetupPhase(transport: InnerFrameTransport) {
  await transport.prepareSetup();
  await transport.completeSetup({
    displayName: 'Pi Calculator',
    transportVisibility: { requirement: 'optional' },
    ephemeralMessage: 'π is ready'
  });
}

async function handleTransportPhase(transport: InnerFrameTransport) {
  let appState: PiCalculatorState = INITIAL_STATE;

  await transport.prepareToConnect();
  const server = new McpServer({ name: 'pi-calculator', version: '1.0.0' });

  server.registerTool('calculate_pi', {
    title: 'Calculate π',
    description: 'Monte Carlo estimation of π with visualization',
    inputSchema: { iterations: z.number().min(1000).max(1000000).describe('Number of random points. Example: 1000') }
  }, async ({ iterations }) => {
    appState = calculateNewPiState(appState, iterations);
    renderUi(appState);
    return { content: [{ type: 'text', text: `Added ${iterations.toLocaleString()} iterations. π ≈ ${appState.pi.toFixed(6)} (${appState.accuracy.toFixed(1)}% accurate)` }] };
  });

  server.registerTool('reset', {
    title: 'Reset Everything',
    description: 'Clear canvas, reset π estimate and iteration count',
    inputSchema: {}
  }, async () => {
    appState = INITIAL_STATE;
    renderUi(appState);
    return { content: [{ type: 'text', text: 'Reset complete.' }] };
  });

  await server.connect(transport);

  let resizeTimeout: number;
  const handleResize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(() => renderUi(appState), 100);
  };
  window.addEventListener('resize', handleResize);
  if (window.ResizeObserver) {
    const container = document.getElementById('visualization')?.parentElement;
    if (container) new ResizeObserver(handleResize).observe(container);
  }

  document.getElementById('loading')?.classList.add('hidden');
  renderUi(appState);
}

// --- 4. MAIN ORCHESTRATION ---

async function main() {
  if (!isInWindowContext()) throw new Error('π needs a window');

  const transport = new InnerFrameTransport(new PostMessageInnerControl(['*']), { requiresVisibleSetup: false });

  if (getServerPhase() === 'setup') {
    await handleSetupPhase(transport);
  } else {
    await handleTransportPhase(transport);
  }
}

main().catch(error => {
  console.error('[PI] Fatal error:', error);
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = `Error: ${error.message}`;
});