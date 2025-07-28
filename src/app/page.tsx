'use client';

import { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Settings, Download } from 'lucide-react';

export default function HomePage() {
  const [currentStep, setCurrentStep] = useState<'upload' | 'validate' | 'rules' | 'export'>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [validationStatus, setValidationStatus] = useState<'pending' | 'validating' | 'complete' | 'error'>('pending');

  const steps = [
    { id: 'upload', label: 'Upload Data', icon: Upload, description: 'Upload CSV/XLSX files' },
    { id: 'validate', label: 'Validate & Fix', icon: CheckCircle, description: 'Review and fix data issues' },
    { id: 'rules', label: 'Business Rules', icon: Settings, description: 'Configure allocation rules' },
    { id: 'export', label: 'Export', icon: Download, description: 'Download cleaned data' },
  ];

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const fileNames = Array.from(files).map(file => file.name);
      setUploadedFiles(prev => [...prev, ...fileNames]);
      setValidationStatus('validating');
      
      // Simulate validation process
      setTimeout(() => {
        setValidationStatus('complete');
        setCurrentStep('validate');
      }, 2000);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files) {
      const fileNames = Array.from(files).map(file => file.name);
      setUploadedFiles(prev => [...prev, ...fileNames]);
      setValidationStatus('validating');
      
      setTimeout(() => {
        setValidationStatus('complete');
        setCurrentStep('validate');
      }, 2000);
    }
  };

  const getStepStatus = (stepId: string) => {
    const stepIndex = steps.findIndex(s => s.id === stepId);
    const currentIndex = steps.findIndex(s => s.id === currentStep);
    
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header Section */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center space-x-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium">
          <FileSpreadsheet className="w-4 h-4" />
          <span>AI Resource Allocation Configurator</span>
        </div>
        <h1 className="text-4xl font-bold text-gray-900">
          Transform Your Spreadsheet Chaos
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Upload messy CSV/XLSX files, let AI validate and clean your data, configure business rules, 
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
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    status === 'complete' ? 'bg-green-500 text-white' :
                    status === 'current' ? 'bg-blue-500 text-white' :
                    'bg-gray-200 text-gray-500'
                  }`}>
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

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column - Main Action */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* File Upload Section */}
          {currentStep === 'upload' && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Upload Your Data Files</h2>
                <p className="card-description">
                  Upload CSV or XLSX files containing clients, workers, and tasks data. 
                  Our AI will automatically map columns even if headers are misnamed.
                </p>
              </div>
              <div className="card-content">
                <div 
                  className="file-upload-area"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                      <Upload className="w-8 h-8 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">Drop files here or click to upload</h3>
                      <p className="text-sm text-gray-500">Supports CSV and XLSX files up to 10MB each</p>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="btn btn-primary btn-lg cursor-pointer"
                    >
                      Choose Files
                    </label>
                  </div>
                </div>

                {/* Uploaded Files List */}
                {uploadedFiles.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <h4 className="font-medium text-gray-900">Uploaded Files:</h4>
                    {uploadedFiles.map((fileName, index) => (
                      <div key={index} className="flex items-center space-x-2 text-sm">
                        <FileSpreadsheet className="w-4 h-4 text-green-500" />
                        <span className="text-gray-700">{fileName}</span>
                        {validationStatus === 'validating' ? (
                          <div className="loading-spinner w-4 h-4"></div>
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Validation Section */}
          {currentStep === 'validate' && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Data Validation & Editing</h2>
                <p className="card-description">
                  Review your data, fix any errors, and use natural language to search and modify entries.
                </p>
              </div>
              <div className="card-content">
                <div className="space-y-4">
                  {/* Search Bar */}
                  <div className="flex space-x-2">
                    <input 
                      type="text"
                      placeholder="Search with natural language: 'Tasks with duration > 2 phases'"
                      className="input flex-1"
                    />
                    <button className="btn btn-primary">Search</button>
                  </div>

                  {/* Sample Data Grid Placeholder */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Clients Data (10 entries)</span>
                        <div className="flex items-center space-x-2">
                          <span className="badge badge-destructive">3 Errors</span>
                          <span className="badge bg-yellow-500 text-white">2 Warnings</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 text-center text-gray-500">
                      Interactive data grid will be implemented here
                      <br />
                      <small>Milestone 1: Data grid with inline editing</small>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button 
                      className="btn btn-primary"
                      onClick={() => setCurrentStep('rules')}
                    >
                      Continue to Rules
                    </button>
                    <button className="btn btn-outline">
                      Auto-fix All Issues
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rules Section */}
          {currentStep === 'rules' && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Business Rules Configuration</h2>
                <p className="card-description">
                  Create allocation rules using our visual builder or natural language input.
                </p>
              </div>
              <div className="card-content">
                <div className="space-y-4">
                  <textarea 
                    placeholder="Describe a rule in plain English: 'Marketing tasks should never run in phase 1'"
                    className="textarea min-h-[100px]"
                  />
                  <button className="btn btn-primary">Convert to Rule</button>
                  
                  <div className="border rounded-lg p-4 text-center text-gray-500">
                    Visual rule builder will be implemented here
                    <br />
                    <small>Milestone 2: Rule creation interface</small>
                  </div>

                  <div className="flex space-x-2">
                    <button 
                      className="btn btn-primary"
                      onClick={() => setCurrentStep('export')}
                    >
                      Continue to Export
                    </button>
                    <button className="btn btn-ghost">AI Rule Suggestions</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Export Section */}
          {currentStep === 'export' && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Export Configuration</h2>
                <p className="card-description">
                  Download your cleaned data and rules configuration for downstream processing.
                </p>
              </div>
              <div className="card-content">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium mb-2">Data Files</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>✓ clients_cleaned.csv</li>
                        <li>✓ workers_cleaned.csv</li>
                        <li>✓ tasks_cleaned.csv</li>
                      </ul>
                    </div>
                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium mb-2">Configuration</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>✓ rules.json</li>
                        <li>✓ priorities.json</li>
                        <li>✓ validation_report.pdf</li>
                      </ul>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button className="btn btn-primary btn-lg">
                      <Download className="w-4 h-4 mr-2" />
                      Download All Files
                    </button>
                    <button className="btn btn-outline">Preview Export</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Status & Info */}
        <div className="space-y-6">
          
          {/* Status Panel */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">System Status</h3>
            </div>
            <div className="card-content space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">AI Engine</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-green-600">Online</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Validation Engine</span>
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
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Quick Stats</h3>
            </div>
            <div className="card-content space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Files Processed</span>
                <span className="text-sm font-medium">{uploadedFiles.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Validation Rules</span>
                <span className="text-sm font-medium">12 Active</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">AI Features</span>
                <span className="text-sm font-medium">5 Available</span>
              </div>
            </div>
          </div>

          {/* Help Panel */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Need Help?</h3>
            </div>
            <div className="card-content space-y-3">
              <div className="text-sm text-gray-600">
                <p>Try these natural language searches:</p>
                <ul className="mt-2 space-y-1 text-xs">
                  <li>• "High priority clients"</li>
                  <li>• "Tasks needing Python skills"</li>
                  <li>• "Workers available in phase 2"</li>
                </ul>
              </div>
              <button className="btn btn-outline btn-sm w-full">
                View Documentation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}