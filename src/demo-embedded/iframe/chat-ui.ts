/**
 * Chat UI components for the MCP client iframe
 */

import type { ChatMessage, ToolCall } from '../shared/types.js';

export class ChatUI {
  private container: HTMLElement;
  private messagesContainer!: HTMLElement;
  private inputContainer!: HTMLElement;
  private messageInput!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private messages: ChatMessage[] = [];
  private onMessageSend?: (message: string) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.setupUI();
  }

  private setupUI(): void {
    this.container.innerHTML = `
      <div class="chat-container">
        <div class="chat-header">
          <h3>🤖 Medical AI Assistant</h3>
          <p>Ask me about medications, allergies, or patient information</p>
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input-container" id="chat-input-container">
          <div class="input-group">
            <textarea 
              id="message-input" 
              placeholder="Type your message here... (e.g., 'What medications is the patient taking?')"
              rows="2"
            ></textarea>
            <button id="send-button" class="send-btn" disabled>
              <span class="send-icon">➤</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.messagesContainer = document.getElementById('chat-messages')!;
    this.inputContainer = document.getElementById('chat-input-container')!;
    this.messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    this.sendButton = document.getElementById('send-button') as HTMLButtonElement;

    this.setupEventListeners();
    this.addSystemMessage('Welcome! I can help you manage patient medications and allergies. Try asking me about the patient\'s current medications or adding new ones.');
  }

  private setupEventListeners(): void {
    this.sendButton.addEventListener('click', () => {
      this.sendMessage();
    });

    this.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.messageInput.addEventListener('input', () => {
      this.updateSendButton();
      this.autoResize();
    });
  }

  private autoResize(): void {
    this.messageInput.style.height = 'auto';
    this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
  }

  private updateSendButton(): void {
    this.sendButton.disabled = !this.messageInput.value.trim();
  }

  setOnMessageSend(callback: (message: string) => void): void {
    this.onMessageSend = callback;
  }

  private sendMessage(): void {
    const text = this.messageInput.value.trim();
    if (!text || !this.onMessageSend) return;

    this.messageInput.value = '';
    this.updateSendButton();
    this.autoResize();

    this.onMessageSend(text);
  }

  addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.renderMessage(message);
    this.scrollToBottom();
  }

  addUserMessage(text: string): ChatMessage {
    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      type: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      toolCalls: []
    };

    this.addMessage(message);
    return message;
  }

  addAssistantMessage(text: string): ChatMessage {
    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      type: 'assistant',
      content: text,
      timestamp: new Date().toISOString(),
      toolCalls: []
    };

    this.addMessage(message);
    return message;
  }

  addSystemMessage(text: string): ChatMessage {
    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      type: 'system',
      content: text,
      timestamp: new Date().toISOString(),
      toolCalls: []
    };

    this.addMessage(message);
    return message;
  }

  addToolCall(messageId: string, toolCall: ToolCall): void {
    const message = this.messages.find(m => m.id === messageId);
    if (message) {
      if (!message.toolCalls) message.toolCalls = [];
      message.toolCalls.push(toolCall);
      this.renderMessages(); // Re-render to show updated tool calls
    }
  }

  updateToolCall(messageId: string, toolCallId: string, result: any, status: 'success' | 'error'): void {
    const message = this.messages.find(m => m.id === messageId);
    if (message && message.toolCalls) {
      const toolCall = message.toolCalls.find(tc => tc.id === toolCallId);
      if (toolCall) {
        toolCall.result = result;
        toolCall.status = status;
        this.renderMessages(); // Re-render to show updated results
      }
    }
  }

  private renderMessage(message: ChatMessage): void {
    const messageEl = document.createElement('div');
    messageEl.className = `message message-${message.type}`;
    messageEl.setAttribute('data-message-id', message.id);

    const time = new Date(message.timestamp).toLocaleTimeString();
    
    let content = `
      <div class="message-header">
        <span class="message-type">${this.getMessageTypeIcon(message.type)} ${this.getMessageTypeLabel(message.type)}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-content">${this.formatMessageContent(message.content)}</div>
    `;

    if (message.toolCalls && message.toolCalls.length > 0) {
      content += `<div class="tool-calls">${this.renderToolCalls(message.toolCalls)}</div>`;
    }

    messageEl.innerHTML = content;
    this.messagesContainer.appendChild(messageEl);
  }

  private renderMessages(): void {
    this.messagesContainer.innerHTML = '';
    this.messages.forEach(message => this.renderMessage(message));
    this.scrollToBottom();
  }

  private renderToolCalls(toolCalls: ToolCall[]): string {
    return toolCalls.map(toolCall => `
      <div class="tool-call ${toolCall.status}">
        <div class="tool-call-header">
          <span class="tool-name">🔧 ${toolCall.name}</span>
          <span class="tool-status status-${toolCall.status}">
            ${toolCall.status === 'pending' ? '⏳' : toolCall.status === 'success' ? '✅' : '❌'}
            ${toolCall.status}
          </span>
        </div>
        <div class="tool-parameters">
          <strong>Parameters:</strong>
          <pre>${JSON.stringify(toolCall.parameters, null, 2)}</pre>
        </div>
        ${toolCall.result ? `
          <div class="tool-result">
            <strong>Result:</strong>
            <pre>${JSON.stringify(toolCall.result, null, 2)}</pre>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  private getMessageTypeIcon(type: string): string {
    switch (type) {
      case 'user': return '👤';
      case 'assistant': return '🤖';
      case 'system': return 'ℹ️';
      default: return '💬';
    }
  }

  private getMessageTypeLabel(type: string): string {
    switch (type) {
      case 'user': return 'You';
      case 'assistant': return 'AI Assistant';
      case 'system': return 'System';
      default: return 'Message';
    }
  }

  private formatMessageContent(content: string): string {
    // Simple markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  setEnabled(enabled: boolean): void {
    this.messageInput.disabled = !enabled;
    this.sendButton.disabled = !enabled || !this.messageInput.value.trim();
    
    if (!enabled) {
      this.inputContainer.style.opacity = '0.5';
    } else {
      this.inputContainer.style.opacity = '1';
    }
  }

  showTyping(): void {
    const typingMessage = document.createElement('div');
    typingMessage.className = 'message message-assistant typing';
    typingMessage.innerHTML = `
      <div class="message-header">
        <span class="message-type">🤖 AI Assistant</span>
      </div>
      <div class="message-content">
        <div class="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;
    this.messagesContainer.appendChild(typingMessage);
    this.scrollToBottom();
  }

  hideTyping(): void {
    const typingMessage = this.messagesContainer.querySelector('.typing');
    if (typingMessage) {
      typingMessage.remove();
    }
  }

  clear(): void {
    this.messages = [];
    this.messagesContainer.innerHTML = '';
  }
}