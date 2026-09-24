import { z } from 'zod';
import { modelDefSchema, providerAuthSchema } from '../llm.ts';
import { textSchema } from '../text.ts';
import { descriptionSchema, functionReferenceSchema, modelIdSchema, providerIdSchema } from './grammar.ts';

const requiredProviderFunctions = ['complete', 'status'];

export const providerEntrySchema = z
  .strictObject({
    id: providerIdSchema,
    title: textSchema,
    description: descriptionSchema,
    auth: providerAuthSchema,
    functions: z.array(functionReferenceSchema),
  })
  .superRefine((provider, check) => {
    const prefix = `provider:${provider.id}.`;
    provider.functions.forEach((reference, index) => {
      if (!reference.startsWith(prefix)) {
        check.addIssue({ code: 'custom', path: ['functions', index], message: `expected a reference starting with "${prefix}"` });
      }
    });
    for (const name of requiredProviderFunctions) {
      if (!provider.functions.includes(`${prefix}${name}`)) {
        check.addIssue({ code: 'custom', path: ['functions'], message: `a provider registers "${prefix}${name}"` });
      }
    }
  });

export const llmManifestSchema = z.strictObject({
  providers: z.array(providerEntrySchema),
  models: z.array(modelDefSchema.extend({ id: modelIdSchema })),
});
