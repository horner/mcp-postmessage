/**
 * Shared types for the PostMessage transport MCP demo
 */

// Patient data models
export interface Patient {
  id: string;
  name: string;
  age: number;
  medicalRecordNumber: string;
  medications: Medication[];
  allergies: Allergy[];
  medicalHistory: MedicalHistoryEntry[];
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate?: string;
  status: 'active' | 'discontinued' | 'completed';
  prescribedBy: string;
  notes?: string;
}

export interface Allergy {
  id: string;
  allergen: string;
  severity: 'mild' | 'moderate' | 'severe' | 'life-threatening';
  reaction: string;
  diagnosedDate: string;
  notes?: string;
}

export interface MedicalHistoryEntry {
  id: string;
  date: string;
  type: 'medication_added' | 'medication_edited' | 'medication_discontinued' | 'medication_deleted' | 'allergy_added';
  description: string;
  performedBy: string;
}

// Tool parameters
export interface AddMedicationParams {
  name: string;
  dosage: string;
  frequency: string;
  prescribedBy: string;
  notes?: string;
}

export interface EditMedicationParams {
  medicationId: string;
  name?: string;
  dosage?: string;
  frequency?: string;
  notes?: string;
}

export interface DiscontinueMedicationParams {
  medicationId: string;
  reason: string;
}

export interface DeleteMedicationParams {
  medicationId: string;
  reason: string;
}

export interface AddAllergyParams {
  allergen: string;
  severity: 'mild' | 'moderate' | 'severe' | 'life-threatening';
  reaction: string;
  notes?: string;
}

// Tool results
export interface MedicationResult {
  success: boolean;
  message: string;
  medication?: Medication;
  patient?: Patient;
}

export interface AllergyResult {
  success: boolean;
  message: string;
  allergy?: Allergy;
  patient?: Patient;
}

// Chat message types for the iframe
export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: any;
  result?: any;
  status: 'pending' | 'success' | 'error';
}

// Demo simulation
export interface SimulationStep {
  type: 'user_message' | 'tool_call' | 'wait';
  message?: string;
  tool?: string;
  parameters?: any;
  delay?: number;
}