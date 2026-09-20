import type { McpServer, McpTool } from "./types";

export const MAX_TOOLS = 300;

export class ServerError extends Error {
  constructor(message: string, readonly hint: string) {
    super(message);
    this.name = "ServerError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function nestedVersion(container: Record<string, unknown>): string {
  const server = isRecord(container.server) ? container.server : null;
  if (server) return asString(server.version);
  const result = isRecord(container.result) ? container.result : null;
  return result ? asString(result.version) : "";
}

function nestedName(container: Record<string, unknown>): string {
  const server = isRecord(container.server) ? container.server : null;
  if (server && asString(server.name)) return asString(server.name);
  const result = isRecord(container.result) ? container.result : null;
  if (result && asString(result.name)) return asString(result.name);
  return asString(container.serverName);
}

/**
 * Accepts what an MCP server actually hands you: a tools/list response, a
 * server manifest with a tools array, or a bare array of tools.
 */
export function parseServer(input: string): McpServer {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ServerError("Nothing to audit.", "Paste a server manifest, or load one of the samples.");
  }

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    throw new ServerError(
      "That is not valid JSON.",
      "Paste a tools/list response, a server manifest, or a package.json.",
    );
  }

  let container: Record<string, unknown> = {};
  let toolList: unknown[] | null = null;

  if (Array.isArray(data)) {
    toolList = data;
  } else if (isRecord(data)) {
    container = data;
    const result = isRecord(data.result) ? data.result : null;
    for (const candidate of [data.tools, result?.tools, data.functions]) {
      if (Array.isArray(candidate) && candidate.length > 0) {
        toolList = candidate;
        break;
      }
    }
  } else {
    throw new ServerError("Unsupported shape.", "Expected an object or an array of tools.");
  }

  if (!toolList || toolList.length === 0) {
    throw new ServerError(
      "No tools found in this manifest.",
      "Add a tools array, or paste a tools/list response that contains result.tools.",
    );
  }

  const tools: McpTool[] = [];
  for (const raw of toolList.slice(0, MAX_TOOLS)) {
    if (!isRecord(raw)) continue;
    const schema = isRecord(raw.inputSchema)
      ? raw.inputSchema
      : isRecord(raw.input_schema)
        ? raw.input_schema
        : undefined;
    const annotations = isRecord(raw.annotations) ? raw.annotations : undefined;
    tools.push({
      name: asString(raw.name, asString(raw.tool, "unnamed")),
      description: asString(raw.description),
      ...(schema ? { inputSchema: schema } : {}),
      ...(annotations ? { annotations } : {}),
    });
  }

  if (tools.length === 0) {
    throw new ServerError("No usable tool definitions.", "Each tool needs at least a name.");
  }

  const serverNode = isRecord(container.server) ? container.server : null;
  const scopes = [
    ...asStringArray(container.scopes),
    ...asStringArray(container.permissions),
    ...(serverNode ? asStringArray(serverNode.scopes) : []),
  ];
  const env = [
    ...asStringArray(container.env),
    ...asStringArray(container.environment),
    ...(serverNode ? asStringArray(serverNode.env) : []),
  ];

  const resolvedVersion = asString(container.version) || nestedVersion(container) || "unspecified";

  return {
    name: asString(container.name) || nestedName(container) || "unnamed server",
    version: resolvedVersion,
    description: asString(container.description),
    tools,
    ...(scopes.length > 0 ? { scopes } : {}),
    ...(env.length > 0 ? { env } : {}),
    ...(container.network === true ? { network: true } : {}),
    raw: container,
  };
}
