export type EventType = 'bash' | 'file' | 'prompt' | 'stop' | 'all';
export type ActionType = 'warn' | 'block';
export type OperatorType = 'regex_match' | 'contains' | 'not_contains' | 'equals' | 'starts_with' | 'ends_with';

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

// New types for generic event handling
export interface BashContext {
    type: "bash";
    command: string;
}

export interface FileContext {
    type: "file";
    file_path: string;
    old_text?: string;
    new_text?: string;
    content?: string;
}

export interface PromptContext {
    type: "prompt";
    user_prompt: string;
}

export interface StopContext {
    type: "stop";
    transcript: string;
}

export type HookContext = BashContext | FileContext | PromptContext | StopContext;

export interface EvaluationResult {
    decision: "allow" | "warn" | "block";
    messages: string[];
    matched_rules: string[];
}