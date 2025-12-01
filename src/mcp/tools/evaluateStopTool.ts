import { McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import { evaluateRules } from '../../engine/eventEvaluator';

export function registerEvaluateStopTool(server: McpServer) {
  server.tool(
    'hookify_evaluate_stop',
    'Evaluates a stop event against the loaded rules.',
    {
      transcript: z.string(),
    },
    async ({ transcript }) => {
      const result = await evaluateRules({
        type: 'stop',
        transcript,
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
