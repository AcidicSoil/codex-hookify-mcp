import matter from 'gray-matter';
import { Rule, EventType, ActionType } from '../types/rule';

export function parseRuleFile(content: string, filePath: string): Rule | null {
  try {
    const { data, content: message } = matter(content);

    if (!data.name) {
      console.error(`Rule file ${filePath} is missing 'name' in frontmatter.`);
      return null;
    }

    const rule: Rule = {
      name: data.name,
      enabled: data.enabled !== undefined ? data.enabled : true,
      event: data.event || 'all' as EventType,
      action: data.action || 'warn' as ActionType,
      pattern: data.pattern,
      conditions: data.conditions,
      message: message.trim(),
      filePath,
    };

    return rule;
  } catch (error) {
    console.error(`Error parsing rule file ${filePath}:`, error);
    return null;
  }
}
