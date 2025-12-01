import { Rule, Condition } from '../types/rule';

function matchCondition(condition: Condition, context: Record<string, string>): boolean {
  const value = context[condition.field] || '';
  const pattern = condition.pattern;

  switch (condition.operator) {
    case 'regex_match':
      try {
        const regex = new RegExp(pattern);
        return regex.test(value);
      } catch (error) {
        console.error(`Invalid regex pattern in condition: ${pattern}`, error);
        return false;
      }
    case 'contains':
      return value.includes(pattern);
    case 'not_contains':
      return !value.includes(pattern);
    case 'equals':
      return value === pattern;
    default:
      return false;
  }
}

export function matchConditions(rule: Rule, context: Record<string, string>): boolean {
  if (!rule.conditions || rule.conditions.length === 0) {
    // If a pattern exists, it's the primary matcher. If not, lack of conditions means no match.
    return !!rule.pattern;
  }

  // All conditions must be met
  return rule.conditions.every(condition => matchCondition(condition, context));
}
