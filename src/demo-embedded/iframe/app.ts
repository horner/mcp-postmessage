/**
 * MCP Client Implementation (Iframe)
 * 
 * This file implements the MCP client that runs in the iframe and provides
 * a chat interface for interacting with the medical tools.
 */

import type {
  MCPPostMessageType,
  ServerHandshakeReplyMessage,
  ToolCallResponseMessage,
  ServerStatusMessage,
  StartSimulationMessage,
  ToolDefinition
} from '../shared/protocol.js';
import {
  isMCPPostMessage,
  isServerHandshakeReply,
  isToolCallResponse,
  isStartSimulation,
  isSimulationStep
} from '../shared/protocol.js';
import type { ChatMessage, ToolCall, SimulationStep } from '../shared/types.js';
import { ChatUI } from './chat-ui.js';

/**
 * MCP Client implementation using PostMessage transport
 */
export class MCPPostMessageClient {
  private sessionId: string;
  private isConnected = false;
  private availableTools: ToolDefinition[] = [];
  private pendingToolCalls = new Map<string, { messageId: string; toolCall: ToolCall }>();
  private chatUI!: ChatUI;
  
  // Simulation state
  private isSimulationRunning = false;
  private simulationSteps: SimulationStep[] = [];
  private currentSimulationStep = 0;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.setupEventListeners();
    this.initializeUI();
    this.startHandshake();
  }

  private generateSessionId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupEventListeners(): void {
    window.addEventListener('message', this.handleMessage.bind(this));
  }

  private initializeUI(): void {
    const container = document.getElementById('chat-container');
    if (!container) {
      throw new Error('Chat container not found');
    }

    this.chatUI = new ChatUI(container);
    this.chatUI.setOnMessageSend(this.handleUserMessage.bind(this));
    this.chatUI.setEnabled(false); // Disabled until connected
  }

  private startHandshake(): void {
    console.log('Starting client handshake...');
    
    const handshakeMessage = {
      type: 'MCP_CLIENT_HANDSHAKE' as const,
      protocolVersion: '1.0' as const,
      sessionId: this.sessionId
    };

    this.sendToParent(handshakeMessage);
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    // In a real app, you'd want to validate the origin more strictly
    if (!event.origin.includes('localhost') && !event.origin.includes('127.0.0.1')) {
      console.warn('Rejected message from invalid origin:', event.origin);
      return;
    }

    if (!isMCPPostMessage(event.data)) {
      return; // Ignore non-protocol messages
    }

    const message = event.data as MCPPostMessageType;
    console.log('Client received message:', message);

    try {
      if (isServerHandshakeReply(message)) {
        await this.handleServerHandshakeReply(message);
      } else if (isToolCallResponse(message)) {
        await this.handleToolCallResponse(message);
      } else if (isStartSimulation(message)) {
        await this.handleStartSimulation(message);
      } else if (message.type === 'MCP_SERVER_STATUS') {
        await this.handleServerStatus(message as ServerStatusMessage);
      } else if (isSimulationStep(message)) {
        await this.handleSimulationStep(message);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.chatUI.addSystemMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleServerHandshakeReply(message: ServerHandshakeReplyMessage): Promise<void> {
    if (message.sessionId !== this.sessionId) {
      throw new Error('Session ID mismatch in handshake reply');
    }

    this.availableTools = message.tools;
    console.log('Received tools from server:', this.availableTools);

    // Send connection established message
    const connectionMessage = {
      type: 'MCP_CONNECTION_ESTABLISHED' as const,
      protocolVersion: '1.0' as const,
      sessionId: this.sessionId
    };

    this.sendToParent(connectionMessage);
    this.isConnected = true;
    this.chatUI.setEnabled(true);
    
    this.chatUI.addSystemMessage(
      `Connected to ${message.serverInfo.name} v${message.serverInfo.version}. ` +
      `Available tools: ${this.availableTools.map(t => t.name).join(', ')}`
    );
  }

  private async handleToolCallResponse(message: ToolCallResponseMessage): Promise<void> {
    const pendingCall = this.pendingToolCalls.get(message.callId);
    if (!pendingCall) {
      console.warn('Received response for unknown tool call:', message.callId);
      return;
    }

    this.pendingToolCalls.delete(message.callId);

    if (message.success) {
      this.chatUI.updateToolCall(
        pendingCall.messageId,
        message.callId,
        message.result,
        'success'
      );
      
      // Add assistant response based on the tool result
      this.generateAssistantResponse(pendingCall.toolCall, message.result);
    } else {
      this.chatUI.updateToolCall(
        pendingCall.messageId,
        message.callId,
        { error: message.error },
        'error'
      );
      
      this.chatUI.addAssistantMessage(
        `I encountered an error while executing ${pendingCall.toolCall.name}: ${message.error}`
      );
    }

    // If we're in simulation mode, notify parent of step completion
    if (this.isSimulationRunning) {
      this.sendSimulationStepComplete(message.success);
    }
  }

  private async handleServerStatus(message: ServerStatusMessage): Promise<void> {
    if (message.message) {
      console.log(`Server status: ${message.status} - ${message.message}`);
    }
  }

  private async handleStartSimulation(message: StartSimulationMessage): Promise<void> {
    console.log('Starting simulation:', message.scenario);
    this.isSimulationRunning = true;
    this.currentSimulationStep = 0;
    
    this.chatUI.addSystemMessage('🎬 Starting automated demo simulation...');
  }

  private async handleSimulationStep(message: any): Promise<void> {
    if (!this.isSimulationRunning) return;

    const step = message.step as SimulationStep;
    const stepIndex = message.stepIndex;

    console.log(`Executing simulation step ${stepIndex}:`, step);

    switch (step.type) {
      case 'user_message':
        if (step.message) {
          await this.simulateUserMessage(step.message);
        }
        break;
      
      case 'tool_call':
        if (step.tool && step.parameters) {
          await this.simulateToolCall(step.tool, step.parameters);
        }
        break;
      
      case 'wait':
        await this.simulateWait(step.delay || 1000);
        break;
    }
  }

  private async simulateUserMessage(message: string): Promise<void> {
    // Add user message
    this.chatUI.addUserMessage(message);
    
    // Show typing indicator briefly
    this.chatUI.showTyping();
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.chatUI.hideTyping();
    
    // Send completion
    this.sendSimulationStepComplete(true);
  }

  private async simulateToolCall(toolName: string, parameters: any): Promise<void> {
    // Simulate the user asking for the tool call
    const userMessage = this.generateUserMessageForTool(toolName, parameters);
    this.chatUI.addUserMessage(userMessage);
    
    // Show typing briefly
    this.chatUI.showTyping();
    await new Promise(resolve => setTimeout(resolve, 800));
    this.chatUI.hideTyping();
    
    // Execute the tool call
    await this.callTool(toolName, parameters);
  }

  private async simulateWait(delay: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delay));
    this.sendSimulationStepComplete(true);
  }

  private generateUserMessageForTool(toolName: string, parameters: any): string {
    switch (toolName) {
      case 'list_medications':
        return parameters.status === 'active' 
          ? 'What medications is the patient currently taking?'
          : 'Show me all the patient\'s medications.';
      
      case 'add_medication':
        return `Please add ${parameters.name} ${parameters.dosage} ${parameters.frequency} prescribed by ${parameters.prescribedBy}.`;
      
      case 'add_allergy':
        return `The patient has a ${parameters.severity} allergy to ${parameters.allergen} causing ${parameters.reaction}.`;
      
      case 'get_patient_summary':
        return 'Can you give me a complete summary of this patient\'s medical information?';
      
      default:
        return `I need to use the ${toolName} tool.`;
    }
  }

  private sendSimulationStepComplete(success: boolean): void {
    const message = {
      type: 'MCP_SIMULATION_STEP_COMPLETE' as const,
      protocolVersion: '1.0' as const,
      sessionId: this.sessionId,
      stepIndex: this.currentSimulationStep,
      success
    };

    this.sendToParent(message);
  }

  private async handleUserMessage(text: string): Promise<void> {
    // Add user message to chat
    this.chatUI.addUserMessage(text);
    
    // Show typing indicator
    this.chatUI.showTyping();
    
    // Simulate AI thinking time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.chatUI.hideTyping();
    
    // Try to understand the intent and call appropriate tools
    await this.processUserIntent(text);
  }

  private async processUserIntent(text: string): Promise<void> {
    const lowerText = text.toLowerCase();
    
    // Simple intent matching - in a real app, you'd use NLP or an LLM
    if (lowerText.includes('medication') && (lowerText.includes('list') || lowerText.includes('show') || lowerText.includes('current') || lowerText.includes('taking'))) {
      await this.callTool('list_medications', { status: 'active' });
    } else if (lowerText.includes('all medication')) {
      await this.callTool('list_medications', { status: 'all' });
    } else if (lowerText.includes('allerg') && (lowerText.includes('list') || lowerText.includes('show'))) {
      await this.callTool('list_allergies', {});
    } else if (lowerText.includes('patient') && (lowerText.includes('summary') || lowerText.includes('information') || lowerText.includes('info'))) {
      await this.callTool('get_patient_summary', {});
    } else if (lowerText.includes('add') && lowerText.includes('medication')) {
      this.chatUI.addAssistantMessage(
        'I can help you add a medication. Please provide the medication name, dosage, frequency, and prescribing physician. ' +
        'For example: "Add Aspirin 81mg once daily prescribed by Dr. Smith"'
      );
    } else if (lowerText.includes('add') && lowerText.includes('allerg')) {
      this.chatUI.addAssistantMessage(
        'I can help you add an allergy. Please provide the allergen, severity (mild/moderate/severe/life-threatening), and reaction. ' +
        'For example: "Add peanut allergy, severe severity, causes hives and difficulty breathing"'
      );
    } else {
      // Default response with available tools
      this.chatUI.addAssistantMessage(
        `I can help you with the following medical tasks:\n\n` +
        `• List current medications\n` +
        `• List all medications\n` +
        `• Show patient allergies\n` +
        `• Get patient summary\n` +
        `• Add new medications\n` +
        `• Add new allergies\n\n` +
        `What would you like to do?`
      );
    }
  }

  private async callTool(toolName: string, parameters: any): Promise<void> {
    const tool = this.availableTools.find(t => t.name === toolName);
    if (!tool) {
      this.chatUI.addAssistantMessage(`Tool "${toolName}" is not available.`);
      return;
    }

    const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create assistant message with tool call
    const assistantMessage = this.chatUI.addAssistantMessage(`I'll help you with that. Let me ${tool.description.toLowerCase()}.`);
    
    const toolCall: ToolCall = {
      id: callId,
      name: toolName,
      parameters,
      status: 'pending'
    };

    this.chatUI.addToolCall(assistantMessage.id, toolCall);
    this.pendingToolCalls.set(callId, { messageId: assistantMessage.id, toolCall });

    // Send tool call request to parent
    const request = {
      type: 'MCP_TOOL_CALL_REQUEST' as const,
      protocolVersion: '1.0' as const,
      sessionId: this.sessionId,
      callId,
      toolName,
      parameters
    };

    this.sendToParent(request);
  }

  private generateAssistantResponse(toolCall: ToolCall, result: any): void {
    let response = '';

    switch (toolCall.name) {
      case 'list_medications':
        if (result.medications && result.medications.length > 0) {
          response = `Found ${result.medications.length} medications:\n\n`;
          result.medications.forEach((med: any) => {
            response += `• **${med.name}** ${med.dosage} - ${med.frequency}\n`;
            response += `  Prescribed by ${med.prescribedBy} on ${med.startDate}\n`;
            if (med.status !== 'active') response += `  Status: ${med.status}\n`;
            response += '\n';
          });
        } else {
          response = 'No medications found for this patient.';
        }
        break;

      case 'list_allergies':
        if (result.allergies && result.allergies.length > 0) {
          response = `Found ${result.allergies.length} allergies:\n\n`;
          result.allergies.forEach((allergy: any) => {
            response += `• **${allergy.allergen}** (${allergy.severity})\n`;
            response += `  Reaction: ${allergy.reaction}\n`;
            response += `  Diagnosed: ${allergy.diagnosedDate}\n\n`;
          });
        } else {
          response = 'No known allergies for this patient.';
        }
        break;

      case 'add_medication':
        if (result.success) {
          response = `✅ Successfully added **${result.medication.name}** to the patient's medication list.`;
        }
        break;

      case 'add_allergy':
        if (result.success) {
          response = `✅ Successfully added **${result.allergy.allergen}** allergy to the patient's record.`;
        }
        break;

      case 'get_patient_summary':
        if (result.patient) {
          response = `## Patient Summary\n\n`;
          response += `**Name:** ${result.patient.name}\n`;
          response += `**Age:** ${result.patient.age}\n`;
          response += `**MRN:** ${result.patient.medicalRecordNumber}\n`;
          response += `**Active Medications:** ${result.patient.activeMedications}\n`;
          response += `**Known Allergies:** ${result.patient.allergies}\n\n`;
          
          if (result.medications && result.medications.length > 0) {
            response += `### Current Medications\n`;
            result.medications.filter((med: any) => med.status === 'active').forEach((med: any) => {
              response += `• ${med.name} ${med.dosage} - ${med.frequency}\n`;
            });
            response += '\n';
          }
          
          if (result.allergies && result.allergies.length > 0) {
            response += `### Known Allergies\n`;
            result.allergies.forEach((allergy: any) => {
              response += `• ${allergy.allergen} (${allergy.severity})\n`;
            });
          }
        }
        break;

      default:
        response = `Tool ${toolCall.name} executed successfully.`;
    }

    if (response) {
      this.chatUI.addAssistantMessage(response);
    }
  }

  private sendToParent(message: any): void {
    window.parent.postMessage(message, '*');
  }
}

// Initialize the client when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new MCPPostMessageClient();
});