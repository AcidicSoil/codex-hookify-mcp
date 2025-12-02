You are building an MCP server that:

* Loads and evaluates “hook” rules à la `plugins/hookify` in `claude-code`
* Exposes that behavior as MCP tools
* Is wired into `codex` via `~/.codex/config.toml` so Codex can use it as if it were a Claude Code plugin

Start with a “Hookify for Codex” MCP server focused on shell safety (the `bash` event type), then extend to files/prompts later.

---

## 1. Map Claude Hookify → Codex MCP

From the `hookify` plugin docs you already saw: rules live in `.claude/hookify.*.local.md`, with YAML frontmatter and a Markdown body, and fields like:

* `event`: `bash | file | stop | prompt | all`
* `pattern` or `conditions[]`
* `action`: `warn | block`
* message body: Markdown shown to the user

Your Codex variant needs three things:

1. A **rule store** (where the rule markdown files live)
2. A **rule engine** (match command/file/prompt against rules → decision + message)
3. A set of **MCP tools** that Codex can call:

   * To evaluate a candidate action (`evaluate_*` tools)
   * To create/list/configure rules (the `/hookify`, `/hookify:list`, `/hookify:configure` equivalents)

Codex gives you:

* MCP client support via `mcp_servers` in `~/.codex/config.toml`([OpenAI Developers][1])
* Execpolicy (`.codexpolicy` Starlark files in `~/.codex/policy`) for hard enforcement of shell rules, if you want to emit policies later rather than doing everything via MCP tools

For v1, keep it simple: implement the **hook engine as an MCP server**, and instruct Codex (via AGENTS/system instructions) to call it before dangerous actions.

---

## 2. Shape of the “codex-hookify” MCP API

Define a single MCP server, e.g. `hookify-mcp`, with these tools:

1. `hookify_evaluate_shell`

   Input schema (MCP tool schema):

   ```json
   {
     "type": "object",
     "properties": {
       "command": { "type": "string", "description": "Shell command to run" }
     },
     "required": ["command"]
   }
   ```

   Behavior:

   * Load all enabled rules with `event: bash` or `event: all`
   * For each rule:

     * If `pattern` present: treat as Python/PCRE-style regex and run against `command`
     * If `conditions` present: support at least `field=command`, `operator=regex_match|contains|not_contains`
   * Compute:

     * `decision`: `"allow" | "warn" | "block"` where:

       * default is `"allow"`
       * `"block"` if at least one `action: block` rule matches
       * `"warn"` if no block rules but at least one `warn` rule matches
     * `messages`: list of Markdown message bodies from matching rules

   Return (MCP tool result):

   ```json
   {
     "content": [
       {
         "type": "text",
         "text": "{\"decision\":\"warn\",\"messages\":[\"⚠️ Dangerous rm detected ...\"]}"
       }
     ]
   }
   ```

   (Use JSON in the text payload; Codex will parse it.)

2. `hookify_list_rules`

   * No input, or simple filter fields.
   * Returns a JSON list of rules with: name, event, action, enabled, file path.

3. `hookify_set_rule_enabled`

   Input:

   ```json
   {
     "type": "object",
     "properties": {
       "name": { "type": "string" },
       "enabled": { "type": "boolean" }
     },
     "required": ["name", "enabled"]
   }
   ```

   * Toggle `enabled: true/false` in the rule file frontmatter.

4. `hookify_create_rule`

   Do *not* try to parse natural language inside the server. Make this a **structured** tool and let Codex synthesize the arguments from the user’s NL instructions, exactly like Claude does.

   Input:

   ```json
   {
     "type": "object",
     "properties": {
       "name": { "type": "string" },
       "event": {
         "type": "string",
         "enum": ["bash", "file", "prompt", "stop", "all"]
       },
       "action": {
         "type": "string",
         "enum": ["warn", "block"],
         "default": "warn"
       },
       "pattern": { "type": "string" },
       "conditions": {
         "type": "array",
         "items": {
           "type": "object",
           "properties": {
             "field": { "type": "string" },
             "operator": {
               "type": "string",
               "enum": ["regex_match", "contains", "not_contains", "equals"]
             },
             "pattern": { "type": "string" }
           },
           "required": ["field", "operator", "pattern"]
         }
       },
       "message_markdown": { "type": "string" }
     },
     "required": ["name", "event", "message_markdown"]
   }
   ```

   Behavior:

   * Decide a filename such as `~/.codex/hookify/<name>.md` or `.claude/hookify.<name>.local.md` for compatibility
   * Write a Markdown file in the same format Hookify uses:

     ```markdown
     ---
     name: block-dangerous-rm
     enabled: true
     event: bash
     pattern: rm\s+-rf
     action: block
     ---

     🛑 **Destructive operation detected!**

     This command can cause data loss. Operation blocked.
     ```

   This gives you a 1:1 mapping to the Claude plugin’s config model.

