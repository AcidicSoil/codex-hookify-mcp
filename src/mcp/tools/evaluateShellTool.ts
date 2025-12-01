import { McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import { evaluateShell } from '../../engine/shellEvaluator';
import { loadRules } from '../../rules/ruleStore';

export function registerEvaluateShellTool(server: McpServer) {
  server.tool(
    'hookify_evaluate_shell',
    'Evaluates a shell command against the loaded rules.',
    {
      command: z.string().describe('The shell command to evaluate'),
    },
    async ({ command }) => {
      const rules = await loadRules();
      const result = evaluateShell(command, rules);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
