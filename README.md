# MCP Server Starter

![mcp starter](/public/banner.png)

<div align="center">
  <strong>Created by</strong><br />
  <a href="https://twitter.com/kregenrek">
    <img src="https://img.shields.io/twitter/follow/kregenrek?style=social" alt="Follow @kregenrek on Twitter">
  </a>
</div>

**Want to build your own MCP server?**

MCP Server Starter gives you a basic structure to run local tools with Cursor, Claude, and others using the MCP standard.

---

## Codex Hookify MCP Server

This repository contains an MCP server that brings the functionality of Claude Code's `hookify` safety plugin to the `codex-cli` ecosystem. This server allows you to define rules to warn or block dangerous shell commands before they are executed by an AI agent.

It is based on the [MCP Server Starter](https://github.com/instructa/mcp-starter).

## Features

- **Shell Command Safety**: Intercepts shell commands and evaluates them against a set of user-defined rules.
- **Claude `hookify` Compatibility**: Parses and uses rule files from Claude Code's `hookify` plugin (`.claude/hookify.*.local.md`) as well as a local `~/.codex/hookify` directory.
- **Configurable Actions**: Rules can be configured to `warn` the user before execution or `block` the command entirely.
- **Flexible Rule Definition**: Rules are defined in simple Markdown files with YAML frontmatter, allowing for easy creation and modification.
- **MCP Tooling**: Exposes a clear set of MCP tools for `codex-cli` to evaluate commands and manage rules.
- 📡 **Flexible Communication**
  - Supports multiple communication protocols between client and server,
  - `stdio`: Local usage
  - `Streamable HTTP`: Remote and local useage
  - `sse`: Remote and local usage (deprecated)~~

- 📦 **Minimal Setup** - Get started quickly with a basic server implementation.
- 🤖 **Codex CLI Integration** - Includes example `config.toml` configuration for `codex-cli`.
- ⌨️ **TypeScript** - Add type safety to your project.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- An MCP-compatible client (e.g., [codex-cli](https://github.com/openai/codex-cli))

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/instructa/codex-hookify-mcp.git
    cd codex-hookify-mcp
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Build the server:**
    ```bash
    npm run build
    ```
    This will compile the TypeScript source to `./dist`.

## Usage

This server is designed to be used with `codex-cli` via its MCP server integration.

### stdio

This is the recommended transport for local `codex-cli` usage.

Add the following to your `~/.codex/config.toml` file to register the Hookify server. Make sure to use the **absolute path** to the compiled server entrypoint (`dist/server.js`).

```toml
[mcp_servers.hookify]
command = ["node", "/path/to/your/project/codex-hookify-mcp/dist/server.js"]
startup_timeout_ms = 20000
```

`codex-cli` will now automatically start the Hookify MCP server when it launches.

### Rule Directory

By default, the server loads rules from `~/.codex/hookify`. You can override this by setting the `HOOKIFY_RULE_DIR` environment variable.

Rules are `.md` files with YAML frontmatter. See the `hookify-plugin/hookify/examples` directory for examples.

## MCP Tools

The server exposes the following tools for use by `codex-cli`:

### Evaluation

-   **`hookify_evaluate_shell`**: Evaluates a shell command against the loaded rules.
    -   **Input**: `{ "command": "shell command to evaluate" }`
    -   **Output**: A JSON string with `{ "decision": "allow" | "warn" | "block", "messages": string[], "matched_rules": string[] }`

### Rule Management

-   **`hookify_list_rules`**: Lists all currently loaded rules.
-   **`hookify_set_rule_enabled`**: Enables or disables a specific rule.
    -   **Input**: `{ "name": "rule-name", "enabled": true | false }`
-   **`hookify_create_rule`**: Creates a new rule file from structured arguments.

### Health

-   **`hookify_health`**: Returns status and configuration information about the server.

---

## Generic MCP Starter Information

The following sections contain the original information from the MCP Server Starter template.

<a href="https://glama.ai/mcp/servers/@instructa/mcp-starter">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@instructa/mcp-starter/badge" alt="Starter MCP server" />
</a>

### Todo (Original)

- [ ] Add option to publish your own packages
- [ ] Better CLI support for scaffolding
- [ ] Prompts to build tools on the fly

### Supported Transport Options

Model Context Protocol Supports multiple Transport methods.

#### stdio

![mcp starter](/public/stdio-mcp-starter.jpg)

Recommend for local setups

##### Code Editor Support

Add the code snippets below

* Cursor: `.cursor/mcp.json`

**Local development/testing**

Use this if you want to test your mcp server locally

```json
{
  "mcpServers": {
    "codex-hookify-mcp-stdio": {
      "command": "node",
      "args": ["./dist/server.js", "--stdio"]
    }
  }
}
```

**Published Package**

Use this when you have published your package in the npm registry

```json
{
  "mcpServers": {
    "codex-hookify-mcp-stdio": {
      "command": "npx",
      "args": ["codex-hookify-mcp", "--stdio"]
    }
  }
}
```

#### Streamable HTTP

![mcp starter](/public/mcp-sse-starter.jpg)

>Important: Streamable HTTP is not supported in Cursor yet

Recommend for remote server usage

**Important:** In contrast to stdio you need also to run the server with the correct flag

**Local development**
Use the `streamable http` transport

1. Start the MCP Server
  Run this in your terminal
  ```bash
  node ./dist/server.js --http --port 4200
  ```

  Or with mcp inspector
  ```
  npm run dev-http
  # npm run dev-sse (deprecated)
  ```

  2. Add this to your config
  ```json
  {
    "mcpServers": {
      "codex-hookify-mcp-http": {
        "command": "node",
        "args": ["./dist/server.js", "--http", "--port", "4001"]
        // "args": ["./bin/cli.mjs", "--sse", "--port", "4002"] (or deprecated sse usage)
      }
    }
  }
  ```

**Published Package**

Use this when you have published your package in the npm registry

Run this in your terminal
```bash
npx codex-hookify-mcp --http --port 4200
# npx codex-hookify-mcp --sse --port 4201 (deprecated)
```

```json
{
  "mcpServers": {
    "codex-hookify-mcp-http": {
      "url": "http://localhost:4200/mcp"
      // "url": "http://localhost:4201/sse"
    }
  }
}
```

### Use the Inspector

Use the `inspect` command to debug your mcp server

![mcp starter](/public/inspect.jpg)
![mcp starter](/public/streamable2.jpg)

### Command-Line Options

#### Protocol Selection

| Protocol | Description            | Flags                                                | Notes           |
| :------- | :--------------------- | :--------------------------------------------------- | :-------------- |
| `stdio`  | Standard I/O           | (None)                                               | Default         |
| `http`   | HTTP REST              | `--port <num>` (def: 3000), `--endpoint <path>` (def: `/mcp`) |                 |
| `sse`    | Server-Sent Events     | `--port <num>` (def: 3000)                            | Deprecated      |

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## Courses
- Learn to build software with AI: [instructa.ai](https://www.instructa.ai)