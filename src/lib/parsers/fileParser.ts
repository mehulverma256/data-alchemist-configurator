import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Client, Worker, Task, RawClient, RawWorker, RawTask } from '@/types';

export interface ParseResult<T> {
  data: T[];
  errors: string[];
  fileName: string;
  type: 'clients' | 'workers' | 'tasks';
}

// AI-powered column mapping
const COLUMN_MAPPINGS = {
  clients: {
    'ClientID': ['client_id', 'clientid', 'id', 'client'],
    'ClientName': ['client_name', 'clientname', 'name', 'company'],
    'PriorityLevel': ['priority_level', 'prioritylevel', 'priority', 'level'],
    'RequestedTaskIDs': ['requested_task_ids', 'requestedtaskids', 'tasks', 'task_ids'],
    'GroupTag': ['group_tag', 'grouptag', 'group', 'tag'],
    'AttributesJSON': ['attributes_json', 'attributesjson', 'attributes', 'metadata']
  },
  workers: {
    'WorkerID': ['worker_id', 'workerid', 'id', 'worker'],
    'WorkerName': ['worker_name', 'workername', 'name', 'employee'],
    'Skills': ['skills', 'skill', 'capabilities', 'expertise'],
    'AvailableSlots': ['available_slots', 'availableslots', 'slots', 'availability'],
    'MaxLoadPerPhase': ['max_load_per_phase', 'maxloadperphase', 'max_load', 'capacity'],
    'WorkerGroup': ['worker_group', 'workergroup', 'group', 'team'],
    'QualificationLevel': ['qualification_level', 'qualificationlevel', 'qualification', 'level']
  },
  tasks: {
    'TaskID': ['task_id', 'taskid', 'id', 'task'],
    'TaskName': ['task_name', 'taskname', 'name', 'title'],
    'Category': ['category', 'type', 'classification'],
    'Duration': ['duration', 'time', 'phases'],
    'RequiredSkills': ['required_skills', 'requiredskills', 'skills', 'requirements'],
    'PreferredPhases': ['preferred_phases', 'preferredphases', 'phases', 'timeline'],
    'MaxConcurrent': ['max_concurrent', 'maxconcurrent', 'concurrent', 'parallel']
  }
};

function mapColumns(headers: string[], entityType: 'clients' | 'workers' | 'tasks'): Record<string, string> {
  const mapping: Record<string, string> = {};
  const columnMaps = COLUMN_MAPPINGS[entityType];
  
  Object.keys(columnMaps).forEach(standardName => {
    const variations = columnMaps[standardName as keyof typeof columnMaps];
    const foundHeader = headers.find(header => 
      variations.some(variation => 
        header.toLowerCase().replace(/[^a-z0-9]/g, '') === variation.replace(/[^a-z0-9]/g, '')
      )
    );
    
    if (foundHeader) {
      mapping[foundHeader] = standardName;
    }
  });
  
  return mapping;
}

export async function parseFile(file: File): Promise<ParseResult<any>> {
  const fileName = file.name.toLowerCase();
  const entityType = detectEntityType(fileName);
  
  try {
    let rawData: any[] = [];
    
    if (fileName.endsWith('.csv')) {
      rawData = await parseCSV(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      rawData = await parseExcel(file);
    } else {
      return {
        data: [],
        errors: ['Unsupported file format. Please use CSV or XLSX files.'],
        fileName: file.name,
        type: entityType
      };
    }
    
    if (rawData.length === 0) {
      return {
        data: [],
        errors: ['File appears to be empty or has no valid data.'],
        fileName: file.name,
        type: entityType
      };
    }
    
    // Map columns using AI-like logic
    const headers = Object.keys(rawData[0] || {});
    const columnMapping = mapColumns(headers, entityType);
    
    // Transform data to standard format
    const mappedData = rawData.map(row => {
      const mappedRow: any = {};
      Object.keys(row).forEach(originalKey => {
        const standardKey = columnMapping[originalKey] || originalKey;
        mappedRow[standardKey] = row[originalKey];
      });
      return mappedRow;
    });
    
    // Parse specific entity type
    let parsedData: any[] = [];
    const errors: string[] = [];
    
    switch (entityType) {
      case 'clients':
        parsedData = mappedData.map((row, index) => parseClient(row, index, errors));
        break;
      case 'workers':
        parsedData = mappedData.map((row, index) => parseWorker(row, index, errors));
        break;
      case 'tasks':
        parsedData = mappedData.map((row, index) => parseTask(row, index, errors));
        break;
    }
    
    return {
      data: parsedData.filter(item => item !== null),
      errors,
      fileName: file.name,
      type: entityType
    };
    
  } catch (error) {
    return {
      data: [],
      errors: [`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`],
      fileName: file.name,
      type: entityType
    };
  }
}

function detectEntityType(fileName: string): 'clients' | 'workers' | 'tasks' {
  if (fileName.includes('client')) return 'clients';
  if (fileName.includes('worker') || fileName.includes('employee')) return 'workers';
  if (fileName.includes('task')) return 'tasks';
  
  // Default to clients if can't detect
  return 'clients';
}

async function parseCSV(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn('CSV parsing warnings:', results.errors);
        }
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

async function parseExcel(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read Excel file'));
    reader.readAsArrayBuffer(file);
  });
}

