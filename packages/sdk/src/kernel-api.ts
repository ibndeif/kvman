import { z } from 'zod';
import { jsonSchema } from './json.ts';
import { packageNameSchema } from './manifest.ts';
import { extensionSourceSchema, presetStateSchema } from './preset.ts';
import { fileSchema, isoTimeSchema, jobSchema, jobStatusSchema, workspaceSchema } from './rows.ts';

const emptySchema = z.strictObject({});
const scopeSchema = z.enum(['global', 'workspace']);
const listLimitSchema = z.number().int().positive().max(1000);

/** Accepts a JSON Schema, as the kernel lists schemas for forms (plan 02 §2.12). */
export const jsonSchemaDocumentSchema = z.record(z.string(), jsonSchema);

/** Accepts a command or query as `kernel.extensions.list` describes it. */
export const registrationInfoSchema = z.strictObject({
  name: z.string(),
  description: z.string(),
  public: z.boolean(),
  input: jsonSchemaDocumentSchema,
  output: jsonSchemaDocumentSchema,
});

/** Accepts an extension as `kernel.extensions.list` describes it. */
export const extensionInfoSchema = z.strictObject({
  name: z.string(),
  version: z.string(),
  source: extensionSourceSchema,
  revision: z.number().int().nonnegative(),
  namespace: z.string(),
  commands: z.array(registrationInfoSchema),
  queries: z.array(registrationInfoSchema),
  settings: z.array(z.strictObject({ key: z.string(), description: z.string(), scopes: z.array(scopeSchema) })),
  handlers: z.array(z.strictObject({ point: z.string(), description: z.string() })),
});

/** Accepts a setting as `kernel.settings.list` describes it: its JSON Schema, its scopes, and where its value comes from. */
export const settingInfoSchema = z.strictObject({
  key: z.string(),
  description: z.string(),
  schema: jsonSchemaDocumentSchema,
  scopes: z.array(scopeSchema),
  value: jsonSchema,
  source: z.enum(['workspace', 'global', 'preset', 'default']),
});

/** Accepts a running long-lived process as `kernel.processes.list` describes it. */
export const processRowSchema = z.strictObject({
  extension: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  pid: z.number().int(),
  startedAt: isoTimeSchema,
});

/** Accepts the sub-folders of a folder as `kernel.folder.list` answers (plan 02 §2.12). */
export const folderListSchema = z.strictObject({
  path: z.string(),
  parent: z.string().nullable(),
  folders: z.array(z.strictObject({ name: z.string(), path: z.string() })),
  truncated: z.boolean(),
});

/** Accepts the answer of `kernel.health.get`. */
export const healthSchema = z.strictObject({
  version: z.string(),
  preset: z.string(),
  mode: z.literal('web'),
  workers: z.number().int().positive(),
  uptimeMs: z.number().nonnegative(),
  languages: z.array(z.string()),
});

/** The input and output schemas of the kernel's own commands (plan 02 §2.12). */
export const kernelCommandSchemas = {
  'kernel.workspace.open': { input: z.strictObject({ path: z.string().min(1) }), output: workspaceSchema },
  'kernel.workspace.close': { input: z.strictObject({ workspaceId: z.string().min(1) }), output: emptySchema },
  'kernel.folder.create': { input: z.strictObject({ path: z.string().min(1), name: z.string() }), output: z.strictObject({ path: z.string() }) },
  'kernel.settings.set': { input: z.strictObject({ key: z.string().min(1), value: jsonSchema, scope: scopeSchema }), output: emptySchema },
  'kernel.settings.reset': { input: z.strictObject({ key: z.string().min(1), scope: scopeSchema }), output: emptySchema },
  'kernel.secrets.set': { input: z.strictObject({ extension: z.string().min(1), name: z.string().min(1), value: z.string() }), output: emptySchema },
  'kernel.secrets.delete': { input: z.strictObject({ extension: z.string().min(1), name: z.string().min(1) }), output: emptySchema },
  'kernel.files.unlink': { input: z.strictObject({ id: z.string().min(1) }), output: emptySchema },
  'kernel.extensions.install': {
    input: z.strictObject({ name: packageNameSchema, source: extensionSourceSchema }),
    output: z.strictObject({ file: z.string(), restartRequired: z.literal(true) }),
  },
  'kernel.extensions.uninstall': {
    input: z.strictObject({ name: packageNameSchema }),
    output: z.strictObject({ file: z.string(), restartRequired: z.literal(true) }),
  },
} as const;

/** The input and output schemas of the kernel's own queries (plan 02 §2.12). */
export const kernelQuerySchemas = {
  'kernel.workspace.list': { input: emptySchema, output: z.array(workspaceSchema) },
  'kernel.folder.list': { input: z.strictObject({ path: z.string().min(1).exactOptional(), hidden: z.boolean().exactOptional() }), output: folderListSchema },
  'kernel.settings.list': { input: emptySchema, output: z.array(settingInfoSchema) },
  'kernel.secrets.list': { input: emptySchema, output: z.array(z.strictObject({ extension: z.string(), name: z.string() })) },
  'kernel.jobs.get': { input: z.strictObject({ id: z.string().min(1) }), output: jobSchema },
  'kernel.jobs.list': { input: z.strictObject({ status: jobStatusSchema.optional(), limit: listLimitSchema }), output: z.array(jobSchema) },
  'kernel.files.get': { input: z.strictObject({ id: z.string().min(1) }), output: fileSchema },
  'kernel.files.list': { input: z.strictObject({ limit: listLimitSchema }), output: z.array(fileSchema) },
  'kernel.extensions.list': { input: emptySchema, output: z.array(extensionInfoSchema) },
  'kernel.preset.get': { input: emptySchema, output: presetStateSchema },
  'kernel.processes.list': { input: emptySchema, output: z.array(processRowSchema) },
  'kernel.health.get': { input: emptySchema, output: healthSchema },
} as const;

type Typed<Schemas extends Record<string, { input: z.ZodType; output: z.ZodType }>> = {
  [Name in keyof Schemas]: { input: z.input<Schemas[Name]['input']>; output: z.output<Schemas[Name]['output']> };
};

/** The kernel's commands by name, each `{ input; output }`; `Commands` includes them. */
export type KernelCommands = Typed<typeof kernelCommandSchemas>;

/** The kernel's queries by name, each `{ input; output }`; `Queries` includes them. */
export type KernelQueries = Typed<typeof kernelQuerySchemas>;
