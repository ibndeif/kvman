# ADR 0015 — Stage result shape

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.3
- **Decided by**: the product owner (confirmed after the implementer first stated it without asking)

## Question

`06` §6.2 lists what `kernel.extension.stage` returns ("requested and derived capabilities with reasons", "types summary", "contributions summary", "warnings", "translations") without their shapes.

## Decision

```ts
type StageResult = {
  name: string; version: string; title: Text; summary?: Text; description: string; namespace: string;
  source: string; digest: string; integrity?: string;          // absent for dev: and local: sources
  capabilities: { requested: Array<{ name: string; reason: Text; types?: string[] }>;
                  derived: { subscribes: string[]; providesLlm: string[] } };
  isolation: { mode: 'shared' | 'dedicated'; reason: Text } | null;
  types: Array<{ type: string; kind: 'command' | 'query' | 'event'; access?: Access; agentTool: boolean }>;
  contributions: Array<{ id: string; kind: string; slot?: string; target?: string }>;
  warnings: Issue[];                                             // severity 'warning', e.g. code 'NATIVE_CODE'
  translations: Record<string /* locale */, { title?: string; summary?: string; reasons: Record<string, string> }>;
  confirmationToken: string; expiresAt: number;
};
```

## Consequences

`06` §6.2 shows this shape.
