/**
 * Medical MCP Server Implementation (Parent Page)
 * 
 * This file implements the MCP server that runs in the parent page and provides
 * medical tools to the embedded iframe client.
 */

import type {
  MCPPostMessageType,
  ClientHandshakeMessage,
  ConnectionEstablishedMessage,
  ToolCallRequestMessage,
  ServerStatusMessage,
  StartSimulationMessage,
  SimulationStepCompleteMessage
} from '../shared/protocol.js';
import {
  isMCPPostMessage,
  isClientHandshake,
  isConnectionEstablished,
  isToolCallRequest,
  isSimulationStepComplete
} from '../shared/protocol.js';
import { PatientDataManager } from './patient-data.js';
import { MedicalTools } from './medical-tools.js';
import type { Patient, SimulationStep } from '../shared/types.js';

/**
 * MCP Server implementation using PostMessage transport
 */
export class MCPPostMessageServer {
  private patientData: PatientDataManager;
  private medicalTools: MedicalTools;
  private iframe: HTMLIFrameElement | null = null;
  private sessionId: string | null = null;
  private isConnected = false;
  private simulationSteps: SimulationStep[] = [];
  private currentSimulationStep = 0;
  private isSimulationRunning = false;

  // UI elements
  private patientInfoEl: HTMLElement | null = null;
  private medicationsEl: HTMLElement | null = null;
  private allergiesEl: HTMLElement | null = null;
  private historyEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;

  constructor() {
    this.patientData = new PatientDataManager();
    this.medicalTools = new MedicalTools(this.patientData);
    this.setupEventListeners();
    this.setupUI();
    this.initializeSimulation();
  }

  private setupEventListeners(): void {
    // Listen for postMessage from iframe
    window.addEventListener('message', this.handleMessage.bind(this));

    // Subscribe to patient data changes
    this.patientData.subscribe(this.updatePatientDisplay.bind(this));
  }

  private setupUI(): void {
    // Find UI elements
    this.patientInfoEl = document.getElementById('patient-info');
    this.medicationsEl = document.getElementById('medications-list');
    this.allergiesEl = document.getElementById('allergies-list');
    this.historyEl = document.getElementById('medical-history');
    this.statusEl = document.getElementById('connection-status');

    // Setup iframe
    this.iframe = document.getElementById('mcp-client-iframe') as HTMLIFrameElement;
    if (this.iframe) {
      this.iframe.addEventListener('load', this.onIframeLoad.bind(this));
    }

    // Setup simulation button
    const simButton = document.getElementById('run-simulation-btn');
    if (simButton) {
      simButton.addEventListener('click', this.startSimulation.bind(this));
    }

    // Initial patient display
    this.updatePatientDisplay(this.patientData.getPatient());
    this.updateStatus('waiting', 'Waiting for client connection...');
  }