---

## 3. Implement the MCP server (TypeScript / stdio)

Use the official TypeScript MCP SDK with the stdio transport.([MCPHub][2])

Install dependencies:

```bash
npm init -y
npm install @modelcontextprotocol/sdk zod gray-matter
```

`src/server.ts`:

```ts
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";
import { promises as fs } from "fs";
import { join } from "path";
import matter from "gray-matter";

const server = new McpServer({
  name: "hookify-mcp",
  version: "0.1.0",
});

const RULE_DIR = process.env.HOOKIFY_RULE_DIR ?? join(process.env.HOME ?? "", ".codex", "hookify");

type Rule = {
  name: string;
  enabled: boolean;
  event: string;
  action: "warn" | "block";
  pattern?: string;
  conditions?: Array<{ field: string; operator: string; pattern: string }>;
  message: string;
  filePath: string;
};

async function loadRules(): Promise<Rule[]> {
  let files: string[];
  try {
    files = await fs.readdir(RULE_DIR);
  } catch {
    return [];
  }

  const rules: Rule[] = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const full = join(RULE_DIR, f);
    const content = await fs.readFile(full, "utf8");
    const parsed = matter(content);
    const fm: any = parsed.data;
    rules.push({
      name: fm.name ?? f.replace(/\.md$/, ""),
      enabled: fm.enabled ?? true,
      event: fm.event ?? "all",
      action: (fm.action ?? "warn") as "warn" | "block",
      pattern: fm.pattern,
      conditions: fm.conditions,
      message: parsed.content.trim(),
      filePath: full,
    });
  }
  return rules.filter(r => r.enabled);
}

function matchConditions(
  rule: Rule,
  ctx: { command?: string; file_path?: string; new_text?: string; user_prompt?: string },
): boolean {
  if (!rule.conditions || rule.conditions.length === 0) return true;
  return rule.conditions.every(cond => {
    const value = (ctx as any)[cond.field] ?? "";
    switch (cond.operator) {
      case "regex_match":
        return new RegExp(cond.pattern).test(value);
      case "contains":
        return value.includes(cond.pattern);
      case "not_contains":
        return !value.includes(cond.pattern);
      case "equals":
        return value === cond.pattern;
      default:
        return false;
    }
  });
}

// 1) Evaluate shell commands
server.tool(
  "hookify_evaluate_shell",
  { command: z.string() },
  async ({ command }) => {
    const rules = await loadRules();
    const candidates = rules.filter(
      r =>
        (r.event === "bash" || r.event === "all") &&
        (r.pattern ? new RegExp(r.pattern).test(command) : true) &&
        matchConditions(r, { command }),
    );

    let decision: "allow" | "warn" | "block" = "allow";
    if (candidates.some(r => r.action === "block")) decision = "block";
    else if (candidates.length > 0) decision = "warn";

    const messages = candidates.map(r => r.message);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            decision,
            messages,
            matched_rules: candidates.map(r => r.name),
          }),
        },
      ],
    };
  },
);

// 2) List rules
server.tool("hookify_list_rules", z.object({}), async () => {
  const rules = await loadRules();
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          rules.map(r => ({
            name: r.name,
            event: r.event,
            action: r.action,
            file: r.filePath,
          })),
        ),
      },
    ],
  };
});

// 3) Enable/disable rule
server.tool(
  "hookify_set_rule_enabled",
  {
    name: z.string(),
    enabled: z.boolean(),
  },
  async ({ name, enabled }) => {
    const rules = await loadRules();
    const rule = rules.find(r => r.name === name);
    if (!rule) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: "Rule not found" }) }],
      };
    }
    const raw = await fs.readFile(rule.filePath, "utf8");
    const parsed = matter(raw);
    const updated = matter.stringify(parsed.content, { ...parsed.data, enabled });
    await fs.writeFile(rule.filePath, updated, "utf8");
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }],
    };
  },
);

// 4) Create rule
server.tool(
  "hookify_create_rule",
  {
    name: z.string(),
    event: z.enum(["bash", "file", "prompt", "stop", "all"]),
    action: z.enum(["warn", "block"]).default("warn"),
    pattern: z.string().optional(),
    conditions: z
      .array(
        z.object({
          field: z.string(),
          operator: z.enum(["regex_match", "contains", "not_contains", "equals"]),
          pattern: z.string(),
        }),
      )
      .optional(),
    message_markdown: z.string(),
  },
  async ({ name, event, action, pattern, conditions, message_markdown }) => {
    await fs.mkdir(RULE_DIR, { recursive: true });
    const filePath = join(RULE_DIR, `${name}.md`);

    const frontmatter: any = {
      name,
      enabled: true,
      event,
      action,
    };
    if (pattern) frontmatter.pattern = pattern;
    if (conditions) frontmatter.conditions = conditions;

    const file = matter.stringify(message_markdown.trim() + "\n", frontmatter);
    await fs.writeFile(filePath, file, "utf8");

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ok: true, file: filePath }),
        },
      ],
    };
  },
);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch(err => {
  console.error("Hookify MCP server error:", err);
  process.exit(1);
});
```

