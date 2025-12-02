1. Overview
   ===========

Problem:
Claude Code’s plugin ecosystem (specifically the `hookify` safety plugin) is only available inside Claude Code. Codex CLI users cannot reuse their existing hook rules or benefit from the same safety/guardrail behavior (e.g., blocking or warning on dangerous shell commands) because there is no MCP-based equivalent wired into `codex`.

Who has the problem:

* Power users of `codex` who run shell commands and file edits from the assistant.
* Teams with existing `.claude/hookify.*.local.md` rules who want parity across tools.
* Org/platform owners who need centralized, explainable guardrails on AI-initiated actions.

Why current solutions fail:

* Hookify is implemented as a Claude Code plugin; Codex cannot call those hooks.
* Execpolicy in Codex can enforce rules, but it is static, code-heavy, and not aligned with Hookify’s markdown-based rule model.
* There is no reusable MCP server that:

  * Parses Hookify-style rule files.
  * Applies them to Codex actions.
  * Exposes structured tools for rule management and evaluation.

Product to build:

* An MCP server (“codex-hookify”) that:

  * Implements a Hookify-compatible rule model (YAML frontmatter + Markdown body).
  * Evaluates shell commands (MVP) and eventually file/prompt events against those rules.
  * Exposes this behavior via MCP tools for `codex`.
  * Optionally exports rules into Codex execpolicy for hard enforcement.

Success metrics (initial release):

* ≥90% behavioral parity with Claude Code Hookify for `bash` event rules on a shared corpus of rules.
* ≥80% of shell commands that would be blocked/warned by Claude Code Hookify are blocked/warned identically via `codex-hookify`.
* <1% false-positive hard blocks on a defined benchmark of “safe” commands.
* End-to-end latency added by `hookify_evaluate_shell` ≤50ms p95 on local filesystem rules.
* For at least one production user, ≥70% of “dangerous” commands receive a warning or block before execution (measured over a sampled period).

Scope for MVP:

* Single MCP server focused on `event: bash | all`.
* Rule store: filesystem-based, compatible with `.claude/hookify.*.local.md` and/or `~/.codex/hookify/*.md`.
* Tools: evaluate shell, list rules, create rule, enable/disable rule.

2. Capability Tree (Functional Decomposition)
   =============================================

## Capability A: Rule Storage and Parsing

Brief: Represent, persist, and parse Hookify-style rules from Markdown with YAML frontmatter into a normalized internal model.

#### Feature A1 (MVP): Filesystem Rule Store

* Description: Load and persist rule definitions as Markdown files in a configured directory.
* Inputs:

  * Rule directory path (from env/config).
  * File glob or list of files (`*.md`).
* Outputs:

  * In-memory list of `Rule` objects: `{ name, enabled, event, action, pattern?, conditions?, message, filePath }`.
* Behavior:

  * On load:

    * Enumerate `.md` files in the rule directory.
    * For each file, parse YAML frontmatter and Markdown body.
    * Map fields: `name`, `enabled`, `event`, `action`, `pattern`, `conditions`, etc. into a strongly typed `Rule`.
    * Default missing fields (`enabled: true`, `event: all`, `action: warn`).
    * Filter out invalid schemas and log errors.
  * On save/update:

    * Serialize Rule back to Markdown+frontmatter preserving unknown fields where possible.
    * Create directory if missing.
    * Ensure atomic writes (temp file + rename).

#### Feature A2 (MVP): Rule Format Compatibility Layer

* Description: Support both Claude-style `.claude/hookify.*.local.md` file naming and Codex-specific `~/.codex/hookify/*.md` layout.
* Inputs:

  * Primary rule directory.
  * Optional compatibility mode flag(s).
* Outputs:

  * Combined set of rules with consistent `name` and `filePath` semantics.
* Behavior:

  * Resolve rule directories in priority order (e.g., Codex directory > Claude directory).
  * Normalize rule names so they can be referenced consistently from MCP tools.
  * Avoid duplicates; deterministic precedence when multiple files declare the same `name`.

#### Feature A3: Rule Validation and Normalization

* Description: Validate rule fields and normalize patterns/conditions for runtime evaluation.
* Inputs:

  * Raw parsed `Rule` objects.
* Outputs:

  * Validated `Rule` objects plus a list of validation errors (for metrics/logging).
* Behavior:

  * Validate `event` in `["bash","file","prompt","stop","all"]`.
  * Validate `action` in `["warn","block"]`.
  * Ensure at least one of `pattern` or `conditions` is present (except for global rules).
  * Normalize regex patterns to a consistent dialect, precompile where applicable.
  * Flag and skip invalid rules at runtime while surfacing diagnostics.

## Capability B: Rule Evaluation Engine

Brief: Determine allow/warn/block decisions by applying rules to candidate actions.

#### Feature B1 (MVP): Shell Command Evaluation

* Description: Evaluate a single shell command against all relevant rules and compute a decision.
* Inputs:

  * `command: string`.
  * Loaded rules from Capability A.
* Outputs:

  * `{ decision: "allow" | "warn" | "block", messages: string[], matched_rules: string[] }`.
