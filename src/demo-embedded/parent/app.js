// ../shared/protocol.ts
function isInvertedMessage(data) {
  return data && typeof data === "object" && typeof data.type === "string" && data.type.startsWith("INVERTED_") && data.protocolVersion === "1.0";
}
function isClientHandshake(msg) {
  return msg.type === "INVERTED_CLIENT_HANDSHAKE";
}
function isConnectionEstablished(msg) {
  return msg.type === "INVERTED_CONNECTION_ESTABLISHED";
}
function isToolCallRequest(msg) {
  return msg.type === "INVERTED_TOOL_CALL_REQUEST";
}
function isSimulationStepComplete(msg) {
  return msg.type === "INVERTED_SIMULATION_STEP_COMPLETE";
}

// patient-data.ts
var initialPatient = {
  id: "patient-001",
  name: "John Doe",
  age: 45,
  medicalRecordNumber: "MRN-123456",
  medications: [
    {
      id: "med-001",
      name: "Lisinopril",
      dosage: "10mg",
      frequency: "Once daily",
      startDate: "2023-01-15",
      status: "active",
      prescribedBy: "Dr. Smith",
      notes: "For blood pressure management"
    },
    {
      id: "med-002",
      name: "Metformin",
      dosage: "500mg",
      frequency: "Twice daily with meals",
      startDate: "2023-03-10",
      status: "active",
      prescribedBy: "Dr. Johnson",
      notes: "For diabetes management"
    }
  ],
  allergies: [
    {
      id: "allergy-001",
      allergen: "Penicillin",
      severity: "severe",
      reaction: "Anaphylaxis",
      diagnosedDate: "2020-05-15",
      notes: "Discovered during strep throat treatment"
    }
  ],
  medicalHistory: [
    {
      id: "history-001",
      date: "2023-01-15",
      type: "medication_added",
      description: "Added Lisinopril 10mg once daily for blood pressure management",
      performedBy: "Dr. Smith"
    },
    {
      id: "history-002",
      date: "2023-03-10",
      type: "medication_added",
      description: "Added Metformin 500mg twice daily for diabetes management",
      performedBy: "Dr. Johnson"
    }
  ]
};

