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
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <input
          type="text"
          placeholder="Search data..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="text-sm text-gray-600">
          {filteredData.length} of {data.length} entries
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {columns[type].map(column => (
                  <th key={column.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    {column.label}
                    {column.editable && <Edit3 className="w-3 h-3 inline ml-1" />}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, rowIndex) => {
                const entityId = (item as any)[type.slice(0, -1) + 'ID'] || `row-${rowIndex}`;
                return (
                  <tr key={entityId} className="border-b hover:bg-gray-50">
                    {columns[type].map(column => {
                      const cellErrors = getCellErrors(rowIndex, column.key);
                      const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.field === column.key;
                      
                      return (
                        <td
                          key={`${entityId}-${column.key}`}
                          className={`p-3 ${cellErrors.length > 0 ? 'bg-red-50' : ''} ${isEditing ? 'bg-blue-50' : ''}`}
                          onClick={() => !isEditing && startEditing(rowIndex, column.key)}
                        >
                          {isEditing ? (
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="p-2 border border-gray-300 rounded text-sm flex-1"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit();
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                autoFocus
                              />
                              <button onClick={saveEdit} className="text-green-600">
                                <Save className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingCell(null)} className="text-red-600">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="text-sm">{formatCellValue((item as any)[column.key])}</span>
                              {cellErrors.length > 0 && <AlertCircle className="w-4 h-4 text-red-500" />}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td key={`${entityId}-status`} className="p-3">
                      {(() => {
                        const itemErrors = validationErrors.filter(e => e.entityId === entityId);
                        if (itemErrors.some(e => e.type === 'error')) {
                          return <div className="flex items-center text-red-600"><AlertCircle className="w-4 h-4 mr-1" />Error</div>;
                        } else if (itemErrors.some(e => e.type === 'warning')) {
                          return <div className="flex items-center text-yellow-600"><AlertTriangle className="w-4 h-4 mr-1" />Warning</div>;
                        }
                        return <div className="flex items-center text-green-600"><CheckCircle className="w-4 h-4 mr-1" />Valid</div>;
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
        <div className="bg-gray-50 border rounded-lg p-4">
          <h4 className="font-medium mb-2">Validation Issues</h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {validationErrors.slice(0, 5).map(error => (
              <div key={error.id} className={`text-sm ${error.type === 'error' ? 'text-red-600' : 'text-yellow-600'}`}>
                {error.entityId}: {error.message}
              </div>
            ))}
            {validationErrors.length > 5 && (
              <div className="text-xs text-gray-500">... and {validationErrors.length - 5} more</div>
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

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center space-x-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium">
          <FileSpreadsheet className="w-4 h-4" />
          <span>AI Resource Allocation Configurator</span>
        </div>
        <h1 className="text-4xl font-bold text-gray-900">Transform Your Spreadsheet Chaos</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Upload messy CSV files, let AI validate and clean your data, configure business rules, 
          and export perfect allocation-ready datasets.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-lg border shadow-sm p-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const status = getStepStatus(step.id);
            const StepIcon = step.icon;
            
            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center space-y-2">
                  <div 
                    className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                      status === 'complete' ? 'bg-green-500 text-white' :
                      status === 'current' ? 'bg-blue-500 text-white' :
                      'bg-gray-200 text-gray-500'
                    }`}
                    onClick={() => {
                      if (status === 'complete' || step.id === 'upload') {
                        setCurrentStep(step.id as any);
                      }
                    }}
                  >
                    <StepIcon className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <div className={`text-sm font-medium ${
                      status === 'current' ? 'text-blue-600' : 'text-gray-900'
                    }`}>
                      {step.label}
                    </div>
                    <div className="text-xs text-gray-500">{step.description}</div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-24 h-1 mx-4 ${
                    getStepStatus(steps[index + 1].id) === 'complete' ? 'bg-green-500' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          
          {/* Upload Section */}
          {currentStep === 'upload' && (
            <div className="bg-white rounded-lg border shadow-sm p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Upload Your Data Files</h2>
                <p className="text-gray-600 mt-1">
                  Upload CSV files containing clients, workers, and tasks data. 
                  AI will automatically map columns even if headers are misnamed.
                </p>
              </div>
              <div className="space-y-4">
                <div 
                  className={`border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors ${isUploading ? 'opacity-50' : ''}`}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                      {isUploading ? (
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Upload className="w-8 h-8 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">
                        {isUploading ? 'Processing files...' : 'Drop files here or click to upload'}
                      </h3>
                      <p className="text-sm text-gray-500">Supports CSV files up to 10MB each</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".csv"
                      onChange={handleFileInputChange}
                      className="hidden"
                      id="file-upload"
                      disabled={isUploading}
                    />
                    <label
                      htmlFor="file-upload"
                      className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 cursor-pointer transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isUploading ? 'Processing...' : 'Choose Files'}
                    </label>
                  </div>
                </div>

                {/* Uploaded Files List */}
                {uploadedFiles.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <h4 className="font-medium text-gray-900">Processing Results:</h4>
                    {uploadedFiles.map((result, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <FileSpreadsheet className="w-4 h-4 text-blue-500" />
                          <span className="text-sm text-gray-700">{result.fileName}</span>
                          <span className="text-xs text-gray-500">({result.type})</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {result.errors.length > 0 ? (
                            <div className="flex items-center space-x-1">
                              <AlertCircle className="w-4 h-4 text-red-500" />
                              <span className="text-xs text-red-600">{result.errors.length} errors</span>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-1">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span className="text-xs text-green-600">{result.data.length} entries</span>
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
            <div className="space-y-6">
              <div className="bg-white rounded-lg border shadow-sm p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Data Validation & Editing</h2>
                <p className="text-gray-600">
                  Review your data, fix any errors, and search through entries.
                </p>
              </div>

              {/* Natural Language Query */}
              <div className="bg-white rounded-lg border shadow-sm p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <Search className="w-5 h-5" />
                  <h3 className="text-lg font-medium">Natural Language Data Retrieval</h3>
                </div>
                <p className="text-gray-600 mb-4">Query your data using natural language</p>
                <div className="flex space-x-2 mb-4">
                  <input
                    type="text"
                    placeholder="Example: 'Show me high priority clients' or 'Find senior developers'"
                    className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={nlQuery}
                    onChange={(e) => setNlQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleNLQuery()}
                  />
                  <button 
                    onClick={handleNLQuery}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Search
                  </button>
                </div>
                
                {queryResults.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium text-gray-900 mb-2">Search Results ({queryResults.length})</h4>
                    <div className="bg-gray-50 border rounded-lg p-3 max-h-40 overflow-y-auto">
                      {queryResults.slice(0, 5).map((item, index) => (
                        <div key={index} className="text-sm text-gray-700 py-1">
                          {item.ClientName || item.WorkerName || item.TaskName} 
                          {item.PriorityLevel && ` (Priority: ${item.PriorityLevel})`}
                          {item.QualificationLevel && ` (${item.QualificationLevel})`}
                          {item.Category && ` (${item.Category})`}
                        </div>
                      ))}
                      {queryResults.length > 5 && (
                        <div className="text-xs text-gray-500 mt-2">
                          ... and {queryResults.length - 5} more results
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Error Correction */}
              {validationResult.errors.length > 0 && (
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <Settings className="w-5 h-5" />
                      <h3 className="text-lg font-medium">AI Error Correction</h3>
                    </div>
                    <button 
                      onClick={handleGetCorrections}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Get AI Suggestions
                    </button>
                  </div>
                  {correctionSuggestions.length > 0 ? (
                    <div className="space-y-2">
                      {correctionSuggestions.map((suggestion, index) => (
                        <div key={index} className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-start space-x-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                            <span className="text-sm text-green-800">{suggestion}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-4">
                      Click "Get AI Suggestions" to receive correction recommendations
                    </div>
                  )}
                </div>
              )}

              {/* Validation Summary */}
              {(validationResult.errors.length > 0 || validationResult.warnings.length > 0) && (
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <h3 className="text-lg font-medium mb-4">Validation Summary</h3>
                  <div className="flex items-center space-x-6 mb-4">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-5 h-5 text-red-500" />
                      <span className="text-red-600 font-medium">{validationResult.errors.length} Errors</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                      <span className="text-yellow-600 font-medium">{validationResult.warnings.length} Warnings</span>
                    </div>
                  </div>
                  {validationResult.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                      <h4 className="text-sm font-medium text-red-800 mb-2">Critical Errors (Must Fix)</h4>
                      <div className="space-y-1">
                        {validationResult.errors.slice(0, 3).map(error => (
                          <div key={error.id} className="text-sm text-red-700">
                            • {error.entityId}: {error.message}
                          </div>
                        ))}
                        {validationResult.errors.length > 3 && (
                          <div className="text-xs text-red-600">... and {validationResult.errors.length - 3} more errors</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Data Grids */}
              {dataSet.clients.length > 0 && (
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <h3 className="text-lg font-medium mb-4">Clients Data ({dataSet.clients.length} entries)</h3>
                  <DataGrid
                    data={dataSet.clients}
                    type="clients"
                    validationErrors={validationResult.errors.concat(validationResult.warnings).filter(e => e.entityType === 'client')}
                    onDataChange={(data) => handleDataChange('clients', data)}
                  />
                </div>
              )}

              {dataSet.workers.length > 0 && (
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <h3 className="text-lg font-medium mb-4">Workers Data ({dataSet.workers.length} entries)</h3>
                  <DataGrid
                    data={dataSet.workers}
                    type="workers"
                    validationErrors={validationResult.errors.concat(validationResult.warnings).filter(e => e.entityType === 'worker')}
                    onDataChange={(data) => handleDataChange('workers', data)}
                  />
                </div>
              )}

              {dataSet.tasks.length > 0 && (
                <div className="bg-white rounded-lg border shadow-sm p-6">
                  <h3 className="text-lg font-medium mb-4">Tasks Data ({dataSet.tasks.length} entries)</h3>
                  <DataGrid
                    data={dataSet.tasks}
                    type="tasks"
                    validationErrors={validationResult.errors.concat(validationResult.warnings).filter(e => e.entityType === 'task')}
                    onDataChange={(data) => handleDataChange('tasks', data)}
                  />
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between">
                <button 
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => setCurrentStep('upload')}
                >
                  Back to Upload
                </button>
                <button 
                  className={`px-6 py-3 rounded-lg transition-colors ${
                    validationResult.errors.length > 0 
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                  onClick={() => setCurrentStep('rules')}
                  disabled={validationResult.errors.length > 0}
                >
                  Continue to Rules
                  {validationResult.errors.length > 0 && (
                    <span className="ml-2 text-xs">(Fix errors first)</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Enhanced Rules Section */}
          {currentStep === 'rules' && (
            <div className="space-y-6">
              {/* Priority Weights Section */}
              <div className="bg-white rounded-lg border shadow-sm p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <Sliders className="w-5 h-5" />
                  <h3 className="text-lg font-medium">Prioritization & Weights</h3>
                </div>
                <p className="text-gray-600 mb-6">Configure how different factors influence task allocation</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Natural Language Rule Creation */}
              <div className="bg-white rounded-lg border shadow-sm p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <Brain className="w-5 h-5" />
                  <h3 className="text-lg font-medium">AI-Powered Rule Creation</h3>
                </div>
                <p className="text-gray-600 mb-4">Describe rules in plain English and let AI convert them</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Describe a rule in plain English:
                    </label>
                    <textarea 
                      placeholder="Example: 'Marketing tasks should never run in phase 1' or 'Senior developers can take maximum 2 tasks per phase'"
                      className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                      value={naturalLanguageRule}
                      onChange={(e) => setNaturalLanguageRule(e.target.value)}
                    />
                    <button 
                      onClick={handleCreateRule}
                      disabled={isProcessingRule || !naturalLanguageRule.trim()}
                      className={`mt-2 flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                        isProcessingRule || !naturalLanguageRule.trim()
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {isProcessingRule ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Converting...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-4 h-4" />
                          <span>Convert to Rule</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Recommendations */}
              <div className="bg-white rounded-lg border shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Lightbulb className="w-5 h-5" />
                    <h3 className="text-lg font-medium">AI Rule Recommendations</h3>
                  </div>
                  <button 
                    onClick={handleGenerateRecommendations}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Generate Recommendations
                  </button>
                </div>
                {recommendedRules.length > 0 ? (
                  <div className="space-y-3">
                    {recommendedRules.map(rule => (
                      <div key={rule.id} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-blue-900">{rule.description}</h4>
                            <p className="text-sm text-blue-700 mt-1">
                              {rule.condition} → {rule.action}
                            </p>
                            <div className="flex items-center space-x-2 mt-2">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                rule.type === 'constraint' ? 'bg-red-100 text-red-700' :
                                rule.type === 'requirement' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {rule.type}
                              </span>
                              <span className="text-xs text-blue-600">Priority: {rule.priority}</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => addRecommendedRule(rule)}
                            className="ml-3 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                          >
                            Add Rule
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    Click "Generate Recommendations" to get AI-suggested rules based on your data
                  </div>
                )}
              </div>

              {/* Active Rules */}
              <div className="bg-white rounded-lg border shadow-sm p-6">
                <h3 className="text-lg font-medium mb-4">Active Business Rules ({businessRules.length})</h3>
                {businessRules.length > 0 ? (
                  <div className="space-y-3">
                    {businessRules.map(rule => (
                      <div key={rule.id} className="p-4 border border-gray-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <h4 className="font-medium text-gray-900">{rule.description}</h4>
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                rule.type === 'constraint' ? 'bg-red-100 text-red-700' :
                                rule.type === 'requirement' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {rule.type}
                              </span>
                              <span className="text-xs text-gray-500">Priority: {rule.priority}</span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">
                              <strong>When:</strong> {rule.condition}
                            </p>
                            <p className="text-sm text-gray-600">
                              <strong>Then:</strong> {rule.action}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2 ml-3">
                            <button
                              onClick={() => toggleRule(rule.id)}
                              className={`p-2 rounded-lg ${rule.active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}
                            >
                              <Power className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteRule(rule.id)}
                              className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <Settings className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p>No rules created yet</p>
                    <p className="text-sm">Use the AI tools above to create your first rule</p>
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="flex justify-between pt-4">
                <button 
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => setCurrentStep('validate')}
                >
                  Back to Validation
                </button>
                <button 
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  onClick={() => setCurrentStep('export')}
                >
                  Continue to Export
                </button>
              </div>
            </div>
          )}

          {/* Export Section */}
          {currentStep === 'export' && (
            <div className="bg-white rounded-lg border shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Export Configuration</h2>
              <p className="text-gray-600 mb-6">
                Download your cleaned data and configuration files for downstream processing.
              </p>
              <div className="space-y-6">
                {/* Export Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-blue-900">Data Files</span>
                    </div>
                    <div className="mt-2 text-sm text-blue-700">
                      <div>• {dataSet.clients.length} clients</div>
                      <div>• {dataSet.workers.length} workers</div>
                      <div>• {dataSet.tasks.length} tasks</div>
                    </div>
                  </div>
                  
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-green-900">Validation</span>
                    </div>
                    <div className="mt-2 text-sm text-green-700">
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
                  
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <Settings className="w-5 h-5 text-purple-600" />
                      <span className="font-medium text-purple-900">Rules</span>
                    </div>
                    <div className="mt-2 text-sm text-purple-700">
                      <div>{businessRules.filter(r => r.active).length} active rules</div>
                      <div>Ready for export</div>
                    </div>
                  </div>
                </div>

                {/* File Preview */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Files to be exported:</h4>
                  <div className="space-y-2">
                    {dataSet.clients.length > 0 && (
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">clients_cleaned.csv</span>
                        <span className="text-xs text-gray-500">{dataSet.clients.length} entries</span>
                      </div>
                    )}
                    {dataSet.workers.length > 0 && (
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">workers_cleaned.csv</span>
                        <span className="text-xs text-gray-500">{dataSet.workers.length} entries</span>
                      </div>
                    )}
                    {dataSet.tasks.length > 0 && (
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">tasks_cleaned.csv</span>
                        <span className="text-xs text-gray-500">{dataSet.tasks.length} entries</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm">validation_report.json</span>
                      <span className="text-xs text-gray-500">Validation summary</span>
                    </div>
                    {businessRules.length > 0 && (
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">business_rules.json</span>
                        <span className="text-xs text-gray-500">{businessRules.length} rules</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Export Actions */}
                <div className="flex space-x-3">
                  <button 
                    className={`flex-1 flex items-center justify-center space-x-2 px-6 py-3 rounded-lg text-lg font-medium transition-colors ${
                      dataSet.clients.length + dataSet.workers.length + dataSet.tasks.length === 0
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                    onClick={exportData}
                    disabled={dataSet.clients.length + dataSet.workers.length + dataSet.tasks.length === 0}
                  >
                    <Download className="w-4 h-4" />
                    <span>Download All Files</span>
                  </button>
                  <button 
                    className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
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
        <div className="space-y-6">
          
          {/* System Status */}
          <div className="bg-white rounded-lg border shadow-sm p-6">
            <h3 className="text-lg font-medium mb-4">System Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Parser Engine</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-600">Ready</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Validation Engine</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-600">Active</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">AI Rules Engine</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-600">Ready</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Export System</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-600">Ready</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-lg border shadow-sm p-6">
            <h3 className="text-lg font-medium mb-4">Data Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Clients</span>
                <span className="text-sm font-medium">{dataSet.clients.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Workers</span>
                <span className="text-sm font-medium">{dataSet.workers.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Tasks</span>
                <span className="text-sm font-medium">{dataSet.tasks.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Active Rules</span>
                <span className="text-sm font-medium">{businessRules.filter(r => r.active).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Validation Errors</span>
                <span className={`text-sm font-medium ${validationResult.errors.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {validationResult.errors.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Validation Warnings</span>
                <span className={`text-sm font-medium ${validationResult.warnings.length > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {validationResult.warnings.length}
                </span>
              </div>
            </div>
          </div>

          {/* Help Panel */}
          <div className="bg-white rounded-lg border shadow-sm p-6">
            <h3 className="text-lg font-medium mb-4">Quick Tips</h3>
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                <h4 className="font-medium text-gray-900 mb-1">File Naming:</h4>
                <ul className="text-xs space-y-1">
                  <li>• Use "clients" in filename for client data</li>
                  <li>• Use "workers" in filename for worker data</li>
                  <li>• Use "tasks" in filename for task data</li>
                </ul>
              </div>
              <div className="text-sm text-gray-600">
                <h4 className="font-medium text-gray-900 mb-1">Data Format:</h4>
                <ul className="text-xs space-y-1">
                  <li>• Arrays: "skill1,skill2,skill3"</li>
                  <li>• Numbers: "1,2,3" or "[1,2,3]"</li>
                  <li>• Priority: 1-5 (higher = more important)</li>
                </ul>
              </div>
              <div className="text-sm text-gray-600">
                <h4 className="font-medium text-gray-900 mb-1">AI Features:</h4>
                <ul className="text-xs space-y-1">
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
    </div>
  );
}