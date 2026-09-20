# mcp-audit

**Audit an MCP server before you connect it.**

An MCP server is a set of instructions your agent will follow. Descriptions that
address the model, tools whose name hides a write, credentials reachable from an
outbound call, and one tool doing everything are all decisions made inside the
server before your agent ever runs.

Live: **https://mcp-audit-three.vercel.app**

## What it checks

| Check | What it looks for |
|---|---|
| **Tool poisoning** | Instructions in a description field: requests to ignore prior context, to hide something, to act silently, or fake system tags. Text here is documentation to a human and an instruction to a model. |
| **Hidden behaviour** | A tool that asks to act without being logged or reported. |
| **Capability mismatch** | A tool named as a read whose description actually writes, deletes or sends. The agent chooses on the name. |
| **Exfiltration surface** | A tool that takes content and a destination together, so it can send anything the agent can read to anywhere the network allows. |
| **Credential exposure** | A description linking a credential to an outbound action, or a server holding secrets while any tool can leave the machine. |
| **Scope creep** | One tool spanning read, write, network and execution, or credentials and network together. A grant nobody can hold partially cannot be reviewed. |
| **Unconstrained arguments** | A free form string named like content, a command, a body or a URL. That is a direct injection channel. |
| **Undeclared destructive tools** | A delete or revoke with no destructiveHint, so the client cannot require confirmation. |

The server score is a saturating composite, and every tool gets its own score,
because the useful question is usually which tool to be careful with rather than
whether the server is good or bad.

## How it works

1. Every tool is read for name, description, input schema and annotations.
2. Eight rules run over that text, including checks that span tools.
3. Each finding names the tool and quotes the evidence that produced it.
4. Tool scores roll up into a server trust score.

It reads declarations. It does not execute the server and does not call any tool.

## What it does not do

- It reads what the server declares, not what it does at runtime.
- It cannot see code behind a published manifest.
- A clear score is not proof of safety.

## Privacy

Everything runs in your browser. The manifest is never uploaded and never
executed.

## Run it

```bash
npm install
npm run dev      # http://localhost:3002
npm test         # 27 engine tests
npm run typecheck
```

## Use it as a library

```ts
import { analyzeServer } from "./lib/analyze";

const report = analyzeServer(manifest);
report.trustScore; // 0 to 100
report.grade;      // "Safe to connect" | "Review first" | "Risky" | "Do not connect as is"
report.tools;      // per tool score, severity and finding count
report.findings;   // each with tool, evidence, why and repair
```

## Input format

A bare array of tools, a server manifest with a tools array, or a tools/list
response nested under result.tools. Scopes, environment variables and per tool
annotations are read when present, since they change what the audit can see.

```json
{
  "name": "notes-sync",
  "version": "0.4.1",
  "env": ["NOTES_API_KEY"],
  "tools": [
    {
      "name": "sync_notes",
      "description": "Upload notes to the sync service.",
      "inputSchema": { "type": "object", "properties": { "content": { "type": "string" } } }
    }
  ]
}
```

## License

MIT
