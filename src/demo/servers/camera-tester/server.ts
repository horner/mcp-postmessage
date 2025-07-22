import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InnerFrameTransport, PostMessageInnerControl } from '$sdk/transport/postmessage/index.js';
import { getServerPhase } from '$sdk/utils/helpers.js';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';

// UI elements
const statusText = document.getElementById('status-text')!;
const video = document.getElementById('video') as HTMLVideoElement;
const noVideo = document.getElementById('no-video')!;
const snapshotDisplay = document.getElementById('snapshot-display') as HTMLImageElement;
const testCameraBtn = document.getElementById('test-camera') as HTMLButtonElement;
const stopCameraBtn = document.getElementById('stop-camera') as HTMLButtonElement;
const proceedBtn = document.getElementById('proceed-btn') as HTMLButtonElement;
const cameraPerm = document.getElementById('camera-perm')!;
const geminiApiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement;
const geminiSetupDiv = document.getElementById('gemini-setup')!;
const clearApiKeyBtn = document.getElementById('clear-api-key') as HTMLButtonElement;

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
    // Setup mode: show video controls, Gemini setup, and proceed button
    testCameraBtn.style.display = 'inline-block';
    stopCameraBtn.style.display = 'inline-block'; 
    proceedBtn.style.display = 'inline-block';
    snapshotDisplay.style.display = 'none';
    geminiSetupDiv.style.display = 'block';
  } else {
    // Transport mode: hide all controls, show only snapshot display
    testCameraBtn.style.display = 'none';
    stopCameraBtn.style.display = 'none';
    proceedBtn.style.display = 'none';
    video.style.display = 'none';
    noVideo.style.display = 'none';
    snapshotDisplay.style.display = 'block';
    geminiSetupDiv.style.display = 'none';
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
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('No active video stream or video not ready');
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0);
  
  return canvas.toDataURL('image/jpeg', 0.8);
}

// Analyze emotion using Gemini AI or fallback to random
async function analyzeEmotion(base64ImageData?: string, sessionId?: string): Promise<{ emotion: string; confidence: number; description: string }> {
  // Try to get Gemini API key
  const apiKey = sessionId ? localStorage.getItem(`camera-tester-gemini-key-${sessionId}`) : null;
  
  if (apiKey && base64ImageData) {
    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
      });
      
      const config = {
        responseMimeType: 'text/plain',
      };
      
      const model = 'gemini-2.0-flash-001';
      const contents = [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64ImageData,
                mimeType: 'image/jpeg',
              },
            },
            {
              text: `Analyze the person's emotional state in this image. Respond with exactly this format:
EMOTION: [single word emotion]
CONFIDENCE: [number 70-95]
DESCRIPTION: [describe the user's emotion in <12 words that read like a line of Updike]`,
            },
          ],
        },
      ];

      const response = await ai.models.generateContent({
        model,
        config,
        contents,
      });
      
      const text = response.text;
      console.log('[CAMERA-TESTER] Gemini response:', text);
      
      // Parse the response
      const emotionMatch = text.match(/EMOTION:\s*(\w+)/i);
      const confidenceMatch = text.match(/CONFIDENCE:\s*(\d+)/i);
      const descriptionMatch = text.match(/DESCRIPTION:\s*(.+)/i);
      
      if (emotionMatch && confidenceMatch && descriptionMatch) {
        return {
          emotion: emotionMatch[1].toLowerCase(),
          confidence: parseInt(confidenceMatch[1]),
          description: descriptionMatch[1].trim()
        };
      } else {
        console.warn('[CAMERA-TESTER] Could not parse Gemini response, falling back to random');
      }
      
    } catch (error) {
      console.error('[CAMERA-TESTER] Gemini API error:', error);
      console.log('[CAMERA-TESTER] Falling back to random emotion analysis');
    }
  }
  
  // Fallback to random analysis
  const emotions = [
    { name: 'happy', desc: 'showing joy and contentment' },
    { name: 'focused', desc: 'displaying concentration and attention' },
    { name: 'curious', desc: 'engaged and interested' },
    { name: 'calm', desc: 'relaxed and peaceful' },
    { name: 'thoughtful', desc: 'contemplative and reflective' },
    { name: 'confident', desc: 'projecting self-assurance' },
    { name: 'surprised', desc: 'showing mild surprise or interest' }
  ];
  
  const selectedEmotion = emotions[Math.floor(Math.random() * emotions.length)];
  const confidence = 70 + Math.floor(Math.random() * 26); // 70-95% confidence
  
  return {
    emotion: selectedEmotion.name,
    confidence: confidence,
    description: selectedEmotion.desc
  };
}

