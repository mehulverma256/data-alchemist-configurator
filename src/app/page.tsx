'use client';

import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Settings, Download, AlertTriangle, Edit3, Save, X, Wand2, Lightbulb, Trash2, Power, Brain, Search, Sliders } from 'lucide-react';
import { 
  convertNaturalLanguageToRule, 
  generateRuleRecommendations, 
  getErrorCorrectionSuggestions,
  queryDataWithNL,
  BusinessRule 
} from '../lib/ai/ai';

// Types
interface Client {
  ClientID: string;
  ClientName: string;
  PriorityLevel: number;
  RequestedTaskIDs: string[];
  GroupTag: string;
  AttributesJSON: Record<string, any>;
}

interface Worker {
  WorkerID: string;
  WorkerName: string;
  Skills: string[];
  AvailableSlots: number[];
  MaxLoadPerPhase: number;
  WorkerGroup: string;
  QualificationLevel: string;
}

interface Task {
  TaskID: string;
  TaskName: string;
  Category: string;
  Duration: number;
  RequiredSkills: string[];
  PreferredPhases: number[];
  MaxConcurrent: number;
}

interface ValidationError {
  id: string;
  type: 'error' | 'warning';
  message: string;
  field?: string;
  entityType: 'client' | 'worker' | 'task';
  entityId: string;
  severity: 'low' | 'medium' | 'high';
}

interface ParseResult<T> {
  data: T[];
  errors: string[];
  fileName: string;
  type: 'clients' | 'workers' | 'tasks';
}

interface DataSet {
  clients: Client[];
  workers: Worker[];
  tasks: Task[];
}

