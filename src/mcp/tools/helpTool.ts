import { McpServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';

export function registerHelpTool(server: McpServer) {
  server.tool(
    'hookify_help',
    'Returns a markdown help string for the hookify plugin.',
    {},
    async () => {
      const help = `
# Hookify MCP Help

- Rules live in markdown files with YAML frontmatter.
- Fields: name, enabled, event, action, pattern, conditions[].
- Events: bash, file, prompt, stop, all.
- Conditions: field, operator (regex_match, contains, not_contains, equals, starts_with, ends_with), pattern.

## Example Rule

    ---
    name: block-dangerous-rm
    enabled: true
    event: bash
    pattern: rm\s+-rf
    action: block
    ---

⚠️ **Dangerous rm command detected!**

This command could delete important files. Please:
- Verify the path is correct
- Consider using a safer approach
- Make sure you have backups
    `

      return {
        content: [
          {
            type: 'text',
            text: help,
          },
        ],
      };
    }
  );
}
