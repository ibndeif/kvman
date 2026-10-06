import { kernelQuerySchemas, type Ctx } from '@kvman/sdk';

// The `kvman` connector's reads of the app's state (plan 09 §9.1, ADR 0022, 7): the open workspaces, the jobs of the
// chat's workspace, the long-lived processes, and the app's health. Each wraps the kernel query of the same name.

export function registerAppReads(ctx: Ctx): void {
  ctx.registerQuery('kvcustomizer.app.workspaces.list', {
    description: 'Lists the open workspaces, Home first.',
    public: true,
    ...kernelQuerySchemas['kernel.workspace.list'],
    handle: () => ctx.exec('kernel.workspace.list', {}),
  });
  ctx.registerQuery('kvcustomizer.app.jobs.list', {
    description: "Lists this workspace's async and scheduled jobs, newest first, with their status and, for a failed one, its Problem.",
    public: true,
    ...kernelQuerySchemas['kernel.jobs.list'],
    handle: (input) => ctx.exec('kernel.jobs.list', input),
  });
  ctx.registerQuery('kvcustomizer.app.jobs.get', {
    description: 'Gives one job of any workspace by its id.',
    public: true,
    ...kernelQuerySchemas['kernel.jobs.get'],
    handle: (input) => ctx.exec('kernel.jobs.get', input),
  });
  ctx.registerQuery('kvcustomizer.app.processes.list', {
    description: 'Lists the long-lived processes that extensions keep running.',
    public: true,
    ...kernelQuerySchemas['kernel.processes.list'],
    handle: () => ctx.exec('kernel.processes.list', {}),
  });
  ctx.registerQuery('kvcustomizer.app.health.get', {
    description: "Gives kvman's version, preset, mode, pool size, uptime, and languages.",
    public: true,
    ...kernelQuerySchemas['kernel.health.get'],
    handle: () => ctx.exec('kernel.health.get', {}),
  });
}
