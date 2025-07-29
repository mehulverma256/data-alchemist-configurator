// src/lib/parsers/fileParser.ts
export interface ParseResult<T> {
  data: T[];
  errors: string[];
  fileName: string;
  type: 'clients' | 'workers' | 'tasks';
}

export interface Client {
  ClientID: string;
  ClientName: string;
  PriorityLevel: number;
  RequestedTaskIDs: string[];
  GroupTag: string;
  AttributesJSON: Record<string, any>;
}

export interface Worker {
  WorkerID: string;
  WorkerName: string;
  Skills: string[];
  AvailableSlots: number[];
  MaxLoadPerPhase: number;
  WorkerGroup: string;
  QualificationLevel: string;
}

export interface Task {
  TaskID: string;
  TaskName: string;
  Category: string;
  Duration: number;
  RequiredSkills: string[];
  PreferredPhases: number[];
  MaxConcurrent: number;
}

// Helper functions for parsing
export const parseArrayField = (value: string): string[] => {
  if (!value || value.trim() === '') return [];
  
  // Remove outer quotes if present
  let cleaned = value.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  
  // Remove brackets if present
  cleaned = cleaned.replace(/^\[|\]$/g, '').trim();
  
  if (!cleaned) return [];
  
  // Split by comma and clean each item
  return cleaned.split(',')
    .map(item => item.trim().replace(/^["']|["']$/g, ''))
    .filter(item => item && item !== '');
};

export const parseNumberArrayField = (value: string): number[] => {
  if (!value || value.trim() === '') return [];
  
  // Remove outer quotes if present
  let cleaned = value.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  
  // Remove brackets if present
  cleaned = cleaned.replace(/^\[|\]$/g, '').trim();
  
  if (!cleaned) return [];
  
  // Split by comma, convert to numbers, filter out NaN
  return cleaned.split(',')
    .map(item => {
      const num = parseInt(item.trim());
      return isNaN(num) ? null : num;
    })
    .filter((num): num is number => num !== null);
};

export const parseJSONField = (value: string): Record<string, any> => {
  if (!value || value.trim() === '' || value.trim() === '{}') return {};
  
  try {
    // Remove outer quotes if they exist
    let cleaned = value.trim();
    if ((cleaned.startsWith('"') && cleaned.endsWith('"'))) {
      cleaned = cleaned.slice(1, -1);
      // Handle double-escaped quotes
      cleaned = cleaned.replace(/""/g, '"');
    }
    
    return JSON.parse(cleaned);
  } catch (error) {
    console.warn('Failed to parse JSON:', value);
    return {};
  }
};

// Simple CSV parser
export const parseCSV = (text: string): any[] => {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  // Simple CSV parsing - handles basic cases
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote within quotes
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator outside quotes
        result.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    // Add the last field
    result.push(current);
    return result;
  };
  
  const headers = parseCSVLine(lines[0]);
  const data: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header.trim()] = values[index] ? values[index].trim() : '';
    });
    
    data.push(row);
  }
  
  return data;
};

// File parser
export const parseFile = async (file: File): Promise<ParseResult<any>> => {
  const fileName = file.name.toLowerCase();
  const entityType = fileName.includes('client') ? 'clients' : 
                    fileName.includes('worker') ? 'workers' : 'tasks';
  
  try {
    const text = await file.text();
    const rawData = parseCSV(text);
    
    if (rawData.length === 0) {
      return {
        data: [],
        errors: ['File appears to be empty'],
        fileName: file.name,
        type: entityType
      };
    }
    
    // Parse based on entity type using helper functions
    const parsedData = rawData.map((row) => {
      try {
        switch (entityType) {
          case 'clients':
            return {
              ClientID: row.ClientID || row.clientid || row.id || '',
              ClientName: row.ClientName || row.clientname || row.name || '',
              PriorityLevel: parseInt(row.PriorityLevel || row.priority || '1') || 1,
              RequestedTaskIDs: parseArrayField(row.RequestedTaskIDs || row.tasks || ''),
              GroupTag: row.GroupTag || row.group || '',
              AttributesJSON: parseJSONField(row.AttributesJSON || '{}')
            };
          case 'workers':
            return {
              WorkerID: row.WorkerID || row.workerid || row.id || '',
              WorkerName: row.WorkerName || row.workername || row.name || '',
              Skills: parseArrayField(row.Skills || row.skills || ''),
              AvailableSlots: parseNumberArrayField(row.AvailableSlots || row.slots || ''),
              MaxLoadPerPhase: parseInt(row.MaxLoadPerPhase || row.maxload || '1') || 1,
              WorkerGroup: row.WorkerGroup || row.group || '',
              QualificationLevel: row.QualificationLevel || row.level || ''
            };
          case 'tasks':
            return {
              TaskID: row.TaskID || row.taskid || row.id || '',
              TaskName: row.TaskName || row.taskname || row.name || '',
              Category: row.Category || row.category || '',
              Duration: parseInt(row.Duration || row.duration || '1') || 1,
              RequiredSkills: parseArrayField(row.RequiredSkills || row.skills || ''),
              PreferredPhases: parseNumberArrayField(row.PreferredPhases || row.phases || ''),
              MaxConcurrent: parseInt(row.MaxConcurrent || row.concurrent || '1') || 1
            };
          default:
            return row;
        }
      } catch (error) {
        return null;
      }
    }).filter(item => item !== null);
    
    return {
      data: parsedData,
      errors: [],
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
};