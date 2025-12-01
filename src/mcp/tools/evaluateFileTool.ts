import { McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import { evaluateRules } from '../../engine/eventEvaluator';

export function registerEvaluateFileTool(server: McpServer) {
  server.tool(
    'hookify_evaluate_file',
    'Evaluates a file edit against the loaded rules.',
    {
        file_path: z.string(),
        old_text: z.string().optional(),
        new_text: z.string().optional(),
        content: z.string().optional(),
    },
    async ({ file_path, old_text, new_text, content }) => {
      const result = await evaluateRules({
        type: 'file',
        file_path,
        old_text,
        new_text,
        content,
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