* Behavior:

  * Select rules where `event` is `bash` or `all`.
  * For each candidate rule:

    * If `pattern` is present, test regex against the full `command`.
    * If `conditions` present, evaluate each condition:

      * `field` → pick from `{ command }`.
      * `operator` in `["regex_match","contains","not_contains","equals"]`.
    * Rule matches only if all conditions succeed.
  * Aggregate matches:

    * If any matching rule has `action: "block"`, decision = `"block"`.
    * Else if any matching rule exists, decision = `"warn"`.
    * Else decision = `"allow"`.
  * Collect Markdown messages from matched rules in deterministic order.
  * Return JSON-serializable result.

#### Feature B2: Condition Evaluation Engine

* Description: Reusable condition matcher for different event types (bash/file/prompt).
* Inputs:

  * Rule conditions: `[{ field, operator, pattern }, ...]`.
  * Evaluation context, e.g., `{ command?, file_path?, new_text?, user_prompt? }`.
* Outputs:

  * Boolean match result per rule.
* Behavior:

  * Map `field` to a string value in the context (missing → `""`).
  * Apply operator semantics:

    * `regex_match`: `RegExp(pattern).test(value)`.
    * `contains`: `value.includes(pattern)`.
    * `not_contains`: `!value.includes(pattern)`.
    * `equals`: strict string equality.
  * Rule passes conditions if all conditions are true.

#### Feature B3: Event-Generic Evaluation (Post-MVP)

* Description: Extend evaluation for `file`, `prompt`, and `stop` events using shared matching engine.
* Inputs:

  * Event-specific payload: file edit, prompt text, stop event metadata.
  * Loaded rules.
* Outputs:

  * Same decision JSON shape as B1.
* Behavior:

  * Derive context object for each event type.
  * Reuse condition and pattern logic from B2.
  * Allow event-specific shortcuts (e.g., `pattern` on `file_path` by default for `file`).

## Capability C: MCP Tool Surface

Brief: Expose rule evaluation and management via MCP tools usable from `codex`.

#### Feature C1 (MVP): `hookify_evaluate_shell` Tool

* Description: MCP tool that evaluates a shell command via the rule engine.
* Inputs:

  * JSON payload `{ command: string }`.
* Outputs:

  * MCP text content containing JSON string:

    * `{"decision":"warn","messages":[...],"matched_rules":["..."]}`.
* Behavior:

  * Validate input schema.
  * Call B1 with `command`.
  * Serialize result as a JSON string in `content[0].text`.
  * Return in MCP-compliant response format.

#### Feature C2 (MVP): `hookify_list_rules` Tool

* Description: List all loaded rules and their metadata.
* Inputs:

  * Optional filters (event, enabled flag).
* Outputs:

  * JSON list of `{ name, event, action, enabled, file }`.
* Behavior:

  * Load rules via A1.
  * Optionally include disabled rules (requires load-all variant).
  * Flatten into compact metadata for display/inspection.

#### Feature C3 (MVP): `hookify_set_rule_enabled` Tool

* Description: Enable or disable a named rule.
* Inputs:

  * `{ name: string, enabled: boolean }`.
* Outputs:

  * `{ ok: boolean, error?: string }` JSON inside MCP text content.
* Behavior:

  * Find rule by name via A1.
  * Read original Markdown file.
  * Update frontmatter `enabled` flag.
  * Write file back through A1/A3 persistence.
  * Return success/failure.

#### Feature C4 (MVP): `hookify_create_rule` Tool

* Description: Create a new rule file from structured arguments.
* Inputs:

  * `{ name, event, action?, pattern?, conditions?, message_markdown }`.
* Outputs:

  * `{ ok: true, file: string }` JSON inside MCP text content on success.
* Behavior:

  * Validate required fields: `name`, `event`, `message_markdown`.
  * Use A3 for semantic validation.
  * Build frontmatter with defaults and optional fields.
  * Determine file path in rule directory.
  * Persist to disk.
  * Return file path.

#### Feature C5: Health and Introspection Tools

* Description: Lightweight tools for observability (optional but recommended).
* Inputs:

  * None or simple ping payload.
* Outputs:

  * Static info: version, rule directory, rule count.
* Behavior:

  * Provide `hookify_health` returning status and counts.
  * Provide `hookify_get_config` returning effective configuration snapshot.

## Capability D: Codex CLI Integration and Guidance

Brief: Ensure Codex uses the MCP server effectively and consistently for safety decisions.

#### Feature D1 (MVP): Codex MCP Configuration Snippet

* Description: Provide the required `~/.codex/config.toml` snippet to register the `hookify` MCP server over stdio.
* Inputs:

  * Server executable path.
  * Optional startup timeout.
* Outputs:

  * TOML snippet with `[mcp_servers.hookify]` entry.
* Behavior:

  * Template snippet using Node command and server path.
  * Document environment variables (`HOOKIFY_RULE_DIR`, etc.).
  * Keep this in docs and optionally as a generated file from the repo.

#### Feature D2 (MVP): System/Agent Instruction Template

* Description: Provide canonical instructions for Codex agents on when and how to use `hookify_*` tools.
* Inputs:

  * Understanding of Codex’s tool-calling behavior and safety expectations.
