import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InnerFrameTransport, PostMessageInnerControl } from '$sdk/transport/postmessage/index.js';
import { getServerPhase } from '$sdk/utils/helpers.js';
import { z } from 'zod';

// UI elements
const statusText = document.getElementById('status-text')!;
const video = document.getElementById('video') as HTMLVideoElement;
const noVideo = document.getElementById('no-video')!;
const snapshotDisplay = document.getElementById('snapshot-display') as HTMLImageElement;
const testCameraBtn = document.getElementById('test-camera') as HTMLButtonElement;
const stopCameraBtn = document.getElementById('stop-camera') as HTMLButtonElement;
const proceedBtn = document.getElementById('proceed-btn') as HTMLButtonElement;
const cameraPerm = document.getElementById('camera-perm')!;

let mediaStream: MediaStream | null = null;

// Update status
function updateStatus(message: string, type: 'info' | 'error' | 'success' = 'info') {
  statusText.textContent = message;
  const statusDiv = document.getElementById('status')!;
  statusDiv.className = `status ${type}`;
}

// Switch UI between setup and transport modes
function setUIMode(mode: 'setup' | 'transport') {
  if (mode === 'setup') {
    // Setup mode: show video controls and proceed button
    testCameraBtn.style.display = 'inline-block';
    stopCameraBtn.style.display = 'inline-block'; 
    proceedBtn.style.display = 'inline-block';
    snapshotDisplay.style.display = 'none';
  } else {
    // Transport mode: hide all controls, show only snapshot display
    testCameraBtn.style.display = 'none';
    stopCameraBtn.style.display = 'none';
    proceedBtn.style.display = 'none';
    video.style.display = 'none';
    noVideo.style.display = 'none';
    snapshotDisplay.style.display = 'block';
    // Hide the buttons container in transport mode
    const buttonsContainer = document.querySelector('div[style*="text-align: center"]') as HTMLElement;
    if (buttonsContainer) buttonsContainer.style.display = 'none';
  }
}

// Test camera access function
async function testCameraAccess() {
  try {
    updateStatus('Requesting camera access...', 'info');
    testCameraBtn.disabled = true;
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: true 
    });
    
    mediaStream = stream;
    video.srcObject = stream;
    video.style.display = 'block';
    noVideo.style.display = 'none';
    video.play();
    
    testCameraBtn.disabled = false;
    stopCameraBtn.disabled = false;
    proceedBtn.disabled = false; // Enable proceed button when camera works
    updateStatus('Camera access granted! Click "Proceed with Setup" to continue.', 'success');
    
    // Update permission status
    checkPermissions();
    
  } catch (error) {
    testCameraBtn.disabled = false;
    updateStatus(`Camera access failed: ${error}`, 'error');
    console.error('Camera access error:', error);
  }
}

// Stop camera function
function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  
  video.style.display = 'none';
  noVideo.style.display = 'block';
  video.srcObject = null;
  
  testCameraBtn.disabled = false;
  stopCameraBtn.disabled = true;
  updateStatus('Camera stopped', 'info');
}

// Check permissions status
async function checkPermissions() {
  try {
    const cameraResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
    
    cameraPerm.textContent = cameraResult.state;
  } catch (error) {
    cameraPerm.textContent = 'Unable to check';
  }
}

// Capture still frame from video
function captureFrame(): string {
  if (!mediaStream || !video.videoWidth) {
    throw new Error('No active video stream');
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0);
  
  return canvas.toDataURL('image/jpeg', 0.8);
}

// Analyze emotion (RNG placeholder for now)
function analyzeEmotion(): { emotion: string; confidence: number; description: string } {
  const emotions = [
    { name: 'happy', desc: 'showing joy and contentment' },
    { name: 'focused', desc: 'displaying concentration and attention' },
    { name: 'curious', desc: 'appearing engaged and interested' },
    { name: 'calm', desc: 'looking relaxed and peaceful' },
    { name: 'thoughtful', desc: 'seeming contemplative and reflective' },
    { name: 'confident', desc: 'projecting self-assurance' },
    { name: 'surprised', desc: 'showing mild surprise or interest' }
  ];
  
  const selectedEmotion = emotions[Math.floor(Math.random() * emotions.length)];
  const confidence = 0.7 + Math.random() * 0.25; // 70-95% confidence
  
  return {
    emotion: selectedEmotion.name,
    confidence: Math.round(confidence * 100),
    description: selectedEmotion.desc
  };
}

// Proceed with setup function
async function proceedWithSetup() {
  try {
    await transport.completeSetup({
      displayName: 'Camera Emotion Analyzer',
      transportVisibility: { requirement: 'optional', description: 'Show to see camera feed and capture frames' },
      ephemeralMessage: 'Camera access configured! Ready to analyze emotions.'
    });
    updateStatus('Setup completed successfully!', 'success');
  } catch (error) {
    console.error('[CAMERA-TESTER] Setup completion error:', error);
    updateStatus(`Setup completion failed: ${error}`, 'error');
  }
}

