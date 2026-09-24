import { describe, expect, it } from 'vitest';
import { presetSchema, presetSecretIssues, type JsonObject, type Preset } from '../src/index.ts';
import { copyOf, expectRoundTrip, issueMessages, issuePaths } from './assertions.ts';
import kioskPresetFixture from './fixtures/kiosk-preset.json' with { type: 'json' };

const kioskPreset = presetSchema.parse(kioskPresetFixture);

type Mutable = Record<string, unknown>;

function withChange(change: (preset: Mutable & Preset) => void): unknown {
  const preset = copyOf(kioskPreset) as Mutable & Preset;
  change(preset);
  return preset;
}

function pdfEntry(preset: Preset): Mutable {
  const entry = preset.extensions['@acme/pdf'];
  if (entry === undefined) throw new Error('the fixture has no @acme/pdf');
  return entry as Mutable;
}

const providersSchema: JsonObject = {
  type: 'object',
  properties: {
    baseUrl: { type: 'string' },
    apiKey: { type: 'string', secret: true },
    endpoints: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, token: { type: 'string', secret: true } } } },
    oauth: { type: 'object', properties: { clientId: { type: 'string' }, clientSecret: { type: 'string', secret: true } } },
  },
};

describe('presets (plan 07 §7.3, ADRs 0017, 0019)', () => {
  it('M0.3-H2 the kiosk preset validates', () => {
    expectRoundTrip(presetSchema, kioskPresetFixture);
  });

  it('M0.3-H3 a loose npm range fails at the source path', () => {
    const preset = withChange((changed) => (pdfEntry(changed)['source'] = 'npm:@acme/pdf@^1.4.2'));
    expect(issuePaths(presetSchema, preset)).toEqual(['extensions.@acme/pdf.source']);
    expect(issueMessages(presetSchema, preset)).toEqual(['npm sources name an exact version, e.g. npm:@acme/pdf@1.4.2']);
  });

  it('M0.3-H4 a secret in config fails at its path', () => {
    const preset = presetSchema.parse(withChange((changed) => {
      changed.config = { '@kvman/llm-providers': { baseUrl: 'https://api.example.com', apiKey: 'sk-live-1' } };
    }));
    expect(presetSecretIssues(preset, { '@kvman/llm-providers': providersSchema }).map((issue) => issue.path)).toEqual([
      'config.@kvman/llm-providers.apiKey',
    ]);
  });

  it('M0.3-E15 malformed preset fields are rejected', () => {
    expect(issueMessages(presetSchema, withChange((changed) => Reflect.set(changed, 'presetVersion', 2)))).toEqual(['requires a newer kvman']);
    expect(issuePaths(presetSchema, withChange((changed) => (changed.id = 'PDF-Kiosk')))).toEqual(['id']);
    expect(issuePaths(presetSchema, withChange((changed) => (changed.app.home = '/files/:id')))).toEqual(['app.home']);
    expect(issuePaths(presetSchema, withChange((changed) => (changed.app.theme = { accent: 'red' })))).toEqual(['app.theme.accent']);
    expect(issuePaths(presetSchema, withChange((changed) => (changed['trust'] = { mode: 'always' })))).toEqual(['']);
  });

  it('M0.3-E16 nested secrets are found and unknown schemas fail closed', () => {
    const preset = presetSchema.parse(withChange((changed) => {
      changed.config = {
        '@kvman/llm-providers': { oauth: { clientId: 'kvman', clientSecret: 's' }, endpoints: [{ name: 'local', token: 't' }] },
        '@acme/unknown': { anything: 1 },
      };
    }));
    expect(presetSecretIssues(preset, { '@kvman/llm-providers': providersSchema }).map((issue) => issue.path)).toEqual([
      'config.@kvman/llm-providers.oauth.clientSecret',
      'config.@kvman/llm-providers.endpoints.0.token',
      'config.@acme/unknown',
    ]);
  });
});