* Outputs:

  * Text template suitable for AGENTS/system instructions.
* Behavior:

  * Instruct models to:

    * Call `hookify_evaluate_shell` before executing potentially dangerous commands (mutating filesystem, permissions, devices).
    * Respect `"block"` decisions (do not run command).
    * Surface `"warn"` messages to the user and require explicit confirmation.
    * Use create/list/enable tools to manage rules as requested.

#### Feature D3: Execpolicy Export (Optional)

* Description: Emit `.codexpolicy` Starlark rules from Hookify rules.
* Inputs:

  * Loaded `bash` rules.
* Outputs:

  * Generated `.codexpolicy` file(s) mapping patterns to `prefix_rule(...)` or equivalent.
* Behavior:

  * Map `pattern` and `action` semantics into execpolicy expressions.
  * Write or update policy files in Codex policy directory.
  * Provide a dedicated MCP tool `hookify_emit_execpolicy` to trigger regeneration.

## Capability E: Extensibility and Plugin Parity

Brief: Provide a path to extend beyond `bash` to other events and to additional Claude Code plugins.

#### Feature E1: File Event Evaluation

* Description: Evaluate candidate file edits before applying them.
* Inputs:

  * `{ file_path: string, old_text?: string, new_text: string }`.
* Outputs:

  * Same decision JSON as B1.
* Behavior:

  * Build file-specific context (`file_path`, `old_text`, `new_text`).
  * Reuse condition engine (B2).
  * Honor `event: file | all` rules.

#### Feature E2: Prompt Event Evaluation

* Description: Evaluate sensitive or restricted prompts (`event: prompt`).
* Inputs:

  * `{ user_prompt: string }`.
* Outputs:

  * Same decision JSON as B1.
* Behavior:

  * Context `user_prompt`.
  * Rules with `field: "user_prompt"`.

#### Feature E3: Multi-Plugin Host Pattern

* Description: Define standards to host additional Claude Code plugins behind MCP tools.
* Inputs:

  * Plugin definitions from Claude codebase.
* Outputs:

  * Documented patterns and interfaces for future MCP servers or shared host.
* Behavior:

  * Define naming, rule models, and capability boundaries to minimize coupling.

3. Repository Structure + Module Definitions
   ============================================

Proposed TypeScript/Node layout, following the sample server implementation.

Repository structure (high level):

```text
codex-hookify-mcp/
├── src/
│   ├── config/
│   │   └── env.ts
│   ├── types/
│   │   └── rule.ts
│   ├── rules/
│   │   ├── ruleStore.ts
│   │   ├── ruleParser.ts
│   │   └── ruleValidator.ts
│   ├── engine/
│   │   ├── conditionMatcher.ts
│   │   ├── shellEvaluator.ts
│   │   └── eventEvaluator.ts
│   ├── mcp/
│   │   ├── tools/
│   │   │   ├── evaluateShellTool.ts
│   │   │   ├── listRulesTool.ts
│   │   │   ├── setRuleEnabledTool.ts
│   │   │   ├── createRuleTool.ts
│   │   │   └── healthTool.ts
│   │   └── server.ts
│   ├── integration/
│   │   ├── codexConfigSnippet.ts
│   │   └── agentInstructions.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/
    ├── hookify-format.md
    ├── codex-integration.md
    └── examples/
```

Module definitions:

### Module: `config/env`

* Maps to capability: A2, D1.
* Responsibility: Resolve configuration (rule directory, compatibility flags, log level).
* File structure:

  ```text
  src/config/env.ts
  ```

* Exports:

  * `getConfig()` – returns `{ ruleDir, compatibilityMode, logLevel }`.

### Module: `types/rule`

* Maps to capability: A1, A3, B1–B3.
* Responsibility: Define strongly-typed `Rule` and related types.
* File structure:

  ```text
  src/types/rule.ts
  ```

* Exports:

  * `Rule` – core rule type.
  * `Condition` – condition type.
  * `EventType`, `ActionType` – enums or union types.

### Module: `rules/ruleParser`

* Maps to capability: A1.
* Responsibility: Parse Markdown rule files into raw objects.
* File structure:

  ```text
  src/rules/ruleParser.ts
  ```

* Exports:

  * `parseRuleFile(content: string, filePath: string): Rule`.

### Module: `rules/ruleValidator`

* Maps to capability: A3.
* Responsibility: Validate and normalize rules.
* File structure:

  ```text
  src/rules/ruleValidator.ts
  ```

* Exports:

  * `validateRule(raw: Rule): { rule?: Rule; errors?: string[] }`.

### Module: `rules/ruleStore`

* Maps to capability: A1, A2.
* Responsibility: Filesystem-backed storage and listing of rules.
* File structure:

  ```text
  src/rules/ruleStore.ts
  ```

* Exports:

  * `loadRules(options?): Rule[]`.
  * `loadAllRulesWithDisabled(options?): Rule[]`.
  * `writeRule(rule: Rule): Promise<void>`.
  * `updateRuleEnabled(name: string, enabled: boolean): Promise<boolean>`.

