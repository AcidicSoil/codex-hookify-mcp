# Missing Features Analysis: Codex Hookify MCP Server

This document outlines the key features and functionalities from the original Python-based `hookify` plugin that are currently missing from the new TypeScript MCP server implementation.

### 1. Missing Event Support

The most significant gap is that the MCP server currently only handles the `bash` event type. The original plugin supported a wider range of events, which are crucial for comprehensive safety and behavior management.

*   **`event: file`**: The server does not evaluate rules for file modification tools (like `Edit`, `Write`, `MultiEdit`). This means rules to prevent writing to sensitive files (e.g., `.env`), or to warn about adding `console.log` statements, will not work.
*   **`event: stop`**: The server cannot intercept the agent's decision to stop working. This was used in the original plugin to enforce completion checks, such as verifying that tests were run before finishing a task.
*   **`event: prompt`**: The server does not evaluate the user's initial prompt. This feature could be used to provide contextual reminders or enforce prompt-level guidelines.

### 2. Incomplete Rule Condition Logic

The rule evaluation engine is missing some of the operators available in the original plugin, limiting the complexity of rules that can be created.

*   **Missing Operators**: The `conditionMatcher.ts` does not implement the `starts_with` and `ends_with` operators.
*   **Missing Fields**: Since `file` and `stop` events are not handled, their corresponding fields are also not supported. This includes:
    *   For `file` events: `file_path`, `new_text`, `old_text`.
    *   For `stop` events: `transcript` (which was used to check if test commands had been run).

### 3. No AI-Powered Rule Creation

A major feature of the original plugin was its ability to simplify rule creation using natural language. This is completely absent from the current MCP server.

*   **/hookify from Natural Language**: The original allowed users to type `/hookify Warn me when I use rm -rf` and the AI would generate the rule file. The current implementation only provides a structured `hookify_create_rule` tool, which requires the agent to know the exact schema.
*   **Conversation Analysis**: The original plugin could run `/hookify` with no arguments to trigger a `conversation-analyzer` agent that would proactively suggest rules based on the user's frustrations or corrections during the session. This advanced, AI-driven feature is missing.

### 4. Lack of User-Facing Helper Commands

The original plugin provided several user-friendly commands that are not present in the MCP toolset.

*   **Interactive Configuration (`/hookify:configure`)**: There is no interactive tool for enabling or disabling rules. The current `hookify_set_rule_enabled` tool requires a specific rule name and is not as user-friendly.
*   **Help Command (`/hookify:help`)**: There is no equivalent tool to provide documentation and usage examples to the user.

In summary, while the new MCP server successfully implements the foundational logic for evaluating `bash` commands, it is missing the majority of the advanced event handling, the AI-powered "smart" features, and the user-friendly interactive commands that made the original `hookify` plugin powerful and easy to use.
