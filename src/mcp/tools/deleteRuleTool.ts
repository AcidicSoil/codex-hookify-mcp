import { McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { loadRules, invalidateRuleCache } from '../../rules/ruleStore';

async function findRuleByName(name: string): Promise<string | null> {
    const rules = await loadRules(true);
    const rule = rules.find(r => r.name === name);
    return rule ? rule.filePath : null;
}

export function registerDeleteRuleTool(server: McpServer) {
  server.tool(
    'hookify_delete_rule',
    'Deletes a specific rule file.',
    {
      name: z.string().describe('The name of the rule to delete'),
    },
    async ({ name }) => {
      try {
        const filePath = await findRuleByName(name);
        if (!filePath) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ok: false, error: 'Rule not found' }),
              },
            ],
          };
        }
        await fs.unlink(filePath);
        invalidateRuleCache();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: true }),
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
