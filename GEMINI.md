# Gemini Code Assist Context: Codex Hookify MCP Server

## Project Overview

This project, `codex-hookify-mcp`, is a Model Context Protocol (MCP) server that brings the functionality of Claude Code's `hookify` safety plugin to the `codex-cli` ecosystem. Its primary purpose is to intercept shell commands initiated by an AI agent, evaluate them against a set of user-defined safety rules, and then either allow, warn, or block the command.

The server is built with **TypeScript** and runs on **Node.js**. It is designed to be used as a plugin for AI-powered command-line tools that support MCP, such as `codex-cli`.

The core functionality includes:
- **Parsing Safety Rules:** Reads and parses `.md` files containing YAML frontmatter that define safety rules, compatible with the Claude `hookify` plugin format.
- **Command Evaluation:** Exposes an MCP tool (`hookify_evaluate_shell`) that the AI agent can call to check if a shell command is safe before execution.
- **Rule Management:** Provides MCP tools to list, create, enable, and disable safety rules.
- **Flexible Transports:** Can communicate with the client via `stdio` (standard I/O), `HTTP`, or `SSE` (Server-Sent Events).

## Building and Running the Project

The project uses `pnpm` as its package manager and `unbuild` for the build process.

### Key Commands

-   **Install Dependencies:**
    ```bash
    pnpm install
    ```

-   **Build the Project:**
    Compiles the TypeScript source code into the `./dist` directory.
    ```bash
    pnpm build
    ```

-   **Run in Development Mode:**
    Starts the server using `nodemon` for automatic restarts on file changes.
    ```bash
    pnpm start
    ```

-   **Run Tests:**
    Executes the test suite using `vitest`.
    ```bash
    pnpm test
    ```

-   **Linting:**
    Checks the code for style and quality issues using `eslint`.
    ```bash
    pnpm lint
    ```

## Development Conventions

-   **Language:** The project is written entirely in **TypeScript**.
-   **Build Tool:** `unbuild` is used for a fast and minimal build process.
-   **Testing:** The `vitest` framework is used for unit and integration tests. Test files are located in the `tests/` directory.
-   **Linting:** `eslint` with `@antfu/eslint-config` is used to enforce a consistent coding style.
-   **Modularity:** The project is structured into modules with clear responsibilities, as detailed in the `prd.md`:
    -   `src/config`: Environment and configuration management.
    -   `src/types`: Core data structures (e.g., for rules).
    -   `src/rules`: Rule parsing, validation, and storage logic.
    -   `src/engine`: The core evaluation engine for matching commands against rules.
    -   `src/mcp`: The MCP server and tool implementations.
-   **Plugin System (`hookify-plugin`):** The `hookify-plugin` directory contains what appears to be the source for a Claude Code plugin, which this MCP server aims to replicate. This includes rule examples and agent/command definitions.

## Project Usage

This server is intended to be run as a background service for an MCP-compatible client like `codex-cli`.

### Configuration for `codex-cli`

To integrate with `codex-cli`, you need to add a configuration snippet to your `~/.codex/config.toml` file. This tells `codex-cli` how to start and communicate with the Hookify MCP server.

**Example `config.toml` entry (using `stdio`):**
```toml
[mcp_servers.hookify]
command = ["node", "/path/to/your/project/codex-hookify-mcp/dist/server.js"]
startup_timeout_ms = 20000
```
*Note: You must use the absolute path to the compiled `dist/server.js` file.*

### Rule Files

The server loads safety rules from `.md` files located in `~/.codex/hookify` by default. The rule format consists of YAML frontmatter for metadata (`name`, `event`, `action`, `pattern`) and a Markdown body for the warning/block message.

Examples can be found in the `hookify-plugin/hookify/examples/` directory.

### MCP Tools Exposed

The AI agent can use the following tools exposed by this server:

-   `hookify_evaluate_shell`: Evaluates a shell command against the rules.
-   `hookify_list_rules`: Lists all loaded rules.
-   `hookify_set_rule_enabled`: Enables or disables a rule.
-   `hookify_create_rule`: Creates a new rule file.
-   `hookify_health`: Checks the status of the server.
