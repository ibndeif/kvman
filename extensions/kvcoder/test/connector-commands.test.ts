import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';

const kvcoder = useKvcoder();

const registrationSchema = z.object({ name: z.string(), public: z.boolean(), input: z.object({ properties: z.record(z.string(), z.object({ description: z.string().optional() })).optional() }) });
const extensionsSchema = z.array(z.object({ name: z.string(), commands: z.array(registrationSchema), queries: z.array(registrationSchema) }));

const connectorJobs = [
  'kvcoder.shell.run',
  'kvcoder.binary.run',
  'kvcoder.fs.write',
  'kvcoder.fs.edit',
  'kvcoder.fs.file.get',
  'kvcoder.fs.entry.list',
  'kvcoder.fs.text.search',
  'kvcoder.artifact.write',
  'kvcoder.artifact.edit',
  'kvcoder.artifact.content.get',
  'kvcoder.background.list',
  'kvcoder.background.output.get',
  'kvcoder.background.stop',
  'kvcoder.ask.text.check',
  'kvcoder.ask.choice.check',
  'kvcoder.ask.confirm.check',
  'kvcoder.delegate.check',
  'kvcoder.connector.help.get',
];

describe("the built-in connectors' kernel jobs (08 §8.3, ADR 0011, 10)", { timeout: 30_000 }, () => {
  it('QA18-H17 every built-in connector command is a private kvcoder command or query with described input fields', async () => {
    const { kernel } = await kvcoder.start();
    const kvcoderExtension = extensionsSchema.parse(await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvcoder');
    const registered = [...(kvcoderExtension?.commands ?? []), ...(kvcoderExtension?.queries ?? [])];
    for (const name of connectorJobs) {
      const found = registered.find((registration) => registration.name === name);
      expect(found?.public, name).toBe(false);
      expect(Object.keys(found?.input.properties ?? {}), name).not.toEqual([]);
      for (const [field, schema] of Object.entries(found?.input.properties ?? {})) expect(schema.description, `${name} ${field}`).toEqual(expect.any(String));
    }
    expect(registered.map((registration) => registration.name)).not.toContain('kvcoder.connector.run');
    await expect(kernel.exec('kvcoder.fs.file.get', { sessionId: 'any', payload: { path: 'a' } } as never, { as: '@test/todo' })).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
  });
});
