import { Client, Worker, Task, ValidationError, ValidationResult } from '@/types';

export interface DataSet {
  clients: Client[];
  workers: Worker[];
  tasks: Task[];
}

export function validateDataSet(data: DataSet): ValidationResult {
  const errors: ValidationError[] = [];
  
  // Run all validation rules
  errors.push(...validateMissingRequiredColumns(data));
  errors.push(...validateDuplicateIDs(data));
  errors.push(...validateMalformedLists(data));
  errors.push(...validateOutOfRangeValues(data));
  errors.push(...validateBrokenJSON(data));
  errors.push(...validateUnknownReferences(data));
  errors.push(...validateOverloadedWorkers(data));
  errors.push(...validatePhaseSlotSaturation(data));
  errors.push(...validateSkillCoverageMatrix(data));
  errors.push(...validateMaxConcurrencyFeasibility(data));
  
  // Separate errors and warnings
  const actualErrors = errors.filter(e => e.type === 'error');
  const warnings = errors.filter(e => e.type === 'warning');
  
  return {
    isValid: actualErrors.length === 0,
    errors: actualErrors,
    warnings: warnings
  };
}

// 1. Missing required columns
function validateMissingRequiredColumns(data: DataSet): ValidationError[] {
  const errors: ValidationError[] = [];
  
  const requiredClientFields = ['ClientID', 'ClientName', 'PriorityLevel'];
  const requiredWorkerFields = ['WorkerID', 'WorkerName', 'Skills', 'AvailableSlots'];
  const requiredTaskFields = ['TaskID', 'TaskName', 'Duration', 'RequiredSkills'];
  
  data.clients.forEach((client, index) => {
    requiredClientFields.forEach(field => {
      if (!client[field as keyof Client] || (Array.isArray(client[field as keyof Client]) && (client[field as keyof Client] as any[]).length === 0)) {
        errors.push({
          id: `missing-client-${field}-${index}`,
          type: 'error',
          message: `Missing required field: ${field}`,
          field,
          entityType: 'client',
          entityId: client.ClientID || `Row ${index + 1}`,
          severity: 'high'
        });
      }
    });
  });
  
  data.workers.forEach((worker, index) => {
    requiredWorkerFields.forEach(field => {
      if (!worker[field as keyof Worker] || (Array.isArray(worker[field as keyof Worker]) && (worker[field as keyof Worker] as any[]).length === 0)) {
        errors.push({
          id: `missing-worker-${field}-${index}`,
          type: 'error',
          message: `Missing required field: ${field}`,
          field,
          entityType: 'worker',
          entityId: worker.WorkerID || `Row ${index + 1}`,
          severity: 'high'
        });
      }
    });
  });
  
  data.tasks.forEach((task, index) => {
    requiredTaskFields.forEach(field => {
      if (!task[field as keyof Task] || (Array.isArray(task[field as keyof Task]) && (task[field as keyof Task] as any[]).length === 0)) {
        errors.push({
          id: `missing-task-${field}-${index}`,
          type: 'error',
          message: `Missing required field: ${field}`,
          field,
          entityType: 'task',
          entityId: task.TaskID || `Row ${index + 1}`,
          severity: 'high'
        });
      }
    });
  });
  
  return errors;
}

