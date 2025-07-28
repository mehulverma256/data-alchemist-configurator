// Core data types based on the requirements

export interface Client {
  ClientID: string;
  ClientName: string;
  PriorityLevel: number; // 1-5
  RequestedTaskIDs: string[]; // parsed from comma-separated
  GroupTag: string;
  AttributesJSON: Record<string, any>; // parsed JSON
}

export interface Worker {
  WorkerID: string;
  WorkerName: string;
  Skills: string[]; // parsed from comma-separated
  AvailableSlots: number[]; // array of phase numbers
  MaxLoadPerPhase: number;
  WorkerGroup: string;
  QualificationLevel: string;
}

export interface Task {
  TaskID: string;
  TaskName: string;
  Category: string;
  Duration: number; // number of phases (≥1)
  RequiredSkills: string[]; // parsed from comma-separated
  PreferredPhases: number[]; // normalized from ranges/lists
  MaxConcurrent: number;
}

// Raw data types (before parsing)
export interface RawClient {
  ClientID: string;
  ClientName: string;
  PriorityLevel: string | number;
  RequestedTaskIDs: string;
  GroupTag: string;
  AttributesJSON: string;
}

export interface RawWorker {
  WorkerID: string;
  WorkerName: string;
  Skills: string;
  AvailableSlots: string;
  MaxLoadPerPhase: string | number;
  WorkerGroup: string;
  QualificationLevel: string;
}

export interface RawTask {
  TaskID: string;
  TaskName: string;
  Category: string;
  Duration: string | number;
  RequiredSkills: string;
  PreferredPhases: string;
  MaxConcurrent: string | number;
}

// Validation types
export interface ValidationError {
  id: string;
  type: 'error' | 'warning';
  message: string;
  field?: string;
  entityType: 'client' | 'worker' | 'task';
  entityId: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}