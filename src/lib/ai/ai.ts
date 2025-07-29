// lib/ai.ts - Simplified version with no external dependencies
export interface BusinessRule {
  id: string;
  type: 'constraint' | 'preference' | 'requirement';
  description: string;
  condition: string;
  action: string;
  priority: number;
  active: boolean;
}

// Mock AI functions for demo - replace with real API calls later
export async function convertNaturalLanguageToRule(naturalLanguage: string): Promise<BusinessRule> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Simple rule parsing logic based on keywords
  let type: 'constraint' | 'preference' | 'requirement' = 'constraint';
  let priority = 3;
  
  const text = naturalLanguage.toLowerCase();
  
  if (text.includes('should') || text.includes('prefer') || text.includes('recommend')) {
    type = 'preference';
  }
  if (text.includes('must') || text.includes('never') || text.includes('always') || text.includes('required')) {
    type = 'constraint';
    priority = 4;
  }
  if (text.includes('high priority') || text.includes('critical') || text.includes('urgent')) {
    priority = 5;
  }
  if (text.includes('low priority') || text.includes('optional')) {
    priority = 2;
  }
  
  // Generate condition and action based on keywords
  let condition = 'When applicable conditions are met';
  let action = 'Apply the specified rule';
  
  if (text.includes('phase')) {
    condition = 'When scheduling tasks by phase';
    action = 'Apply phase-based constraints';
  }
  if (text.includes('skill') || text.includes('worker')) {
    condition = 'When matching workers to tasks';
    action = 'Consider skill requirements and worker capabilities';
  }
  if (text.includes('priority') || text.includes('client')) {
    condition = 'When prioritizing task assignments';
    action = 'Apply priority-based allocation rules';
  }
  
  return {
    id: `rule-${Date.now()}`,
    type,
    description: naturalLanguage,
    condition,
    action,
    priority,
    active: true
  };
}

export async function generateRuleRecommendations(dataSet: any): Promise<BusinessRule[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const recommendations: BusinessRule[] = [];
  
  // Basic recommendations based on data analysis
  if (dataSet.clients?.length > 0) {
    recommendations.push({
      id: 'rec-priority',
      type: 'constraint',
      description: 'High priority clients (level 4-5) should get tasks assigned first',
      condition: 'When client has priority level 4 or 5',
      action: 'Prioritize their tasks in allocation queue',
      priority: 5,
      active: false
    });
  }
  
  if (dataSet.workers?.length > 0) {
    recommendations.push({
      id: 'rec-load',
      type: 'constraint',
      description: 'Workers should not exceed their maximum load per phase',
      condition: 'When assigning tasks to workers',
      action: 'Check available slots before assignment',
      priority: 4,
      active: false
    });
    
    // Check if workers have skills data
    if (dataSet.workers.some((w: any) => w.Skills?.length > 0)) {
      recommendations.push({
        id: 'rec-skills',
        type: 'preference',
        description: 'Match task required skills with worker expertise',
        condition: 'When task requires specific skills',
        action: 'Assign to workers with best skill match',
        priority: 4,
        active: false
      });
    }
  }
  
  if (dataSet.tasks?.length > 0) {
    // Check for long duration tasks
    if (dataSet.tasks.some((t: any) => t.Duration > 5)) {
      recommendations.push({
        id: 'rec-duration',
        type: 'constraint',
        description: 'Long duration tasks should be distributed across phases',
        condition: 'When task duration exceeds 5 units',
        action: 'Spread across multiple phases if possible',
        priority: 3,
        active: false
      });
    }
    
    // Check for task categories
    const categories = [...new Set(dataSet.tasks.map((t: any) => t.Category).filter(Boolean))];
    if (categories.length > 1) {
      recommendations.push({
        id: 'rec-categories',
        type: 'preference',
        description: 'Balance task categories across workers and phases',
        condition: 'When multiple task categories exist',
        action: 'Distribute different types of work evenly',
        priority: 3,
        active: false
      });
    }
  }
  
  return recommendations;
}

export async function getErrorCorrectionSuggestions(errors: any[]): Promise<string[]> {
  if (errors.length === 0) return [];
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const suggestions: string[] = [];
  const errorTypes = new Set();
  
  errors.forEach(error => {
    if (error.field === 'ClientID' && error.message.includes('Missing')) {
      if (!errorTypes.has('missing-client-id')) {
        suggestions.push('Generate unique ClientIDs using format: CLIENT_001, CLIENT_002, etc.');
        errorTypes.add('missing-client-id');
      }
    }
    if (error.field === 'PriorityLevel') {
      if (!errorTypes.has('priority-level')) {
        suggestions.push('Set default priority level to 3 for clients missing priority values');
        errorTypes.add('priority-level');
      }
    }
    if (error.field === 'Skills' && error.message.includes('no skills')) {
      if (!errorTypes.has('missing-skills')) {
        suggestions.push('Add default skills based on worker group or job title');
        errorTypes.add('missing-skills');
      }
    }
    if (error.field === 'AvailableSlots' && error.message.includes('no available slots')) {
      if (!errorTypes.has('missing-slots')) {
        suggestions.push('Set default available slots [1,2,3] for workers missing slot data');
        errorTypes.add('missing-slots');
      }
    }
    if (error.field === 'Duration' && error.message.includes('Duration must be at least 1')) {
      if (!errorTypes.has('invalid-duration')) {
        suggestions.push('Set minimum duration of 1 for tasks with invalid duration values');
        errorTypes.add('invalid-duration');
      }
    }
    if (error.field === 'WorkerID' && error.message.includes('Missing')) {
      if (!errorTypes.has('missing-worker-id')) {
        suggestions.push('Generate unique WorkerIDs using format: WORKER_001, WORKER_002, etc.');
        errorTypes.add('missing-worker-id');
      }
    }
    if (error.field === 'TaskID' && error.message.includes('Missing')) {
      if (!errorTypes.has('missing-task-id')) {
        suggestions.push('Generate unique TaskIDs using format: TASK_001, TASK_002, etc.');
        errorTypes.add('missing-task-id');
      }
    }
  });
  
  // Add general suggestions if no specific ones found
  if (suggestions.length === 0) {
    suggestions.push('Review data entries and ensure all required fields are populated');
    suggestions.push('Check for formatting issues in array fields (use comma separation)');
    suggestions.push('Validate numeric fields contain valid numbers greater than 0');
    suggestions.push('Ensure ID fields are unique and not empty');
  }
  
  return suggestions;
}

