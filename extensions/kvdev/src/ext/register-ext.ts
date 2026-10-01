import { namespaceSchema, packageNameSchema, z, type Ctx } from '@kvman/sdk';
import { projectAt } from '../folders.ts';
import { jobOptions } from '../job-options.ts';
import { checkProject, testProject } from './ext-check.ts';
import { listProjects } from './ext-list.ts';
import { newProject } from './ext-new.ts';

// The `ext` connector's commands (plan 09 §9.1): scaffold, list, check, and test extension projects in the workspace.

const folderInput = z.object({ folder: z.string().min(1).describe('The project folder, relative to the workspace folder.') });
const findingSchema = z.object({ file: z.string().optional(), message: z.string(), hint: z.string() });

const newInput = z.object({
  name: packageNameSchema.describe('The npm package name, such as notes or @me/notes.'),
  namespace: namespaceSchema.refine((namespace) => namespace !== 'kernel', 'kernel is the kernel\'s own namespace.').describe('The namespace every name starts with, such as notes.'),
  folder: z.string().min(1).describe('The new or empty folder to write it in, relative to the workspace folder.'),
  web: z.boolean().optional().describe('Whether to add a Vue custom component and its build.'),
});

export function registerExt(ctx: Ctx): void {
  ctx.registerCommand('kvdev.ext.new', {
    description: 'Scaffolds an extension project and runs npm install in it.',
    public: true,
    ...jobOptions['kvdev.ext.new'],
    input: newInput,
    output: z.object({ folder: z.string(), name: z.string(), namespace: z.string(), web: z.boolean() }),
    handle: (input) => newProject(ctx.job.workspace.path, { name: input.name, namespace: input.namespace, folder: input.folder, web: input.web ?? false }, ctx.job.signal),
  });
  ctx.registerQuery('kvdev.ext.list', {
    description: 'Lists the extension projects in the workspace folder.',
    public: true,
    input: z.object({}),
    output: z.array(z.object({ folder: z.string(), name: z.string(), namespace: z.string(), version: z.string() })),
    handle: () => listProjects(ctx.job.workspace.path),
  });
  ctx.registerCommand('kvdev.ext.check', {
    description: 'Type-checks a project and runs its kvman check.',
    public: true,
    ...jobOptions['kvdev.ext.check'],
    input: folderInput,
    output: z.array(findingSchema),
    handle: (input) => checkProject(projectAt(ctx.job.workspace.path, input.folder).folder, ctx.job.signal),
  });
  ctx.registerCommand('kvdev.ext.test', {
    description: "Runs a project's tests.",
    public: true,
    ...jobOptions['kvdev.ext.test'],
    input: folderInput,
    output: z.object({ passed: z.boolean(), exitCode: z.number(), output: z.string() }),
    handle: (input) => testProject(projectAt(ctx.job.workspace.path, input.folder).folder, ctx.job.signal),
  });
}
