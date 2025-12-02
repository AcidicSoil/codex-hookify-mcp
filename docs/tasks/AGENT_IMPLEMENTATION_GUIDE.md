# Agent Implementation Guide: Achieving Full `hookify` Functionality

This document outlines the client-side agent logic required to fully replicate the original `hookify` plugin's "smart" features. The `codex-hookify-mcp` server provides the core rule evaluation engine and file management tools, but the AI-powered and interactive behaviors **must be implemented in the agent** that consumes the MCP server.

---

## **Must-Have Feature: AI-Powered Rule Creation**

To achieve parity with the original plugin, the client AI agent (e.g., Codex) **must** be responsible for interpreting natural language and user conversation to create rules. The MCP server intentionally does not handle this AI-heavy lifting.

### 1. Handling Natural Language Rule Creation

The agent must be programmed to recognize when a user is asking to create a rule from a natural language command.

**Workflow:**

1.  **Detect Trigger:** The agent identifies when a user prompt starts with a command like `/hookify`, followed by a description (e.g., `/hookify Warn me when I use rm -rf`).
2.  **Infer Rule Properties:** The agent's core reasoning must parse the user's text to determine the properties for a new rule:
    *   `event`: Infer from keywords (e.g., "command", "run" -> `bash`; "file", "edit" -> `file`).
    *   `pattern`: Generate a regex for the described behavior (e.g., "rm -rf" -> `rm\s+-rf`).
    *   `action`: Default to `warn`, but use `block` for clearly dangerous patterns.
    *   `name`: Create a descriptive name (e.g., `warn-dangerous-rm`).
    *   `message_markdown`: Write a helpful warning message for the user.
3.  **Call MCP Tool:** The agent must call the `hookify_create_rule` tool on the MCP server with the structured data it just inferred.

### 2. Implementing the Conversation Analyzer

The most advanced feature of the original plugin was its ability to proactively suggest rules by analyzing the conversation history. This **must be implemented as a specialized agent persona or skill** that the main agent can invoke.

**Workflow:**

1.  **Detect Trigger:** The main agent identifies when the user runs `/hookify` with no arguments.
2.  **Invoke Analyzer Persona:** The main agent should then adopt the `conversation-analyzer` persona as defined in `hookify-plugin/hookify/agents/conversation-analyzer.md`.
3.  **Analyze Transcript:** In this persona, the agent reads the recent conversation history, looking for signals of user frustration, corrections, or repeated mistakes.
4.  **Suggest Rules:** The agent produces a structured list of suggested rules based on its analysis.
5.  **User Confirmation:** The main agent presents these suggestions to the user for approval.
6.  **Call MCP Tool:** For each rule the user approves, the agent calls the `hookify_create_rule` tool on the MCP server to save the new rule.

---

## Summary of Responsibilities

*   **AI Agent (Client-Side) - MUST IMPLEMENT:**
    *   Natural Language Understanding to parse commands like `/hookify ...`.
    *   The `conversation-analyzer` logic to proactively suggest rules.
    *   The interactive logic for user confirmation (`/hookify:configure`).

*   **MCP Server (Server-Side) - ALREADY IMPLEMENTED:**
    *   Provides the simple, deterministic tools (`hookify_create_rule`, `hookify_list_rules`, `hookify_evaluate_*`) that the AI agent needs to execute its decisions.

By architecting the system this way, we keep the MCP server lean and focused on rule evaluation, while leveraging the power of the Large Language Model on the client side to create a smart, interactive user experience.