// Make functions global for onclick handlers
(window as any).testCameraAccess = testCameraAccess;
(window as any).stopCamera = stopCamera;
(window as any).proceedWithSetup = proceedWithSetup;

// Initialize
const phase = getServerPhase();
const transport = new InnerFrameTransport(
  new PostMessageInnerControl(['*']),
  { 
    requiresVisibleSetup: true,
    minProtocolVersion: '1.0',
    maxProtocolVersion: '1.0',
    requestedPermissions: [
      {
        name: 'camera',
        phase: ['setup', 'transport'],
        required: true,
        purpose: 'To capture images and video for analysis'
      }
    ]
  }
);

if (phase === 'setup') {
  // Setup phase - show UI and wait for user to proceed
  console.log('[CAMERA-TESTER] Starting setup phase');
  setUIMode('setup');
  updateStatus('Setting up Camera Emotion Analyzer...', 'info');
  
  transport.prepareSetup().then(() => {
    console.log('[CAMERA-TESTER] Setup preparation complete');
    updateStatus('Ready for setup! Test camera access then click Proceed.', 'info');
    // Don't auto-complete setup - wait for user to click proceed button
  }).catch(error => {
    console.error('[CAMERA-TESTER] Setup preparation error:', error);
    updateStatus(`Setup failed: ${error}`, 'error');
  });

} else {
  // Transport phase  
  setUIMode('transport');
  updateStatus('Initializing camera...', 'info');
  
  transport.prepareToConnect().then(async () => {
    // Start camera automatically in transport phase
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      mediaStream = stream;
      video.srcObject = stream;
      video.play();
      updateStatus('Camera Emotion Analyzer ready', 'success');
    } catch (error) {
      updateStatus(`Camera initialization failed: ${error}`, 'error');
    }
    const server = new McpServer({
      name: 'camera-tester',
      version: '1.0.0'
    });

    // Take snapshot tool (first)
    server.registerTool('take_snapshot', {
      title: 'Take Snapshot',
      description: 'Capture a still image from the camera feed.',
      inputSchema: {}
    }, async () => {
      try {
        // Ensure camera is active
        if (!mediaStream) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          mediaStream = stream;
          video.srcObject = stream;
          video.play();
        }

        // Wait a moment for video to be ready
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Capture frame
        const frameData = captureFrame();
        const timestamp = new Date().toLocaleTimeString();
        
        // Update the snapshot display
        snapshotDisplay.innerHTML = `<img src="${frameData}" style="max-width: 100%; height: auto;" alt="Camera snapshot">`;
        
        updateStatus(`Snapshot captured at ${timestamp}`, 'success');
        
        // Extract base64 data from data URL (remove "data:image/jpeg;base64," prefix)
        const base64Data = frameData.split(',')[1];
        
        return {
          content: [
            {
              type: 'text',
              text: `Snapshot captured at ${timestamp}. Resolution: ${video.videoWidth}x${video.videoHeight}`
            },
            {
              type: 'image',
              data: base64Data,
              mimeType: 'image/jpeg'
            }
          ]
        };
        
      } catch (error) {
        updateStatus(`Snapshot failed: ${error}`, 'error');
        return {
          content: [{
            type: 'text', 
            text: `**Snapshot Failed**\n\nError: ${error}\n\nThis could be due to:\n- Camera permission not granted\n- No active camera stream\n- Camera in use by another application`
          }]
        };
      }
    });

    // Check emotional state tool (second)
    server.registerTool('check_emotional_state', {
      title: 'Check Emotional State',
      description: 'Analyze the user\'s current emotional state from camera feed.',
      inputSchema: {}
    }, async () => {
      try {
        // Ensure camera is active
        if (!mediaStream) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          mediaStream = stream;
          video.srcObject = stream;
          video.play();
        }

        // Wait a moment for video to be ready
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Capture frame for analysis and display
        const frameData = captureFrame();
        const analysis = analyzeEmotion();
        const timestamp = new Date().toLocaleTimeString();
        
        // Update the snapshot display with the frame used for analysis
        snapshotDisplay.innerHTML = `<img src="${frameData}" style="max-width: 100%; height: auto;" alt="Emotion analysis snapshot">`;
        
        updateStatus(`Emotion detected: ${analysis.emotion} (${analysis.confidence}% confidence)`, 'success');
        
        return {
          content: [{
            type: 'text',
            text: `**Current Emotional State**\n\n**Detected Emotion:** ${analysis.emotion}\n**Confidence:** ${analysis.confidence}%\n**Description:** User appears ${analysis.description}\n**Timestamp:** ${timestamp}`
          }]
        };
        
      } catch (error) {
        updateStatus(`Emotion analysis failed: ${error}`, 'error');
        return {
          content: [{
            type: 'text',
            text: `**Emotion Analysis Failed**\n\nError: ${error}\n\nThis could be due to:\n- Camera permission not granted\n- No active camera stream\n- Camera in use by another application`
          }]
        };
      }
    });

    await server.connect(transport);
    updateStatus('Camera Tester connected and ready!', 'success');
    checkPermissions();
    
  }).catch(error => {
    updateStatus(`Connection failed: ${error}`, 'error');
  });
}