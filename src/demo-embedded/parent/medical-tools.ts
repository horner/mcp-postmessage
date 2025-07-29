/**
 * Medical tools implementation for the MCP server using PostMessage transport
 */

import type { ToolDefinition } from '../shared/protocol.js';
import type { 
  AddMedicationParams,
  EditMedicationParams,
  DiscontinueMedicationParams,
  DeleteMedicationParams,
  AddAllergyParams
} from '../shared/types.js';
import { PatientDataManager } from './patient-data.js';

/**
 * Medical tools class that implements all medical-related MCP tools
 */
export class MedicalTools {
  constructor(private patientData: PatientDataManager) {}

  /**
   * Get all available tool definitions
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'add_medication',
        description: 'Add a new medication to the patient\'s medication list',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the medication. Example: Lisinopril'
            },
            dosage: {
              type: 'string',
              description: 'Dosage of the medication. Example: 10mg'
            },
            frequency: {
              type: 'string',
              description: 'Frequency of administration. Example: Once daily'
            },
            prescribedBy: {
              type: 'string',
              description: 'Name of the prescribing physician. Example: Dr. Smith'
            },
            notes: {
              type: 'string',
              description: 'Optional notes about the medication. Example: Take with food'
            }
          },
          required: ['name', 'dosage', 'frequency', 'prescribedBy']
        }
      },
      {
        name: 'edit_medication',
        description: 'Edit an existing medication in the patient\'s medication list',
        inputSchema: {
          type: 'object',
          properties: {
            medicationId: {
              type: 'string',
              description: 'ID of the medication to edit. Example: med-001'
            },
            name: {
              type: 'string',
              description: 'New name of the medication. Example: Lisinopril'
            },
            dosage: {
              type: 'string',
              description: 'New dosage of the medication. Example: 20mg'
            },
            frequency: {
              type: 'string',
              description: 'New frequency of administration. Example: Twice daily'
            },
            notes: {
              type: 'string',
              description: 'New notes about the medication. Example: Take with food'
            }
          },
          required: ['medicationId']
        }
      },
      {
        name: 'discontinue_medication',
        description: 'Discontinue an active medication for the patient',
        inputSchema: {
          type: 'object',
          properties: {
            medicationId: {
              type: 'string',
              description: 'ID of the medication to discontinue. Example: med-001'
            },
            reason: {
              type: 'string',
              description: 'Reason for discontinuing the medication. Example: Side effects'
            }
          },
          required: ['medicationId', 'reason']
        }
      },
      {
        name: 'delete_medication',
        description: 'Permanently delete a medication from the patient\'s record',
        inputSchema: {
          type: 'object',
          properties: {
            medicationId: {
              type: 'string',
              description: 'ID of the medication to delete. Example: med-001'
            },
            reason: {
              type: 'string',
              description: 'Reason for deleting the medication. Example: Entered in error'
            }
          },
          required: ['medicationId', 'reason']
        }
      },
      {
        name: 'add_allergy',
        description: 'Add a new allergy to the patient\'s allergy list',
        inputSchema: {
          type: 'object',
          properties: {
            allergen: {
              type: 'string',
              description: 'Name of the allergen. Example: Peanuts'
            },
            severity: {
              type: 'string',
              enum: ['mild', 'moderate', 'severe', 'life-threatening'],
              description: 'Severity of the allergic reaction. Example: severe'
            },
            reaction: {
              type: 'string',
              description: 'Description of the allergic reaction. Example: Hives and difficulty breathing'
            },
            notes: {
              type: 'string',
              description: 'Optional notes about the allergy. Example: Avoid all tree nuts'
            }
          },
          required: ['allergen', 'severity', 'reaction']
        }
      },
      {
        name: 'get_patient_summary',
        description: 'Get a comprehensive summary of the current patient\'s medical information',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'list_medications',
        description: 'List all medications for the current patient',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'discontinued', 'completed', 'all'],
              description: 'Filter medications by status. Example: active'
            }
          },
          required: []
        }
      },
      {
        name: 'list_allergies',
        description: 'List all allergies for the current patient',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ];
  }

  /**
   * Execute a tool by name with parameters
   */
  async executeTool(toolName: string, parameters: any): Promise<any> {
    try {
      switch (toolName) {
        case 'add_medication':
          return this.addMedication(parameters as AddMedicationParams);
        
        case 'edit_medication':
          return this.editMedication(parameters as EditMedicationParams);
        
        case 'discontinue_medication':
          return this.discontinueMedication(parameters as DiscontinueMedicationParams);
        
        case 'delete_medication':
          return this.deleteMedication(parameters as DeleteMedicationParams);
        
        case 'add_allergy':
          return this.addAllergy(parameters as AddAllergyParams);
        
        case 'get_patient_summary':
          return this.getPatientSummary();
        
        case 'list_medications':
          return this.listMedications(parameters?.status);
        
        case 'list_allergies':
          return this.listAllergies();
        
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      throw error;
    }
  }

  // ============================================================================
  // TOOL IMPLEMENTATIONS
  // ============================================================================

  private addMedication(params: AddMedicationParams) {
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

  private editMedication(params: EditMedicationParams) {
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

  private discontinueMedication(params: DiscontinueMedicationParams) {
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

  private deleteMedication(params: DeleteMedicationParams) {
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

  private addAllergy(params: AddAllergyParams) {
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

  private getPatientSummary() {
    const patient = this.patientData.getPatient();
    return {
      patient: {
        name: patient.name,
        age: patient.age,
        medicalRecordNumber: patient.medicalRecordNumber,
        activeMedications: patient.medications.filter(med => med.status === 'active').length,
        totalMedications: patient.medications.length,
        allergies: patient.allergies.length,
        recentHistoryEntries: patient.medicalHistory.slice(0, 5)
      },
      medications: patient.medications,
      allergies: patient.allergies,
      medicalHistory: patient.medicalHistory
    };
  }

  private listMedications(status?: string) {
    const patient = this.patientData.getPatient();
    let medications = patient.medications;

    if (status && status !== 'all') {
      medications = medications.filter(med => med.status === status);
    }

    return {
      medications,
      count: medications.length,
      filterApplied: status || 'all'
    };
  }

  private listAllergies() {
    const patient = this.patientData.getPatient();
    return {
      allergies: patient.allergies,
      count: patient.allergies.length
    };
  }

  private getBasicPatientInfo() {
    const patient = this.patientData.getPatient();
    return {
      name: patient.name,
      age: patient.age,
      medicalRecordNumber: patient.medicalRecordNumber,
      activeMedications: patient.medications.filter(med => med.status === 'active').length,
      allergies: patient.allergies.length
    };
  }
}