export type Severity = "critical" | "high" | "medium" | "pass";

export type FindingKind =
  | "tool-poisoning"
  | "hidden-instruction"
  | "scope-creep"
  | "shadowing"
  | "exfiltration"
  | "credential-exposure"
  | "capability-mismatch"
  | "oversharing"
  | "unbounded";

export interface McpTool {
  name: string;
  description: string;
  /** JSON Schema for the tool input, when the server declares one. */
  inputSchema?: Record<string, unknown>;
  /** Free form annotations a server may attach. */
  annotations?: Record<string, unknown>;
}

export interface McpServer {
  name: string;
  version?: string;
  description?: string;
  tools: McpTool[];
  /** Declared permissions or scopes, if the server lists them. */
  scopes?: string[];
  /** Environment variables or secrets the server reads. */
  env?: string[];
  /** Whether the server declares a transport that can reach the network. */
  network?: boolean;
  /** Raw source when the input was a package manifest rather than a tool list. */
  raw?: Record<string, unknown>;
}

export interface Finding {
  id: string;
  kind: FindingKind;
  severity: Severity;
  title: string;
  tool: string;
  evidence: string;
  why: string;
  repair: string;
}

export interface ToolScore {
  name: string;
  /** 0 to 100, higher is safer. */
  score: number;
  severity: Severity;
  findings: number;
  descriptionLength: number;
  hasSchema: boolean;
}

export interface Report {
  server: string;
  version: string;
  toolCount: number;
  findings: Finding[];
  counts: Record<Severity, number>;
  trustScore: number;
  grade: string;
  verdict: Severity;
  summary: string;
  tools: ToolScore[];
  /** Categories present in the description text, for the surface view. */
  surfaces: { kind: FindingKind; tools: string[]; severity: Severity }[];
}
