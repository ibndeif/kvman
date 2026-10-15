import { jsonSchemaDocumentSchema, kernelQuerySchemas, packageNameSchema, ProblemError, registrationInfoSchema, z, type Ctx } from '@kvman/sdk';

// The `kvman` connector's reads of the app's state (plan 09 §9.1, ADR 0022, 7): the open workspaces, the jobs of the
// chat's workspace, the long-lived processes, and the app's health, each wrapping the kernel query of the same name;
// and one extension's public shapes, for building on it (ADR 0080, 3).

const publicRegistrationSchema = registrationInfoSchema.omit({ public: true });

const extensionShapesSchema = z.object({
  name: z.string(),
  version: z.string(),
  source: z.string(),
  namespace: z.string(),
  commands: z.array(publicRegistrationSchema),
  queries: z.array(publicRegistrationSchema),
  settings: z.array(z.object({ key: z.string(), description: z.string(), scopes: z.array(z.enum(['global', 'workspace'])), schema: jsonSchemaDocumentSchema })),
});

// One running extension with its public commands and queries, and its settings with their JSON Schemas.
async function extensionShapes(ctx: Ctx, name: string): Promise<z.output<typeof extensionShapesSchema>> {
  const extension = (await ctx.exec('kernel.extensions.list', {})).find((candidate) => candidate.name === name);
  if (extension === undefined) throw new ProblemError({ code: 'NOT_FOUND', message: `No running extension is named ${name}; extensions-list names them.`, params: { name } });
  const schemas = new Map((await ctx.exec('kernel.settings.list', {})).map((setting) => [setting.key, setting.schema]));
  const shown = (registrations: typeof extension.commands) => registrations.filter((entry) => entry.public).map(({ name: entryName, description, input, output }) => ({ name: entryName, description, input, output }));
  return {
    name: extension.name,
    version: extension.version,
    source: extension.source,
    namespace: extension.namespace,
    commands: shown(extension.commands),
    queries: shown(extension.queries),
    settings: extension.settings.map((setting) => ({ ...setting, schema: schemas.get(setting.key) ?? {} })),
  };
}

export function registerAppReads(ctx: Ctx): void {
  ctx.registerQuery('kvbuilder.app.workspaces.list', {
    description: 'Lists the open workspaces, Home first.',
    public: true,
    ...kernelQuerySchemas['kernel.workspace.list'],
    handle: () => ctx.exec('kernel.workspace.list', {}),
  });
  ctx.registerQuery('kvbuilder.app.jobs.list', {
    description: "Lists this workspace's async and scheduled jobs, newest first, with their status and, for a failed one, its Problem.",
    public: true,
    ...kernelQuerySchemas['kernel.jobs.list'],
    handle: (input) => ctx.exec('kernel.jobs.list', input),
  });
  ctx.registerQuery('kvbuilder.app.jobs.get', {
    description: 'Gives one job of any workspace by its id.',
    public: true,
    ...kernelQuerySchemas['kernel.jobs.get'],
    handle: (input) => ctx.exec('kernel.jobs.get', input),
  });
  ctx.registerQuery('kvbuilder.app.processes.list', {
    description: 'Lists the long-lived processes that extensions keep running.',
    public: true,
    ...kernelQuerySchemas['kernel.processes.list'],
    handle: () => ctx.exec('kernel.processes.list', {}),
  });
  ctx.registerQuery('kvbuilder.app.extensions.get', {
    description: 'Gives one running extension by package name: its public commands and queries with their JSON Schemas, and its settings with theirs.',
    public: true,
    input: z.object({ name: packageNameSchema.describe('The extension package name, such as @kvman/kvai.') }),
    output: extensionShapesSchema,
    handle: (input) => extensionShapes(ctx, input.name),
  });
  ctx.registerQuery('kvbuilder.app.health.get', {
    description: "Gives kvman's version, preset, mode, pool size, uptime, and languages.",
    public: true,
    ...kernelQuerySchemas['kernel.health.get'],
    handle: () => ctx.exec('kernel.health.get', {}),
  });
}
