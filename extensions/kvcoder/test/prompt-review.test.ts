import { describe, expect, it } from 'vitest';
import { artifactDescription } from '../src/connectors/artifact.ts';
import { workingMethod } from '../src/prompt/working-method.ts';

// ADR 0087, 5 and 8: the artifact connector's entry points to edit, and a brief quotes what the lead holds.

describe('the prompt after the cost review (ADR 0087, 5 and 8)', () => {
  it("QA55-H8 the artifact entry asks for edit, and the lead's Delegate rule asks for quoted lines", () => {
    expect(artifactDescription).toContain('To change part of an existing artifact, use edit; write it again only when most of it changes.');
    // ADR 0108, 2: the brief's context names line ranges, whose text kvcoder attaches.
    expect(workingMethod('lead')).toContain('context the line ranges the worker needs, whose text kvcoder attaches, so it reads nothing again that you hold.');
    expect(workingMethod('lead')).not.toContain('the lines that matter');
  });
});
