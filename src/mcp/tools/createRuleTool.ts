import { McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import { writeRule } from '../../rules/ruleStore';
import { ActionType, EventType } from '../../types/rule';

export function registerCreateRuleTool(server: McpServer) {
  server.tool(
    'hookify_create_rule',
    'Creates a new rule file from structured arguments.',
    {
      name: z.string().describe('Name of the rule'),
      event: z.string().describe('Event type (bash, file, prompt, stop, all)'),
      action: z.string().optional().describe('Action to take (warn, block)'),
      pattern: z.string().optional().describe('Regex pattern to match'),
      conditions: z.array(z.object({
          field: z.string(),
          operator: z.string(),
          pattern: z.string()
      })).optional().describe('Conditions to evaluate'),
      message_markdown: z.string().describe('Markdown message for the rule'),
    },
    async (args) => {
      try {
        const filePath = await writeRule({
            name: args.name,
            event: args.event as EventType,
            action: (args.action || 'warn') as ActionType,
            pattern: args.pattern,
            conditions: args.conditions,
            message: args.message_markdown,
            enabled: true
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: true, file: filePath }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: false, error: (error as Error).message }),
            },
          ],
        };
      }
    }
  );
}
