import { Rule, HookContext, EvaluationResult } from '../types/rule';
import { loadRules } from '../rules/ruleStore';
import { matchConditions } from './conditionMatcher';

function buildFieldContext(ctx: HookContext): Record<string, string> {
  switch (ctx.type) {
    case "bash":
      return { command: ctx.command };
    case "file":
      return {
        file_path: ctx.file_path,
        old_text: ctx.old_text ?? "",
        new_text: ctx.new_text ?? "",
        content: ctx.content ?? "",
      };
    case "prompt":
      return { user_prompt: ctx.user_prompt };
    case "stop":
      return { transcript: ctx.transcript };
  }
}

function ruleMatchesContext(rule: Rule, ctx: HookContext): boolean {
  const contextFields = buildFieldContext(ctx);

  // pattern-only rule
  if (rule.pattern && (!rule.conditions || rule.conditions.length === 0)) {
    // Choose field based on event for backwards compatibility
    const target =
      ctx.type === "bash" ? contextFields.command :
      ctx.type === "file" ? contextFields.new_text || contextFields.content :
      ctx.type === "prompt" ? contextFields.user_prompt :
      ctx.type === "stop" ? contextFields.transcript :
      "";

    try {
        if (!new RegExp(rule.pattern).test(target)) return false;
    } catch (e) {
        console.error(`Invalid regex in rule ${rule.name}: ${rule.pattern}`);
        return false;
    }
  }

  // condition-based rule
  if (rule.conditions && rule.conditions.length > 0) {
    if (!matchConditions(rule, contextFields)) {
      return false;
    }
  }
  
  // A rule with neither pattern nor conditions should not match anything.
  if (!rule.pattern && (!rule.conditions || rule.conditions.length === 0)) {
      return false;
  }

  return true;
}

export async function evaluateRules(ctx: HookContext): Promise<EvaluationResult> {
  const rules = await loadRules();

  const applicable = rules.filter(r =>
    r.enabled &&
    (r.event === ctx.type || r.event === "all") &&
    ruleMatchesContext(r, ctx)
  );

  let decision: EvaluationResult["decision"] = "allow";
  if (applicable.some(r => r.action === "block")) decision = "block";
  else if (applicable.length > 0) decision = "warn";

  return {
    decision,
    messages: applicable.map(r => r.message),
    matched_rules: applicable.map(r => r.name),
  };
}