### Module: `engine/conditionMatcher`

* Maps to capability: B2.
* Responsibility: Evaluate conditions against event context.
* File structure:

  ```text
  src/engine/conditionMatcher.ts
  ```

* Exports:

  * `matchConditions(rule: Rule, ctx: Record<string, string>): boolean`.

### Module: `engine/shellEvaluator`

* Maps to capability: B1.
* Responsibility: Evaluate shell commands against rules.
* File structure:

  ```text
  src/engine/shellEvaluator.ts
  ```

* Exports:

  * `evaluateShell(command: string, rules: Rule[]): EvaluationResult`.

### Module: `engine/eventEvaluator`

* Maps to capability: B3, E1, E2.
* Responsibility: Generic event evaluation for file/prompt/stop.
* File structure:

  ```text
  src/engine/eventEvaluator.ts
  ```

* Exports:

  * `evaluateEvent(eventType: EventType, ctx: Record<string,string>, rules: Rule[]): EvaluationResult`.

### Module: `mcp/tools/evaluateShellTool`

* Maps to capability: C1.
* Responsibility: Wrap shell evaluation in MCP tool implementation.
* File structure:

  ```text
  src/mcp/tools/evaluateShellTool.ts
  ```

* Exports:

  * `registerEvaluateShellTool(server: McpServer)`.

### Module: `mcp/tools/listRulesTool`

* Maps to capability: C2.
* Responsibility: Expose rule listing via MCP.
* File structure:

  ```text
  src/mcp/tools/listRulesTool.ts
  ```

* Exports:

  * `registerListRulesTool(server: McpServer)`.

### Module: `mcp/tools/setRuleEnabledTool`

* Maps to capability: C3.
* Responsibility: Enable/disable rules via MCP.
* File structure:

  ```text
  src/mcp/tools/setRuleEnabledTool.ts
  ```

* Exports:

  * `registerSetRuleEnabledTool(server: McpServer)`.

### Module: `mcp/tools/createRuleTool`

* Maps to capability: C4.
* Responsibility: Create new rules via MCP.
* File structure:

  ```text
  src/mcp/tools/createRuleTool.ts
  ```

* Exports:

  * `registerCreateRuleTool(server: McpServer)`.

### Module: `mcp/tools/healthTool`

* Maps to capability: C5.
* Responsibility: Health/introspection.
* File structure:

  ```text
  src/mcp/tools/healthTool.ts
  ```

* Exports:

  * `registerHealthTool(server: McpServer)`.

### Module: `mcp/server`

* Maps to capability: C1–C5.
* Responsibility: Wire MCP server, transport, and tool registrations.
* File structure:

  ```text
  src/mcp/server.ts
  ```

* Exports:

  * `run()` – entrypoint to start MCP server over stdio.

### Module: `integration/codexConfigSnippet`

* Maps to capability: D1.
* Responsibility: Provide Codex config snippet.
* File structure:

  ```text
  src/integration/codexConfigSnippet.ts
  ```

* Exports:

  * `getCodexTomlSnippet(binaryPath: string): string`.

### Module: `integration/agentInstructions`

* Maps to capability: D2.
* Responsibility: Provide standard agent/system instruction text.
* File structure:

  ```text
  src/integration/agentInstructions.ts
  ```

* Exports:

  * `getAgentInstructions(): string`.

### Module: `index`

* Maps to capability: composition/entry.
* Responsibility: Single entry to run server (re-export `run`).
* File structure:

  ```text
  src/index.ts
  ```

* Exports:

  * `run()`.

4. Dependency Chain
   ===================

Acyclic layering, foundation first.

### Foundation Layer (Phase 0)

* **Module `config/env`**: Provides configuration (rule directory, flags); no dependencies.
* **Module `types/rule`**: Provides core types; no dependencies.

### File System and Parsing Layer (Phase 1)

* **Module `rules/ruleParser`**

  * Depends on: `types/rule`.
  * Provides: parsing Markdown to `Rule`.

* **Module `rules/ruleValidator`**

  * Depends on: `types/rule`.
  * Provides: validation and normalization.

* **Module `rules/ruleStore`**

  * Depends on: `config/env`, `rules/ruleParser`, `rules/ruleValidator`, `types/rule`.
  * Provides: load/save/update rule operations.

### Engine Layer (Phase 2)

* **Module `engine/conditionMatcher`**

  * Depends on: `types/rule`.
  * Provides: generic condition evaluation.

* **Module `engine/shellEvaluator`**

  * Depends on: `types/rule`, `rules/ruleStore`, `engine/conditionMatcher`.
  * Provides: shell command evaluation.

* **Module `engine/eventEvaluator`**

  * Depends on: `types/rule`, `rules/ruleStore`, `engine/conditionMatcher`.
  * Provides: generic event evaluation for future features.

### MCP Tools Layer (Phase 3)

* **Module `mcp/tools/evaluateShellTool`**

  * Depends on: `engine/shellEvaluator`, `rules/ruleStore`, MCP SDK.

* **Module `mcp/tools/listRulesTool`**

  * Depends on: `rules/ruleStore`, `types/rule`, MCP SDK.

