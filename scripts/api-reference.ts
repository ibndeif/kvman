import { fileURLToPath } from 'node:url';
import { Application, Logger, LogLevel } from 'typedoc';

export type ApiReferenceOptions = { entryPoints: string[]; tsconfig: string; out: string };

export type ApiReferenceResult = { ok: boolean; problems: string[] };

// Every message TypeDoc logs at warning level or above; with treatWarningsAsErrors a warning fails the run.
class CollectingLogger extends Logger {
  readonly problems: string[] = [];

  override log(message: string, level: LogLevel): void {
    super.log(message, level);
    if (level >= LogLevel.Warn) this.problems.push(message);
  }
}

// 14 §14.5, ADR 0168: the API reference of the public packages, generated from their types. An exported declaration
// or member without a doc comment fails the run.
export async function buildApiReference(options: ApiReferenceOptions): Promise<ApiReferenceResult> {
  const app = await Application.bootstrapWithPlugins({
    entryPoints: options.entryPoints,
    tsconfig: options.tsconfig,
    out: options.out,
    validation: { notExported: false, invalidLink: true, notDocumented: true },
    treatWarningsAsErrors: true,
    readme: 'none',
    disableSources: true,
    excludePrivate: true,
    logLevel: 'Warn',
  });
  const logger = new CollectingLogger();
  app.logger = logger;
  const project = await app.convert();
  if (project === undefined) return { ok: false, problems: logger.problems };
  app.validate(project);
  if (logger.problems.length > 0) return { ok: false, problems: logger.problems };
  await app.generateDocs(project, options.out);
  return { ok: logger.problems.length === 0, problems: logger.problems };
}

const root = fileURLToPath(new URL('../', import.meta.url));

export const publicPackages: ApiReferenceOptions = {
  entryPoints: [`${root}packages/sdk/src/index.ts`, `${root}packages/widget-bridge/src/index.ts`],
  tsconfig: `${root}tsconfig.typedoc.json`,
  out: `${root}docs/api`,
};

if (import.meta.main) {
  const result = await buildApiReference(publicPackages);
  for (const problem of result.problems) process.stderr.write(`${problem}\n`);
  if (!result.ok) process.exitCode = 1;
}
