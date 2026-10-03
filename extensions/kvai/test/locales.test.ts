import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { kvaiFolder, useKvai } from './support/kvai-kernel.ts';

const kvai = useKvai();

const catalogSchema = z.record(z.string(), z.string());

function catalog(language: string): Record<string, string> {
  return catalogSchema.parse(JSON.parse(readFileSync(path.join(kvaiFolder, 'locales', `${language}.json`), 'utf8')));
}

const codes = ['SIGNIN_EXPIRED', 'SIGNIN_UNSUPPORTED', 'SIGNIN_FAILED', 'SIGNIN_NOT_WAITING', 'KEY_MISSING', 'NO_MODEL', 'MODEL_UNKNOWN', 'RATE_LIMITED', 'CONTEXT_TOO_LONG', 'PROVIDER_ERROR', 'PROVIDER_UNKNOWN', 'BUILT_IN', 'KEY_UNSUPPORTED'];

// The top-level fields of a JSON Schema object, or of each object in its `anyOf`.
const schemaSchema = z.object({
  properties: z.record(z.string(), z.unknown()).optional(),
  anyOf: z.array(z.unknown()).optional(),
});

function fieldsOf(schema: unknown): string[] {
  const parsed = schemaSchema.parse(schema);
  return [...Object.keys(parsed.properties ?? {}), ...(parsed.anyOf ?? []).flatMap(fieldsOf)];
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

describe("kvai's catalogs (02 §2.11)", () => {
  it('M2.1-H8 en and ar have the same keys under kvai., covering descriptions, errors, and form fields', async () => {
    const en = catalog('en');
    const ar = catalog('ar');
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(en).filter((key) => !key.startsWith('kvai.'))).toEqual([]);
    for (const key of Object.keys(en)) expect(placeholders(ar[key] ?? ''), key).toEqual(placeholders(en[key] ?? ''));

    const { kernel } = await kvai.start();
    const info = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvai');
    const calls = [...(info?.commands ?? []), ...(info?.queries ?? [])];
    const needed = [
      ...calls.map((call) => `${call.name}.description`),
      ...(info?.settings ?? []).map((setting) => `${setting.key}.description`),
      ...codes.map((code) => `kvai.errors.${code}`),
      ...calls.filter((call) => call.name === 'kvai.provider.add' || call.name === 'kvai.model.add').flatMap((call) => fieldsOf(call.input).map((field) => `${call.name}.fields.${field}`)),
    ];
    expect(needed).toContain('kvai.defaultModel.description');
    expect(needed).toContain('kvai.provider.add.fields.delegate');
    expect(needed.filter((key) => en[key] === undefined)).toEqual([]);
  });

  it('QA15-H13 the connection keys exist in both languages with the same placeholders', () => {
    const en = catalog('en');
    const ar = catalog('ar');
    const keys = Object.keys(en).filter((key) => key.startsWith('kvai.ui.connection.'));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => ar[key] === undefined)).toEqual([]);
    for (const key of keys) expect(placeholders(ar[key] ?? ''), key).toEqual(placeholders(en[key] ?? ''));
  });
});
