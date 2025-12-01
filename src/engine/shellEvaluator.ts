import { Rule, ActionType } from '../types/rule';
import { matchConditions } from './conditionMatcher';

export interface EvaluationResult {
  decision: 'allow' | 'warn' | 'block';
  messages: string[];
  matched_rules: string[];
}

function matchPattern(rule: Rule, command: string): boolean {
    if (!rule.pattern) {
        return false;
    }
    try {
        const regex = new RegExp(rule.pattern);
        return regex.test(command);
    } catch (error) {
        console.error(`Invalid regex pattern in rule "${rule.name}": ${rule.pattern}`, error);
        return false;
    }
}

export function evaluateShell(command: string, rules: Rule[]): EvaluationResult {
  const context = { command };
  const matchedRules: Rule[] = [];

  for (const rule of rules) {
    if (!rule.enabled || (rule.event !== 'bash' && rule.event !== 'all')) {
      continue;
    }

    const patternMatch = rule.pattern ? matchPattern(rule, command) : false;
    const conditionMatch = rule.conditions ? matchConditions(rule, context) : false;

    // A rule matches if it has a pattern and it matches, OR if it has conditions and they match.
    // If it has both, both must match.
    if (rule.pattern && rule.conditions) {
        if(patternMatch && conditionMatch) {
            matchedRules.push(rule);
        }
    } else if (rule.pattern && patternMatch) {
        matchedRules.push(rule);
    } else if (rule.conditions && conditionMatch) {
        matchedRules.push(rule);
    }
  }

  let decision: 'allow' | 'warn' | 'block' = 'allow';
  const messages: string[] = [];
  const matched_rules: string[] = [];

  if (matchedRules.length > 0) {
    decision = 'warn'; // Default to warn if any rule matches
    for (const rule of matchedRules) {
      if (rule.action === 'block') {
        decision = 'block'; // Block overrides warn
      }
      messages.push(rule.message);
      matched_rules.push(rule.name);
    }
  }
  
  // If decision is block, we only need one message. Let's find the first blocking message.
  if (decision === 'block') {
      const blockingRule = matchedRules.find(r => r.action === 'block');
      return {
          decision,
          messages: blockingRule ? [blockingRule.message] : [],
          matched_rules: blockingRule ? [blockingRule.name] : [],
      }
  }

  return {
    decision,
    messages,
    matched_rules,
  };
}
