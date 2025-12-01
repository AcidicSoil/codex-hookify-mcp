export type EventType = 'bash' | 'file' | 'prompt' | 'stop' | 'all';
export type ActionType = 'warn' | 'block';
export type OperatorType = 'regex_match' | 'contains' | 'not_contains' | 'equals';

export interface Condition {
  field: string;
  operator: OperatorType;
  pattern: string;
}

export interface Rule {
  name: string;
  enabled: boolean;
  event: EventType;
  action: ActionType;
  pattern?: string;
  conditions?: Condition[];
  message: string;
  filePath: string;
}