That is a complete MCP server exposing the minimum `hookify` behavior for shell commands.

---

## 4. Wire the server into `codex`

Build the server:

```bash
npx tsc src/server.ts --target ES2020 --module NodeNext --outDir dist
chmod +x dist/server.js
```

Add an MCP server entry to `~/.codex/config.toml` using the stdio mode Codex expects([Online Tool][3]):

```toml
[mcp_servers.hookify]
command = "node"
args = ["/absolute/path/to/dist/server.js"]
startup_timeout_ms = 20000
```

Codex will now launch `hookify` as an MCP server alongside your session.

---

## 5. Make Codex actually use it like a plugin

Claude Code uses command prefixes like `/hookify` plus its own plugin wiring. In Codex, the equivalent behavior is done via:

* **System / base instructions** (e.g. in `AGENTS.md` or profile config)([npm][4])
* **Tool calling**: Codex automatically decides when to call MCP tools once it knows their semantics.

Embed instructions roughly equivalent to Claude’s into your Codex guidance, for example in `AGENTS.md`:

> * Before executing any shell command that modifies files (`rm`, `mv`, `cp`, `chmod`, `mkfs`, `dd`, etc.), always call the MCP tool `hookify_evaluate_shell` with the `command` argument set to the full shell command.
> * If the tool returns `"decision": "block"`, do not run the command and instead show the user the `messages` it returned.
> * If the tool returns `"decision": "warn"`, show the `messages` to the user and ask whether to proceed before executing the command.
> * Use `hookify_create_rule` to encode recurring safety patterns, and `hookify_list_rules` / `hookify_set_rule_enabled` to manage them.

Now the flow is analogous to Claude’s `hookify` plugin:

* User: `Warn me when I use rm -rf commands`
* Codex:

  * Interprets this as a request to create a shell hook
  * Calls `hookify_create_rule` with `event="bash"`, `pattern="rm\\s+-rf"`, `action="warn"`, and a Markdown message
* Later, when it wants to run `rm -rf /tmp/test`, it calls `hookify_evaluate_shell` first and reacts to the response.

You have reproduced the core Hookify behavior as an MCP server usable from Codex.

---

## 6. Extending beyond shell commands

Once the shell path is stable, extend in these directions:

1. **File events**

   * Add `hookify_evaluate_file_edit` with inputs like:

     * `file_path`, `old_text`, `new_text`, or `content`
   * Reuse the same rule files:

     * `event: file`
     * `field: file_path | new_text | old_text | content`
   * Instruct Codex to call this tool before using its file-edit tools.

2. **Prompt events**

   * Add `hookify_evaluate_prompt` with `user_prompt` input.
   * Use it to block or warn on prompts containing e.g. secrets, disallowed actions, etc.

3. **Execpolicy integration (optional)**

   * Add a tool `hookify_emit_execpolicy` that:

     * Reads all `event: bash` rules
     * Writes corresponding Starlark rules into `~/.codex/policy/*.codexpolicy` using `prefix_rule(...)` as documented in Codex execpolicy docs
   * That gives you hard enforcement even if the model “forgets” to call `hookify_evaluate_shell`.

At that point you have:

* A dedicated **MCP “plugin host”** for Hookify, compatible with Claude-style rules
* Full integration into Codex via MCP and (optionally) execpolicy
* A pattern you can reuse to port other Claude Code plugins into Codex as MCP servers (each plugin becomes one MCP server or a shared “claude-code-mcp” server with multiple tools).

[1]: https://developers.openai.com/codex/mcp?utm_source=chatgpt.com "Model Context Protocol"
[2]: https://mcphub.com/mcp-servers/modelcontextprotocol/typescript-sdk?utm_source=chatgpt.com "Typescript SDK by modelcontextprotocol - MCP Server | MCPHub"
[3]: https://docs.onlinetool.cc/codex/docs/config.html?utm_source=chatgpt.com "Config · Codex Docs"
[4]: https://www.npmjs.com/package/%40openai/codex/v/0.20.0?utm_source=chatgpt.com "@openai/codex - npm"