// Proceed with setup function
async function proceedWithSetup() {
  try {
    const sessionId = transport.sessionId;
    
    // Save Gemini API key if provided
    const apiKey = geminiApiKeyInput.value.trim();
    if (apiKey) {
      localStorage.setItem(`camera-tester-gemini-key-${sessionId}`, apiKey);
      console.log('[CAMERA-TESTER] Gemini API key saved for session:', sessionId);
    } else {
      localStorage.removeItem(`camera-tester-gemini-key-${sessionId}`);
      console.log('[CAMERA-TESTER] No Gemini API key provided, will use random analysis');
    }
    
    await transport.completeSetup({
      displayName: 'Camera Emotion Analyzer',
      transportVisibility: { requirement: 'optional', description: 'Show to see camera feed and capture frames' },
      ephemeralMessage: apiKey ? 'Camera access configured with AI-powered emotion analysis!' : 'Camera access configured! Using random emotion analysis.'
    });
    updateStatus('Setup completed successfully!', 'success');
  } catch (error) {
    console.error('[CAMERA-TESTER] Setup completion error:', error);
    updateStatus(`Setup completion failed: ${error}`, 'error');
  }
}

// Clear API key function
function clearApiKey() {
  geminiApiKeyInput.value = '';
  updateApiKeyDisplay();
}

// Update API key display based on saved value
function updateApiKeyDisplay() {
  const sessionId = transport.sessionId;
  if (sessionId) {
    const savedKey = localStorage.getItem(`camera-tester-gemini-key-${sessionId}`);
    if (savedKey) {
      geminiApiKeyInput.placeholder = '•'.repeat(Math.min(savedKey.length, 20)) + ' (saved)';
    } else {
      geminiApiKeyInput.placeholder = 'Enter your Gemini API key...';
    }
  }
}

// Make functions global for onclick handlers
(window as any).testCameraAccess = testCameraAccess;
(window as any).stopCamera = stopCamera;
(window as any).proceedWithSetup = proceedWithSetup;
(window as any).clearApiKey = clearApiKey;

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
    updateApiKeyDisplay();
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
    // Don't start camera automatically - will be activated on-demand for tools
    updateStatus('Camera Emotion Analyzer ready (camera will activate when needed)', 'success');
    
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
      let tempStream: MediaStream | null = null;
      try {
        updateStatus('Activating camera for snapshot...', 'info');
        
        // Activate camera temporarily
        tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = tempStream;
        await video.play();

        // Wait for video to be ready and metadata to load
        await new Promise((resolve) => {
          const checkReady = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              resolve(undefined);
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        });
        
        // Additional small delay to ensure stable frame
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Capture frame while camera is still active
        const frameData = captureFrame();
        const timestamp = new Date().toLocaleTimeString();
        
        // Show the snapshot immediately
        snapshotDisplay.innerHTML = `<img src="${frameData}" style="max-width: 100%; height: auto;" alt="Camera snapshot">`;
        
        // Clean up camera
        tempStream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        
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
        // Clean up on error
        if (tempStream) {
          tempStream.getTracks().forEach(track => track.stop());
          video.srcObject = null;
        }
        updateStatus(`Snapshot failed: ${error}`, 'error');
        return {
          content: [{
            type: 'text', 
            text: `**Snapshot Failed**\n\nError: ${error}\n\nThis could be due to:\n- Camera permission not granted\n- Camera in use by another application\n- Browser security restrictions`
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
      let tempStream: MediaStream | null = null;
      try {
        updateStatus('Activating camera for emotion analysis...', 'info');
        
        // Activate camera temporarily
        tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = tempStream;
        await video.play();

        // Wait for video to be ready and metadata to load
        await new Promise((resolve) => {
          const checkReady = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              resolve(undefined);
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        });
        
        // Additional small delay to ensure stable frame
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Capture frame for analysis and display while camera is still active
        const frameData = captureFrame();
        const base64Data = frameData.split(',')[1]; // Extract base64 data
        const sessionId = transport.sessionId;
        
        // Show the snapshot immediately
        snapshotDisplay.innerHTML = `<img src="${frameData}" style="max-width: 100%; height: auto;" alt="Emotion analysis snapshot">`;
        
        // Clean up camera before analysis
        tempStream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        
        updateStatus('Analyzing emotion...', 'info');
        const analysis = await analyzeEmotion(base64Data, sessionId);
        const timestamp = new Date().toLocaleTimeString();
        
        const apiKey = localStorage.getItem(`camera-tester-gemini-key-${sessionId}`);
        const analysisMethod = apiKey ? 'AI-powered' : 'Random';
        updateStatus(`${analysisMethod} emotion detected: ${analysis.emotion} (${analysis.confidence}% confidence)`, 'success');
        
        return {
          content: [{
            type: 'text',
            text: `**Current Emotional State** (${analysisMethod} Analysis)\n\n**Detected Emotion:** ${analysis.emotion}\n**Confidence:** ${analysis.confidence}%\n**Description:** ${analysis.description}\n**Timestamp:** ${timestamp}`
          }]
        };
        
      } catch (error) {
        // Clean up on error
        if (tempStream) {
          tempStream.getTracks().forEach(track => track.stop());
          video.srcObject = null;
        }
        updateStatus(`Emotion analysis failed: ${error}`, 'error');
        return {
          content: [{
            type: 'text',
            text: `**Emotion Analysis Failed**\n\nError: ${error}\n\nThis could be due to:\n- Camera permission not granted\n- Camera in use by another application\n- Browser security restrictions\n- Invalid Gemini API key (if using AI analysis)`
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