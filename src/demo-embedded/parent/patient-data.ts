/**
 * Patient data models and state management for the medical demo
 */

import type { 
  Patient, 
  Medication, 
  Allergy, 
  MedicalHistoryEntry,
  AddMedicationParams,
  EditMedicationParams,
  DiscontinueMedicationParams,
  DeleteMedicationParams,
  AddAllergyParams
} from '../shared/types.js';

// Sample patient data
export const initialPatient: Patient = {
  id: 'patient-001',
  name: 'John Doe',
  age: 45,
  medicalRecordNumber: 'MRN-123456',
  medications: [
    {
      id: 'med-001',
      name: 'Lisinopril',
      dosage: '10mg',
      frequency: 'Once daily',
      startDate: '2023-01-15',
      status: 'active',
      prescribedBy: 'Dr. Smith',
      notes: 'For blood pressure management'
    },
    {
      id: 'med-002',
      name: 'Metformin',
      dosage: '500mg',
      frequency: 'Twice daily with meals',
      startDate: '2023-03-10',
      status: 'active',
      prescribedBy: 'Dr. Johnson',
      notes: 'For diabetes management'
    }
  ],
  allergies: [
    {
      id: 'allergy-001',
      allergen: 'Penicillin',
      severity: 'severe',
      reaction: 'Anaphylaxis',
      diagnosedDate: '2020-05-15',
      notes: 'Discovered during strep throat treatment'
    }
  ],
  medicalHistory: [
    {
      id: 'history-001',
      date: '2023-01-15',
      type: 'medication_added',
      description: 'Added Lisinopril 10mg once daily for blood pressure management',
      performedBy: 'Dr. Smith'
    },
    {
      id: 'history-002',
      date: '2023-03-10',
      type: 'medication_added',
      description: 'Added Metformin 500mg twice daily for diabetes management',
      performedBy: 'Dr. Johnson'
    }
  ]
};

/**
 * Patient data manager - handles all patient data operations
 */
export class PatientDataManager {
  private patient: Patient;
  private listeners: ((patient: Patient) => void)[] = [];

  constructor(initialData: Patient = initialPatient) {
    this.patient = JSON.parse(JSON.stringify(initialData));
  }

