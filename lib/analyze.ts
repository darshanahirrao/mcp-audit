import { parseServer } from "./parse";
import type { Finding, FindingKind, McpTool, Report, Severity, ToolScore } from "./types";

const WEIGHT: Record<Severity, number> = { critical: 34, high: 14, medium: 5, pass: 0 };
const ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, pass: 3 };

/** Text a description uses to address the model rather than describe the tool. */
const INSTRUCTION_PATTERNS: { pattern: RegExp; note: string }[] = [
  {
    // Checked first so the more specific override pattern is the one reported.
    pattern: /(ignore|disregard|forget)\s+(the\s+)?(previous|prior|above|earlier|all|any)\b/i,
    note: "asks the model to ignore prior instructions",
  },
  {
    pattern: /(do not|don't|never)\s+(tell|mention|reveal|inform|disclose|report)\b/i,
    note: "asks the model to hide something",
  },
  {
    pattern: /\b(secretly|without telling|without informing|silently|do not inform the user)\b/i,
    note: "asks for silent behaviour",
  },
  { pattern: /\byou (must|should|need to|have to|are required to)\b/i, note: "addresses the model directly" },
  {
    pattern: /\b(always|automatically) (include|send|attach|forward|append|copy)\b/i,
    note: "makes an extra action automatic",
  },
  { pattern: /<\s*(instructions?|system|im_start|important)\s*>/i, note: "embeds fake instruction tags" },
  {
    pattern: /\b(system prompt|hidden instruction|internal note)\b/i,
    note: "references the prompt rather than the tool",
  },
];

const CAPS: { id: string; pattern: RegExp }[] = [
  { id: "read", pattern: /\b(read|list|get|fetch|search|query|find|lookup|load|open|inspect|scan)\b/i },
  {
    id: "write",
    pattern: /\b(write|create|update|insert|delete|remove|modify|patch|set|put|append|upload|move|rename|send|post|publish|execute)\b/i,
  },
  { id: "network", pattern: /\b(http|url|webhook|request|fetch|download|browse|api|endpoint|remote|external)\b/i },
  { id: "exec", pattern: /\b(shell|bash|command|exec|run|spawn|subprocess|script|terminal|eval)\b/i },
  {
    id: "credential",
    pattern: /\b(token|api[_ ]?key|secret|password|credential|auth|bearer|private[_ ]?key|env)\b/i,
  },
  { id: "spend", pattern: /\b(pay|payment|purchase|charge|refund|transfer|wallet|billing|spend)\b/i },
];

/**
 * Exfiltration needs content being moved somewhere. The signal is an outbound
 * verb joined to a destination, which is what makes a tool able to send what
 * it can read to a place the operator did not choose.
 */
const EXFIL: RegExp[] = [
  /\b(send|sends|post|posts|upload|uploads|forward|forwards|transmit|transmits|publish|publishes|share|shares)\b[^.]{0,80}\b(url|endpoint|webhook|external|remote|third[ -]?party|destination|server)\b/i,
  /\b(url|endpoint|webhook|destination)\b[^.]{0,80}\b(send|post|upload|forward|transmit|publish)\b/i,
  /\b(content|data|file|record|output|document|message|note|transcript)\b[^.]{0,40}\b(to|at)\b[^.]{0,20}\b(url|endpoint|webhook|destination|external)\b/i,
];

/**
 * Credential exposure needs a credential and an outbound verb close together.
 * A tool that merely says "sends a request" or mentions a token in passing is
 * not disclosing anything, so the two must be genuinely linked.
 */
const CRED_WORDS = /\b(api[_ ]?key|access[_ ]?token|secret[_ ]?key|password|credential|private[_ ]?key|bearer token|session cookie|customer token)\b/i;
const OUTBOUND_VERBS = /\b(send|sends|post|posts|upload|uploads|forward|forwards|transmit|transmits|exfiltrate|disclose|share)\b/i;
const OUTBOUND_TARGET = /\b(url|endpoint|webhook|external|third[ -]?party|remote|destination|request)\b/i;

const READ_VERBS = /^(get|list|read|fetch|search|query|find|inspect|view|show|describe|lookup|scan|check|status|info)$/i;
const DESTRUCTIVE = /^(delete|remove|drop|destroy|purge|reset|wipe|overwrite|revoke|disable|terminate|kill)$/i;

function textOf(tool: McpTool): string {
  return `${tool.name} ${tool.description}`.trim();
}

function leadingVerb(name: string): string {
  const match = name.match(/^([a-z]+)/i);
  return match ? match[1]!.toLowerCase() : "";
}

function schemaPropertyNames(tool: McpTool): string[] {
  const properties = tool.inputSchema?.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    return Object.keys(properties as Record<string, unknown>);
  }
  return [];
}