class PatientDataManager {
  patient;
  listeners = [];
  constructor(initialData = initialPatient) {
    this.patient = JSON.parse(JSON.stringify(initialData));
  }
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  notifyListeners() {
    this.listeners.forEach((listener) => listener(this.patient));
  }
  addHistoryEntry(entry) {
    const historyEntry = {
      id: `history-${Date.now()}`,
      ...entry
    };
    this.patient.medicalHistory.unshift(historyEntry);
  }
  getPatient() {
    return JSON.parse(JSON.stringify(this.patient));
  }
  generateId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  getCurrentDate() {
    return new Date().toISOString().split("T")[0];
  }
  addMedication(params) {
    try {
      if (!params.name?.trim()) {
        return { success: false, message: "Medication name is required" };
      }
      if (!params.dosage?.trim()) {
        return { success: false, message: "Dosage is required" };
      }
      if (!params.frequency?.trim()) {
        return { success: false, message: "Frequency is required" };
      }
      if (!params.prescribedBy?.trim()) {
        return { success: false, message: "Prescribing physician is required" };
      }
      const existingMed = this.patient.medications.find((med) => med.name.toLowerCase() === params.name.toLowerCase() && med.status === "active");
      if (existingMed) {
        return { success: false, message: `Patient is already taking ${params.name}` };
      }
      const medication = {
        id: this.generateId("med"),
        name: params.name.trim(),
        dosage: params.dosage.trim(),
        frequency: params.frequency.trim(),
        startDate: this.getCurrentDate(),
        status: "active",
        prescribedBy: params.prescribedBy.trim(),
        notes: params.notes?.trim()
      };
      this.patient.medications.push(medication);
      this.addHistoryEntry({
        date: this.getCurrentDate(),
        type: "medication_added",
        description: `Added ${medication.name} ${medication.dosage} ${medication.frequency}`,
        performedBy: medication.prescribedBy
      });
      this.notifyListeners();
      return {
        success: true,
        message: `Successfully added ${medication.name} to patient's medication list`,
        medication
      };
    } catch (error) {
      return {
        success: false,
        message: `Error adding medication: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
  editMedication(params) {
    try {
      const medIndex = this.patient.medications.findIndex((med) => med.id === params.medicationId);
      if (medIndex === -1) {
        return { success: false, message: "Medication not found" };
      }
      const medication = this.patient.medications[medIndex];
      if (medication.status !== "active") {
        return { success: false, message: "Cannot edit discontinued or completed medication" };
      }
      const changes = [];
      if (params.name && params.name !== medication.name) {
        changes.push(`name from "${medication.name}" to "${params.name}"`);
        medication.name = params.name;
      }
      if (params.dosage && params.dosage !== medication.dosage) {
        changes.push(`dosage from "${medication.dosage}" to "${params.dosage}"`);
        medication.dosage = params.dosage;
      }
      if (params.frequency && params.frequency !== medication.frequency) {
        changes.push(`frequency from "${medication.frequency}" to "${params.frequency}"`);
        medication.frequency = params.frequency;
      }
      if (params.notes !== undefined && params.notes !== medication.notes) {
        changes.push(`notes`);
        medication.notes = params.notes;
      }
      if (changes.length === 0) {
        return { success: false, message: "No changes specified" };
      }
      this.addHistoryEntry({
        date: this.getCurrentDate(),
        type: "medication_edited",
        description: `Modified ${medication.name}: ${changes.join(", ")}`,
        performedBy: "System User"
      });
      this.notifyListeners();
      return {
        success: true,
        message: `Successfully updated ${medication.name}`,
        medication
      };
    } catch (error) {
      return {
        success: false,
        message: `Error editing medication: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
  discontinueMedication(params) {
    try {
      const medIndex = this.patient.medications.findIndex((med) => med.id === params.medicationId);
      if (medIndex === -1) {
        return { success: false, message: "Medication not found" };
      }
      const medication = this.patient.medications[medIndex];
      if (medication.status !== "active") {
        return { success: false, message: "Medication is already discontinued or completed" };
      }
      medication.status = "discontinued";
      medication.endDate = this.getCurrentDate();
      medication.notes = medication.notes ? `${medication.notes}

Discontinued: ${params.reason}` : `Discontinued: ${params.reason}`;
      this.addHistoryEntry({
        date: this.getCurrentDate(),
        type: "medication_discontinued",
        description: `Discontinued ${medication.name} - ${params.reason}`,
        performedBy: "System User"
      });
      this.notifyListeners();
      return {
        success: true,
        message: `Successfully discontinued ${medication.name}`,
        medication
      };
    } catch (error) {
      return {
        success: false,
        message: `Error discontinuing medication: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
  deleteMedication(params) {
    try {
      const medIndex = this.patient.medications.findIndex((med) => med.id === params.medicationId);
      if (medIndex === -1) {
        return { success: false, message: "Medication not found" };
      }
      const medication = this.patient.medications[medIndex];
      this.addHistoryEntry({
        date: this.getCurrentDate(),
        type: "medication_deleted",
        description: `Deleted ${medication.name} ${medication.dosage} - ${params.reason}`,
        performedBy: "System User"
      });
      this.patient.medications.splice(medIndex, 1);
      this.notifyListeners();
      return {
        success: true,
        message: `Successfully deleted ${medication.name} from patient's record`
      };
    } catch (error) {
      return {
        success: false,
        message: `Error deleting medication: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
  addAllergy(params) {
    try {
      if (!params.allergen?.trim()) {
        return { success: false, message: "Allergen name is required" };
      }
      if (!params.reaction?.trim()) {
        return { success: false, message: "Reaction description is required" };
      }
      const existingAllergy = this.patient.allergies.find((allergy2) => allergy2.allergen.toLowerCase() === params.allergen.toLowerCase());
      if (existingAllergy) {
        return { success: false, message: `Allergy to ${params.allergen} is already recorded` };
      }
      const allergy = {
        id: this.generateId("allergy"),
        allergen: params.allergen.trim(),
        severity: params.severity,
        reaction: params.reaction.trim(),
        diagnosedDate: this.getCurrentDate(),
        notes: params.notes?.trim()
      };
      this.patient.allergies.push(allergy);
      this.addHistoryEntry({
        date: this.getCurrentDate(),
        type: "allergy_added",
        description: `Added allergy to ${allergy.allergen} (${allergy.severity} severity)`,
        performedBy: "System User"
      });
      this.notifyListeners();
      return {
        success: true,
        message: `Successfully added allergy to ${allergy.allergen}`,
        allergy
      };
    } catch (error) {
      return {
        success: false,
        message: `Error adding allergy: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
}

// medical-tools.ts
class MedicalTools {
  patientData;
  constructor(patientData) {
    this.patientData = patientData;
  }
  getToolDefinitions() {
    return [
      {
        name: "add_medication",
        description: "Add a new medication to the patient's medication list",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the medication. Example: Lisinopril"
            },
            dosage: {
              type: "string",
              description: "Dosage of the medication. Example: 10mg"
            },
            frequency: {
              type: "string",
              description: "Frequency of administration. Example: Once daily"
            },
            prescribedBy: {
              type: "string",
              description: "Name of the prescribing physician. Example: Dr. Smith"
            },
            notes: {
              type: "string",
              description: "Optional notes about the medication. Example: Take with food"
            }
          },
          required: ["name", "dosage", "frequency", "prescribedBy"]
        }
      },
      {
        name: "edit_medication",
        description: "Edit an existing medication in the patient's medication list",
        inputSchema: {
          type: "object",
          properties: {
            medicationId: {
              type: "string",
              description: "ID of the medication to edit. Example: med-001"
            },
            name: {
              type: "string",
              description: "New name of the medication. Example: Lisinopril"
            },
            dosage: {
              type: "string",
              description: "New dosage of the medication. Example: 20mg"
            },
            frequency: {
              type: "string",
              description: "New frequency of administration. Example: Twice daily"
            },
            notes: {
              type: "string",
              description: "New notes about the medication. Example: Take with food"
            }
          },
          required: ["medicationId"]
        }
      },
      {
        name: "discontinue_medication",
        description: "Discontinue an active medication for the patient",
        inputSchema: {
          type: "object",
          properties: {
            medicationId: {
              type: "string",
              description: "ID of the medication to discontinue. Example: med-001"
            },
            reason: {
              type: "string",
              description: "Reason for discontinuing the medication. Example: Side effects"
            }
          },
          required: ["medicationId", "reason"]
        }
      },
      {
        name: "delete_medication",
        description: "Permanently delete a medication from the patient's record",
        inputSchema: {
          type: "object",
          properties: {
            medicationId: {
              type: "string",
              description: "ID of the medication to delete. Example: med-001"
            },
            reason: {
              type: "string",
              description: "Reason for deleting the medication. Example: Entered in error"
            }
          },
          required: ["medicationId", "reason"]
        }
      },
      {
        name: "add_allergy",
        description: "Add a new allergy to the patient's allergy list",
        inputSchema: {
          type: "object",
          properties: {
            allergen: {
              type: "string",
              description: "Name of the allergen. Example: Peanuts"
            },
            severity: {
              type: "string",
              enum: ["mild", "moderate", "severe", "life-threatening"],
              description: "Severity of the allergic reaction. Example: severe"
            },
            reaction: {
              type: "string",
              description: "Description of the allergic reaction. Example: Hives and difficulty breathing"
            },
            notes: {
              type: "string",
              description: "Optional notes about the allergy. Example: Avoid all tree nuts"
            }
          },
          required: ["allergen", "severity", "reaction"]
        }
      },
      {
        name: "get_patient_summary",
        description: "Get a comprehensive summary of the current patient's medical information",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "list_medications",
        description: "List all medications for the current patient",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["active", "discontinued", "completed", "all"],
              description: "Filter medications by status. Example: active"
            }
          },
          required: []
        }
      },
      {
        name: "list_allergies",
        description: "List all allergies for the current patient",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      }
    ];
  }
  async executeTool(toolName, parameters) {
    try {
      switch (toolName) {
        case "add_medication":
          return this.addMedication(parameters);
        case "edit_medication":
          return this.editMedication(parameters);
        case "discontinue_medication":
          return this.discontinueMedication(parameters);
        case "delete_medication":
          return this.deleteMedication(parameters);
        case "add_allergy":
          return this.addAllergy(parameters);
        case "get_patient_summary":
          return this.getPatientSummary();
        case "list_medications":
          return this.listMedications(parameters?.status);
        case "list_allergies":
          return this.listAllergies();
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      throw error;
    }
  }
  addMedication(params) {
    const result = this.patientData.addMedication(params);
    if (result.success) {
      return {
        success: true,
        message: result.message,
        medication: result.medication,
        patientSummary: this.getBasicPatientInfo()
      };
    } else {
      throw new Error(result.message);
    }
  }
  editMedication(params) {
    const result = this.patientData.editMedication(params);
    if (result.success) {
      return {
        success: true,
        message: result.message,
        medication: result.medication,
        patientSummary: this.getBasicPatientInfo()
      };
    } else {
      throw new Error(result.message);
    }
  }
  discontinueMedication(params) {
    const result = this.patientData.discontinueMedication(params);
    if (result.success) {
      return {
        success: true,
        message: result.message,
        medication: result.medication,
        patientSummary: this.getBasicPatientInfo()
      };
    } else {
      throw new Error(result.message);
    }
  }
  deleteMedication(params) {
    const result = this.patientData.deleteMedication(params);
    if (result.success) {
      return {
        success: true,
        message: result.message,
        patientSummary: this.getBasicPatientInfo()
      };
    } else {
      throw new Error(result.message);
    }
  }
  addAllergy(params) {
    const result = this.patientData.addAllergy(params);
    if (result.success) {
      return {
        success: true,
        message: result.message,
        allergy: result.allergy,
        patientSummary: this.getBasicPatientInfo()
      };
    } else {
      throw new Error(result.message);
    }
  }
  getPatientSummary() {
    const patient = this.patientData.getPatient();
    return {
      patient: {
        name: patient.name,
        age: patient.age,
        medicalRecordNumber: patient.medicalRecordNumber,
        activeMedications: patient.medications.filter((med) => med.status === "active").length,
        totalMedications: patient.medications.length,
        allergies: patient.allergies.length,
        recentHistoryEntries: patient.medicalHistory.slice(0, 5)
      },
      medications: patient.medications,
      allergies: patient.allergies,
      medicalHistory: patient.medicalHistory
    };
  }
  listMedications(status) {
    const patient = this.patientData.getPatient();
    let medications = patient.medications;
    if (status && status !== "all") {
      medications = medications.filter((med) => med.status === status);
    }
    return {
      medications,
      count: medications.length,
      filterApplied: status || "all"
    };
  }
  listAllergies() {
    const patient = this.patientData.getPatient();
    return {
      allergies: patient.allergies,
      count: patient.allergies.length
    };
  }
  getBasicPatientInfo() {
    const patient = this.patientData.getPatient();
    return {
      name: patient.name,
      age: patient.age,
      medicalRecordNumber: patient.medicalRecordNumber,
      activeMedications: patient.medications.filter((med) => med.status === "active").length,
      allergies: patient.allergies.length
    };
  }
}

// app.ts
class InvertedMCPServer {
  patientData;
  medicalTools;
  iframe = null;
  sessionId = null;
  isConnected = false;
  simulationSteps = [];
  currentSimulationStep = 0;
  isSimulationRunning = false;
  patientInfoEl = null;
  medicationsEl = null;
  allergiesEl = null;
  historyEl = null;
  statusEl = null;
  constructor() {
    this.patientData = new PatientDataManager;
    this.medicalTools = new MedicalTools(this.patientData);
    this.setupEventListeners();
    this.setupUI();
    this.initializeSimulation();
  }
  setupEventListeners() {
    window.addEventListener("message", this.handleMessage.bind(this));
    this.patientData.subscribe(this.updatePatientDisplay.bind(this));
  }
  setupUI() {
    this.patientInfoEl = document.getElementById("patient-info");
    this.medicationsEl = document.getElementById("medications-list");
    this.allergiesEl = document.getElementById("allergies-list");
    this.historyEl = document.getElementById("medical-history");
    this.statusEl = document.getElementById("connection-status");
    this.iframe = document.getElementById("mcp-client-iframe");
    if (this.iframe) {
      this.iframe.addEventListener("load", this.onIframeLoad.bind(this));
    }
    const simButton = document.getElementById("run-simulation-btn");
    if (simButton) {
      simButton.addEventListener("click", this.startSimulation.bind(this));
    }
    this.updatePatientDisplay(this.patientData.getPatient());
    this.updateStatus("waiting", "Waiting for client connection...");
  }
  onIframeLoad() {
    console.log("Iframe loaded, waiting for handshake...");
    this.updateStatus("waiting", "Iframe loaded, waiting for client handshake...");
  }
  async handleMessage(event) {
    if (!event.origin.includes("localhost") && !event.origin.includes("127.0.0.1")) {
      console.warn("Rejected message from invalid origin:", event.origin);
      return;
    }
    if (!isInvertedMessage(event.data)) {
      return;
    }
    const message = event.data;
    console.log("Received message:", message);
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
      console.error("Error handling message:", error);
      this.updateStatus("error", `Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  async handleClientHandshake(message) {
    this.sessionId = message.sessionId;
    const response = {
      type: "INVERTED_SERVER_HANDSHAKE_REPLY",
      protocolVersion: "1.0",
      sessionId: this.sessionId,
      serverInfo: {
        name: "Medical MCP Server",
        version: "1.0.0",
        description: "Provides medical tools for patient data management"
      },
      tools: this.medicalTools.getToolDefinitions()
    };
    this.sendToIframe(response);
    this.updateStatus("handshake", "Sent server handshake reply");
  }
  async handleConnectionEstablished(message) {
    if (message.sessionId !== this.sessionId) {
      throw new Error("Session ID mismatch");
    }
    this.isConnected = true;
    this.updateStatus("connected", "Connection established successfully");
    setTimeout(() => {
      this.sendStatusMessage("ready", "Server ready to process tool calls");
    }, 500);
  }
  async handleToolCall(message) {
    if (!this.isConnected || message.sessionId !== this.sessionId) {
      throw new Error("Invalid session or not connected");
    }
    this.updateStatus("processing", `Executing tool: ${message.toolName}`);
    try {
      const result = await this.medicalTools.executeTool(message.toolName, message.parameters);
      const response = {
        type: "INVERTED_TOOL_CALL_RESPONSE",
        protocolVersion: "1.0",
        sessionId: this.sessionId,
        callId: message.callId,
        success: true,
        result
      };
      this.sendToIframe(response);
      this.updateStatus("connected", `Tool ${message.toolName} executed successfully`);
    } catch (error) {
      const response = {
        type: "INVERTED_TOOL_CALL_RESPONSE",
        protocolVersion: "1.0",
        sessionId: this.sessionId,
        callId: message.callId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
      this.sendToIframe(response);
      this.updateStatus("error", `Tool ${message.toolName} failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  async handleSimulationStepComplete(message) {
    if (!this.isSimulationRunning)
      return;
    console.log(`Simulation step ${message.stepIndex} completed:`, message.success);
    this.currentSimulationStep++;
    if (this.currentSimulationStep < this.simulationSteps.length) {
      setTimeout(() => {
        this.executeSimulationStep(this.currentSimulationStep);
      }, 2000);
    } else {
      this.isSimulationRunning = false;
      this.updateStatus("connected", "Simulation completed successfully");
      console.log("Simulation completed");
    }
  }
  sendToIframe(message) {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage(message, "*");
    }
  }
  sendStatusMessage(status, message) {
    if (!this.isConnected || !this.sessionId)
      return;
    const statusMessage = {
      type: "INVERTED_SERVER_STATUS",
      protocolVersion: "1.0",
      sessionId: this.sessionId,
      status,
      message
    };
    this.sendToIframe(statusMessage);
  }
  updateStatus(status, message) {
    if (this.statusEl) {
      this.statusEl.innerHTML = `
        <div class="status-indicator ${status}">
          <strong>Status:</strong> ${message}
        </div>
      `;
    }
    console.log(`[Status] ${status}: ${message}`);
  }
  updatePatientDisplay(patient) {
    this.updatePatientInfo(patient);
    this.updateMedicationsList(patient);
    this.updateAllergiesList(patient);
    this.updateMedicalHistory(patient);
  }
  updatePatientInfo(patient) {
    if (!this.patientInfoEl)
      return;
    const activeMeds = patient.medications.filter((med) => med.status === "active").length;
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
  updateMedicationsList(patient) {
    if (!this.medicationsEl)
      return;
    const activeMeds = patient.medications.filter((med) => med.status === "active");
    const inactiveMeds = patient.medications.filter((med) => med.status !== "active");
    this.medicationsEl.innerHTML = `
      <h4>Current Medications (${activeMeds.length})</h4>
      ${activeMeds.length === 0 ? '<p class="no-data">No active medications</p>' : ""}
      ${activeMeds.map((med) => `
        <div class="medication-item active">
          <div class="med-header">
            <strong>${med.name}</strong> - ${med.dosage}
            <span class="med-id">(ID: ${med.id})</span>
          </div>
          <div class="med-details">
            <p><strong>Frequency:</strong> ${med.frequency}</p>
            <p><strong>Prescribed by:</strong> ${med.prescribedBy}</p>
            <p><strong>Start Date:</strong> ${med.startDate}</p>
            ${med.notes ? `<p><strong>Notes:</strong> ${med.notes}</p>` : ""}
          </div>
        </div>
      `).join("")}
      
      ${inactiveMeds.length > 0 ? `
        <h4>Previous Medications (${inactiveMeds.length})</h4>
        ${inactiveMeds.map((med) => `
          <div class="medication-item ${med.status}">
            <div class="med-header">
              <strong>${med.name}</strong> - ${med.dosage}
              <span class="status-badge ${med.status}">${med.status}</span>
            </div>
            <div class="med-details">
              <p><strong>Period:</strong> ${med.startDate} - ${med.endDate || "ongoing"}</p>
              <p><strong>Prescribed by:</strong> ${med.prescribedBy}</p>
              ${med.notes ? `<p><strong>Notes:</strong> ${med.notes}</p>` : ""}
            </div>
          </div>
        `).join("")}
      ` : ""}
    `;
  }
  updateAllergiesList(patient) {
    if (!this.allergiesEl)
      return;
    this.allergiesEl.innerHTML = `
      <h4>Known Allergies (${patient.allergies.length})</h4>
      ${patient.allergies.length === 0 ? '<p class="no-data">No known allergies</p>' : ""}
      ${patient.allergies.map((allergy) => `
        <div class="allergy-item severity-${allergy.severity}">
          <div class="allergy-header">
            <strong>${allergy.allergen}</strong>
            <span class="severity-badge ${allergy.severity}">${allergy.severity}</span>
          </div>
          <div class="allergy-details">
            <p><strong>Reaction:</strong> ${allergy.reaction}</p>
            <p><strong>Diagnosed:</strong> ${allergy.diagnosedDate}</p>
            ${allergy.notes ? `<p><strong>Notes:</strong> ${allergy.notes}</p>` : ""}
          </div>
        </div>
      `).join("")}
    `;
  }
  updateMedicalHistory(patient) {
    if (!this.historyEl)
      return;
    const recentHistory = patient.medicalHistory.slice(0, 10);
    this.historyEl.innerHTML = `
      <h4>Recent Medical History (${recentHistory.length}/${patient.medicalHistory.length})</h4>
      ${recentHistory.length === 0 ? '<p class="no-data">No medical history</p>' : ""}
      ${recentHistory.map((entry) => `
        <div class="history-item">
          <div class="history-header">
            <span class="history-date">${entry.date}</span>
            <span class="history-type ${entry.type}">${entry.type.replace("_", " ")}</span>
          </div>
          <p class="history-description">${entry.description}</p>
          <p class="history-performer">by ${entry.performedBy}</p>
        </div>
      `).join("")}
    `;
  }
  initializeSimulation() {
    this.simulationSteps = [
      {
        type: "user_message",
        message: "Hello! I need help managing my patient's medications. Can you show me what medications John Doe is currently taking?",
        delay: 1000
      },
      {
        type: "tool_call",
        tool: "list_medications",
        parameters: { status: "active" },
        delay: 2000
      },
      {
        type: "user_message",
        message: "I need to add a new medication. Please add Aspirin 81mg once daily prescribed by Dr. Wilson for cardiovascular protection.",
        delay: 2000
      },
      {
        type: "tool_call",
        tool: "add_medication",
        parameters: {
          name: "Aspirin",
          dosage: "81mg",
          frequency: "Once daily",
          prescribedBy: "Dr. Wilson",
          notes: "For cardiovascular protection"
        },
        delay: 3000
      },
      {
        type: "user_message",
        message: "The patient mentioned they have a shellfish allergy. Please add this to their record as a severe allergy.",
        delay: 2000
      },
      {
        type: "tool_call",
        tool: "add_allergy",
        parameters: {
          allergen: "Shellfish",
          severity: "severe",
          reaction: "Hives and swelling",
          notes: "Avoid all shellfish and products containing shellfish"
        },
        delay: 3000
      },
      {
        type: "user_message",
        message: "Let me get a complete patient summary to review all changes.",
        delay: 2000
      },
      {
        type: "tool_call",
        tool: "get_patient_summary",
        parameters: {},
        delay: 2000
      }
    ];
  }
  startSimulation() {
    if (this.isSimulationRunning)
      return;
    if (!this.isConnected) {
      alert("Please wait for the client to connect before starting simulation");
      return;
    }
    console.log("Starting simulation...");
    this.isSimulationRunning = true;
    this.currentSimulationStep = 0;
    this.updateStatus("simulation", "Running automated demo simulation...");
    const startMessage = {
      type: "INVERTED_START_SIMULATION",
      protocolVersion: "1.0",
      sessionId: this.sessionId,
      scenario: "medical_demo"
    };
    this.sendToIframe(startMessage);
    setTimeout(() => {
      this.executeSimulationStep(0);
    }, 1000);
  }
  executeSimulationStep(stepIndex) {
    if (stepIndex >= this.simulationSteps.length) {
      this.isSimulationRunning = false;
      return;
    }
    const step = this.simulationSteps[stepIndex];
    console.log(`Executing simulation step ${stepIndex}:`, step);
    this.sendToIframe({
      type: "INVERTED_SIMULATION_STEP",
      protocolVersion: "1.0",
      sessionId: this.sessionId,
      stepIndex,
      step
    });
  }
}
document.addEventListener("DOMContentLoaded", () => {
  new InvertedMCPServer;
});
export {
  InvertedMCPServer
};