  // Subscribe to patient data changes
  subscribe(listener: (patient: Patient) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Notify all listeners of changes
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.patient));
  }

  // Add history entry
  private addHistoryEntry(entry: Omit<MedicalHistoryEntry, 'id'>): void {
    const historyEntry: MedicalHistoryEntry = {
      id: `history-${Date.now()}`,
      ...entry
    };
    this.patient.medicalHistory.unshift(historyEntry);
  }

  // Get current patient data
  getPatient(): Patient {
    return JSON.parse(JSON.stringify(this.patient));
  }

  // Generate unique ID
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get current date string
  private getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  // ============================================================================
  // MEDICATION OPERATIONS
  // ============================================================================

  addMedication(params: AddMedicationParams): { success: boolean; message: string; medication?: Medication } {
    try {
      // Validate input
      if (!params.name?.trim()) {
        return { success: false, message: 'Medication name is required' };
      }
      if (!params.dosage?.trim()) {
        return { success: false, message: 'Dosage is required' };
      }
      if (!params.frequency?.trim()) {
        return { success: false, message: 'Frequency is required' };
      }
      if (!params.prescribedBy?.trim()) {
        return { success: false, message: 'Prescribing physician is required' };
      }

      // Check for duplicate medication
      const existingMed = this.patient.medications.find(
        med => med.name.toLowerCase() === params.name.toLowerCase() && med.status === 'active'
      );
      if (existingMed) {
        return { success: false, message: `Patient is already taking ${params.name}` };
      }

      // Create new medication
      const medication: Medication = {
        id: this.generateId('med'),
        name: params.name.trim(),
        dosage: params.dosage.trim(),
        frequency: params.frequency.trim(),
        startDate: this.getCurrentDate(),
        status: 'active',
        prescribedBy: params.prescribedBy.trim(),
        notes: params.notes?.trim()
      };

      // Add to patient
      this.patient.medications.push(medication);

      // Add history entry
      this.addHistoryEntry({
        date: this.getCurrentDate(),
        type: 'medication_added',
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
        message: `Error adding medication: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  editMedication(params: EditMedicationParams): { success: boolean; message: string; medication?: Medication } {
    try {
      // Find medication
      const medIndex = this.patient.medications.findIndex(med => med.id === params.medicationId);
      if (medIndex === -1) {
        return { success: false, message: 'Medication not found' };
      }

      const medication = this.patient.medications[medIndex];
      if (medication.status !== 'active') {
        return { success: false, message: 'Cannot edit discontinued or completed medication' };
      }

      // Track changes
      const changes: string[] = [];
      
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
        return { success: false, message: 'No changes specified' };
      }

      // Add history entry
      this.addHistoryEntry({
        date: this.getCurrentDate(),
        type: 'medication_edited',
        description: `Modified ${medication.name}: ${changes.join(', ')}`,
        performedBy: 'System User'
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
        message: `Error editing medication: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  discontinueMedication(params: DiscontinueMedicationParams): { success: boolean; message: string; medication?: Medication } {
    try {
      // Find medication
      const medIndex = this.patient.medications.findIndex(med => med.id === params.medicationId);
      if (medIndex === -1) {
        return { success: false, message: 'Medication not found' };
      }

      const medication = this.patient.medications[medIndex];
      if (medication.status !== 'active') {
        return { success: false, message: 'Medication is already discontinued or completed' };
      }

      // Update medication
      medication.status = 'discontinued';
      medication.endDate = this.getCurrentDate();
      medication.notes = medication.notes 
        ? `${medication.notes}\n\nDiscontinued: ${params.reason}`
        : `Discontinued: ${params.reason}`;

      // Add history entry
      this.addHistoryEntry({
        date: this.getCurrentDate(),
        type: 'medication_discontinued',
        description: `Discontinued ${medication.name} - ${params.reason}`,
        performedBy: 'System User'
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
        message: `Error discontinuing medication: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  deleteMedication(params: DeleteMedicationParams): { success: boolean; message: string } {
    try {
      // Find medication
      const medIndex = this.patient.medications.findIndex(med => med.id === params.medicationId);
      if (medIndex === -1) {
        return { success: false, message: 'Medication not found' };
      }

      const medication = this.patient.medications[medIndex];

      // Add history entry before deletion
      this.addHistoryEntry({
        date: this.getCurrentDate(),
        type: 'medication_deleted',
        description: `Deleted ${medication.name} ${medication.dosage} - ${params.reason}`,
        performedBy: 'System User'
      });

      // Remove medication
      this.patient.medications.splice(medIndex, 1);

      this.notifyListeners();

      return {
        success: true,
        message: `Successfully deleted ${medication.name} from patient's record`
      };
    } catch (error) {
      return {
        success: false,
        message: `Error deleting medication: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // ============================================================================
  // ALLERGY OPERATIONS
  // ============================================================================

  addAllergy(params: AddAllergyParams): { success: boolean; message: string; allergy?: Allergy } {
    try {
      // Validate input
      if (!params.allergen?.trim()) {
        return { success: false, message: 'Allergen name is required' };
      }
      if (!params.reaction?.trim()) {
        return { success: false, message: 'Reaction description is required' };
      }

      // Check for duplicate allergy
      const existingAllergy = this.patient.allergies.find(
        allergy => allergy.allergen.toLowerCase() === params.allergen.toLowerCase()
      );
      if (existingAllergy) {
        return { success: false, message: `Allergy to ${params.allergen} is already recorded` };
      }

      // Create new allergy
      const allergy: Allergy = {
        id: this.generateId('allergy'),
        allergen: params.allergen.trim(),
        severity: params.severity,
        reaction: params.reaction.trim(),
        diagnosedDate: this.getCurrentDate(),
        notes: params.notes?.trim()
      };

      // Add to patient
      this.patient.allergies.push(allergy);

      // Add history entry
      this.addHistoryEntry({
        date: this.getCurrentDate(),
        type: 'allergy_added',
        description: `Added allergy to ${allergy.allergen} (${allergy.severity} severity)`,
        performedBy: 'System User'
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
        message: `Error adding allergy: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}