// 2. Duplicate IDs
function validateDuplicateIDs(data: DataSet): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Check duplicate ClientIDs
  const clientIDs = new Map<string, number>();
  data.clients.forEach((client, index) => {
    if (client.ClientID) {
      if (clientIDs.has(client.ClientID)) {
        errors.push({
          id: `duplicate-client-${client.ClientID}`,
          type: 'error',
          message: `Duplicate ClientID: ${client.ClientID}`,
          field: 'ClientID',
          entityType: 'client',
          entityId: client.ClientID,
          severity: 'high'
        });
      } else {
        clientIDs.set(client.ClientID, index);
      }
    }
  });
  
  // Check duplicate WorkerIDs
  const workerIDs = new Map<string, number>();
  data.workers.forEach((worker, index) => {
    if (worker.WorkerID) {
      if (workerIDs.has(worker.WorkerID)) {
        errors.push({
          id: `duplicate-worker-${worker.WorkerID}`,
          type: 'error',
          message: `Duplicate WorkerID: ${worker.WorkerID}`,
          field: 'WorkerID',
          entityType: 'worker',
          entityId: worker.WorkerID,
          severity: 'high'
        });
      } else {
        workerIDs.set(worker.WorkerID, index);
      }
    }
  });
  
  // Check duplicate TaskIDs
  const taskIDs = new Map<string, number>();
  data.tasks.forEach((task, index) => {
    if (task.TaskID) {
      if (taskIDs.has(task.TaskID)) {
        errors.push({
          id: `duplicate-task-${task.TaskID}`,
          type: 'error',
          message: `Duplicate TaskID: ${task.TaskID}`,
          field: 'TaskID',
          entityType: 'task',
          entityId: task.TaskID,
          severity: 'high'
        });
      } else {
        taskIDs.set(task.TaskID, index);
      }
    }
  });
  
  return errors;
}

// 3. Malformed lists
function validateMalformedLists(data: DataSet): ValidationError[] {
  const errors: ValidationError[] = [];
  
  data.workers.forEach(worker => {
    // Check AvailableSlots are all numeric
    worker.AvailableSlots.forEach(slot => {
      if (isNaN(slot) || slot < 1) {
        errors.push({
          id: `malformed-slots-${worker.WorkerID}`,
          type: 'error',
          message: `Invalid AvailableSlot value: ${slot}. Must be positive numbers.`,
          field: 'AvailableSlots',
          entityType: 'worker',
          entityId: worker.WorkerID,
          severity: 'medium'
        });
      }
    });
  });
  
  return errors;
}

// 4. Out-of-range values
function validateOutOfRangeValues(data: DataSet): ValidationError[] {
  const errors: ValidationError[] = [];
  
  data.clients.forEach(client => {
    if (client.PriorityLevel < 1 || client.PriorityLevel > 5) {
      errors.push({
        id: `priority-range-${client.ClientID}`,
        type: 'error',
        message: `PriorityLevel must be between 1-5, got: ${client.PriorityLevel}`,
        field: 'PriorityLevel',
        entityType: 'client',
        entityId: client.ClientID,
        severity: 'medium'
      });
    }
  });
  
  data.tasks.forEach(task => {
    if (task.Duration < 1) {
      errors.push({
        id: `duration-range-${task.TaskID}`,
        type: 'error',
        message: `Duration must be at least 1, got: ${task.Duration}`,
        field: 'Duration',
        entityType: 'task',
        entityId: task.TaskID,
        severity: 'medium'
      });
    }
  });
  
  return errors;
}

// 5. Broken JSON
function validateBrokenJSON(data: DataSet): ValidationError[] {
  const errors: ValidationError[] = [];
  
  data.clients.forEach(client => {
    try {
      // If AttributesJSON is already parsed, it's valid
      if (typeof client.AttributesJSON === 'object' && client.AttributesJSON !== null) {
        // Valid JSON object
      }
    } catch (error) {
      errors.push({
        id: `broken-json-${client.ClientID}`,
        type: 'error',
        message: `Invalid JSON in AttributesJSON`,
        field: 'AttributesJSON',
        entityType: 'client',
        entityId: client.ClientID,
        severity: 'low'
      });
    }
  });
  
  return errors;
}

// 6. Unknown references
function validateUnknownReferences(data: DataSet): ValidationError[] {
  const errors: ValidationError[] = [];
  
  const taskIDs = new Set(data.tasks.map(task => task.TaskID));
  
  data.clients.forEach(client => {
    client.RequestedTaskIDs.forEach(taskID => {
      if (!taskIDs.has(taskID)) {
        errors.push({
          id: `unknown-task-${client.ClientID}-${taskID}`,
          type: 'error',
          message: `Client references unknown TaskID: ${taskID}`,
          field: 'RequestedTaskIDs',
          entityType: 'client',
          entityId: client.ClientID,
          severity: 'high'
        });
      }
    });
  });
  
  return errors;
}

