import { McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import { loadRules } from '../../rules/ruleStore';

export function registerListRulesTool(server: McpServer) {
  server.tool(
    'hookify_list_rules',
    'Lists all currently loaded rules.',
    {
        event: z.string().optional().describe('Filter by event type'),
        enabled: z.boolean().optional().describe('Filter by enabled status')
    },
    async ({ event, enabled }) => {
      let rules = await loadRules();

      if (event) {
          rules = rules.filter(r => r.event === event);
      }
      if (enabled !== undefined) {
          rules = rules.filter(r => r.enabled === enabled);
      }

      const ruleInfo = rules.map(r => ({
        name: r.name,
        event: r.event,
        action: r.action,
        enabled: r.enabled,
        file: r.filePath,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(ruleInfo, null, 2),
          },
        ],
      };
    }
  );
}
