# mcp-audit design plan

Deliberately different from permfuzz and judge-audit, so the portfolio does not
read as one template recoloured.

## Calibration

**Utilitarian, in a review register.** This is a pre-install inspection, the kind
of screen someone reads once and then makes a decision from.

## Composition (how it differs)

| Project | Composition | Primary interaction | Dominant content |
|---|---|---|---|
| permfuzz | input rail beside a single results column | paste, then read a findings list | finding cards |
| judge-audit | input rail beside a verdict and test cards | load, compare samples | verdict and per-test cards |
| **mcp-audit** | **verdict banner across the top, then a two column body: a tool roster table on the left and finding detail on the right** | **scan the roster, then read one tool in depth** | **the tool inventory table** |

The distinction that matters: mcp-audit is organised around **the tools as
objects**, not around the findings as a list. A reviewer wants to see every tool
and its own score, then drill into the ones that matter. So the roster is the
primary surface and findings hang off it.

The accent is spent differently too: here it marks **the selected tool row**,
where permfuzz spends it on links and judge-audit on the reliability meter.

## Type

Shared superfamily with the other tools (IBM Plex Sans plus Plex Mono), because
the studio identity is shared and only the composition is not. This is the
deliberate boundary: one design language, twenty different pages.

## Structure claims

The trust score is a saturating composite. Tool scores are per tool. Severity
chips are consistent across the whole portfolio: a critical is a critical in
every project, which is what makes the vocabulary readable across the set.