// 9. Overloaded workers
function validateOverloadedWorkers(data: DataSet): ValidationError[] {
  const errors: ValidationError[] = [];
  
  data.workers.forEach(worker => {
    if (worker.AvailableSlots.length < worker.MaxLoadPerPhase) {
      errors.push({
        id: `overloaded-worker-${worker.WorkerID}`,
        type: 'warning',
        message: `Worker has ${worker.AvailableSlots.length} available slots but MaxLoadPerPhase is ${worker.MaxLoadPerPhase}`,
        field: 'MaxLoadPerPhase',
        entityType: 'worker',
        entityId: worker.WorkerID,
        severity: 'medium'
      });
    }
  });
  
  return errors;
}

// 10. Phase-slot saturation
function validatePhaseSlotSaturation(data: DataSet): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Calculate total demand per phase
  const phaseDemand = new Map<number, number>();
  
  data.tasks.forEach(task => {
    task.PreferredPhases.forEach(phase => {
      const currentDemand = phaseDemand.get(phase) || 0;
      phaseDemand.set(phase, currentDemand + task.Duration);
    });
  });
  
  // Calculate total supply per phase
  const phaseSupply = new Map<number, number>();
  
  data.workers.forEach(worker => {
    worker.AvailableSlots.forEach(phase => {
      const currentSupply = phaseSupply.get(phase) || 0;
      phaseSupply.set(phase, currentSupply + worker.MaxLoadPerPhase);
    });
  });
  
  // Check for saturation
  phaseDemand.forEach((demand, phase) => {
    const supply = phaseSupply.get(phase) || 0;
    if (demand > supply) {
      errors.push({
        id: `phase-saturation-${phase}`,
        type: 'warning',
        message: `Phase ${phase} is oversaturated: demand ${demand} > supply ${supply}`,
        entityType: 'task',
        entityId: `Phase ${phase}`,
        severity: 'high'
      });
    }
  });
  
  return errors;
}

// 11. Skill-coverage matrix
function validateSkillCoverageMatrix(data: DataSet): ValidationError[] {
  const errors: ValidationError[] = [];
  
  const availableSkills = new Set<string>();
  data.workers.forEach(worker => {
    worker.Skills.forEach(skill => availableSkills.add(skill));
  });
  
  data.tasks.forEach(task => {
    task.RequiredSkills.forEach(skill => {
      if (!availableSkills.has(skill)) {
        errors.push({
          id: `missing-skill-${task.TaskID}-${skill}`,
          type: 'error',
          message: `No worker has required skill: ${skill}`,
          field: 'RequiredSkills',
          entityType: 'task',
          entityId: task.TaskID,
          severity: 'high'
        });
      }
    });
  });
  
  return errors;
}

// 12. Max-concurrency feasibility
function validateMaxConcurrencyFeasibility(data: DataSet): ValidationError[] {
  const errors: ValidationError[] = [];
  
  data.tasks.forEach(task => {
    // Count workers who can perform this task
    const qualifiedWorkers = data.workers.filter(worker =>
      task.RequiredSkills.every(skill => worker.Skills.includes(skill))
    );
    
    if (task.MaxConcurrent > qualifiedWorkers.length) {
      errors.push({
        id: `concurrency-infeasible-${task.TaskID}`,
        type: 'warning',
        message: `MaxConcurrent (${task.MaxConcurrent}) exceeds qualified workers (${qualifiedWorkers.length})`,
        field: 'MaxConcurrent',
        entityType: 'task',
        entityId: task.TaskID,
        severity: 'medium'
      });
    }
  });
  
  return errors;
}