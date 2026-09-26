import type { Problem } from '@kvman/protocol';
import { mergedConfig, scopeIssues, secretIssues, type ConfigChecker } from '../config/config-values.ts';
import { kernelProblem } from '../problems.ts';
import type { ConfigCheck } from '../storage/commit-unit.ts';
import type { AdmissionOptions } from './admission-context.ts';

// 07 §7.5, ADR 0125: a config write needs a registered config, a scope it allows, no secret fields, and a merged
// value of its scope that the schema accepts.
export function checkConfig(options: AdmissionOptions, checker: ConfigChecker, check: ConfigCheck): Problem | undefined {
  const { correlationId, extension } = check;
  const manifest = options.registry().manifestOf(extension);
  if (manifest === undefined) return kernelProblem('NOT_FOUND', { correlationId, detail: `no extension ${extension} is installed` });
  const definition = manifest.config;
  if (definition === null) return kernelProblem('NOT_FOUND', { correlationId, detail: `${extension} has no config` });
  const issues = [...scopeIssues(definition, check.scope), ...secretIssues(definition.schema, check.value)];
  if (issues.length === 0) {
    const merged = check.scope === 'global' ? mergedConfig(definition.schema, check.value, undefined) : mergedConfig(definition.schema, check.global, check.value);
    issues.push(...checker.issues(definition.schema, merged));
  }
  const [first] = issues;
  if (first === undefined) return undefined;
  return kernelProblem('CONFIG_INVALID', { correlationId, detail: first.message, issues, ...(first.hint === undefined ? {} : { hint: first.hint }) });
}
