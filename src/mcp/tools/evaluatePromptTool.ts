import { McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import { evaluateRules } from '../../engine/eventEvaluator';

export function registerEvaluatePromptTool(server: McpServer) {
  server.tool(
    'hookify_evaluate_prompt',
    'Evaluates a user prompt against the loaded rules.',
    {
      user_prompt: z.string(),
    },
    async ({ user_prompt }) => {
      const result = await evaluateRules({
        type: 'prompt',
        user_prompt,
      });
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