* **Module `mcp/tools/setRuleEnabledTool`**

  * Depends on: `rules/ruleStore`, MCP SDK.

* **Module `mcp/tools/createRuleTool`**

  * Depends on: `rules/ruleStore`, `rules/ruleValidator`, MCP SDK.

* **Module `mcp/tools/healthTool`**

  * Depends on: `rules/ruleStore`, `config/env`, MCP SDK.

### MCP Server Layer (Phase 3)

* **Module `mcp/server`**

  * Depends on: MCP SDK, stdio transport, all `mcp/tools/*` modules.

* **Module `index`**

  * Depends on: `mcp/server`.

### Integration Layer (Phase 4)

* **Module `integration/codexConfigSnippet`**

  * Depends on: `config/env` (optional).

* **Module `integration/agentInstructions`**

  * Depends on: none (static text).

* **Future Execpolicy Exporter (if added)**

  * Depends on: `rules/ruleStore`, `types/rule`, Codex execpolicy spec.

No cycles; each layer uses only layers at or below it.

5. Development Phases
   =====================

## Phase 0: Foundation

Goal: Establish configuration and types foundation for rules.

Entry Criteria: Clean repo scaffolding with TypeScript and MCP SDK dependencies installed.

Tasks:

* [ ] Task 0.1 – Implement configuration module (`config/env`)

  * Depends on: none.
  * Acceptance criteria:

    * `getConfig()` returns default rule directory under `~/.codex/hookify` when env is unset.
    * Unit tests cover env overrides and fallback behavior.
  * Test strategy:

    * Unit tests with mocked `process.env` and `HOME`.
    * No filesystem interaction.

* [ ] Task 0.2 – Define rule types (`types/rule`)

  * Depends on: none.
  * Acceptance criteria:

    * `Rule`, `Condition`, `EventType`, `ActionType` types defined and exported.
    * TypeScript passes with strict mode enabled.
  * Test strategy:

    * Type-level tests / simple runtime sanity checks (e.g., `EventType` values).

Exit Criteria: Configuration and types modules exist, are compiled, and are test-covered.

Delivers: Stable type contracts for all later modules and a single source of configuration truth.

## Phase 1: Rule Store and Parsing

Goal: Read and write Hookify-style rule files from the filesystem.

Entry Criteria: Phase 0 complete.

Tasks:

* [ ] Task 1.1 – Implement rule parsing (`rules/ruleParser`)

  * Depends on: Task 0.2.
  * Acceptance criteria:

    * Given a sample `.md` file with frontmatter and body, `parseRuleFile` produces a `Rule` with correct fields.
    * Invalid YAML or missing required fields produce structured errors.
  * Test strategy:

    * Unit tests with multiple sample files including Claude-style examples.

* [ ] Task 1.2 – Implement rule validation and normalization (`rules/ruleValidator`)

  * Depends on: Tasks 0.2, 1.1.
  * Acceptance criteria:

    * Invalid `event` or `action` are rejected.
    * Missing `enabled` defaults to `true`, missing `action` defaults to `warn`, missing `event` defaults to `all`.
    * Normalized rule returned with compiled regex if used.
  * Test strategy:

    * Unit tests for valid and invalid combinations.
    * Edge cases: empty pattern, missing conditions, conflicting fields.

* [ ] Task 1.3 – Implement filesystem rule store (`rules/ruleStore`)

  * Depends on: Tasks 0.1, 1.1, 1.2.
  * Acceptance criteria:

    * `loadRules()` scans configured directory, loads valid rules, skips invalid ones.
    * `updateRuleEnabled(name, enabled)` updates frontmatter in place and persists.
    * `writeRule(rule)` creates/overwrites rule file.
  * Test strategy:

    * Integration tests with a temp directory and sample files.
    * Ensure atomic write behavior.

Exit Criteria: Rules can be loaded, validated, and written back to disk with deterministic behavior.

Delivers: Persistent rule storage compatible with Hookify-style Markdown.

## Phase 2: Evaluation Engine

Goal: Compute decisions (allow/warn/block) for shell commands using stored rules.

Entry Criteria: Phase 1 complete.

Tasks:

* [ ] Task 2.1 – Implement condition matcher (`engine/conditionMatcher`)

  * Depends on: Tasks 0.2, 1.2.
  * Acceptance criteria:

    * All operators (`regex_match`, `contains`, `not_contains`, `equals`) behave as specified.
    * Empty condition list yields `true`.
  * Test strategy:

    * Unit tests per operator type with positive and negative cases.

* [ ] Task 2.2 (MVP) – Implement shell evaluator (`engine/shellEvaluator`)

  * Depends on: Tasks 1.3, 2.1.
  * Acceptance criteria:

    * Given a set of rules and a command, returns correct decision and matched rule names.
    * Block wins over warn; warn wins over allow.
    * Deterministic behavior for multiple matches.
  * Test strategy:

    * Unit tests with synthetic rule sets.
    * Integration tests with actual rule files from temp directory.