  private onIframeLoad(): void {
    console.log('Iframe loaded, waiting for handshake...');
    this.updateStatus('waiting', 'Iframe loaded, waiting for client handshake...');
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    // Validate origin - in a real app, you'd want to be more restrictive
    if (!event.origin.includes('localhost') && !event.origin.includes('127.0.0.1')) {
      console.warn('Rejected message from invalid origin:', event.origin);
      return;
    }

    if (!isMCPPostMessage(event.data)) {
      return; // Ignore non-protocol messages
    }

    const message = event.data as MCPPostMessageType;
    console.log('Received message:', message);

    try {
      if (isClientHandshake(message)) {
        await this.handleClientHandshake(message);
      } else if (isConnectionEstablished(message)) {
        await this.handleConnectionEstablished(message);
      } else if (isToolCallRequest(message)) {
        await this.handleToolCall(message);
      } else if (isSimulationStepComplete(message)) {
        await this.handleSimulationStepComplete(message);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.updateStatus('error', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleClientHandshake(message: ClientHandshakeMessage): Promise<void> {
    this.sessionId = message.sessionId;
    
    const response = {
      type: 'MCP_SERVER_HANDSHAKE_REPLY' as const,
      protocolVersion: '1.0' as const,
      sessionId: this.sessionId,
      serverInfo: {
        name: 'Medical MCP Server',
        version: '1.0.0',
        description: 'Provides medical tools for patient data management'
      },
      tools: this.medicalTools.getToolDefinitions()
    };

    this.sendToIframe(response);
    this.updateStatus('handshake', 'Sent server handshake reply');
  }

  private async handleConnectionEstablished(message: ConnectionEstablishedMessage): Promise<void> {
    if (message.sessionId !== this.sessionId) {
      throw new Error('Session ID mismatch');
    }

    this.isConnected = true;
    this.updateStatus('connected', 'Connection established successfully');
    
    // Send initial patient summary
    setTimeout(() => {
      this.sendStatusMessage('ready', 'Server ready to process tool calls');
    }, 500);
  }

  private async handleToolCall(message: ToolCallRequestMessage): Promise<void> {
    if (!this.isConnected || message.sessionId !== this.sessionId) {
      throw new Error('Invalid session or not connected');
    }

    this.updateStatus('processing', `Executing tool: ${message.toolName}`);

    try {
      const result = await this.medicalTools.executeTool(message.toolName, message.parameters);
      
      const response = {
        type: 'MCP_TOOL_CALL_RESPONSE' as const,
        protocolVersion: '1.0' as const,
        sessionId: this.sessionId,
        callId: message.callId,
        success: true,
        result
      };

      this.sendToIframe(response);
      this.updateStatus('connected', `Tool ${message.toolName} executed successfully`);
    } catch (error) {
      const response = {
        type: 'MCP_TOOL_CALL_RESPONSE' as const,
        protocolVersion: '1.0' as const,
        sessionId: this.sessionId,
        callId: message.callId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      this.sendToIframe(response);
      this.updateStatus('error', `Tool ${message.toolName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleSimulationStepComplete(message: SimulationStepCompleteMessage): Promise<void> {
    if (!this.isSimulationRunning) return;

    console.log(`Simulation step ${message.stepIndex} completed:`, message.success);
    
    // Move to next step
    this.currentSimulationStep++;
    
    if (this.currentSimulationStep < this.simulationSteps.length) {
      // Continue simulation
      setTimeout(() => {
        this.executeSimulationStep(this.currentSimulationStep);
      }, 2000); // 2 second delay between steps
    } else {
      // Simulation complete
      this.isSimulationRunning = false;
      this.updateStatus('connected', 'Simulation completed successfully');
      console.log('Simulation completed');
    }
  }

  private sendToIframe(message: any): void {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage(message, '*');
    }
  }

  private sendStatusMessage(status: 'ready' | 'busy' | 'error', message?: string): void {
    if (!this.isConnected || !this.sessionId) return;

    const statusMessage: ServerStatusMessage = {
      type: 'MCP_SERVER_STATUS',
      protocolVersion: '1.0',
      sessionId: this.sessionId,
      status,
      message
    };

    this.sendToIframe(statusMessage);
  }

  private updateStatus(status: string, message: string): void {
    if (this.statusEl) {
      this.statusEl.innerHTML = `
        <div class="status-indicator ${status}">
          <strong>Status:</strong> ${message}
        </div>
      `;
    }
    console.log(`[Status] ${status}: ${message}`);
  }

  private updatePatientDisplay(patient: Patient): void {
    this.updatePatientInfo(patient);
    this.updateMedicationsList(patient);
    this.updateAllergiesList(patient);
    this.updateMedicalHistory(patient);
  }

  private updatePatientInfo(patient: Patient): void {
    if (!this.patientInfoEl) return;

    const activeMeds = patient.medications.filter(med => med.status === 'active').length;
    
    this.patientInfoEl.innerHTML = `
      <h3>Patient Information</h3>
      <div class="patient-details">
        <p><strong>Name:</strong> ${patient.name}</p>
        <p><strong>Age:</strong> ${patient.age}</p>
        <p><strong>MRN:</strong> ${patient.medicalRecordNumber}</p>
        <p><strong>Active Medications:</strong> ${activeMeds}</p>
        <p><strong>Known Allergies:</strong> ${patient.allergies.length}</p>
      </div>
    `;
  }

  private updateMedicationsList(patient: Patient): void {
    if (!this.medicationsEl) return;

    const activeMeds = patient.medications.filter(med => med.status === 'active');
    const inactiveMeds = patient.medications.filter(med => med.status !== 'active');

    this.medicationsEl.innerHTML = `
      <h4>Current Medications (${activeMeds.length})</h4>
      ${activeMeds.length === 0 ? '<p class="no-data">No active medications</p>' : ''}
      ${activeMeds.map(med => `
        <div class="medication-item active">
          <div class="med-header">
            <strong>${med.name}</strong> - ${med.dosage}
            <span class="med-id">(ID: ${med.id})</span>
          </div>
          <div class="med-details">
            <p><strong>Frequency:</strong> ${med.frequency}</p>
            <p><strong>Prescribed by:</strong> ${med.prescribedBy}</p>
            <p><strong>Start Date:</strong> ${med.startDate}</p>
            ${med.notes ? `<p><strong>Notes:</strong> ${med.notes}</p>` : ''}
          </div>
        </div>
      `).join('')}
      
      ${inactiveMeds.length > 0 ? `
        <h4>Previous Medications (${inactiveMeds.length})</h4>
        ${inactiveMeds.map(med => `
          <div class="medication-item ${med.status}">
            <div class="med-header">
              <strong>${med.name}</strong> - ${med.dosage}
              <span class="status-badge ${med.status}">${med.status}</span>
            </div>
            <div class="med-details">
              <p><strong>Period:</strong> ${med.startDate} - ${med.endDate || 'ongoing'}</p>
              <p><strong>Prescribed by:</strong> ${med.prescribedBy}</p>
              ${med.notes ? `<p><strong>Notes:</strong> ${med.notes}</p>` : ''}
            </div>
          </div>
        `).join('')}
      ` : ''}
    `;
  }

  private updateAllergiesList(patient: Patient): void {
    if (!this.allergiesEl) return;

    this.allergiesEl.innerHTML = `
      <h4>Known Allergies (${patient.allergies.length})</h4>
      ${patient.allergies.length === 0 ? '<p class="no-data">No known allergies</p>' : ''}
      ${patient.allergies.map(allergy => `
        <div class="allergy-item severity-${allergy.severity}">
          <div class="allergy-header">
            <strong>${allergy.allergen}</strong>
            <span class="severity-badge ${allergy.severity}">${allergy.severity}</span>
          </div>
          <div class="allergy-details">
            <p><strong>Reaction:</strong> ${allergy.reaction}</p>
            <p><strong>Diagnosed:</strong> ${allergy.diagnosedDate}</p>
            ${allergy.notes ? `<p><strong>Notes:</strong> ${allergy.notes}</p>` : ''}
          </div>
        </div>
      `).join('')}
    `;
  }

  private updateMedicalHistory(patient: Patient): void {
    if (!this.historyEl) return;

    const recentHistory = patient.medicalHistory.slice(0, 10);

    this.historyEl.innerHTML = `
      <h4>Recent Medical History (${recentHistory.length}/${patient.medicalHistory.length})</h4>
      ${recentHistory.length === 0 ? '<p class="no-data">No medical history</p>' : ''}
      ${recentHistory.map(entry => `
        <div class="history-item">
          <div class="history-header">
            <span class="history-date">${entry.date}</span>
            <span class="history-type ${entry.type}">${entry.type.replace('_', ' ')}</span>
          </div>
          <p class="history-description">${entry.description}</p>
          <p class="history-performer">by ${entry.performedBy}</p>
        </div>
      `).join('')}
    `;
  }

  // ============================================================================
  // SIMULATION
  // ============================================================================

  private initializeSimulation(): void {
    this.simulationSteps = [
      {
        type: 'user_message',
        message: 'Hello! I need help managing my patient\'s medications. Can you show me what medications John Doe is currently taking?',
        delay: 1000
      },
      {
        type: 'tool_call',
        tool: 'list_medications',
        parameters: { status: 'active' },
        delay: 2000
      },
      {
        type: 'user_message',
        message: 'I need to add a new medication. Please add Aspirin 81mg once daily prescribed by Dr. Wilson for cardiovascular protection.',
        delay: 2000
      },
      {
        type: 'tool_call',
        tool: 'add_medication',
        parameters: {
          name: 'Aspirin',
          dosage: '81mg',
          frequency: 'Once daily',
          prescribedBy: 'Dr. Wilson',
          notes: 'For cardiovascular protection'
        },
        delay: 3000
      },
      {
        type: 'user_message',
        message: 'The patient mentioned they have a shellfish allergy. Please add this to their record as a severe allergy.',
        delay: 2000
      },
      {
        type: 'tool_call',
        tool: 'add_allergy',
        parameters: {
          allergen: 'Shellfish',
          severity: 'severe',
          reaction: 'Hives and swelling',
          notes: 'Avoid all shellfish and products containing shellfish'
        },
        delay: 3000
      },
      {
        type: 'user_message',
        message: 'Let me get a complete patient summary to review all changes.',
        delay: 2000
      },
      {
        type: 'tool_call',
        tool: 'get_patient_summary',
        parameters: {},
        delay: 2000
      }
    ];
  }

  private startSimulation(): void {
    if (this.isSimulationRunning) return;
    if (!this.isConnected) {
      alert('Please wait for the client to connect before starting simulation');
      return;
    }

    console.log('Starting simulation...');
    this.isSimulationRunning = true;
    this.currentSimulationStep = 0;
    this.updateStatus('simulation', 'Running automated demo simulation...');

    const startMessage: StartSimulationMessage = {
      type: 'MCP_START_SIMULATION',
      protocolVersion: '1.0',
      sessionId: this.sessionId!,
      scenario: 'medical_demo'
    };

    this.sendToIframe(startMessage);
    
    // Start first step after a short delay
    setTimeout(() => {
      this.executeSimulationStep(0);
    }, 1000);
  }

  private executeSimulationStep(stepIndex: number): void {
    if (stepIndex >= this.simulationSteps.length) {
      this.isSimulationRunning = false;
      return;
    }

    const step = this.simulationSteps[stepIndex];
    console.log(`Executing simulation step ${stepIndex}:`, step);

    // Send step to iframe for execution
    this.sendToIframe({
      type: 'MCP_SIMULATION_STEP',
      protocolVersion: '1.0',
      sessionId: this.sessionId!,
      stepIndex,
      step
    });
  }
}

// Initialize the server when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new MCPPostMessageServer();
});