export async function queryDataWithNL(query: string, dataSet: any): Promise<any[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const queryLower = query.toLowerCase();
  let results: any[] = [];
  
  // Enhanced natural language processing
  if (queryLower.includes('high priority') || queryLower.includes('priority 4') || queryLower.includes('priority 5')) {
    results = dataSet.clients?.filter((c: any) => c.PriorityLevel >= 4) || [];
  } 
  else if (queryLower.includes('low priority') || queryLower.includes('priority 1') || queryLower.includes('priority 2')) {
    results = dataSet.clients?.filter((c: any) => c.PriorityLevel <= 2) || [];
  }
  else if (queryLower.includes('senior') || queryLower.includes('lead')) {
    results = dataSet.workers?.filter((w: any) => 
      w.QualificationLevel?.toLowerCase().includes('senior') || 
      w.QualificationLevel?.toLowerCase().includes('lead') ||
      w.WorkerName?.toLowerCase().includes('senior') ||
      w.WorkerName?.toLowerCase().includes('lead')
    ) || [];
  }
  else if (queryLower.includes('junior') || queryLower.includes('entry')) {
    results = dataSet.workers?.filter((w: any) => 
      w.QualificationLevel?.toLowerCase().includes('junior') || 
      w.QualificationLevel?.toLowerCase().includes('entry')
    ) || [];
  }
  else if (queryLower.includes('marketing')) {
    results = [
      ...(dataSet.tasks?.filter((t: any) => t.Category?.toLowerCase().includes('marketing')) || []),
      ...(dataSet.workers?.filter((w: any) => w.Skills?.some((s: string) => s.toLowerCase().includes('marketing'))) || [])
    ];
  }
  else if (queryLower.includes('development') || queryLower.includes('coding') || queryLower.includes('programming')) {
    results = [
      ...(dataSet.tasks?.filter((t: any) => 
        t.Category?.toLowerCase().includes('development') ||
        t.Category?.toLowerCase().includes('coding') ||
        t.TaskName?.toLowerCase().includes('development')
      ) || []),
      ...(dataSet.workers?.filter((w: any) => 
        w.Skills?.some((s: string) => 
          s.toLowerCase().includes('javascript') ||
          s.toLowerCase().includes('python') ||
          s.toLowerCase().includes('react') ||
          s.toLowerCase().includes('development') ||
          s.toLowerCase().includes('programming')
        )
      ) || [])
    ];
  }
  else if (queryLower.includes('design')) {
    results = [
      ...(dataSet.tasks?.filter((t: any) => t.Category?.toLowerCase().includes('design')) || []),
      ...(dataSet.workers?.filter((w: any) => w.Skills?.some((s: string) => s.toLowerCase().includes('design'))) || [])
    ];
  }
  else if (queryLower.includes('long tasks') || queryLower.includes('duration')) {
    results = dataSet.tasks?.filter((t: any) => t.Duration > 3) || [];
  }
  else if (queryLower.includes('available workers') || queryLower.includes('free workers')) {
    results = dataSet.workers?.filter((w: any) => w.AvailableSlots?.length > 0) || [];
  }
  else if (queryLower.includes('errors') || queryLower.includes('invalid')) {
    // Return entities with validation issues
    results = [
      ...(dataSet.clients?.filter((c: any) => !c.ClientID || !c.ClientName) || []),
      ...(dataSet.workers?.filter((w: any) => !w.WorkerID || !w.WorkerName || w.Skills?.length === 0) || []),
      ...(dataSet.tasks?.filter((t: any) => !t.TaskID || !t.TaskName || t.Duration < 1) || [])
    ];
  }
  else {
    // General search across all entities
    const searchTerm = query.toLowerCase();
    results = [
      ...(dataSet.clients?.filter((c: any) => 
        c.ClientName?.toLowerCase().includes(searchTerm) ||
        c.GroupTag?.toLowerCase().includes(searchTerm)
      ) || []),
      ...(dataSet.workers?.filter((w: any) => 
        w.WorkerName?.toLowerCase().includes(searchTerm) ||
        w.WorkerGroup?.toLowerCase().includes(searchTerm) ||
        w.Skills?.some((s: string) => s.toLowerCase().includes(searchTerm))
      ) || []),
      ...(dataSet.tasks?.filter((t: any) => 
        t.TaskName?.toLowerCase().includes(searchTerm) ||
        t.Category?.toLowerCase().includes(searchTerm)
      ) || [])
    ];
  }
  
  return results.slice(0, 10); // Limit results
}