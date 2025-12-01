import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import matter from 'gray-matter';
import { getConfig } from '../config/env';
import { Rule } from '../types/rule';
import { parseRuleFile } from './ruleParser';

let rulesCache: Rule[] | null = null;

async function getRuleFiles(ruleDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(ruleDir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map((entry) => {
        const fullPath = path.join(ruleDir, entry.name);
        if (entry.isDirectory()) {
          return getRuleFiles(fullPath);
        }
        if (entry.isFile() && entry.name.endsWith('.md')) {
          return [fullPath];
        }
        return [];
      })
    );
    return files.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    console.error(`Error reading rule directory ${ruleDir}:`, error);
    return [];
  }
}

export async function loadRules(force = false): Promise<Rule[]> {
  if (rulesCache && !force) {
    return rulesCache;
  }

  const config = getConfig();
  const claudeCompatDir = path.join(os.homedir(), '.claude', 'hookify');
  
  const allRuleFiles = [
      ...await getRuleFiles(config.ruleDir),
      ...(config.compatibilityMode ? await getRuleFiles(claudeCompatDir) : [])
  ];

  const uniqueFiles = [...new Set(allRuleFiles)];

  const loadedRules: Rule[] = [];
  for (const file of uniqueFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const rule = parseRuleFile(content, file);
      if (rule) {
        loadedRules.push(rule);
      }
    } catch (error) {
      console.error(`Error reading or parsing rule file ${file}:`, error);
    }
  }

  rulesCache = loadedRules;
  return loadedRules;
}

export async function writeRule(rule: Partial<Rule>): Promise<string> {
    const config = getConfig();
    const { name, ...frontmatter } = rule;
    const content = matter.stringify(rule.message || '', frontmatter);
    const fileName = `${name}.md`.replace(/\s+/g, '-').toLowerCase();
    const filePath = path.join(config.ruleDir, fileName);

    await fs.mkdir(config.ruleDir, { recursive: true });
    await fs.writeFile(filePath, content);
    invalidateRuleCache();
    return filePath;
}

export async function updateRuleEnabled(name: string, enabled: boolean): Promise<boolean> {
    const rules = await loadRules(true);
    const ruleToUpdate = rules.find(r => r.name === name);

    if (!ruleToUpdate) {
        throw new Error(`Rule with name "${name}" not found.`);
    }

    const fileContent = await fs.readFile(ruleToUpdate.filePath, 'utf-8');
    const { data, content } = matter(fileContent);
    data.enabled = enabled;
    const newContent = matter.stringify(content, data);
    await fs.writeFile(ruleToUpdate.filePath, newContent);
    invalidateRuleCache();
    return true;
}


export function invalidateRuleCache(): void {
  rulesCache = null;
}