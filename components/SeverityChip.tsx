import type { Severity } from "@/lib/types";

const LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Review",
  pass: "Clear",
};

export function SeverityChip({ severity }: { severity: Severity }) {
  switch (severity) {
    case "critical":
      return (
        <span className="sev sev-critical">
          <span className="sev-glyph" aria-hidden="true" />
          Critical
        </span>
      );
    case "high":
      return (
        <span className="sev sev-high">
          <span className="sev-glyph" aria-hidden="true" />
          High
        </span>
      );
    case "medium":
      return (
        <span className="sev sev-medium">
          <span className="sev-glyph" aria-hidden="true" />
          Review
        </span>
      );
    default:
      return (
        <span className="sev sev-pass">
          <span className="sev-glyph" aria-hidden="true" />
          Clear
        </span>
      );
  }
}