function parseClient(raw: RawClient, index: number, errors: string[]): Client | null {
  try {
    // Parse RequestedTaskIDs
    let requestedTaskIDs: string[] = [];
    if (raw.RequestedTaskIDs) {
      if (typeof raw.RequestedTaskIDs === 'string') {
        requestedTaskIDs = raw.RequestedTaskIDs.split(',').map(id => id.trim()).filter(id => id);
      } else if (Array.isArray(raw.RequestedTaskIDs)) {
        requestedTaskIDs = raw.RequestedTaskIDs.map(id => String(id).trim()).filter(id => id);
      }
    }
    
    // Parse AttributesJSON
    let attributesJSON: Record<string, any> = {};
    if (raw.AttributesJSON) {
      if (typeof raw.AttributesJSON === 'string') {
        try {
          attributesJSON = JSON.parse(raw.AttributesJSON);
        } catch {
          errors.push(`Row ${index + 1}: Invalid JSON in AttributesJSON`);
          attributesJSON = {};
        }
      } else if (typeof raw.AttributesJSON === 'object') {
        attributesJSON = raw.AttributesJSON;
      }
    }
    
    return {
      ClientID: String(raw.ClientID || '').trim(),
      ClientName: String(raw.ClientName || '').trim(),
      PriorityLevel: Number(raw.PriorityLevel) || 1,
      RequestedTaskIDs: requestedTaskIDs,
      GroupTag: String(raw.GroupTag || '').trim(),
      AttributesJSON: attributesJSON
    };
  } catch (error) {
    errors.push(`Row ${index + 1}: Failed to parse client data`);
    return null;
  }
}

function parseWorker(raw: RawWorker, index: number, errors: string[]): Worker | null {
  try {
    // Parse Skills
    let skills: string[] = [];
    if (raw.Skills) {
      if (typeof raw.Skills === 'string') {
        skills = raw.Skills.split(',').map(skill => skill.trim()).filter(skill => skill);
      } else if (Array.isArray(raw.Skills)) {
        skills = raw.Skills.map(skill => String(skill).trim()).filter(skill => skill);
      }
    }
    
    // Parse AvailableSlots
    let availableSlots: number[] = [];
    if (raw.AvailableSlots) {
      if (typeof raw.AvailableSlots === 'string') {
        try {
          // Handle both "[1,2,3]" and "1,2,3" formats
          const cleanStr = raw.AvailableSlots.replace(/[\[\]]/g, '');
          availableSlots = cleanStr.split(',').map(slot => parseInt(slot.trim())).filter(slot => !isNaN(slot));
        } catch {
          errors.push(`Row ${index + 1}: Invalid AvailableSlots format`);
        }
      } else if (Array.isArray(raw.AvailableSlots)) {
        availableSlots = raw.AvailableSlots.map(slot => Number(slot)).filter(slot => !isNaN(slot));
      }
    }
    
    return {
      WorkerID: String(raw.WorkerID || '').trim(),
      WorkerName: String(raw.WorkerName || '').trim(),
      Skills: skills,
      AvailableSlots: availableSlots,
      MaxLoadPerPhase: Number(raw.MaxLoadPerPhase) || 1,
      WorkerGroup: String(raw.WorkerGroup || '').trim(),
      QualificationLevel: String(raw.QualificationLevel || '').trim()
    };
  } catch (error) {
    errors.push(`Row ${index + 1}: Failed to parse worker data`);
    return null;
  }
}

function parseTask(raw: RawTask, index: number, errors: string[]): Task | null {
  try {
    // Parse RequiredSkills
    let requiredSkills: string[] = [];
    if (raw.RequiredSkills) {
      if (typeof raw.RequiredSkills === 'string') {
        requiredSkills = raw.RequiredSkills.split(',').map(skill => skill.trim()).filter(skill => skill);
      } else if (Array.isArray(raw.RequiredSkills)) {
        requiredSkills = raw.RequiredSkills.map(skill => String(skill).trim()).filter(skill => skill);
      }
    }
    
    // Parse PreferredPhases
    let preferredPhases: number[] = [];
    if (raw.PreferredPhases) {
      if (typeof raw.PreferredPhases === 'string') {
        try {
          // Handle ranges like "1-3" or lists like "[1,2,3]" or "1,2,3"
          const str = raw.PreferredPhases.trim();
          if (str.includes('-')) {
            const [start, end] = str.split('-').map(n => parseInt(n.trim()));
            for (let i = start; i <= end; i++) {
              preferredPhases.push(i);
            }
          } else {
            const cleanStr = str.replace(/[\[\]]/g, '');
            preferredPhases = cleanStr.split(',').map(phase => parseInt(phase.trim())).filter(phase => !isNaN(phase));
          }
        } catch {
          errors.push(`Row ${index + 1}: Invalid PreferredPhases format`);
        }
      } else if (Array.isArray(raw.PreferredPhases)) {
        preferredPhases = raw.PreferredPhases.map(phase => Number(phase)).filter(phase => !isNaN(phase));
      }
    }
    
    return {
      TaskID: String(raw.TaskID || '').trim(),
      TaskName: String(raw.TaskName || '').trim(),
      Category: String(raw.Category || '').trim(),
      Duration: Number(raw.Duration) || 1,
      RequiredSkills: requiredSkills,
      PreferredPhases: preferredPhases,
      MaxConcurrent: Number(raw.MaxConcurrent) || 1
    };
  } catch (error) {
    errors.push(`Row ${index + 1}: Failed to parse task data`);
    return null;
  }
}