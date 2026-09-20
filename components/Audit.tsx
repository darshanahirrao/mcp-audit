"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeServer } from "@/lib/analyze";
import { ServerError } from "@/lib/parse";
import { DEFAULT_SAMPLE, SAMPLES } from "@/lib/samples";
import type { Report, Severity } from "@/lib/types";
import { SeverityChip } from "./SeverityChip";

interface Failure {
  message: string;
  hint: string;
}

function openTool(report: Report): string | null {
  const worst = report.tools.find((tool) => tool.severity === "critical") ??
    report.tools.find((tool) => tool.severity === "high");
  return worst ? worst.name : (report.tools[0]?.name ?? null);
}

function barClass(score: number): string {
  if (score >= 85) return "roster-fill";
  if (score >= 65) return "roster-fill roster-fill-warn";
  return "roster-fill roster-fill-risk";
}

function severityWord(severity: Severity): string {
  return severity === "pass" ? "clear" : severity;
}

function buildSummary(report: Report): string {
  const lines: string[] = [];
  lines.push(`# mcp-audit report: ${report.server}`);
  lines.push("");
  lines.push(`Trust score ${report.trustScore}/100. ${report.grade}.`);
  lines.push(report.summary);
  lines.push("");
  lines.push(`${report.toolCount} tools audited.`);
  lines.push("");
  lines.push("## Tools");
  lines.push("");
  for (const tool of report.tools) {
    lines.push(`- ${tool.name}: ${tool.score}/100, ${tool.findings} finding(s), ${severityWord(tool.severity)}`);
  }
  lines.push("");
  lines.push("## Findings");
  lines.push("");
  report.findings.forEach((finding, index) => {
    lines.push(`### ${index + 1}. [${finding.severity.toUpperCase()}] ${finding.title}`);
    lines.push("");
    lines.push(`Tool: ${finding.tool}`);
    lines.push("");
    lines.push(`Evidence: ${finding.evidence}`);
    lines.push("");
    lines.push(finding.why);
    lines.push("");
    lines.push(`Repair: ${finding.repair}`);
    lines.push("");
  });
  return lines.join("\n");
}