function hasBroadString(tool: McpTool): boolean {
  if (!tool.inputSchema) return false;
  const serialized = JSON.stringify(tool.inputSchema).toLowerCase();
  const broad =
    /"type"\s*:\s*"string"/.test(serialized) &&
    !/"enum"/.test(serialized) &&
    !/"pattern"/.test(serialized);
  if (!broad) return false;
  // Only the argument names that carry executable or fetchable payloads matter.
  // A plain "path" or "query" string is an ordinary parameter, not a channel.
  const properties = schemaPropertyNames(tool).map((name) => name.toLowerCase());
  const risky = properties.some((name) =>
    /^(content|body|text|command|cmd|script|code|prompt|template|html|sql|url|uri|endpoint|webhook)$/.test(name),
  );
  return risky;
}

function severityOf(findings: Finding[]): Severity {
  if (findings.some((finding) => finding.severity === "critical")) return "critical";
  if (findings.some((finding) => finding.severity === "high")) return "high";
  if (findings.some((finding) => finding.severity === "medium")) return "medium";
  return "pass";
}

export function analyzeServer(input: string): Report {
  const server = parseServer(input);
  const findings: Finding[] = [];

  const nameCounts = new Map<string, number>();
  for (const tool of server.tools) {
    const key = tool.name.toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  for (const tool of server.tools) {
    const body = textOf(tool);
    const instructionHits = INSTRUCTION_PATTERNS.filter((entry) => entry.pattern.test(body));

    if (instructionHits.length > 0) {
      findings.push({
        id: `F-POISON-${tool.name}`,
        kind: "tool-poisoning",
        severity: instructionHits.length >= 2 ? "critical" : "high",
        title: "Description contains instructions to the model",
        tool: tool.name,
        evidence: instructionHits.map((entry) => entry.note).join("; "),
        why: "A description is documentation to a human and an instruction to a model. Text that tells the model what to do, or what not to reveal, selects behaviour the operator never authored and cannot see while reading the tool list.",
        repair:
          "Treat the description as untrusted input. Diff it against upstream, strip imperative language, and move anything genuinely needed into the system prompt where it can be reviewed.",
      });
    }

    const silentAndHidden = /\b(silently|quietly|without (telling|informing|notifying)|do not (tell|notify|log)|no log)\b/i.test(body);
    if (silentAndHidden && instructionHits.length === 0) {
      findings.push({
        id: `F-SILENT-${tool.name}`,
        kind: "hidden-instruction",
        severity: "high",
        title: "Tool asks to act without reporting",
        tool: tool.name,
        evidence: "description mentions acting silently or suppressing disclosure",
        why: "A tool that asks not to be logged removes the only record of what it did. Silent behaviour is indistinguishable from correct behaviour until something goes wrong.",
        repair:
          "Drop the instruction and log the call like any other. If suppressing output is genuinely required, declare it in the manifest rather than in prose the model reads.",
      });
    }

    const verb = leadingVerb(tool.name);
    const claimsRead = READ_VERBS.test(verb) || /\b(read[- ]only|does not (modify|change|write))\b/i.test(body);
    // Only count a write when the description names a genuine mutation, not a
    // read verb that happens to match the broad write pattern.
    const mutates = /\b(delete|deletes|deleted|remove|removes|update|updates|modify|modifies|overwrite|create|creates|insert|write|writes|post|posts|send|sends|upload|uploads|execute|executes)\b/i.test(
      tool.description,
    );
    const forwards = OUTBOUND_VERBS.test(tool.description);
    if (claimsRead && mutates) {
      findings.push({
        id: `F-MISMATCH-${tool.name}`,
        kind: "capability-mismatch",
        severity: "high",
        title: "Name reads as a read, description performs a write",
        tool: tool.name,
        evidence: `name begins with "${verb}" while the description performs a write or a send`,
        why: "An agent selects tools by name and description. A read sounding name that writes is how an unintended change resembles a safe lookup at the moment of decision.",
        repair:
          "Rename the tool to its real effect, or split the read and the write into two tools so the agent has to choose the write deliberately.",
      });
    } else if (claimsRead && forwards) {
      findings.push({
        id: `F-MISMATCH-${tool.name}`,
        kind: "capability-mismatch",
        severity: "medium",
        title: "Name reads as a read, description sends data",
        tool: tool.name,
        evidence: `name begins with "${verb}" while the description performs an outbound send`,
        why: "The name is what the agent chooses on. A read sounding name with an outbound send hides the fact that calling it produces external traffic.",
        repair: "Rename the tool so its outbound effect is visible in the name.",
      });
    }

    const capabilityCount = CAPS.filter((cap) => cap.pattern.test(body)).length;
    // A description that lists what it does not do, or mentions one extra
    // capability in passing, is normal. Catch the tool that genuinely spans
    // read, write, network and execution together.
    const spansIndependentWork =
      CAPS.some((cap) => cap.id === "write" && cap.pattern.test(body)) &&
      CAPS.some((cap) => cap.id === "exec" && cap.pattern.test(body));
    const spansCredentialAndNetwork =
      CAPS.some((cap) => cap.id === "credential" && cap.pattern.test(body)) &&
      CAPS.some((cap) => cap.id === "network" && cap.pattern.test(body));
    if (capabilityCount >= 5 || spansIndependentWork || spansCredentialAndNetwork) {
      findings.push({
        id: `F-CREEP-${tool.name}`,
        kind: "scope-creep",
        severity: "medium",
        title: "One tool covers several unrelated capabilities",
        tool: tool.name,
        evidence: `${capabilityCount} capability categories in a single tool`,
        why: "A tool that reads, writes, calls the network and touches credentials cannot be granted partially. Reviewing it means approving all of it, so least privilege becomes impossible at the tool boundary.",
        repair: "Split it by capability so each grant can be reviewed and revoked on its own.",
      });
    }

    if (EXFIL.some((pattern) => pattern.test(body))) {
      findings.push({
        id: `F-EXFIL-${tool.name}`,
        kind: "exfiltration",
        severity: "high",
        title: "Tool can send content to a destination it chooses",
        tool: tool.name,
        evidence: "description combines content with an outbound destination",
        why: "A tool that takes both content and a destination can send anything the agent can read to anywhere the network allows. That is the final leg of an exfiltration path.",
        repair:
          "Pin the destination inside the server rather than accepting it as an argument, and require the agent to name a configured destination instead of a free URL.",
      });
    }

    if (disclosesCredential(body)) {
      findings.push({
        id: `F-CRED-${tool.name}`,
        kind: "credential-exposure",
        severity: "critical",
        title: "Tool handles credentials and can send them",
        tool: tool.name,
        evidence: "description mentions a credential together with an outbound action",
        why: "Credential disclosure is the one harm that is not recoverable afterwards. A tool that can read and transmit one turns a single injected instruction into a permanent compromise.",
        repair:
          "Keep credentials out of the tool. Issue short lived scoped tokens from outside the agent, pass the token rather than the secret, and never let one tool both read and send.",
      });
    }

    if ((nameCounts.get(tool.name.toLowerCase()) ?? 0) > 1) {
      findings.push({
        id: `F-SHADOW-${tool.name}`,
        kind: "shadowing",
        severity: "medium",
        title: "Duplicate tool name in this server",
        tool: tool.name,
        evidence: "the same name appears more than once",
        why: "A duplicate name makes behaviour order dependent and lets a later definition quietly replace the one an operator approved.",
        repair: "Give each tool a unique name, or namespace tools when two servers expose the same one.",
      });
    }

    if (hasBroadString(tool)) {
      findings.push({
        id: `F-BROAD-${tool.name}`,
        kind: "oversharing",
        severity: "medium",
        title: "Free form string argument with no constraint",
        tool: tool.name,
        evidence: `arguments: ${schemaPropertyNames(tool).slice(0, 6).join(", ") || "unnamed"}`,
        why: "An unconstrained string named like content, a command, a path or a URL is a direct injection channel. Whatever the agent puts there is executed or fetched verbatim.",
        repair:
          "Constrain the argument with an enum, a pattern or a length limit. Where a URL is required, validate the host against an allowlist before use.",
      });
    }

    const tail = tool.name.replace(/^.*[-_]/, "");
    if (DESTRUCTIVE.test(verb) || DESTRUCTIVE.test(tail)) {
      const annotations = tool.annotations ?? {};
      const declared = annotations.destructiveHint === true || annotations.destructive === true;
      if (!declared) {
        findings.push({
          id: `F-DESTRUCTIVE-${tool.name}`,
          kind: "unbounded",
          severity: "medium",
          title: "Destructive tool does not declare that it is destructive",
          tool: tool.name,
          evidence: `name begins with "${verb}" with no destructiveHint annotation`,
          why: "Clients decide whether to require confirmation from the annotation, not from the name. An undeclared destructive tool can be invoked without the operator ever seeing a prompt.",
          repair: "Set destructiveHint on the tool so the client can require approval before it runs.",
        });
      }
    }
  }

  const envSecrets = (server.env ?? []).filter((key) => /token|key|secret|password|credential|auth/i.test(key));
  // A server level finding needs a tool that can genuinely leave the machine:
  // an outbound verb with a destination anywhere in its description, or a tool
  // that reaches the network while the server holds secrets.
  const canSend = server.tools.some((tool) => {
    const body = textOf(tool);
    const outbound = OUTBOUND_VERBS.test(body);
    const destination = OUTBOUND_TARGET.test(body) || /\b(http|url|api|slack|webhook|endpoint)\b/i.test(body);
    return outbound && destination;
  });
  if (envSecrets.length > 0 && canSend) {
    findings.push({
      id: "F-ENV-EGRESS",
      kind: "credential-exposure",
      severity: "critical",
      title: "Server holds secrets and a tool can send data out",
      tool: "server",
      evidence: `environment: ${envSecrets.join(", ")}`,
      why: "Every secret in the server environment is reachable from every tool it runs. Combined with one outbound path, the whole credential set comes into scope for a single bad instruction.",
      repair:
        "Give each tool the narrowest credential it needs rather than the server holding them all, and keep outbound calls in a separate process that never reads the secret store.",
    });
  }

  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, pass: 0 };
  for (const finding of findings) counts[finding.severity] += 1;

  const sorted = [...findings].sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity] || a.tool.localeCompare(b.tool),
  );

  const raw =
    counts.critical * WEIGHT.critical + counts.high * WEIGHT.high + counts.medium * WEIGHT.medium;
  const trustScore = raw === 0 ? 100 : Math.round(100 * Math.exp(-raw / 60));

  const tools: ToolScore[] = server.tools.map((tool) => {
    const own = sorted.filter((finding) => finding.tool === tool.name);
    const toolRaw = own.reduce((sum, finding) => sum + WEIGHT[finding.severity], 0);
    return {
      name: tool.name,
      score: toolRaw === 0 ? 100 : Math.round(100 * Math.exp(-toolRaw / 40)),
      severity: severityOf(own),
      findings: own.length,
      descriptionLength: tool.description.length,
      hasSchema: Boolean(tool.inputSchema),
    };
  });

  const kinds: FindingKind[] = [
    "tool-poisoning",
    "credential-exposure",
    "exfiltration",
    "capability-mismatch",
    "scope-creep",
    "oversharing",
  ];
  const surfaces = kinds
    .map((kind) => {
      const matching = sorted.filter((finding) => finding.kind === kind);
      return { kind, tools: matching.map((finding) => finding.tool), severity: severityOf(matching) };
    })
    .filter((surface) => surface.tools.length > 0);

  const verdict: Severity =
    counts.critical > 0 ? "critical" : counts.high > 0 ? "high" : counts.medium > 0 ? "medium" : "pass";

  const grade =
    trustScore >= 92
      ? "Safe to connect"
      : trustScore >= 78
        ? "Review first"
        : trustScore >= 55
          ? "Risky"
          : "Do not connect as is";

  const summary =
    findings.length === 0
      ? "No known risk pattern matched this server. That is not a clean bill of health: the audit reads what the server declares, not what it does at runtime."
      : counts.critical > 0
        ? `${counts.critical} critical finding${counts.critical === 1 ? "" : "s"} in a server an agent will call. Resolve those before granting access.`
        : counts.high > 0
          ? `${counts.high} high finding${counts.high === 1 ? "" : "s"}. None is a guaranteed compromise, but each widens what a bad instruction can reach.`
          : "Review level findings only. Tighten the descriptions and schemas, then connect with attention.";

  return {
    server: server.name,
    version: server.version ?? "unspecified",
    toolCount: server.tools.length,
    findings: sorted,
    counts,
    trustScore,
    grade,
    verdict,
    summary,
    tools,
    surfaces,
  };
}

/**
 * A credential is disclosed only when the same description links a credential
 * to an outbound action and a destination. Any one of those alone is normal:
 * a tool may hold a token, or send a request, or mention a URL.
 */
function disclosesCredential(body: string): boolean {
  return CRED_WORDS.test(body) && OUTBOUND_VERBS.test(body) && OUTBOUND_TARGET.test(body);
}