* [ ] Task 2.3 – Implement generic event evaluator (`engine/eventEvaluator`)

  * Depends on: Tasks 1.3, 2.1.
  * Acceptance criteria:

    * Supports evaluating arbitrary event types using context maps.
    * Can be used to implement future file/prompt tools without changing the engine.
  * Test strategy:

    * Unit tests with dummy event types.
    * No Codex integration required yet.

Exit Criteria: Engine layer can evaluate shell commands and is extensible to other events.

Delivers: Pure functions capable of deciding on commands given rules.

## Phase 3: MCP Server and Tools (MVP Usable)

Goal: Expose shell evaluation and rule management as MCP tools via stdio server; deliver MVP.

Entry Criteria: Phase 2 complete.

Tasks:

* [ ] Task 3.1 (MVP) – Implement MCP server skeleton (`mcp/server`)

  * Depends on: MCP SDK, Tasks 0.1, 0.2.
  * Acceptance criteria:

    * Server starts over stdio and responds to a trivial health tool.
    * MCP handshake passes using local test harness.
  * Test strategy:

    * Integration test using test harness to start server and call a dummy tool.

* [ ] Task 3.2 (MVP) – Hook `hookify_evaluate_shell` tool

  * Depends on: Tasks 2.2, 3.1.
  * Acceptance criteria:

    * MCP tool registered with correct JSON schema input.
    * Given a test rule and command, returns expected JSON decision string.
  * Test strategy:

    * Integration tests using MCP harness; snapshot responses.

* [ ] Task 3.3 (MVP) – Implement `hookify_list_rules`, `hookify_set_rule_enabled`, `hookify_create_rule`

  * Depends on: Tasks 1.3, 3.1.
  * Acceptance criteria:

    * Each tool validates inputs and returns well-formed JSON text content.
    * Roundtrip: create rule → list rules shows it → enable/disable updates frontmatter.
  * Test strategy:

    * Integration tests around a temp rule directory, calling MCP tools end-to-end.

* [ ] Task 3.4 – Implement `hookify_health` tool

  * Depends on: Tasks 1.3, 3.1.
  * Acceptance criteria:

    * Returns rule count, rule directory, and version info.
  * Test strategy:

    * Simple integration test.

Exit Criteria: MCP server is fully functional for shell evaluation and rule management; command-line harness can exercise all tools.

Delivers: End-to-end usable product: Codex can call `hookify_*` tools once configured.

## Phase 4: Codex CLI Integration + Documentation

Goal: Provide configuration snippets and agent instructions for effective Codex use.

Entry Criteria: Phase 3 complete.

Tasks:

* [ ] Task 4.1 (MVP) – Codex config snippet generator (`integration/codexConfigSnippet`)

  * Depends on: Task 0.1.
  * Acceptance criteria:

    * Function returns valid TOML block given server path.
    * docs/codex-integration.md includes example with `[mcp_servers.hookify]` and args.
  * Test strategy:

    * Unit test for TOML string structure.

* [ ] Task 4.2 (MVP) – Agent/system instruction template (`integration/agentInstructions`)

  * Depends on: Task 3.2.
  * Acceptance criteria:

    * Text instructs calling `hookify_evaluate_shell` before dangerous commands and respecting its decisions.
  * Test strategy:

    * Snapshot tests on the instruction string.

* [ ] Task 4.3 – Documentation

  * Depends on: Tasks 3.2, 3.3, 4.1, 4.2.
  * Acceptance criteria:

    * docs/hookify-format.md explains rule frontmatter and message semantics.
    * docs/codex-integration.md explains configuration and usage examples.
  * Test strategy:

    * Manual doc review.

Exit Criteria: A new user can install the server, configure Codex, and see warnings/blocks on dangerous commands.

Delivers: Production-ready MVP for Codex users.

## Phase 5: Extensions (File/Prompt Events, Execpolicy Export)

Goal: Extend engine and tools to other events and optional execpolicy export.

Entry Criteria: Phases 0–4 complete.

Tasks:

* [ ] Task 5.1 – File event tool (`hookify_evaluate_file_edit`)

  * Depends on: Task 2.3, 3.1.
  * Acceptance criteria:

    * Tool schema defined for file edits.
    * Rules with `event: file | all` are respected.
  * Test strategy:

    * Integration tests with sample file rules.

* [ ] Task 5.2 – Prompt event tool (`hookify_evaluate_prompt`)

  * Depends on: Task 2.3, 3.1.
  * Acceptance criteria:

    * Tool schema defined for prompts.
    * Rules with `event: prompt | all` are respected.
  * Test strategy:

    * Integration tests with sensitive prompt rules.

* [ ] Task 5.3 – Execpolicy export tool (`hookify_emit_execpolicy`)

  * Depends on: Tasks 1.3, 2.2.
  * Acceptance criteria:

    * Generates `.codexpolicy` files from `bash` rules with predictable mapping.
  * Test strategy:

    * Filesystem integration tests; manual inspection of generated policies.

Exit Criteria: Non-shell events supported; optional hard enforcement via execpolicy exists.

Delivers: Extended parity with Claude Hookify and deeper Codex integration.

6. User Experience
   ==================

Personas:

