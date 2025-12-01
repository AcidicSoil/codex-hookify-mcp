import { McpServer } from '@modelcontextprotocol/sdk/server';
import { version } from '../../../package.json';
import { getConfig } from '../../config/env';
import { loadRules } from '../../rules/ruleStore';

export function registerHealthTool(server: McpServer) {
  server.tool(
    'hookify_health',
    'Returns status and configuration information about the server.',
    {},
    async () => {
      const config = getConfig();
      const rules = await loadRules();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'ok',
                version,
                rule_directory: config.ruleDir,
                rules_loaded: rules.length,
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
