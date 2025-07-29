// lib/ai.ts
export interface BusinessRule {
  id: string;
  type: 'constraint' | 'preference' | 'requirement';
  description: string;
  condition: string;
  action: string;
  priority: number;
  active: boolean;
}

// Simulated AI functions for demo
export async function convertNaturalLanguageToRule(naturalLanguage: string): Promise<BusinessRule> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Simple rule parsing logic
  let type: 'constraint' | 'preference' | 'requirement' = 'constraint';
  let priority = 3;
  
  if (naturalLanguage.toLowerCase().includes('should') || naturalLanguage.toLowerCase().includes('prefer')) {
    type = 'preference';
  }
  if (naturalLanguage.toLowerCase().includes('must') || naturalLanguage.toLowerCase().includes('never')) {
    type = 'constraint';
    priority = 4;
  }
  if (naturalLanguage.toLowerCase().includes('high priority') || naturalLanguage.toLowerCase().includes('critical')) {
    priority = 5;
  }
  
  return {
    id: `rule-${Date.now()}`,
    type,
    description: naturalLanguage,
    condition: 'When applicable conditions are met',
    action: 'Apply the specified rule',
    priority,
    active: true
  };
}

export async function generateRuleRecommendations(dataSet: any): Promise<BusinessRule[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const recommendations: BusinessRule[] = [
    {
      id: 'rec-1',
      type: 'constraint',
      description: 'High priority clients (level 4-5) should get tasks assigned first',
      condition: 'When client has priority level 4 or 5',
      action: 'Prioritize their tasks in allocation queue',
      priority: 5,
      active: false
    },
    {
      id: 'rec-2',
      type: 'constraint',
      description: 'Workers should not exceed their maximum load per phase',
      condition: 'When assigning tasks to workers',
      action: 'Check available slots before assignment',
      priority: 4,
      active: false
    }
  ];
  
  // Add more recommendations based on data
  if (dataSet.workers?.some((w: any) => w.Skills?.length > 3)) {
    recommendations.push({
      id: 'rec-3',
      type: 'preference',
      description: 'Match task required skills with worker expertise',
      condition: 'When task requires specific skills',
      action: 'Assign to workers with best skill match',
      priority: 4,
      active: false
    });
  }
  
  if (dataSet.tasks?.some((t: any) => t.Duration > 5)) {
    recommendations.push({
      id: 'rec-4',
      type: 'constraint',
      description: 'Long duration tasks should be distributed across phases',
      condition: 'When task duration exceeds 5 units',
      action: 'Spread across multiple phases if possible',
      priority: 3,
      active: false
    });
  }
  
  return recommendations;
}

export async function getErrorCorrectionSuggestions(errors: any[]): Promise<string[]> {
  if (errors.length === 0) return [];
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const suggestions: string[] = [];
  
  errors.forEach(error => {
    if (error.field === 'ClientID' && error.message.includes('Missing')) {
      suggestions.push(`Generate unique ClientID for ${error.entityId} using format: CLIENT_${Date.now()}`);
    }
    if (error.field === 'PriorityLevel') {
      suggestions.push(`Set default priority level to 3 for client ${error.entityId}`);
    }
    if (error.field === 'Skills' && error.message.includes('no skills')) {
      suggestions.push(`Add default skills based on worker group for ${error.entityId}`);
    }
    if (error.field === 'AvailableSlots' && error.message.includes('no available slots')) {
      suggestions.push(`Set default available slots [1,2,3] for worker ${error.entityId}`);
    }
    if (error.field === 'Duration' && error.message.includes('Duration must be at least 1')) {
      suggestions.push(`Set minimum duration of 1 for task ${error.entityId}`);
    }
  });
  
  if (suggestions.length === 0) {
    suggestions.push('Review data entries and ensure all required fields are populated');
    suggestions.push('Check for formatting issues in array fields (use comma separation)');
    suggestions.push('Validate numeric fields contain valid numbers');
  }
  
  return [...new Set(suggestions)]; // Remove duplicates
}

export async function queryDataWithNL(query: string, dataSet: any): Promise<any[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const queryLower = query.toLowerCase();
  let results: any[] = [];
  
  // Simple natural language processing
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
          s.toLowerCase().includes('development')
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