* Individual developer using `codex` to run shell commands and edits with AI assistance.
* Team lead / DevOps engineer responsible for enforcing command safety rules.
* Platform/security engineer consolidating guardrails across multiple tools.

Key flows (MVP):

1. Configure and run:

   * Install `codex-hookify-mcp`.
   * Add generated TOML snippet to `~/.codex/config.toml`.
   * Restart Codex CLI.
   * Codex now discovers the MCP server and tools.

2. Create safety rule:

   * User asks Codex: “Warn me when a command contains `rm -rf`.”
   * Codex calls `hookify_create_rule` with structured arguments.
   * Rule file is written; `hookify_list_rules` shows it.

3. Command evaluation:

   * Codex prepares to run `rm -rf /tmp/test`.
   * Before execution, Codex calls `hookify_evaluate_shell` with the full command.
   * Response: `"decision": "warn"` and message from rule.
   * Codex shows message and waits; if user still confirms, Codex proceeds.

4. Blocked command:

   * Rule with `action: block` matches.
   * `decision: "block"`.
   * Codex surfaces explanation; does not run the command.

5. Rule management:

   * User lists existing rules (`hookify_list_rules`).
   * User disables a noisy rule via `hookify_set_rule_enabled`.

UX notes:

* Messages are pure Markdown from rule bodies, allowing rich explanations.
* Tool responses remain machine-parseable JSON to keep Codex behavior deterministic.
* No custom UI layer required; UX is entirely through Codex’s CLI and model outputs.

7. Technical Architecture
   =========================

System components:

* MCP Server:

  * Node/TypeScript process exposing MCP tools over stdio.
* Rule Store:

  * Filesystem-backed store under configurable directory.
* Evaluation Engine:

  * Pure functions that compute decisions given rules and context.
* Integration Layer:

  * Documentation and text generators for Codex config and instructions.

Data models:

* `Rule`:

  * `name: string`
  * `enabled: boolean`
  * `event: "bash" | "file" | "prompt" | "stop" | "all"`
  * `action: "warn" | "block"`
  * `pattern?: string`
  * `conditions?: Condition[]`
  * `message: string` (Markdown body)
  * `filePath: string`

* `Condition`:

  * `field: string`
  * `operator: "regex_match" | "contains" | "not_contains" | "equals"`
  * `pattern: string`

* `EvaluationResult`:

  * `decision: "allow" | "warn" | "block"`
  * `messages: string[]`
  * `matched_rules: string[]`

APIs and integrations:

* MCP:

  * Uses official TypeScript MCP SDK with `StdioServerTransport`.
  * Each tool defines Zod-based JSON schema for inputs and outputs.

* Codex CLI:

  * Configured via `[mcp_servers.hookify]` entry in `~/.codex/config.toml`.
  * Tools auto-discovered; behavior driven by model instructions.

* Filesystem:

  * Uses Node `fs.promises` under the hood.
  * Rule directory configurable via `HOOKIFY_RULE_DIR` or default path.

Technology stack:

* Language: TypeScript.
* Runtime: Node.js.
* Libraries:

  * `@modelcontextprotocol/sdk` for MCP.
  * `zod` for schema validation.
  * `gray-matter` for YAML+Markdown parsing.
* Build: `tsc` or minimal bundler configuration.

Decisions:

* MCP server over stdio (Decision):

  * Rationale: Matches Codex’s expected transport and is simplest to integrate.
  * Trade-offs: Requires Node runtime; more verbose than HTTP.
  * Alternatives: HTTP-based MCP server (more complex deployment).

* Filesystem rule store (Decision):

  * Rationale: Aligns with Hookify’s markdown-local configuration model.
  * Trade-offs: No centralized DB or multi-user sync; local-only by default.
  * Alternatives: DB-backed rules with synchronization service.

* JSON-in-text result (Decision):

  * Rationale: Keeps MCP content simple and tool-agnostic; Codex can parse easily.
  * Trade-offs: Slightly awkward for humans reading raw tool output.
  * Alternatives: Custom structured content type.

8. Test Strategy
   ================

Test pyramid:

```text
        /\
       /E2E\        ← ~10%
      /------\
     /Integration\  ← ~20%
    /------------\
   /  Unit Tests  \← ~70%
  /----------------\
```

Coverage requirements (targets):

* Line coverage: ≥80%.
* Branch coverage: ≥75%.
* Function coverage: ≥80%.
* Statement coverage: ≥80%.

Critical test scenarios:

### Module: `rules/ruleParser` / `rules/ruleValidator`

Happy path:

* Parse well-formed Hookify `.md` with all fields and ensure `Rule` matches expectations.

Edge cases:

* Missing optional fields (defaults applied).
* Multiple frontmatter fields of same name (latest wins).

Error cases:

* Invalid YAML.
* Unknown `event` or `action`.

Integration points:

* Combined with `ruleStore` to ensure invalid rules are skipped, not fatal.

### Module: `engine/shellEvaluator`

Happy path:

* Single matching `warn` rule; command triggers warn decision with correct message.

Edge cases:

* Multiple matching rules, different actions:

  * Mix of `warn` and `block`.
  * Multiple blocks.
* Overlapping regexes.

Error cases:

