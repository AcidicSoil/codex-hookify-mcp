import os from 'node:os';
import path from 'node:path';

export interface Config {
  ruleDir: string;
  compatibilityMode: boolean;
  logLevel: string;
}

export function getConfig(): Config {
  const homeDir = os.homedir();
  const defaultRuleDir = path.join(homeDir, '.codex', 'hookify');

  return {
    ruleDir: process.env.HOOKIFY_RULE_DIR || defaultRuleDir,
    compatibilityMode: process.env.HOOKIFY_COMPATIBILITY_MODE === 'true',
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}