export function Audit() {
  const [text, setText] = useState(DEFAULT_SAMPLE.data);
  const [report, setReport] = useState<Report | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeSample, setActiveSample] = useState<string | null>(DEFAULT_SAMPLE.id);
  const analyzedText = useRef<string | null>(null);

  const run = useCallback(async (input: string) => {
    setBusy(true);
    setFailure(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const next = analyzeServer(input);
      setReport(next);
      setSelected(openTool(next));
      analyzedText.current = input;
    } catch (error) {
      if (error instanceof ServerError) {
        setFailure({ message: error.message, hint: error.hint });
      } else {
        setFailure({
          message: "The audit failed unexpectedly.",
          hint: "Reload the page and try again. If it repeats, please report the manifest shape.",
        });
      }
      setReport(null);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run(DEFAULT_SAMPLE.data);
  }, [run]);

  const dirty = report !== null && analyzedText.current !== null && text !== analyzedText.current;
  const summary = useMemo(() => (report ? buildSummary(report) : ""), [report]);
  const note = activeSample ? SAMPLES.find((entry) => entry.id === activeSample)?.note : undefined;

  const selectedFindings = useMemo(
    () => (report && selected ? report.findings.filter((finding) => finding.tool === selected) : []),
    [report, selected],
  );
  const selectedToolsurfaces = useMemo(() => {
    if (!report || !selected) return [];
    return report.surfaces.filter((surface) => surface.tools.includes(selected));
  }, [report, selected]);

  async function copySummary() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function loadSample(id: string) {
    const chosen = SAMPLES.find((entry) => entry.id === id);
    if (!chosen) return;
    setActiveSample(chosen.id);
    setText(chosen.data);
    void run(chosen.data);
  }

  return (
    <>
      {report ? (
        <section className="banner" aria-labelledby="banner-heading">
          <div className="wrap banner-inner">
            <div className="banner-lead">
              <span className="banner-label" id="banner-heading">
                Server verdict
              </span>
              <span className="banner-word">
                <strong>{report.grade}</strong>
                <SeverityChip severity={report.verdict} />
              </span>
              <span className="banner-subject">
                {report.server} &#183; v{report.version} &#183; {report.toolCount} tool
                {report.toolCount === 1 ? "" : "s"}
              </span>
              <p className="banner-summary">{report.summary}</p>
            </div>
            <div className="banner-score">
              <span className="banner-score-value">
                <b>{report.trustScore}</b>
                <span>trust score out of 100</span>
              </span>
              <div className="meter">
                <div
                  className="meter-track"
                  role="meter"
                  aria-valuenow={report.trustScore}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Server trust score"
                >
                  <div
                    className={`meter-fill ${
                      report.trustScore >= 85
                        ? "meter-fill-ok"
                        : report.trustScore >= 65
                          ? "meter-fill-warn"
                          : "meter-fill-risk"
                    }`}
                    style={{ width: `${Math.max(report.trustScore, 2)}%` }}
                  />
                </div>
                <div className="meter-legend">
                  <span>0, do not connect</span>
                  <span>100, safe</span>
                </div>
              </div>
              <div className="actions" style={{ marginTop: "var(--space-1)" }}>
                <button type="button" className="btn" onClick={() => void copySummary()}>
                  {copied ? "Copied" : "Copy as Markdown"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <main className="wrap">
        <section className="intro">
          <h1>Audit an MCP server before you connect it.</h1>
          <p>
            An MCP server is a set of instructions your agent will follow. Descriptions that address the
            model, tools whose name hides a write, credentials reachable from an outbound call, and one
            tool doing everything are all decisions made inside the server before your agent ever runs.
          </p>
          <p>Eight checks over the manifest, scored per tool. Nothing is executed and nothing is uploaded.</p>
          <div className="intro-meta">
            <span>Tool poisoning</span>
            <span>Credential exposure</span>
            <span>Exfiltration surface</span>
            <span>Per tool score</span>
          </div>
        </section>

        {failure && !report ? (
          <div className="empty" style={{ marginBottom: "var(--space-6)" }}>
            <p className="empty-title">That manifest could not be read</p>
            <p className="empty-body">
              {failure.message} {failure.hint}
            </p>
          </div>
        ) : null}

        {dirty && report ? (
          <div className="notice notice-info" style={{ marginBottom: "var(--space-4)" }}>
            <div className="notice-body">
              <strong>Manifest edited since this result</strong>
              <span>Run the audit again to refresh these figures.</span>
            </div>
          </div>
        ) : null}

        <div className="body">
          <div className="col">
            {report ? (
              <section className="panel" aria-labelledby="roster-heading">
                <div className="panel-head">
                  <h2 id="roster-heading" className="label">
                    Tool roster
                  </h2>
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    Select a tool to inspect it
                  </span>
                </div>
                <div className="scroll-x">
                  <table className="roster">
                    <caption className="visually-hidden">
                      Every tool in this server with its own safety score
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Tool</th>
                        <th scope="col">Score</th>
                        <th scope="col">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.tools.map((tool) => (
                        <tr
                          key={tool.name}
                          className="roster-row"
                          aria-selected={selected === tool.name}
                          onClick={() => setSelected(tool.name)}
                        >
                          <td className="roster-name">
                            <button
                              type="button"
                              className="btn-quiet"
                              style={{
                                border: 0,
                                background: "none",
                                padding: 0,
                                font: "inherit",
                                color: "inherit",
                                cursor: "pointer",
                                minHeight: 0,
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelected(tool.name);
                              }}
                            >
                              {tool.name}
                            </button>
                          </td>
                          <td>
                            <span className="roster-bar">
                              <span className="roster-track">
                                <span className={barClass(tool.score)} style={{ width: `${Math.max(tool.score, 2)}%` }} />
                              </span>
                              <span className="roster-score">{tool.score}</span>
                            </span>
                          </td>
                          <td>
                            <SeverityChip severity={tool.severity} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section className="panel input-panel" aria-labelledby="input-heading">
              <h2 id="input-heading">Server manifest</h2>
              <div className="samples" role="group" aria-label="Load a sample">
                {SAMPLES.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    className="sample-chip"
                    aria-pressed={activeSample === sample.id}
                    onClick={() => loadSample(sample.id)}
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
              {note ? <p className="sample-note">{note}</p> : null}
              <label className="visually-hidden" htmlFor="manifest">
                Server manifest
              </label>
              <textarea
                id="manifest"
                className="manifest-input"
                spellCheck={false}
                aria-describedby="manifest-hint"
                aria-invalid={failure ? true : undefined}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setActiveSample(null);
                }}
              />
              <p className="field-hint" id="manifest-hint">
                A tools array, a server manifest, or a tools/list response. Scopes, env and annotations
                are read when present.
              </p>
              {failure ? (
                <p className="field-error" role="alert">
                  <strong>{failure.message}</strong> {failure.hint}
                </p>
              ) : null}
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void run(text)}
                  disabled={busy}
                  aria-busy={busy}
                >
                  {busy ? "Auditing" : dirty ? "Re-run audit" : "Audit server"}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => {
                    setText("");
                    setReport(null);
                    setFailure(null);
                    setSelected(null);
                    setActiveSample(null);
                    analyzedText.current = null;
                  }}
                >
                  Clear
                </button>
              </div>
              <p className="privacy-note">
                <span aria-hidden="true" className="mono">
                  &#9632;
                </span>
                Runs in this browser tab. The manifest is never uploaded and never executed.
              </p>
            </section>
          </div>

          <div className="col">
            {report ? (
              <section className="panel detail" aria-labelledby="detail-heading">
                {selected ? (
                  <>
                    <div className="detail-head">
                      <h3 id="detail-heading">{selected}</h3>
                      <SeverityChip
                        severity={report.tools.find((tool) => tool.name === selected)?.severity ?? "pass"}
                      />
                    </div>

                    {selectedToolsurfaces.length > 0 ? (
                      <div>
                        <span className="label">Risk surfaces</span>
                        <div className="surface-list">
                          {selectedToolsurfaces.map((surface) => (
                            <div className="surface" key={surface.kind}>
                              <span className="surface-name">{surface.kind}</span>
                              <SeverityChip severity={surface.severity} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {selectedFindings.length === 0 ? (
                      <div className="detail-empty">
                        <strong>No findings on this tool</strong>
                        <span>
                          Nothing in its name, description or schema matched a known risk pattern. The
                          audit reads what the server declares, so this is not a guarantee about runtime
                          behaviour.
                        </span>
                      </div>
                    ) : (
                      selectedFindings.map((finding) => (
                        <article className={`finding finding-${finding.severity}`} key={finding.id}>
                          <div className="finding-head">
                            <SeverityChip severity={finding.severity} />
                            <h4>{finding.title}</h4>
                          </div>
                          <div className="finding-block">
                            <span className="label">Evidence</span>
                            <span className="finding-evidence">{finding.evidence}</span>
                          </div>
                          <div className="finding-block">
                            <span className="label">Why it matters</span>
                            <p>{finding.why}</p>
                          </div>
                          <div className="finding-block">
                            <span className="label">Repair</span>
                            <p>{finding.repair}</p>
                          </div>
                        </article>
                      ))
                    )}
                  </>
                ) : (
                  <div className="detail-empty">
                    <strong>No tool selected</strong>
                    <span>Pick a tool from the roster to read its findings and evidence.</span>
                  </div>
                )}
              </section>
            ) : null}

            <section className="panel method" aria-labelledby="method-heading">
              <div className="method-col">
                <h3 id="method-heading">How the audit works</h3>
                <ol>
                  <li>Every tool is read for name, description, schema and annotations.</li>
                  <li>Eight rules run over that text, including cross tool checks.</li>
                  <li>Each finding names the tool and quotes the evidence.</li>
                  <li>The server score is a saturating composite of what was found.</li>
                </ol>
              </div>
              <div className="method-col">
                <h3>What it does not do</h3>
                <ul>
                  <li>It reads declarations, not runtime behaviour.</li>
                  <li>It does not execute the server or call any tool.</li>
                  <li>A clear score is not proof of safety.</li>
                  <li>It cannot see code behind a published manifest.</li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
