import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inputSchemaOf, parseArguments, UsageError } from './kv-arguments.ts';
import { request, type Answer } from './kv-client.ts';

// 12 §12.6, ADR 0141: the kv shim inside processes. `kv help` and `kv help <type>` show what the token allows;
// `kv <type> --<field> <value> …` sends it. Answers print as JSON: data on stdout (exit 0), a problem on stderr (exit
// 1); a usage error prints `kv: <message>` on stderr (exit 2).

type Channel = { socket: string; token: string };

function channel(): Channel {
  const socket = process.env['KVMAN_SOCKET'];
  const token = process.env['KVMAN_TOKEN'];
  if (socket === undefined || socket === '' || token === undefined || token === '') throw new UsageError('KVMAN_SOCKET and KVMAN_TOKEN are not set: kv runs inside a process started with a job token');
  return { socket, token };
}

function field(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null && name in value ? Object.getOwnPropertyDescriptor(value, name)?.value : undefined;
}

function printAnswer(answer: Answer): number {
  if (answer.ok) {
    process.stdout.write(`${JSON.stringify({ ok: true, data: answer.data })}\n`);
    return 0;
  }
  process.stderr.write(`${JSON.stringify({ ok: false, problem: answer.problem })}\n`);
  return 1;
}

async function help({ socket, token }: Channel, type: string | undefined): Promise<number> {
  const answer = await request(socket, type === undefined ? { token, op: 'help' } : { token, op: 'help', type });
  if (!answer.ok) return printAnswer(answer);
  if (type !== undefined) {
    process.stdout.write(`${String(field(answer.data, 'markdown'))}\n`);
    return 0;
  }
  const types = field(answer.data, 'types');
  for (const entry of Array.isArray(types) ? types : []) {
    process.stdout.write(`- \`${String(field(entry, 'type'))}\` (${String(field(entry, 'kind'))}): ${String(field(entry, 'description'))}\n`);
  }
  return 0;
}

async function send({ socket, token }: Channel, type: string, argv: readonly string[]): Promise<number> {
  const described = await request(socket, { token, op: 'help', type });
  if (!described.ok) return printAnswer(described);
  const call = parseArguments(argv, inputSchemaOf(field(described.data, 'input')), () => readFileSync(0, 'utf8'));
  if (field(described.data, 'kind') === 'query') return printAnswer(await request(socket, { token, op: 'query', type, payload: call.payload }));
  return printAnswer(await request(socket, {
    token, op: 'command', type, payload: call.payload, idempotencyKey: call.idempotencyKey ?? randomUUID(), ...(call.wait === undefined ? {} : { wait: call.wait }),
  }));
}

async function main(argv: readonly string[]): Promise<number> {
  const [first, ...rest] = argv;
  if (first === undefined) throw new UsageError('usage: kv <type> --<field> <value> …, kv help, or kv help <type>');
  const connected = channel();
  if (first === 'help') return help(connected, rest[0]);
  return send(connected, first, rest);
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`kv: ${error instanceof Error ? error.message : 'failed'}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  },
);
