import { kernelCommandSchemas, kernelQuerySchemas, ProblemError, z, type Ctx } from '@kvman/sdk';
import { invalid } from '../problems.ts';

// `kvman query-get` (plan 09 §9.1, ADR 0022, 8 and 13): runs one public query of the running app, so the agent can use
// what is installed. A command is refused: a command of the app is reached only through a connector that names it. A
// name under `kernel.secrets.` is refused too, so the connector never lists a secret's name (ADR 0010, 6).

const secretsPrefix = 'kernel.secrets.';

const registrationSchema = z.object({ name: z.string(), kind: z.enum(['command', 'query']), public: z.boolean() });

const notAQuery = (name: string): ProblemError => invalid(`${name} is a command, and query-get runs queries only.`, { name });

const noSuchQuery = (name: string): ProblemError => new ProblemError({ code: 'NOT_FOUND', message: `No public query is named ${name}; extensions-list names the queries of every extension.`, params: { name } });

// The kernel's own names aren't among the registrations, which list the run's extensions.
async function requirePublicQuery(ctx: Ctx, name: string): Promise<void> {
  if (name.startsWith(secretsPrefix)) throw invalid(`${name} isn't available here: this connector never reads or lists a secret.`, { name });
  if (Object.hasOwn(kernelQuerySchemas, name)) return;
  if (Object.hasOwn(kernelCommandSchemas, name)) throw notAQuery(name);
  const registered = z.array(registrationSchema).parse(await ctx.exec('kernel.registrations.list', {})).find((row) => row.name === name);
  if (registered === undefined || !registered.public) throw noSuchQuery(name);
  if (registered.kind === 'command') throw notAQuery(name);
}

export function registerAppQuery(ctx: Ctx): void {
  ctx.registerQuery('kvbuilder.app.query.get', {
    description: 'Runs one public query of the running app, of the kernel or of any extension, and gives its output.',
    public: true,
    input: z.object({
      name: z.string().min(1).describe('The full name of a public query, such as kernel.health.get.'),
      input: z.record(z.string(), z.json()).optional().describe("The query's input; {} when left out."),
    }),
    output: z.json(),
    handle: async ({ name, input }) => {
      await requirePublicQuery(ctx, name);
      return z.json().parse(await ctx.exec(name, input ?? {}));
    },
  });
}
