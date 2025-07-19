// ../shared/protocol.ts
function isInvertedMessage(data) {
  return data && typeof data === "object" && typeof data.type === "string" && data.type.startsWith("INVERTED_") && data.protocolVersion === "1.0";
}
function isServerHandshakeReply(msg) {
  return msg.type === "INVERTED_SERVER_HANDSHAKE_REPLY";
}
function isToolCallResponse(msg) {
  return msg.type === "INVERTED_TOOL_CALL_RESPONSE";
}
function isStartSimulation(msg) {
  return msg.type === "INVERTED_START_SIMULATION";
}
function isSimulationStep(msg) {
  return msg.type === "INVERTED_SIMULATION_STEP";
}

// chat-ui.ts
class ChatUI {
  container;
  messagesContainer;
  inputContainer;
  messageInput;
  sendButton;
  messages = [];
  onMessageSend;
  constructor(container) {
    this.container = container;
    this.setupUI();
  }
  setupUI() {
    this.container.innerHTML = `
      <div class="chat-container">
        <div class="chat-header">
          <h3>\uD83E\uDD16 Medical AI Assistant</h3>
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
    this.messagesContainer = document.getElementById("chat-messages");
    this.inputContainer = document.getElementById("chat-input-container");
    this.messageInput = document.getElementById("message-input");
    this.sendButton = document.getElementById("send-button");
    this.setupEventListeners();
    this.addSystemMessage("Welcome! I can help you manage patient medications and allergies. Try asking me about the patient's current medications or adding new ones.");
  }
  setupEventListeners() {
    this.sendButton.addEventListener("click", () => {
      this.sendMessage();
    });
    this.messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    this.messageInput.addEventListener("input", () => {
      this.updateSendButton();
      this.autoResize();
    });
  }
  autoResize() {
    this.messageInput.style.height = "auto";
    this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + "px";
  }
  updateSendButton() {
    this.sendButton.disabled = !this.messageInput.value.trim();
  }
  setOnMessageSend(callback) {
    this.onMessageSend = callback;
  }
  sendMessage() {
    const text = this.messageInput.value.trim();
    if (!text || !this.onMessageSend)
      return;
    this.messageInput.value = "";
    this.updateSendButton();
    this.autoResize();
    this.onMessageSend(text);
  }
  addMessage(message) {
    this.messages.push(message);
    this.renderMessage(message);
    this.scrollToBottom();
  }
  addUserMessage(text) {
    const message = {
      id: `msg-${Date.now()}`,
      type: "user",
      content: text,
      timestamp: new Date().toISOString(),
      toolCalls: []
    };
    this.addMessage(message);
    return message;
  }
  addAssistantMessage(text) {
    const message = {
      id: `msg-${Date.now()}`,
      type: "assistant",
      content: text,
      timestamp: new Date().toISOString(),
      toolCalls: []
    };
    this.addMessage(message);
    return message;
  }
  addSystemMessage(text) {
    const message = {
      id: `msg-${Date.now()}`,
      type: "system",
      content: text,
      timestamp: new Date().toISOString(),
      toolCalls: []
    };
    this.addMessage(message);
    return message;
  }
  addToolCall(messageId, toolCall) {
    const message = this.messages.find((m) => m.id === messageId);
    if (message) {
      if (!message.toolCalls)
        message.toolCalls = [];
      message.toolCalls.push(toolCall);
      this.renderMessages();
    }
  }
  updateToolCall(messageId, toolCallId, result, status) {
    const message = this.messages.find((m) => m.id === messageId);
    if (message && message.toolCalls) {
      const toolCall = message.toolCalls.find((tc) => tc.id === toolCallId);
      if (toolCall) {
        toolCall.result = result;
        toolCall.status = status;
        this.renderMessages();
      }
    }
  }
  renderMessage(message) {
    const messageEl = document.createElement("div");
    messageEl.className = `message message-${message.type}`;
    messageEl.setAttribute("data-message-id", message.id);
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
  renderMessages() {
    this.messagesContainer.innerHTML = "";
    this.messages.forEach((message) => this.renderMessage(message));
    this.scrollToBottom();
  }
  renderToolCalls(toolCalls) {
    return toolCalls.map((toolCall) => `
      <div class="tool-call ${toolCall.status}">
        <div class="tool-call-header">
          <span class="tool-name">\uD83D\uDD27 ${toolCall.name}</span>
          <span class="tool-status status-${toolCall.status}">
            ${toolCall.status === "pending" ? "⏳" : toolCall.status === "success" ? "✅" : "❌"}
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
        ` : ""}
      </div>
    `).join("");
  }
  getMessageTypeIcon(type) {
    switch (type) {
      case "user":
        return "\uD83D\uDC64";
      case "assistant":
        return "\uD83E\uDD16";
      case "system":
        return "ℹ️";
      default:
        return "\uD83D\uDCAC";
    }
  }
  getMessageTypeLabel(type) {
    switch (type) {
      case "user":
        return "You";
      case "assistant":
        return "AI Assistant";
      case "system":
        return "System";
      default:
        return "Message";
    }
  }
  formatMessageContent(content) {
    return content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\*(.*?)\*/g, "<em>$1</em>").replace(/\n/g, "<br>");
  }
  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
  setEnabled(enabled) {
    this.messageInput.disabled = !enabled;
    this.sendButton.disabled = !enabled || !this.messageInput.value.trim();
    if (!enabled) {
      this.inputContainer.style.opacity = "0.5";
    } else {
      this.inputContainer.style.opacity = "1";
    }
  }
  showTyping() {
    const typingMessage = document.createElement("div");
    typingMessage.className = "message message-assistant typing";
    typingMessage.innerHTML = `
      <div class="message-header">
        <span class="message-type">\uD83E\uDD16 AI Assistant</span>
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
  hideTyping() {
    const typingMessage = this.messagesContainer.querySelector(".typing");
    if (typingMessage) {
      typingMessage.remove();
    }
  }
  clear() {
    this.messages = [];
    this.messagesContainer.innerHTML = "";
  }
}

// app.ts
class InvertedMCPClient {
  sessionId;
  isConnected = false;
  availableTools = [];
  pendingToolCalls = new Map;
  chatUI;
  isSimulationRunning = false;
  simulationSteps = [];
  currentSimulationStep = 0;
  constructor() {
    this.sessionId = this.generateSessionId();
    this.setupEventListeners();
    this.initializeUI();
    this.startHandshake();
  }
  generateSessionId() {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  setupEventListeners() {
    window.addEventListener("message", this.handleMessage.bind(this));
  }
  initializeUI() {
    const container = document.getElementById("chat-container");
    if (!container) {
      throw new Error("Chat container not found");
    }
    this.chatUI = new ChatUI(container);
    this.chatUI.setOnMessageSend(this.handleUserMessage.bind(this));
    this.chatUI.setEnabled(false);
  }
  startHandshake() {
    console.log("Starting client handshake...");
    const handshakeMessage = {
      type: "INVERTED_CLIENT_HANDSHAKE",
      protocolVersion: "1.0",
      sessionId: this.sessionId
    };
    this.sendToParent(handshakeMessage);
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
    console.log("Client received message:", message);
    try {
      if (isServerHandshakeReply(message)) {
        await this.handleServerHandshakeReply(message);
      } else if (isToolCallResponse(message)) {
        await this.handleToolCallResponse(message);
      } else if (isStartSimulation(message)) {
        await this.handleStartSimulation(message);
      } else if (message.type === "INVERTED_SERVER_STATUS") {
        await this.handleServerStatus(message);
      } else if (isSimulationStep(message)) {
        await this.handleSimulationStep(message);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      this.chatUI.addSystemMessage(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  async handleServerHandshakeReply(message) {
    if (message.sessionId !== this.sessionId) {
      throw new Error("Session ID mismatch in handshake reply");
    }
    this.availableTools = message.tools;
    console.log("Received tools from server:", this.availableTools);
    const connectionMessage = {
      type: "INVERTED_CONNECTION_ESTABLISHED",
      protocolVersion: "1.0",
      sessionId: this.sessionId
    };
    this.sendToParent(connectionMessage);
    this.isConnected = true;
    this.chatUI.setEnabled(true);
    this.chatUI.addSystemMessage(`Connected to ${message.serverInfo.name} v${message.serverInfo.version}. ` + `Available tools: ${this.availableTools.map((t) => t.name).join(", ")}`);
  }
  async handleToolCallResponse(message) {
    const pendingCall = this.pendingToolCalls.get(message.callId);
    if (!pendingCall) {
      console.warn("Received response for unknown tool call:", message.callId);
      return;
    }
    this.pendingToolCalls.delete(message.callId);
    if (message.success) {
      this.chatUI.updateToolCall(pendingCall.messageId, message.callId, message.result, "success");
      this.generateAssistantResponse(pendingCall.toolCall, message.result);
    } else {
      this.chatUI.updateToolCall(pendingCall.messageId, message.callId, { error: message.error }, "error");
      this.chatUI.addAssistantMessage(`I encountered an error while executing ${pendingCall.toolCall.name}: ${message.error}`);
    }
    if (this.isSimulationRunning) {
      this.sendSimulationStepComplete(message.success);
    }
  }
  async handleServerStatus(message) {
    if (message.message) {
      console.log(`Server status: ${message.status} - ${message.message}`);
    }
  }
  async handleStartSimulation(message) {
    console.log("Starting simulation:", message.scenario);
    this.isSimulationRunning = true;
    this.currentSimulationStep = 0;
    this.chatUI.addSystemMessage("\uD83C\uDFAC Starting automated demo simulation...");
  }
  async handleSimulationStep(message) {
    if (!this.isSimulationRunning)
      return;
    const step = message.step;
    const stepIndex = message.stepIndex;
    console.log(`Executing simulation step ${stepIndex}:`, step);
    switch (step.type) {
      case "user_message":
        if (step.message) {
          await this.simulateUserMessage(step.message);
        }
        break;
      case "tool_call":
        if (step.tool && step.parameters) {
          await this.simulateToolCall(step.tool, step.parameters);
        }
        break;
      case "wait":
        await this.simulateWait(step.delay || 1000);
        break;
    }
  }
  async simulateUserMessage(message) {
    this.chatUI.addUserMessage(message);
    this.chatUI.showTyping();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.chatUI.hideTyping();
    this.sendSimulationStepComplete(true);
  }
  async simulateToolCall(toolName, parameters) {
    const userMessage = this.generateUserMessageForTool(toolName, parameters);
    this.chatUI.addUserMessage(userMessage);
    this.chatUI.showTyping();
    await new Promise((resolve) => setTimeout(resolve, 800));
    this.chatUI.hideTyping();
    await this.callTool(toolName, parameters);
  }
  async simulateWait(delay) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    this.sendSimulationStepComplete(true);
  }
  generateUserMessageForTool(toolName, parameters) {
    switch (toolName) {
      case "list_medications":
        return parameters.status === "active" ? "What medications is the patient currently taking?" : "Show me all the patient's medications.";
      case "add_medication":
        return `Please add ${parameters.name} ${parameters.dosage} ${parameters.frequency} prescribed by ${parameters.prescribedBy}.`;
      case "add_allergy":
        return `The patient has a ${parameters.severity} allergy to ${parameters.allergen} causing ${parameters.reaction}.`;
      case "get_patient_summary":
        return "Can you give me a complete summary of this patient's medical information?";
      default:
        return `I need to use the ${toolName} tool.`;
    }
  }
  sendSimulationStepComplete(success) {
    const message = {
      type: "INVERTED_SIMULATION_STEP_COMPLETE",
      protocolVersion: "1.0",
      sessionId: this.sessionId,
      stepIndex: this.currentSimulationStep,
      success
    };
    this.sendToParent(message);
  }
  async handleUserMessage(text) {
    this.chatUI.addUserMessage(text);
    this.chatUI.showTyping();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.chatUI.hideTyping();
    await this.processUserIntent(text);
  }
  async processUserIntent(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes("medication") && (lowerText.includes("list") || lowerText.includes("show") || lowerText.includes("current") || lowerText.includes("taking"))) {
      await this.callTool("list_medications", { status: "active" });
    } else if (lowerText.includes("all medication")) {
      await this.callTool("list_medications", { status: "all" });
    } else if (lowerText.includes("allerg") && (lowerText.includes("list") || lowerText.includes("show"))) {
      await this.callTool("list_allergies", {});
    } else if (lowerText.includes("patient") && (lowerText.includes("summary") || lowerText.includes("information") || lowerText.includes("info"))) {
      await this.callTool("get_patient_summary", {});
    } else if (lowerText.includes("add") && lowerText.includes("medication")) {
      this.chatUI.addAssistantMessage("I can help you add a medication. Please provide the medication name, dosage, frequency, and prescribing physician. " + 'For example: "Add Aspirin 81mg once daily prescribed by Dr. Smith"');
    } else if (lowerText.includes("add") && lowerText.includes("allerg")) {
      this.chatUI.addAssistantMessage("I can help you add an allergy. Please provide the allergen, severity (mild/moderate/severe/life-threatening), and reaction. " + 'For example: "Add peanut allergy, severe severity, causes hives and difficulty breathing"');
    } else {
      this.chatUI.addAssistantMessage(`I can help you with the following medical tasks:

` + `• List current medications
` + `• List all medications
` + `• Show patient allergies
` + `• Get patient summary
` + `• Add new medications
` + `• Add new allergies

` + `What would you like to do?`);
    }
  }
  async callTool(toolName, parameters) {
    const tool = this.availableTools.find((t) => t.name === toolName);
    if (!tool) {
      this.chatUI.addAssistantMessage(`Tool "${toolName}" is not available.`);
      return;
    }
    const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const assistantMessage = this.chatUI.addAssistantMessage(`I'll help you with that. Let me ${tool.description.toLowerCase()}.`);
    const toolCall = {
      id: callId,
      name: toolName,
      parameters,
      status: "pending"
    };
    this.chatUI.addToolCall(assistantMessage.id, toolCall);
    this.pendingToolCalls.set(callId, { messageId: assistantMessage.id, toolCall });
    const request = {
      type: "INVERTED_TOOL_CALL_REQUEST",
      protocolVersion: "1.0",
      sessionId: this.sessionId,
      callId,
      toolName,
      parameters
    };
    this.sendToParent(request);
  }
  generateAssistantResponse(toolCall, result) {
    let response = "";
    switch (toolCall.name) {
      case "list_medications":
        if (result.medications && result.medications.length > 0) {
          response = `Found ${result.medications.length} medications:

`;
          result.medications.forEach((med) => {
            response += `• **${med.name}** ${med.dosage} - ${med.frequency}
`;
            response += `  Prescribed by ${med.prescribedBy} on ${med.startDate}
`;
            if (med.status !== "active")
              response += `  Status: ${med.status}
`;
            response += `
`;
          });
        } else {
          response = "No medications found for this patient.";
        }
        break;
      case "list_allergies":
        if (result.allergies && result.allergies.length > 0) {
          response = `Found ${result.allergies.length} allergies:

`;
          result.allergies.forEach((allergy) => {
            response += `• **${allergy.allergen}** (${allergy.severity})
`;
            response += `  Reaction: ${allergy.reaction}
`;
            response += `  Diagnosed: ${allergy.diagnosedDate}

`;
          });
        } else {
          response = "No known allergies for this patient.";
        }
        break;
      case "add_medication":
        if (result.success) {
          response = `✅ Successfully added **${result.medication.name}** to the patient's medication list.`;
        }
        break;
      case "add_allergy":
        if (result.success) {
          response = `✅ Successfully added **${result.allergy.allergen}** allergy to the patient's record.`;
        }
        break;
      case "get_patient_summary":
        if (result.patient) {
          response = `## Patient Summary

`;
          response += `**Name:** ${result.patient.name}
`;
          response += `**Age:** ${result.patient.age}
`;
          response += `**MRN:** ${result.patient.medicalRecordNumber}
`;
          response += `**Active Medications:** ${result.patient.activeMedications}
`;
          response += `**Known Allergies:** ${result.patient.allergies}

`;
          if (result.medications && result.medications.length > 0) {
            response += `### Current Medications
`;
            result.medications.filter((med) => med.status === "active").forEach((med) => {
              response += `• ${med.name} ${med.dosage} - ${med.frequency}
`;
            });
            response += `
`;
          }
          if (result.allergies && result.allergies.length > 0) {
            response += `### Known Allergies
`;
            result.allergies.forEach((allergy) => {
              response += `• ${allergy.allergen} (${allergy.severity})
`;
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
  sendToParent(message) {
    window.parent.postMessage(message, "*");
  }
}
document.addEventListener("DOMContentLoaded", () => {
  new InvertedMCPClient;
});
export {
  InvertedMCPClient
};