* Empty rule set → decision `allow`.
* Rules with invalid regex patterns; ensure they are skipped.

Integration points:

* With `ruleStore` to ensure decisions respect enabled/disabled flags.

### Module: MCP tools

Happy path:

* `hookify_evaluate_shell` returns JSON text representing expected decision.
* `hookify_create_rule` → `hookify_list_rules` shows new rule.

Edge cases:

* Input missing required field.
* Conflicting rule names.

Error cases:

* `set_rule_enabled` on non-existent rule → `{ ok: false, error: "Rule not found" }`.

Integration points:

* MCP handshake; Codex tool discovery.

### End-to-End (E2E)

* Start MCP server; configure Codex in a test environment; verify:

  * Dangerous command is blocked or warned.
  * Rule toggling changes behavior without restart.

Test generation guidelines:

* Prefer pure function tests (engines, parsers) to isolate logic.
* Use table-driven tests for condition operators and rule combinations.
* When testing MCP, use a dedicated harness rather than manual processes.
* For filesystem tests, use temp directories and clean them up.

9. Risks and Mitigations
   ========================

Technical risks:

1. Risk: Behavioral divergence from Claude Hookify.

   * Impact: High (users expect parity).
   * Likelihood: Medium.
   * Mitigation: Build a shared test corpus of rules and commands; compare decisions against Claude where possible.
   * Fallback: Document known differences, provide compatibility flags.

2. Risk: MCP spec or Codex integration quirks.

   * Impact: Medium.
   * Likelihood: Medium.
   * Mitigation: Keep MCP usage minimal and close to SDK examples; maintain tests around handshake and tool schemas.
   * Fallback: Provide a CLI wrapper for standalone evaluation outside Codex.

3. Risk: Performance degradation with many rules.

   * Impact: Medium.
   * Likelihood: Low/Medium.
   * Mitigation: Precompile regexes, cache rules, and only reload on a known trigger (e.g., file hash changes).
   * Fallback: Document guidance for maximum rule count and complexity.

Dependency risks:

1. Risk: Node/MCP SDK version mismatches.

   * Impact: Medium.
   * Likelihood: Medium.
   * Mitigation: Pin SDK versions; maintain lockfile; CI to run against supported Node matrix.
   * Fallback: Provide prebuilt binary.

2. Risk: Codex CLI configuration changes.

   * Impact: Medium.
   * Likelihood: Low/Medium.
   * Mitigation: Keep docs modular; note which Codex versions are supported.
   * Fallback: Offer generic MCP config and troubleshooting guide.

Scope risks:

1. Risk: Overextending to all Claude plugins in v1.

   * Impact: High.
   * Likelihood: Medium.
   * Mitigation: Strict MVP on `bash` Hookify; defer file, prompt, execpolicy, and other plugins to later phases.
   * Fallback: Hard-stop at Phase 3/4 until adoption feedback is gathered.

2. Risk: Complex rule formats and advanced conditions.

   * Impact: Medium.
   * Likelihood: Medium.
   * Mitigation: Start with core subset of Hookify semantics; add advanced features behind flags.
   * Fallback: Document unsupported fields and semantics explicitly.

10) Appendix
    ============

References:

* Prior design sketch for Hookify MCP server and Codex integration.
* RPG method PRD template and methodology.
* Generic PRD template and structure used as baseline.

Glossary:

* MCP (Model Context Protocol): Protocol for exposing external tools/resources to models via standardized interfaces.
* Codex CLI: CLI client that can connect to MCP servers and use their tools as part of conversational or agent workflows.
* Hookify: Claude Code plugin that uses rule files to warn/block potentially harmful actions.
* Execpolicy: Codex’s Starlark-based execution policy system.

Open questions:

* Exact mapping of all Hookify fields and advanced features (e.g., conditions beyond basic operators).
* How to detect and respond to runtime rule changes (watcher vs reload-on-demand).
* Whether to support multi-user rule directories or only single-user local config.
* Strategy for sharing rules across machines (e.g., repo-based rules) vs purely local config.

11. Task-Master Integration Notes
    =================================

Capabilities → tasks:

* Capability A: Rule Storage and Parsing → Tasks 0.1, 0.2, 1.1–1.3.
* Capability B: Rule Evaluation Engine → Tasks 2.1–2.3.
* Capability C: MCP Tool Surface → Tasks 3.1–3.4.
* Capability D: Codex CLI Integration and Guidance → Tasks 4.1–4.3.
* Capability E: Extensibility and Plugin Parity → Tasks 5.1–5.3.

Features → subtasks:

* Each feature defined in Section 2 maps to one or more implementation tasks in Phases 0–5.

Dependencies → task deps:

* Task dependencies exactly follow the module dependencies defined in Section 4 and the “Depends on” notes in Phase tasks.
* Foundation tasks (Phase 0) have no deps.
* Higher phase tasks depend only on tasks in earlier phases.

Phases → priorities:

* Phase 0–1: High priority (foundation).
* Phase 2–3: Core MVP delivering usable system (highest user value).
* Phase 4: Documentation and integration polish.
* Phase 5: Optional extensions and execpolicy export.
