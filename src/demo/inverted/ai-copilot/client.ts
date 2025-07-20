/**
 * AI Copilot - Inverted Architecture Demo
 * 
 * This demonstrates an MCP Client running in the INNER FRAME that
 * communicates with an MCP Server in its parent window. The client
 * can call tools provided by the parent to access user data.
 * 
 * Architecture: Inner Frame MCP Client + Outer Frame MCP Server
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InnerFrameTransport, PostMessageInnerControl } from '$sdk/transport/postmessage/index.js';
import { generateSessionId } from '$sdk/utils/helpers.js';

// ============================================================================
// CHAT UI MANAGEMENT
// ============================================================================

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: Date;
}

class ChatUI {
  private messages: ChatMessage[] = [];
  private messageContainer: HTMLElement;
  private inputElement: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private statusElement: HTMLElement;
  private typingIndicator: HTMLElement;
  private quickActions: HTMLElement;
  private welcomeState: HTMLElement;
  private connectionError: HTMLElement;

  constructor() {
    this.messageContainer = document.getElementById('chat-messages') as HTMLElement;
    this.inputElement = document.getElementById('chat-input') as HTMLTextAreaElement;
    this.sendButton = document.getElementById('send-button') as HTMLButtonElement;
    this.statusElement = document.getElementById('connection-status') as HTMLElement;
    this.typingIndicator = document.getElementById('typing-indicator') as HTMLElement;
    this.quickActions = document.getElementById('quick-actions') as HTMLElement;
    this.welcomeState = document.getElementById('welcome-state') as HTMLElement;
    this.connectionError = document.getElementById('connection-error') as HTMLElement;

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.inputElement.addEventListener('input', () => {
      this.autoResize();
    });
  }

  private autoResize() {
    this.inputElement.style.height = 'auto';
    this.inputElement.style.height = Math.min(this.inputElement.scrollHeight, 100) + 'px';
  }

  showConnecting() {
    this.statusElement.textContent = 'Connecting...';
    this.statusElement.style.background = 'rgba(241, 196, 15, 0.8)';
    this.inputElement.disabled = true;
    this.sendButton.disabled = true;
    this.welcomeState.style.display = 'block';
    this.connectionError.style.display = 'none';
    this.quickActions.style.display = 'none';
  }

  showConnected() {
    this.statusElement.textContent = 'Connected';
    this.statusElement.style.background = 'rgba(0, 184, 148, 0.8)';
    this.inputElement.disabled = false;
    this.sendButton.disabled = false;
    this.welcomeState.style.display = 'none';
    this.connectionError.style.display = 'none';
    this.quickActions.style.display = 'flex';
  }

  showDisconnected() {
    this.statusElement.textContent = 'Disconnected';
    this.statusElement.style.background = 'rgba(225, 112, 85, 0.8)';
    this.inputElement.disabled = true;
    this.sendButton.disabled = true;
    this.welcomeState.style.display = 'none';
    this.connectionError.style.display = 'block';
    this.quickActions.style.display = 'none';
  }

  addMessage(type: ChatMessage['type'], content: string): ChatMessage {
    const message: ChatMessage = {
      id: Date.now().toString(),
      type,
      content,
      timestamp: new Date()
    };

    this.messages.push(message);
    this.renderMessage(message);
    this.scrollToBottom();
    return message;
  }

  private renderMessage(message: ChatMessage) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${message.type}`;
    messageEl.textContent = message.content;
    
    // Append to message container
    this.messageContainer.appendChild(messageEl);
  }

  showTyping() {
    this.typingIndicator.style.display = 'block';
    this.scrollToBottom();
  }

  hideTyping() {
    this.typingIndicator.style.display = 'none';
  }

  private scrollToBottom() {
    setTimeout(() => {
      this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }, 100);
  }

  getCurrentInput(): string {
    return this.inputElement.value;
  }

  clearInput() {
    this.inputElement.value = '';
    this.autoResize();
  }

  sendMessage() {
    const content = this.getCurrentInput().trim();
    if (content && !this.inputElement.disabled) {
      this.addMessage('user', content);
      this.clearInput();
      
      // Trigger the actual sending
      (window as any).copilotApp?.handleUserMessage(content);
    }
  }
}

// ============================================================================
// COPILOT APPLICATION
// ============================================================================

class CopilotApp {
  private client: Client | null = null;
  private transport: InnerFrameTransport | null = null;
  private ui: ChatUI;
  private availableTools: string[] = [];

  constructor() {
    this.ui = new ChatUI();
    
    // Make methods available globally for HTML onclick handlers
    (window as any).sendMessage = () => this.ui.sendMessage();
    (window as any).sendQuickMessage = (message: string) => this.sendQuickMessage(message);
    (window as any).reconnect = () => this.initialize();
    (window as any).copilotApp = this;
  }

  async initialize() {
    console.log('[AI-COPILOT] Initializing...');
    this.ui.showConnecting();

    try {
      // Create window control for communicating with parent
      const windowControl = new PostMessageInnerControl(['*']); // In production, specify parent origin
      
      // Create transport for inner frame
      this.transport = new InnerFrameTransport(windowControl);
      
      // Prepare to connect
      await this.transport.prepareToConnect();
      
      // Create MCP client
      this.client = new Client({
        name: 'ai-copilot',
        version: '1.0.0'
      });

      // Connect client to transport
      await this.client.connect(this.transport);
      
      // Discover available tools
      await this.discoverTools();
      
      this.ui.showConnected();
      this.ui.addMessage('system', '🎉 Connected to your dashboard! I can now access your data to help answer questions.');
      
      console.log('[AI-COPILOT] Successfully connected to parent dashboard');
      
    } catch (error) {
      console.error('[AI-COPILOT] Failed to initialize:', error);
      this.ui.showDisconnected();
      this.ui.addMessage('error', '❌ Failed to connect to the dashboard. Please try refreshing the page.');
    }
  }

  private async discoverTools() {
    if (!this.client) return;
    
    try {
      const response = await this.client.listTools();
      this.availableTools = response.tools.map(tool => tool.name);
      console.log('[AI-COPILOT] Available tools:', this.availableTools);
    } catch (error) {
      console.error('[AI-COPILOT] Failed to discover tools:', error);
    }
  }

  sendQuickMessage(message: string) {
    this.ui.addMessage('user', message);
    this.handleUserMessage(message);
  }

  async handleUserMessage(message: string) {
    if (!this.client) {
      this.ui.addMessage('error', '❌ Not connected to dashboard. Please try reconnecting.');
      return;
    }

    this.ui.showTyping();

    try {
      // Simple intent detection based on message content
      const response = await this.processUserMessage(message);
      this.ui.hideTyping();
      this.ui.addMessage('assistant', response);
      
    } catch (error) {
      this.ui.hideTyping();
      console.error('[AI-COPILOT] Error processing message:', error);
      this.ui.addMessage('error', '❌ Sorry, I encountered an error while processing your request. Please try again.');
    }
  }

  private async processUserMessage(message: string): Promise<string> {
    const lowerMessage = message.toLowerCase();
    
    // Intent detection based on keywords
    if (lowerMessage.includes('who am i') || lowerMessage.includes('my info') || lowerMessage.includes('user info')) {
      return await this.callTool('getCurrentUser');
    }
    
    if (lowerMessage.includes('project') || lowerMessage.includes('my work')) {
      return await this.callTool('getUserProjects');
    }
    
    if (lowerMessage.includes('system') || lowerMessage.includes('health') || lowerMessage.includes('status')) {
      return await this.callTool('getSystemHealth');
    }
    
    if (lowerMessage.includes('team') || lowerMessage.includes('stats') || lowerMessage.includes('statistics')) {
      return await this.callTool('getTeamStats');
    }
    
    // Default helpful response with available actions
    return `I'm here to help you with information from your dashboard! 

I can help you with:
• 👤 **User information** - Ask "Who am I?" to see your profile
• 📂 **Your projects** - Ask "What are my current projects?" 
• 🏥 **System health** - Ask "What is the system health?"
• 📊 **Team statistics** - Ask "Show me team statistics"

Try asking one of these questions, or click the quick action buttons below!`;
  }

  private async callTool(toolName: string): Promise<string> {
    if (!this.client) {
      throw new Error('Not connected to dashboard');
    }

    try {
      console.log(`[AI-COPILOT] Calling tool: ${toolName}`);
      const result = await this.client.callTool({
        name: toolName,
        arguments: {}
      });

      // Extract text content from the result
      if (result.content && result.content.length > 0) {
        return result.content[0].text || 'No response received';
      }
      
      return 'Tool executed successfully but returned no content.';
      
    } catch (error) {
      console.error(`[AI-COPILOT] Tool call failed for ${toolName}:`, error);
      throw new Error(`Failed to execute ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect() {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.client = null;
    this.ui.showDisconnected();
  }
}

// ============================================================================
// APPLICATION STARTUP
// ============================================================================

let copilotApp: CopilotApp;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[AI-COPILOT] Page loaded, creating application...');
  copilotApp = new CopilotApp();
  copilotApp.initialize();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (copilotApp) {
    copilotApp.disconnect();
  }
});

console.log('[AI-COPILOT] Client script loaded');
