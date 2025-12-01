import { McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import { updateRuleEnabled } from '../../rules/ruleStore';

export function registerSetRuleEnabledTool(server: McpServer) {
  server.tool(
    'hookify_set_rule_enabled',
    'Enables or disables a specific rule.',
    {
      name: z.string().describe('The name of the rule to update'),
      enabled: z.boolean().describe('The new enabled status'),
    },
    async ({ name, enabled }) => {
      try {
        await updateRuleEnabled(name, enabled);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: true, name, enabled }),
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
