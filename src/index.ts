#!/usr/bin/env node
import { runMain as _runMain, defineCommand } from 'citty';
import { version } from '../package.json';
import { createServer, startServer, stopServer } from './server';
import { registerHealthTool } from './mcp/tools/healthTool';
import { registerEvaluateShellTool } from './mcp/tools/evaluateShellTool';
import { registerListRulesTool } from './mcp/tools/listRulesTool';
import { registerSetRuleEnabledTool } from './mcp/tools/setRuleEnabledTool';
import { registerCreateRuleTool } from './mcp/tools/createRuleTool';
import { McpServer } from '@modelcontextprotocol/sdk/server';

const cli = defineCommand({
  meta: {
    name: 'codex-hookify-mcp',
    version,
    description: 'Run the Codex Hookify MCP server with stdio, http, or sse transport',
  },
  args: {
    http: { type: 'boolean', description: 'Run with HTTP transport' },
    sse: { type: 'boolean', description: 'Run with SSE transport' },
    stdio: { type: 'boolean', description: 'Run with stdio transport (default)' },
    port: { type: 'string', description: 'Port for http/sse (default 3000)', default: '3000' },
    endpoint: { type: 'string', description: 'HTTP endpoint (default /mcp)', default: '/mcp' },
  },
  async run({ args }) {
    const mode = args.http ? 'http' : args.sse ? 'sse' : 'stdio';
    const mcp = createServer({ name: 'codex-hookify-mcp', version });

    process.on('SIGTERM', () => stopServer(mcp as McpServer));
    process.on('SIGINT', () => stopServer(mcp as McpServer));

    // Register all the tools
    registerHealthTool(mcp as McpServer);
    registerEvaluateShellTool(mcp as McpServer);
    registerListRulesTool(mcp as McpServer);
    registerSetRuleEnabledTool(mcp as McpServer);
    registerCreateRuleTool(mcp as McpServer);

    if (mode === 'http') {
      await startServer(mcp as McpServer, { type: 'http', port: Number(args.port), endpoint: args.endpoint });
    } else if (mode === 'sse') {
      console.log('Starting SSE server...');
      await startServer(mcp as McpServer, { type: 'sse', port: Number(args.port) });
    } else if (mode === 'stdio') {
      await startServer(mcp as McpServer, { type: 'stdio' });
    }
  },
});

export const runMain = () => _runMain(cli);

// Self-invoking if executed directly
if (import.meta.url.startsWith('file:') && process.argv[1] === new URL(import.meta.url).pathname) {
  runMain();
}