import { configSecretFields, type JsonObject } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { ConfigChecker, mergedConfig, PayloadValidators, redactedSecret, scopeIssues, secretIssues } from '../../src/index.ts';

const schema: JsonObject = {
  type: 'object',
  properties: {
    model: { type: 'string', default: 'small' },
    limit: { type: 'number', default: 10 },
    rules: { type: 'object', default: { a: 1 } },
    apiKey: { type: 'string', secret: true },
    auth: { type: 'object', properties: { token: { type: 'string', secret: true }, user: { type: 'string' } }, required: ['token'] },
  },
  required: ['apiKey'],
};

describe('config values (plan 07 §7.5, ADRs 0125, 0126)', () => {
  it('M2.3-E28 defaults, then global, then workspace, by top-level field', () => {
    expect(mergedConfig(schema, { limit: 20, rules: { b: 2 } }, { model: 'large' })).toEqual({ model: 'large', limit: 20, rules: { b: 2 } });
    expect(mergedConfig(schema, {}, undefined)).toEqual({ model: 'small', limit: 10, rules: { a: 1 } });
  });

  it('M2.3-E29 secret fields are named by their path, never stored, and not required of a stored value', () => {
    expect(configSecretFields(schema)).toEqual(['apiKey', 'auth.token']);
    const checker = new ConfigChecker(new PayloadValidators());
    expect(checker.issues(schema, { model: 'large', auth: { user: 'me' } })).toEqual([]);
    expect(checker.issues(schema, { limit: 'many' })).toEqual([expect.objectContaining({ path: 'limit' })]);
    expect(secretIssues(schema, { apiKey: 'x' }).map((issue) => issue.path)).toEqual(['apiKey']);
    expect(secretIssues(schema, { auth: { token: 'y' } }).map((issue) => issue.path)).toEqual(['auth.token']);
    expect(secretIssues(schema, { model: 'large' })).toEqual([]);
  });

  it('M2.3-E30 the last 4 characters are shown only for secrets of 12 or more characters', () => {
    expect(redactedSecret('abcdefghijkl')).toBe('••••ijkl');
    expect(redactedSecret('abcdefghijk')).toBe('••••');
    expect(redactedSecret('x')).toBe('••••');
  });

  it('M2.3-E31 a write must use a scope the registration allows', () => {
    expect(scopeIssues({ scope: 'global', schema }, 'workspace')).toEqual([expect.objectContaining({ path: 'scope', message: expect.stringContaining('scope global') })]);
    expect(scopeIssues({ scope: 'workspace', schema }, 'global')).toEqual([expect.objectContaining({ path: 'scope', message: expect.stringContaining('scope workspace') })]);
    expect(scopeIssues({ scope: 'global', schema }, 'global')).toEqual([]);
    expect(scopeIssues({ scope: 'both', schema }, 'global')).toEqual([]);
    expect(scopeIssues({ scope: 'both', schema }, 'workspace')).toEqual([]);
  });
});
