'use client';

import { useState, useMemo } from 'react';
import { Client, Worker, Task, ValidationError } from '@/types';
import { AlertCircle, CheckCircle, AlertTriangle, Edit3, Save, X } from 'lucide-react';

interface DataGridProps {
  data: (Client | Worker | Task)[];
  type: 'clients' | 'workers' | 'tasks';
  validationErrors: ValidationError[];
  onDataChange: (updatedData: (Client | Worker | Task)[]) => void;
}

export default function DataGrid({ data, type, validationErrors, onDataChange }: DataGridProps) {
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Get column definitions based on type
  const columns = useMemo(() => {
    switch (type) {
      case 'clients':
        return [
          { key: 'ClientID', label: 'Client ID', editable: false },
          { key: 'ClientName', label: 'Client Name', editable: true },
          { key: 'PriorityLevel', label: 'Priority', editable: true },
          { key: 'RequestedTaskIDs', label: 'Requested Tasks', editable: true },
          { key: 'GroupTag', label: 'Group', editable: true },
          { key: 'AttributesJSON', label: 'Attributes', editable: true }
        ];
      case 'workers':
        return [
          { key: 'WorkerID', label: 'Worker ID', editable: false },
          { key: 'WorkerName', label: 'Worker Name', editable: true },
          { key: 'Skills', label: 'Skills', editable: true },
          { key: 'AvailableSlots', label: 'Available Slots', editable: true },
          { key: 'MaxLoadPerPhase', label: 'Max Load', editable: true },
          { key: 'WorkerGroup', label: 'Group', editable: true },
          { key: 'QualificationLevel', label: 'Qualification', editable: true }
        ];
      case 'tasks':
        return [
          { key: 'TaskID', label: 'Task ID', editable: false },
          { key: 'TaskName', label: 'Task Name', editable: true },
          { key: 'Category', label: 'Category', editable: true },
          { key: 'Duration', label: 'Duration', editable: true },
          { key: 'RequiredSkills', label: 'Required Skills', editable: true },
          { key: 'PreferredPhases', label: 'Preferred Phases', editable: true },
          { key: 'MaxConcurrent', label: 'Max Concurrent', editable: true }
        ];
      default:
        return [];
    }
  }, [type]);

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    
    return data.filter(item => {
      return Object.values(item).some(value => {
        if (Array.isArray(value)) {
          return value.some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()));
        }
        return String(value).toLowerCase().includes(searchTerm.toLowerCase());
      });
    });
  }, [data, searchTerm]);

  // Get validation errors for specific cell
  const getCellErrors = (rowIndex: number, field: string) => {
    const item = filteredData[rowIndex];
    const entityId = getEntityId(item);
    return validationErrors.filter(error => 
      error.entityId === entityId && error.field === field
    );
  };

  const getEntityId = (item: Client | Worker | Task) => {
    if ('ClientID' in item) return item.ClientID;
    if ('WorkerID' in item) return item.WorkerID;
    if ('TaskID' in item) return item.TaskID;
    return '';
  };

  const formatCellValue = (value: any): string => {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return String(value || '');
  };

  const parseCellValue = (value: string, field: string): any => {
    // Handle array fields
    if (['RequestedTaskIDs', 'Skills', 'RequiredSkills', 'AvailableSlots', 'PreferredPhases'].includes(field)) {
      return value.split(',').map(v => {
        const trimmed = v.trim();
        // For numeric arrays
        if (['AvailableSlots', 'PreferredPhases'].includes(field)) {
          return parseInt(trimmed) || 0;
        }
        return trimmed;
      }).filter(v => v !== '' && v !== 0);
    }
    
    // Handle numeric fields
    if (['PriorityLevel', 'Duration', 'MaxLoadPerPhase', 'MaxConcurrent'].includes(field)) {
      return parseInt(value) || 0;
    }
    
    // Handle JSON fields
    if (field === 'AttributesJSON') {
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }
    
    return value;
  };

  const startEditing = (rowIndex: number, field: string) => {
    if (!columns.find(col => col.key === field)?.editable) return;
    
    const currentValue = filteredData[rowIndex][field as keyof (Client | Worker | Task)];
    setEditValue(formatCellValue(currentValue));
    setEditingCell({ rowIndex, field });
  };

  const saveEdit = () => {
    if (!editingCell) return;
    
    const { rowIndex, field } = editingCell;
    const updatedData = [...data];
    const itemIndex = data.findIndex(item => getEntityId(item) === getEntityId(filteredData[rowIndex]));
    
    if (itemIndex !== -1) {
      const parsedValue = parseCellValue(editValue, field);
      (updatedData[itemIndex] as any)[field] = parsedValue;
      onDataChange(updatedData);
    }
    
    setEditingCell(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const getCellClassName = (rowIndex: number, field: string) => {
    const errors = getCellErrors(rowIndex, field);
    const baseClass = 'p-2 border-b border-gray-200 relative';
    
    if (errors.length > 0) {
      const hasError = errors.some(e => e.type === 'error');
      if (hasError) return `${baseClass} bg-red-50 border-red-200`;
      return `${baseClass} bg-yellow-50 border-yellow-200`;
    }
    
    if (editingCell?.rowIndex === rowIndex && editingCell?.field === field) {
      return `${baseClass} bg-blue-50 border-blue-200`;
    }
    
    return baseClass;
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex items-center space-x-4">
        <input
          type="text"
          placeholder="Search data..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input flex-1"
        />
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <span>{filteredData.length} of {data.length} entries</span>
          {validationErrors.length > 0 && (
            <div className="flex items-center space-x-1">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-red-600">{validationErrors.filter(e => e.type === 'error').length} errors</span>
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <span className="text-yellow-600">{validationErrors.filter(e => e.type === 'warning').length} warnings</span>
            </div>
          )}
        </div>
      </div>

      {/* Data Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {columns.map(column => (
                  <th
                    key={column.key}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {column.label}
                    {column.editable && (
                      <Edit3 className="w-3 h-3 inline ml-1 text-gray-400" />
                    )}
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((item, rowIndex) => (
                <tr key={getEntityId(item)} className="hover:bg-gray-50">
                  {columns.map(column => {
                    const cellErrors = getCellErrors(rowIndex, column.key);
                    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.field === column.key;
                    
                    return (
                      <td
                        key={column.key}
                        className={getCellClassName(rowIndex, column.key)}
                        onClick={() => !isEditing && startEditing(rowIndex, column.key)}
                      >
                        {isEditing ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="input text-sm"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit();
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              autoFocus
                            />
                            <button
                              onClick={saveEdit}
                              className="p-1 text-green-600 hover:bg-green-100 rounded"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 text-red-600 hover:bg-red-100 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-900">
                              {formatCellValue((item as any)[column.key])}
                            </span>
                            {cellErrors.length > 0 && (
                              <div className="flex items-center">
                                {cellErrors.some(e => e.type === 'error') ? (
                                  <AlertCircle className="w-4 h-4 text-red-500" />
                                ) : (
                                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Error tooltip */}
                        {cellErrors.length > 0 && !isEditing && (
                          <div className="absolute z-10 invisible group-hover:visible bg-gray-900 text-white text-xs rounded py-1 px-2 -mt-8 left-0">
                            {cellErrors.map(error => (
                              <div key={error.id}>{error.message}</div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  
                  {/* Status column */}
                  <td className="px-4 py-2 border-b border-gray-200">
                    {(() => {
                      const entityId = getEntityId(item);
                      const itemErrors = validationErrors.filter(e => e.entityId === entityId);
                      const hasErrors = itemErrors.some(e => e.type === 'error');
                      const hasWarnings = itemErrors.some(e => e.type === 'warning');
                      
                      if (hasErrors) {
                        return (
                          <div className="flex items-center space-x-1 text-red-600">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-xs">Error</span>
                          </div>
                        );
                      } else if (hasWarnings) {
                        return (
                          <div className="flex items-center space-x-1 text-yellow-600">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="text-xs">Warning</span>
                          </div>
                        );
                      } else {
                        return (
                          <div className="flex items-center space-x-1 text-green-600">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-xs">Valid</span>
                          </div>
                        );
                      }
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Validation Summary */}
      {validationErrors.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">Validation Summary</h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {validationErrors.slice(0, 10).map(error => (
              <div
                key={error.id}
                className={`text-sm flex items-center space-x-2 ${
                  error.type === 'error' ? 'text-red-600' : 'text-yellow-600'
                }`}
              >
                {error.type === 'error' ? (
                  <AlertCircle className="w-3 h-3" />
                ) : (
                  <AlertTriangle className="w-3 h-3" />
                )}
                <span>{error.entityId}: {error.message}</span>
              </div>
            ))}
            {validationErrors.length > 10 && (
              <div className="text-xs text-gray-500">
                ... and {validationErrors.length - 10} more issues
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}