// Helper functions for parsing
const parseArrayField = (value: string): string[] => {
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

const parseNumberArrayField = (value: string): number[] => {
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

const parseJSONField = (value: string): Record<string, any> => {
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

// Robust CSV parser
const parseCSV = (text: string): any[] => {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  // Robust CSV parsing that properly handles quoted fields
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
const parseFile = async (file: File): Promise<ParseResult<any>> => {
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
    const parsedData = rawData.map((row, index) => {
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

// Enhanced validation with more rules
const validateDataSet = (data: DataSet) => {
  const errors: ValidationError[] = [];
  
  // Validate clients
  data.clients.forEach(client => {
    if (!client.ClientID) {
      errors.push({
        id: `missing-client-id-${Math.random()}`,
        type: 'error',
        message: 'Missing ClientID',
        field: 'ClientID',
        entityType: 'client',
        entityId: client.ClientID || 'Unknown',
        severity: 'high'
      });
    }
    if (!client.ClientName) {
      errors.push({
        id: `missing-client-name-${client.ClientID}`,
        type: 'error',
        message: 'Missing ClientName',
        field: 'ClientName',
        entityType: 'client',
        entityId: client.ClientID,
        severity: 'high'
      });
    }
    if (client.PriorityLevel < 1 || client.PriorityLevel > 5) {
      errors.push({
        id: `invalid-priority-${client.ClientID}`,
        type: 'error',
        message: `PriorityLevel must be 1-5, got ${client.PriorityLevel}`,
        field: 'PriorityLevel',
        entityType: 'client',
        entityId: client.ClientID,
        severity: 'medium'
      });
    }
  });
  
  // Validate workers
  data.workers.forEach(worker => {
    if (!worker.WorkerID) {
      errors.push({
        id: `missing-worker-id-${Math.random()}`,
        type: 'error',
        message: 'Missing WorkerID',
        field: 'WorkerID',
        entityType: 'worker',
        entityId: worker.WorkerID || 'Unknown',
        severity: 'high'
      });
    }
    if (!worker.WorkerName) {
      errors.push({
        id: `missing-worker-name-${worker.WorkerID}`,
        type: 'error',
        message: 'Missing WorkerName',
        field: 'WorkerName',
        entityType: 'worker',
        entityId: worker.WorkerID,
        severity: 'high'
      });
    }
    if (worker.Skills.length === 0) {
      errors.push({
        id: `no-skills-${worker.WorkerID}`,
        type: 'warning',
        message: 'Worker has no skills listed',
        field: 'Skills',
        entityType: 'worker',
        entityId: worker.WorkerID,
        severity: 'medium'
      });
    }
    if (worker.AvailableSlots.length === 0) {
      errors.push({
        id: `no-slots-${worker.WorkerID}`,
        type: 'error',
        message: 'Worker has no available slots',
        field: 'AvailableSlots',
        entityType: 'worker',
        entityId: worker.WorkerID,
        severity: 'high'
      });
    }
  });
  
  // Validate tasks
  data.tasks.forEach(task => {
    if (!task.TaskID) {
      errors.push({
        id: `missing-task-id-${Math.random()}`,
        type: 'error',
        message: 'Missing TaskID',
        field: 'TaskID',
        entityType: 'task',
        entityId: task.TaskID || 'Unknown',
        severity: 'high'
      });
    }
    if (!task.TaskName) {
      errors.push({
        id: `missing-task-name-${task.TaskID}`,
        type: 'error',
        message: 'Missing TaskName',
        field: 'TaskName',
        entityType: 'task',
        entityId: task.TaskID,
        severity: 'high'
      });
    }
    if (task.Duration < 1) {
      errors.push({
        id: `invalid-duration-${task.TaskID}`,
        type: 'error',
        message: `Duration must be at least 1, got ${task.Duration}`,
        field: 'Duration',
        entityType: 'task',
        entityId: task.TaskID,
        severity: 'medium'
      });
    }
    if (task.RequiredSkills.length === 0) {
      errors.push({
        id: `no-required-skills-${task.TaskID}`,
        type: 'warning',
        message: 'Task has no required skills',
        field: 'RequiredSkills',
        entityType: 'task',
        entityId: task.TaskID,
        severity: 'medium'
      });
    }
  });
  
  // Cross-reference validation
  const taskIDs = new Set(data.tasks.map(task => task.TaskID));
  const availableSkills = new Set(data.workers.flatMap(worker => worker.Skills));
  
  // Check if clients reference valid tasks
  data.clients.forEach(client => {
    client.RequestedTaskIDs.forEach(taskID => {
      if (!taskIDs.has(taskID)) {
        errors.push({
          id: `invalid-task-ref-${client.ClientID}-${taskID}`,
          type: 'error',
          message: `References non-existent task: ${taskID}`,
          field: 'RequestedTaskIDs',
          entityType: 'client',
          entityId: client.ClientID,
          severity: 'high'
        });
      }
    });
  });
  
  // Check if tasks require skills that workers have
  data.tasks.forEach(task => {
    task.RequiredSkills.forEach(skill => {
      if (!availableSkills.has(skill)) {
        errors.push({
          id: `unavailable-skill-${task.TaskID}-${skill}`,
          type: 'warning',
          message: `Requires skill '${skill}' but no worker has it`,
          field: 'RequiredSkills',
          entityType: 'task',
          entityId: task.TaskID,
          severity: 'high'
        });
      }
    });
  });
  
  return {
    isValid: errors.filter(e => e.type === 'error').length === 0,
    errors: errors.filter(e => e.type === 'error'),
    warnings: errors.filter(e => e.type === 'warning')
  };
};

// Data Grid Component
interface DataGridProps {
  data: (Client | Worker | Task)[];
  type: 'clients' | 'workers' | 'tasks';
  validationErrors: ValidationError[];
  onDataChange: (updatedData: (Client | Worker | Task)[]) => void;
}

function DataGrid({ data, type, validationErrors, onDataChange }: DataGridProps) {
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const columns = {
    clients: [
      { key: 'ClientID', label: 'Client ID', editable: false },
      { key: 'ClientName', label: 'Client Name', editable: true },
      { key: 'PriorityLevel', label: 'Priority', editable: true },
      { key: 'RequestedTaskIDs', label: 'Requested Tasks', editable: true },
      { key: 'GroupTag', label: 'Group', editable: true }
    ],
    workers: [
      { key: 'WorkerID', label: 'Worker ID', editable: false },
      { key: 'WorkerName', label: 'Worker Name', editable: true },
      { key: 'Skills', label: 'Skills', editable: true },
      { key: 'AvailableSlots', label: 'Available Slots', editable: true },
      { key: 'MaxLoadPerPhase', label: 'Max Load', editable: true },
      { key: 'WorkerGroup', label: 'Group', editable: true }
    ],
    tasks: [
      { key: 'TaskID', label: 'Task ID', editable: false },
      { key: 'TaskName', label: 'Task Name', editable: true },
      { key: 'Category', label: 'Category', editable: true },
      { key: 'Duration', label: 'Duration', editable: true },
      { key: 'RequiredSkills', label: 'Required Skills', editable: true },
      { key: 'PreferredPhases', label: 'Preferred Phases', editable: true }
    ]
  };

  const filteredData = data.filter(item => 
    searchTerm === '' || Object.values(item).some(value => 
      String(value).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const formatCellValue = (value: any): string => {
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value || '');
  };

  const getCellErrors = (rowIndex: number, field: string) => {
    const item = filteredData[rowIndex];
    const entityId = (item as any)[type.slice(0, -1) + 'ID'] || '';
    return validationErrors.filter(error => 
      error.entityId === entityId && error.field === field
    );
  };

  const startEditing = (rowIndex: number, field: string) => {
    const column = columns[type].find(col => col.key === field);
    if (!column?.editable) return;
    
    setEditValue(formatCellValue((filteredData[rowIndex] as any)[field]));
    setEditingCell({ rowIndex, field });
  };

  const saveEdit = () => {
    if (!editingCell) return;
    
    const { rowIndex, field } = editingCell;
    const updatedData = [...data];
    const itemIndex = data.findIndex(item => 
      (item as any)[type.slice(0, -1) + 'ID'] === (filteredData[rowIndex] as any)[type.slice(0, -1) + 'ID']
    );
    
    if (itemIndex !== -1) {
      let parsedValue: any = editValue;
      
      // Parse arrays
      if (['RequestedTaskIDs', 'Skills', 'RequiredSkills', 'AvailableSlots', 'PreferredPhases'].includes(field)) {
        parsedValue = editValue.split(',').map(v => v.trim()).filter(v => v);
        if (['AvailableSlots', 'PreferredPhases'].includes(field)) {
          parsedValue = parsedValue.map(v => parseInt(v)).filter(v => !isNaN(v));
        }
      }
      
      // Parse numbers
      if (['PriorityLevel', 'Duration', 'MaxLoadPerPhase', 'MaxConcurrent'].includes(field)) {
        parsedValue = parseInt(editValue) || 0;
      }
      
      (updatedData[itemIndex] as any)[field] = parsedValue;
      onDataChange(updatedData);
    }
    
    setEditingCell(null);
    setEditValue('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <input
          type="text"
          placeholder="Search data..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ 
            flex: 1, 
            padding: '8px 12px', 
            border: '1px solid #d1d5db', 
            borderRadius: '6px',
            fontSize: '14px'
          }}
        />
        <div style={{ fontSize: '14px', color: '#6b7280' }}>
          {filteredData.length} of {data.length} entries
        </div>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'white' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ backgroundColor: '#f9fafb' }}>
              <tr>
                {columns[type].map(column => (
                  <th key={column.key} style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    fontSize: '12px', 
                    fontWeight: '500', 
                    color: '#6b7280', 
                    textTransform: 'uppercase' 
                  }}>
                    {column.label}
                    {column.editable && <Edit3 style={{ width: '12px', height: '12px', display: 'inline', marginLeft: '4px' }} />}
                  </th>
                ))}
                <th style={{ 
                  padding: '12px 16px', 
                  textAlign: 'left', 
                  fontSize: '12px', 
                  fontWeight: '500', 
                  color: '#6b7280', 
                  textTransform: 'uppercase' 
                }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, rowIndex) => {
                const entityId = (item as any)[type.slice(0, -1) + 'ID'] || `row-${rowIndex}`;
                return (
                  <tr key={entityId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    {columns[type].map(column => {
                      const cellErrors = getCellErrors(rowIndex, column.key);
                      const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.field === column.key;
                      
                      return (
                        <td
                          key={`${entityId}-${column.key}`}
                          style={{
                            padding: '12px',
                            backgroundColor: cellErrors.length > 0 ? '#fef2f2' : isEditing ? '#eff6ff' : 'transparent',
                            cursor: column.editable ? 'pointer' : 'default'
                          }}
                          onClick={() => !isEditing && startEditing(rowIndex, column.key)}
                        >
                          {isEditing ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                style={{ 
                                  padding: '8px', 
                                  border: '1px solid #d1d5db', 
                                  borderRadius: '4px', 
                                  fontSize: '14px', 
                                  flex: 1 
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit();
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                autoFocus
                              />
                              <button onClick={saveEdit} style={{ color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <Save style={{ width: '16px', height: '16px' }} />
                              </button>
                              <button onClick={() => setEditingCell(null)} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X style={{ width: '16px', height: '16px' }} />
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '14px' }}>{formatCellValue((item as any)[column.key])}</span>
                              {cellErrors.length > 0 && <AlertCircle style={{ width: '16px', height: '16px', color: '#ef4444' }} />}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td key={`${entityId}-status`} style={{ padding: '12px' }}>
                      {(() => {
                        const itemErrors = validationErrors.filter(e => e.entityId === entityId);
                        if (itemErrors.some(e => e.type === 'error')) {
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', color: '#dc2626' }}>
                              <AlertCircle style={{ width: '16px', height: '16px', marginRight: '4px' }} />Error
                            </div>
                          );
                        } else if (itemErrors.some(e => e.type === 'warning')) {
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', color: '#d97706' }}>
                              <AlertTriangle style={{ width: '16px', height: '16px', marginRight: '4px' }} />Warning
                            </div>
                          );
                        }
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', color: '#16a34a' }}>
                            <CheckCircle style={{ width: '16px', height: '16px', marginRight: '4px' }} />Valid
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {validationErrors.length > 0 && (
        <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
          <h4 style={{ fontWeight: '500', marginBottom: '8px' }}>Validation Issues</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '128px', overflowY: 'auto' }}>
            {validationErrors.slice(0, 5).map(error => (
              <div key={error.id} style={{ fontSize: '14px', color: error.type === 'error' ? '#dc2626' : '#d97706' }}>
                {error.entityId}: {error.message}
              </div>
            ))}
            {validationErrors.length > 5 && (
              <div style={{ fontSize: '12px', color: '#6b7280' }}>... and {validationErrors.length - 5} more</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Main Component
export default function HomePage() {
  const [currentStep, setCurrentStep] = useState<'upload' | 'validate' | 'rules' | 'export'>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<ParseResult<any>[]>([]);
  const [validationStatus, setValidationStatus] = useState<'pending' | 'validating' | 'complete' | 'error'>('pending');
  const [dataSet, setDataSet] = useState<DataSet>({ clients: [], workers: [], tasks: [] });
  const [validationResult, setValidationResult] = useState<{ isValid: boolean; errors: ValidationError[]; warnings: ValidationError[] }>({ isValid: true, errors: [], warnings: [] });
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New AI-related state
  const [businessRules, setBusinessRules] = useState<BusinessRule[]>([]);
  const [naturalLanguageRule, setNaturalLanguageRule] = useState('');
  const [recommendedRules, setRecommendedRules] = useState<BusinessRule[]>([]);
  const [isProcessingRule, setIsProcessingRule] = useState(false);
  const [correctionSuggestions, setCorrectionSuggestions] = useState<string[]>([]);
  const [nlQuery, setNlQuery] = useState('');
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [priorityWeights, setPriorityWeights] = useState({
    clientPriority: 40,
    workerLoad: 30,
    skillMatch: 30
  });

  const steps = [
    { id: 'upload', label: 'Upload Data', icon: Upload, description: 'Upload CSV files' },
    { id: 'validate', label: 'Validate & Fix', icon: CheckCircle, description: 'Review and fix data issues' },
    { id: 'rules', label: 'Business Rules', icon: Settings, description: 'Configure allocation rules' },
    { id: 'export', label: 'Export', icon: Download, description: 'Download cleaned data' },
  ];

  // AI Handler Functions
  const handleCreateRule = async () => {
    if (!naturalLanguageRule.trim()) return;
    
    setIsProcessingRule(true);
    try {
      const rule = await convertNaturalLanguageToRule(naturalLanguageRule);
      setBusinessRules(prev => [...prev, rule]);
      setNaturalLanguageRule('');
    } catch (error) {
      console.error('Error creating rule:', error);
    } finally {
      setIsProcessingRule(false);
    }
  };

  const handleGenerateRecommendations = async () => {
    try {
      const recommendations = await generateRuleRecommendations(dataSet);
      setRecommendedRules(recommendations);
    } catch (error) {
      console.error('Error generating recommendations:', error);
    }
  };

  const handleGetCorrections = async () => {
    try {
      const suggestions = await getErrorCorrectionSuggestions(validationResult.errors);
      setCorrectionSuggestions(suggestions);
    } catch (error) {
      console.error('Error getting corrections:', error);
    }
  };

  const handleNLQuery = async () => {
    if (!nlQuery.trim()) return;
    
    try {
      const results = await queryDataWithNL(nlQuery, dataSet);
      setQueryResults(results);
    } catch (error) {
      console.error('Error querying data:', error);
    }
  };

  const addRecommendedRule = (rule: BusinessRule) => {
    setBusinessRules(prev => [...prev, { ...rule, active: true, id: `rule-${Date.now()}` }]);
    setRecommendedRules(prev => prev.filter(r => r.id !== rule.id));
  };

  const toggleRule = (id: string) => {
    setBusinessRules(prev => prev.map(rule => 
      rule.id === id ? { ...rule, active: !rule.active } : rule
    ));
  };

  const deleteRule = (id: string) => {
    setBusinessRules(prev => prev.filter(rule => rule.id !== id));
  };

  const handleFileUpload = async (files: FileList) => {
    setIsUploading(true);
    setValidationStatus('validating');
    
    const results: ParseResult<any>[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const result = await parseFile(file);
      results.push(result);
    }
    
    setUploadedFiles(results);
    
    // Organize data by type
    const newDataSet: DataSet = { clients: [], workers: [], tasks: [] };
    
    results.forEach(result => {
      if (result.data.length > 0) {
        newDataSet[result.type] = result.data;
      }
    });
    
    setDataSet(newDataSet);
    
    // Run validation
    const validation = validateDataSet(newDataSet);
    setValidationResult(validation);
    
    setValidationStatus('complete');
    setIsUploading(false);
    
    // Auto-advance if files were successfully parsed
    if (results.some(r => r.data.length > 0)) {
      setCurrentStep('validate');
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  };

  const handleDataChange = (entityType: 'clients' | 'workers' | 'tasks', updatedData: any[]) => {
    const newDataSet = { ...dataSet };
    newDataSet[entityType] = updatedData;
    setDataSet(newDataSet);
    
    // Re-run validation
    const validation = validateDataSet(newDataSet);
    setValidationResult(validation);
  };

  const getStepStatus = (stepId: string) => {
    const stepIndex = steps.findIndex(s => s.id === stepId);
    const currentIndex = steps.findIndex(s => s.id === currentStep);
    
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  const exportData = () => {
    const convertToCSV = (data: any[]): string => {
      if (data.length === 0) return '';
      
      const headers = Object.keys(data[0]);
      
      // Properly escape CSV values
      const escapeCSVValue = (value: any): string => {
        if (value === null || value === undefined) return '';
        
        let stringValue: string;
        
        // Handle arrays - join with commas
        if (Array.isArray(value)) {
          stringValue = value.join(',');
        } 
        // Handle objects - stringify
        else if (typeof value === 'object') {
          stringValue = JSON.stringify(value).replace(/"/g, '""');
        } 
        // Handle everything else
        else {
          stringValue = String(value);
        }
        
        // Always wrap in quotes to prevent CSV parsing issues
        return `"${stringValue.replace(/"/g, '""')}"`;
      };
      
      // Create header row
      const headerRow = headers.map(header => `"${header}"`).join(',');
      
      // Create data rows
      const dataRows = data.map(row => 
        headers.map(header => escapeCSVValue(row[header])).join(',')
      );
      
      return [headerRow, ...dataRows].join('\n');
    };

    const downloadFile = (content: string, fileName: string, mimeType: string = 'text/csv') => {
      const BOM = '\uFEFF'; // Add BOM for better Excel compatibility
      const blob = new Blob([BOM + content], { type: `${mimeType};charset=utf-8;` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    // Export each data type with proper formatting
    if (dataSet.clients.length > 0) {
      downloadFile(convertToCSV(dataSet.clients), 'clients_cleaned.csv');
    }
    
    if (dataSet.workers.length > 0) {
      downloadFile(convertToCSV(dataSet.workers), 'workers_cleaned.csv');
    }
    
    if (dataSet.tasks.length > 0) {
      downloadFile(convertToCSV(dataSet.tasks), 'tasks_cleaned.csv');
    }

    // Export business rules
    if (businessRules.length > 0) {
      const rulesReport = {
        timestamp: new Date().toISOString(),
        priorityWeights,
        activeRules: businessRules.filter(r => r.active),
        allRules: businessRules
      };
      downloadFile(JSON.stringify(rulesReport, null, 2), 'business_rules.json', 'application/json');
    }

    // Export validation report
    const report = {
      timestamp: new Date().toISOString(),
      totalEntities: dataSet.clients.length + dataSet.workers.length + dataSet.tasks.length,
      validationPassed: validationResult.isValid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      businessRulesCount: businessRules.filter(r => r.active).length,
      priorityWeights,
      summary: {
        clients: dataSet.clients.length,
        workers: dataSet.workers.length,
        tasks: dataSet.tasks.length,
        totalValidationIssues: validationResult.errors.length + validationResult.warnings.length
      }
    };
    
    downloadFile(JSON.stringify(report, null, 2), 'validation_report.json', 'application/json');
    
    // Show success message
    alert(`Exported ${dataSet.clients.length + dataSet.workers.length + dataSet.tasks.length} records and ${businessRules.length} business rules successfully!`);
  };

  // Styles
  const containerStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '32px',
    padding: '24px'
  };

  const headerStyle = {
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px'
  };

  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    padding: '8px 16px',
    borderRadius: '999px',
    fontSize: '14px',
    fontWeight: '500'
  };

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    padding: '24px'
  };

  const buttonStyle = (variant: 'primary' | 'outline' | 'danger' = 'primary', disabled = false) => ({
    padding: '12px 24px',
    border: variant === 'outline' ? '1px solid #d1d5db' : 'none',
    borderRadius: '6px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s',
    backgroundColor: disabled ? '#e5e7eb' : 
                    variant === 'primary' ? '#2563eb' : 
                    variant === 'danger' ? '#dc2626' : 
                    'transparent',
    color: disabled ? '#9ca3af' :
           variant === 'primary' ? 'white' : 
           variant === 'danger' ? 'white' :
           '#374151',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px'
  });

  const inputStyle = {
    width: '100%',
    padding: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px'
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '32px'
  };

  const mainGridStyle = {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '32px'
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={badgeStyle}>
          <FileSpreadsheet style={{ width: '16px', height: '16px' }} />
          <span>AI Resource Allocation Configurator</span>
        </div>
        <h1 style={{ fontSize: '36px', fontWeight: 'bold', color: '#111827', margin: 0 }}>
          Transform Your Spreadsheet Chaos
        </h1>
        <p style={{ fontSize: '20px', color: '#6b7280', maxWidth: '600px', margin: '0 auto' }}>
          Upload messy CSV files, let AI validate and clean your data, configure business rules, 
          and export perfect allocation-ready datasets.
        </p>
      </div>

      {/* Progress Steps */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {steps.map((step, index) => {
            const status = getStepStatus(step.id);
            const StepIcon = step.icon;
            
            return (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <div 
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'colors 0.2s',
                      backgroundColor: status === 'complete' ? '#10b981' : status === 'current' ? '#3b82f6' : '#e5e7eb',
                      color: status === 'complete' || status === 'current' ? 'white' : '#6b7280'
                    }}
                    onClick={() => {
                      if (status === 'complete' || step.id === 'upload') {
                        setCurrentStep(step.id as any);
                      }
                    }}
                  >
                    <StepIcon style={{ width: '24px', height: '24px' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: '500',
                      color: status === 'current' ? '#2563eb' : '#111827'
                    }}>
                      {step.label}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{step.description}</div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div style={{
                    width: '96px',
                    height: '4px',
                    margin: '0 16px',
                    backgroundColor: getStepStatus(steps[index + 1].id) === 'complete' ? '#10b981' : '#e5e7eb'
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div style={mainGridStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Upload Section */}
          {currentStep === 'upload' && (
            <div style={cardStyle}>
              <div style={{ marginBottom: '16px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', margin: '0 0 4px 0' }}>
                  Upload Your Data Files
                </h2>
                <p style={{ color: '#6b7280', margin: 0 }}>
                  Upload CSV files containing clients, workers, and tasks data. 
                  AI will automatically map columns even if headers are misnamed.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div 
                  style={{
                    border: '2px dashed #d1d5db',
                    borderRadius: '8px',
                    padding: '32px',
                    textAlign: 'center',
                    transition: 'border-color 0.2s',
                    opacity: isUploading ? 0.5 : 1
                  }}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      margin: '0 auto',
                      backgroundColor: '#dbeafe',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {isUploading ? (
                        <div style={{
                          width: '32px',
                          height: '32px',
                          border: '2px solid #3b82f6',
                          borderTop: '2px solid transparent',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite'
                        }}></div>
                      ) : (
                        <Upload style={{ width: '32px', height: '32px', color: '#2563eb' }} />
                      )}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: '500', color: '#111827', margin: '0 0 4px 0' }}>
                        {isUploading ? 'Processing files...' : 'Drop files here or click to upload'}
                      </h3>
                      <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>Supports CSV files up to 10MB each</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".csv"
                      onChange={handleFileInputChange}
                      style={{ display: 'none' }}
                      id="file-upload"
                      disabled={isUploading}
                    />
                    <label
                      htmlFor="file-upload"
                      style={{
                        ...buttonStyle('primary', isUploading),
                        fontSize: '16px',
                        padding: '12px 24px'
                      }}
                    >
                      {isUploading ? 'Processing...' : 'Choose Files'}
                    </label>
                  </div>
                </div>

                {/* Uploaded Files List */}
                {uploadedFiles.length > 0 && (
                  <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <h4 style={{ fontWeight: '500', color: '#111827', margin: 0 }}>Processing Results:</h4>
                    {uploadedFiles.map((result, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileSpreadsheet style={{ width: '16px', height: '16px', color: '#3b82f6' }} />
                          <span style={{ fontSize: '14px', color: '#374151' }}>{result.fileName}</span>
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>({result.type})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {result.errors.length > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <AlertCircle style={{ width: '16px', height: '16px', color: '#ef4444' }} />
                              <span style={{ fontSize: '12px', color: '#dc2626' }}>{result.errors.length} errors</span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle style={{ width: '16px', height: '16px', color: '#10b981' }} />
                              <span style={{ fontSize: '12px', color: '#059669' }}>{result.data.length} entries</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Validation Section */}
          {currentStep === 'validate' && (
            <div style={gridStyle}>
              <div style={cardStyle}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', margin: '0 0 8px 0' }}>
                  Data Validation & Editing
                </h2>
                <p style={{ color: '#6b7280', margin: 0 }}>
                  Review your data, fix any errors, and search through entries.
                </p>
              </div>

              {/* Natural Language Query */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Search style={{ width: '20px', height: '20px' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: '500', margin: 0 }}>Natural Language Data Retrieval</h3>
                </div>
                <p style={{ color: '#6b7280', marginBottom: '16px' }}>Query your data using natural language</p>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <input
                    type="text"
                    placeholder="Example: 'Show me high priority clients' or 'Find senior developers'"
                    style={{ ...inputStyle, flex: 1, padding: '12px' }}
                    value={nlQuery}
                    onChange={(e) => setNlQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleNLQuery()}
                  />
                  <button 
                    onClick={handleNLQuery}
                    style={buttonStyle('primary')}
                  >
                    Search
                  </button>
                </div>
                
                {queryResults.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h4 style={{ fontWeight: '500', color: '#111827', marginBottom: '8px' }}>
                      Search Results ({queryResults.length})
                    </h4>
                    <div style={{
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '12px',
                      maxHeight: '160px',
                      overflowY: 'auto'
                    }}>
                      {queryResults.slice(0, 5).map((item, index) => (
                        <div key={index} style={{ fontSize: '14px', color: '#374151', paddingBottom: '4px' }}>
                          {item.ClientName || item.WorkerName || item.TaskName} 
                          {item.PriorityLevel && ` (Priority: ${item.PriorityLevel})`}
                          {item.QualificationLevel && ` (${item.QualificationLevel})`}
                          {item.Category && ` (${item.Category})`}
                        </div>
                      ))}
                      {queryResults.length > 5 && (
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                          ... and {queryResults.length - 5} more results
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Error Correction */}
              {validationResult.errors.length > 0 && (
                <div style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Settings style={{ width: '20px', height: '20px' }} />
                      <h3 style={{ fontSize: '18px', fontWeight: '500', margin: 0 }}>AI Error Correction</h3>
                    </div>
                    <button 
                      onClick={handleGetCorrections}
                      style={buttonStyle('outline')}
                    >
                      Get AI Suggestions
                    </button>
                  </div>
                  {correctionSuggestions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {correctionSuggestions.map((suggestion, index) => (
                        <div key={index} style={{
                          padding: '12px',
                          backgroundColor: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: '8px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <div style={{
                              width: '8px',
                              height: '8px',
                              backgroundColor: '#10b981',
                              borderRadius: '50%',
                              marginTop: '8px'
                            }}></div>
                            <span style={{ fontSize: '14px', color: '#065f46' }}>{suggestion}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#6b7280', padding: '16px' }}>
                      Click "Get AI Suggestions" to receive correction recommendations
                    </div>
                  )}
                </div>
              )}

              {/* Validation Summary */}
              {(validationResult.errors.length > 0 || validationResult.warnings.length > 0) && (
                <div style={cardStyle}>
                  <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px' }}>Validation Summary</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle style={{ width: '20px', height: '20px', color: '#ef4444' }} />
                      <span style={{ color: '#dc2626', fontWeight: '500' }}>{validationResult.errors.length} Errors</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle style={{ width: '20px', height: '20px', color: '#f59e0b' }} />
                      <span style={{ color: '#d97706', fontWeight: '500' }}>{validationResult.warnings.length} Warnings</span>
                    </div>
                  </div>
                  {validationResult.errors.length > 0 && (
                    <div style={{
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '12px'
                    }}>
                      <h4 style={{ fontSize: '14px', fontWeight: '500', color: '#991b1b', marginBottom: '8px' }}>
                        Critical Errors (Must Fix)
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {validationResult.errors.slice(0, 3).map(error => (
                          <div key={error.id} style={{ fontSize: '14px', color: '#b91c1c' }}>
                            • {error.entityId}: {error.message}
                          </div>
                        ))}
                        {validationResult.errors.length > 3 && (
                          <div style={{ fontSize: '12px', color: '#dc2626' }}>
                            ... and {validationResult.errors.length - 3} more errors
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Data Grids */}
              {dataSet.clients.length > 0 && (
                <div style={cardStyle}>
                  <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px' }}>
                    Clients Data ({dataSet.clients.length} entries)
                  </h3>
                  <DataGrid
                    data={dataSet.clients}
                    type="clients"
                    validationErrors={validationResult.errors.concat(validationResult.warnings).filter(e => e.entityType === 'client')}
                    onDataChange={(data) => handleDataChange('clients', data)}
                  />
                </div>
              )}

              {dataSet.workers.length > 0 && (
                <div style={cardStyle}>
                  <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px' }}>
                    Workers Data ({dataSet.workers.length} entries)
                  </h3>
                  <DataGrid
                    data={dataSet.workers}
                    type="workers"
                    validationErrors={validationResult.errors.concat(validationResult.warnings).filter(e => e.entityType === 'worker')}
                    onDataChange={(data) => handleDataChange('workers', data)}
                  />
                </div>
              )}

              {dataSet.tasks.length > 0 && (
                <div style={cardStyle}>
                  <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px' }}>
                    Tasks Data ({dataSet.tasks.length} entries)
                  </h3>
                  <DataGrid
                    data={dataSet.tasks}
                    type="tasks"
                    validationErrors={validationResult.errors.concat(validationResult.warnings).filter(e => e.entityType === 'task')}
                    onDataChange={(data) => handleDataChange('tasks', data)}
                  />
                </div>
              )}

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button 
                  style={buttonStyle('outline')}
                  onClick={() => setCurrentStep('upload')}
                >
                  Back to Upload
                </button>
                <button 
                  style={buttonStyle('primary', validationResult.errors.length > 0)}
                  onClick={() => setCurrentStep('rules')}
                  disabled={validationResult.errors.length > 0}
                >
                  Continue to Rules
                  {validationResult.errors.length > 0 && (
                    <span style={{ marginLeft: '8px', fontSize: '12px' }}>(Fix errors first)</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Enhanced Rules Section */}
          {currentStep === 'rules' && (
            <div style={gridStyle}>
              {/* Priority Weights Section */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Sliders style={{ width: '20px', height: '20px' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: '500', margin: 0 }}>Prioritization & Weights</h3>
                </div>
                <p style={{ color: '#6b7280', marginBottom: '24px' }}>Configure how different factors influence task allocation</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                      Client Priority Weight: {priorityWeights.clientPriority}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={priorityWeights.clientPriority}
                      onChange={(e) => setPriorityWeights(prev => ({ 
                        ...prev, 
                        clientPriority: parseInt(e.target.value)
                      }))}
                      style={{
                        width: '100%',
                        height: '8px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '8px',
                        appearance: 'none',
                        cursor: 'pointer'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                      Worker Load Balance: {priorityWeights.workerLoad}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={priorityWeights.workerLoad}
                      onChange={(e) => setPriorityWeights(prev => ({ 
                        ...prev, 
                        workerLoad: parseInt(e.target.value)
                      }))}
                      style={{
                        width: '100%',
                        height: '8px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '8px',
                        appearance: 'none',
                        cursor: 'pointer'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                      Skill Matching: {priorityWeights.skillMatch}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={priorityWeights.skillMatch}
                      onChange={(e) => setPriorityWeights(prev => ({ 
                        ...prev, 
                        skillMatch: parseInt(e.target.value)
                      }))}
                      style={{
                        width: '100%',
                        height: '8px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '8px',
                        appearance: 'none',
                        cursor: 'pointer'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Natural Language Rule Creation */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Brain style={{ width: '20px', height: '20px' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: '500', margin: 0 }}>AI-Powered Rule Creation</h3>
                </div>
                <p style={{ color: '#6b7280', marginBottom: '16px' }}>Describe rules in plain English and let AI convert them</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                      Describe a rule in plain English:
                    </label>
                    <textarea 
                      placeholder="Example: 'Marketing tasks should never run in phase 1' or 'Senior developers can take maximum 2 tasks per phase'"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        resize: 'none',
                        minHeight: '72px',
                        fontSize: '14px'
                      }}
                      rows={3}
                      value={naturalLanguageRule}
                      onChange={(e) => setNaturalLanguageRule(e.target.value)}
                    />
                    <button 
                      onClick={handleCreateRule}
                      disabled={isProcessingRule || !naturalLanguageRule.trim()}
                      style={{
                        ...buttonStyle('primary', isProcessingRule || !naturalLanguageRule.trim()),
                        marginTop: '8px'
                      }}
                    >
                      {isProcessingRule ? (
                        <>
                          <div style={{
                            width: '16px',
                            height: '16px',
                            border: '2px solid white',
                            borderTop: '2px solid transparent',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                          }}></div>
                          <span>Converting...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 style={{ width: '16px', height: '16px' }} />
                          <span>Convert to Rule</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Recommendations */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Lightbulb style={{ width: '20px', height: '20px' }} />
                    <h3 style={{ fontSize: '18px', fontWeight: '500', margin: 0 }}>AI Rule Recommendations</h3>
                  </div>
                  <button 
                    onClick={handleGenerateRecommendations}
                    style={buttonStyle('outline')}
                  >
                    Generate Recommendations
                  </button>
                </div>
                {recommendedRules.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {recommendedRules.map(rule => (
                      <div key={rule.id} style={{
                        padding: '12px',
                        backgroundColor: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ fontWeight: '500', color: '#1e3a8a', margin: '0 0 4px 0' }}>{rule.description}</h4>
                            <p style={{ fontSize: '14px', color: '#1e40af', margin: '0 0 8px 0' }}>
                              {rule.condition} → {rule.action}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                padding: '2px 8px',
                                fontSize: '12px',
                                borderRadius: '999px',
                                backgroundColor: rule.type === 'constraint' ? '#fee2e2' : 
                                                rule.type === 'requirement' ? '#fef3c7' : '#dcfce7',
                                color: rule.type === 'constraint' ? '#991b1b' :
                                       rule.type === 'requirement' ? '#92400e' : '#166534'
                              }}>
                                {rule.type}
                              </span>
                              <span style={{ fontSize: '12px', color: '#2563eb' }}>Priority: {rule.priority}</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => addRecommendedRule(rule)}
                            style={{
                              marginLeft: '12px',
                              padding: '6px 12px',
                              backgroundColor: '#2563eb',
                              color: 'white',
                              fontSize: '14px',
                              borderRadius: '4px',
                              border: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            Add Rule
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: '#6b7280', padding: '16px' }}>
                    Click "Generate Recommendations" to get AI-suggested rules based on your data
                  </div>
                )}
              </div>

              {/* Active Rules */}
              <div style={cardStyle}>
                <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px' }}>
                  Active Business Rules ({businessRules.length})
                </h3>
                {businessRules.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {businessRules.map(rule => (
                      <div key={rule.id} style={{
                        padding: '16px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                              <h4 style={{ fontWeight: '500', color: '#111827', margin: 0 }}>{rule.description}</h4>
                              <span style={{
                                padding: '2px 8px',
                                fontSize: '12px',
                                borderRadius: '999px',
                                backgroundColor: rule.type === 'constraint' ? '#fee2e2' : 
                                                rule.type === 'requirement' ? '#fef3c7' : '#dcfce7',
                                color: rule.type === 'constraint' ? '#991b1b' :
                                       rule.type === 'requirement' ? '#92400e' : '#166534'
                              }}>
                                {rule.type}
                              </span>
                              <span style={{ fontSize: '12px', color: '#6b7280' }}>Priority: {rule.priority}</span>
                            </div>
                            <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 4px 0' }}>
                              <strong>When:</strong> {rule.condition}
                            </p>
                            <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
                              <strong>Then:</strong> {rule.action}
                            </p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
                            <button
                              onClick={() => toggleRule(rule.id)}
                              style={{
                                padding: '8px',
                                borderRadius: '8px',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: rule.active ? '#dcfce7' : '#f3f4f6',
                                color: rule.active ? '#166534' : '#9ca3af'
                              }}
                            >
                              <Power style={{ width: '16px', height: '16px' }} />
                            </button>
                            <button
                              onClick={() => deleteRule(rule.id)}
                              style={{
                                padding: '8px',
                                borderRadius: '8px',
                                backgroundColor: '#fee2e2',
                                color: '#dc2626',
                                border: 'none',
                                cursor: 'pointer'
                              }}
                            >
                              <Trash2 style={{ width: '16px', height: '16px' }} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: '#6b7280', padding: '32px' }}>
                    <Settings style={{ width: '48px', height: '48px', margin: '0 auto 12px auto', color: '#d1d5db' }} />
                    <p style={{ margin: '0 0 4px 0' }}>No rules created yet</p>
                    <p style={{ fontSize: '14px', margin: 0 }}>Use the AI tools above to create your first rule</p>
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '16px' }}>
                <button 
                  style={buttonStyle('outline')}
                  onClick={() => setCurrentStep('validate')}
                >
                  Back to Validation
                </button>
                <button 
                  style={buttonStyle('primary')}
                  onClick={() => setCurrentStep('export')}
                >
                  Continue to Export
                </button>
              </div>
            </div>
          )}

          {/* Export Section */}
          {currentStep === 'export' && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', margin: '0 0 8px 0' }}>
                Export Configuration
              </h2>
              <p style={{ color: '#6b7280', marginBottom: '24px' }}>
                Download your cleaned data and configuration files for downstream processing.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Export Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div style={{
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '8px',
                    padding: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileSpreadsheet style={{ width: '20px', height: '20px', color: '#2563eb' }} />
                      <span style={{ fontWeight: '500', color: '#1e3a8a' }}>Data Files</span>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '14px', color: '#1e40af' }}>
                      <div>• {dataSet.clients.length} clients</div>
                      <div>• {dataSet.workers.length} workers</div>
                      <div>• {dataSet.tasks.length} tasks</div>
                    </div>
                  </div>
                  
                  <div style={{
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '8px',
                    padding: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle style={{ width: '20px', height: '20px', color: '#16a34a' }} />
                      <span style={{ fontWeight: '500', color: '#15803d' }}>Validation</span>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '14px', color: '#166534' }}>
                      {validationResult.isValid ? (
                        <div>✓ All validations passed</div>
                      ) : (
                        <div>
                          <div>{validationResult.errors.length} errors</div>
                          <div>{validationResult.warnings.length} warnings</div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div style={{
                    backgroundColor: '#faf5ff',
                    border: '1px solid #d8b4fe',
                    borderRadius: '8px',
                    padding: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Settings style={{ width: '20px', height: '20px', color: '#9333ea' }} />
                      <span style={{ fontWeight: '500', color: '#7c3aed' }}>Rules</span>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '14px', color: '#6b21a8' }}>
                      <div>{businessRules.filter(r => r.active).length} active rules</div>
                      <div>Ready for export</div>
                    </div>
                  </div>
                </div>

                {/* File Preview */}
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '12px' }}>
                    Files to be exported:
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {dataSet.clients.length > 0 && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '4px'
                      }}>
                        <span style={{ fontSize: '14px' }}>clients_cleaned.csv</span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{dataSet.clients.length} entries</span>
                      </div>
                    )}
                    {dataSet.workers.length > 0 && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '4px'
                      }}>
                        <span style={{ fontSize: '14px' }}>workers_cleaned.csv</span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{dataSet.workers.length} entries</span>
                      </div>
                    )}
                    {dataSet.tasks.length > 0 && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '4px'
                      }}>
                        <span style={{ fontSize: '14px' }}>tasks_cleaned.csv</span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{dataSet.tasks.length} entries</span>
                      </div>
                    )}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '4px'
                    }}>
                      <span style={{ fontSize: '14px' }}>validation_report.json</span>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>Validation summary</span>
                    </div>
                    {businessRules.length > 0 && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '4px'
                      }}>
                        <span style={{ fontSize: '14px' }}>business_rules.json</span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{businessRules.length} rules</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Export Actions */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    style={{
                      ...buttonStyle('primary', dataSet.clients.length + dataSet.workers.length + dataSet.tasks.length === 0),
                      flex: 1,
                      fontSize: '18px',
                      padding: '12px 24px'
                    }}
                    onClick={exportData}
                    disabled={dataSet.clients.length + dataSet.workers.length + dataSet.tasks.length === 0}
                  >
                    <Download style={{ width: '16px', height: '16px' }} />
                    <span>Download All Files</span>
                  </button>
                  <button 
                    style={buttonStyle('outline')}
                    onClick={() => setCurrentStep('rules')}
                  >
                    Back to Rules
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Status & Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* System Status */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px' }}>System Status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Parser Engine</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }}></div>
                  <span style={{ fontSize: '14px', color: '#059669' }}>Ready</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Validation Engine</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }}></div>
                  <span style={{ fontSize: '14px', color: '#059669' }}>Active</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>AI Rules Engine</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }}></div>
                  <span style={{ fontSize: '14px', color: '#059669' }}>Ready</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Export System</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }}></div>
                  <span style={{ fontSize: '14px', color: '#059669' }}>Ready</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px' }}>Data Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Total Clients</span>
                <span style={{ fontSize: '14px', fontWeight: '500' }}>{dataSet.clients.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Total Workers</span>
                <span style={{ fontSize: '14px', fontWeight: '500' }}>{dataSet.workers.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Total Tasks</span>
                <span style={{ fontSize: '14px', fontWeight: '500' }}>{dataSet.tasks.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Active Rules</span>
                <span style={{ fontSize: '14px', fontWeight: '500' }}>{businessRules.filter(r => r.active).length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Validation Errors</span>
                <span style={{ 
                  fontSize: '14px', 
                  fontWeight: '500',
                  color: validationResult.errors.length > 0 ? '#dc2626' : '#059669'
                }}>
                  {validationResult.errors.length}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Validation Warnings</span>
                <span style={{ 
                  fontSize: '14px', 
                  fontWeight: '500',
                  color: validationResult.warnings.length > 0 ? '#d97706' : '#059669'
                }}>
                  {validationResult.warnings.length}
                </span>
              </div>
            </div>
          </div>

          {/* Help Panel */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '16px' }}>Quick Tips</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                <h4 style={{ fontWeight: '500', color: '#111827', marginBottom: '4px' }}>File Naming:</h4>
                <ul style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '16px' }}>
                  <li>• Use "clients" in filename for client data</li>
                  <li>• Use "workers" in filename for worker data</li>
                  <li>• Use "tasks" in filename for task data</li>
                </ul>
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                <h4 style={{ fontWeight: '500', color: '#111827', marginBottom: '4px' }}>Data Format:</h4>
                <ul style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '16px' }}>
                  <li>• Arrays: "skill1,skill2,skill3"</li>
                  <li>• Numbers: "1,2,3" or "[1,2,3]"</li>
                  <li>• Priority: 1-5 (higher = more important)</li>
                </ul>
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                <h4 style={{ fontWeight: '500', color: '#111827', marginBottom: '4px' }}>AI Features:</h4>
                <ul style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '16px' }}>
                  <li>• Natural language rule creation</li>
                  <li>• Smart data querying</li>
                  <li>• Error correction suggestions</li>
                  <li>• Automated rule recommendations</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
        }
        
        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}