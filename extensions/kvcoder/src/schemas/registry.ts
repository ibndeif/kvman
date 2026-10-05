import { z } from '@kvman/sdk';

// What other extensions register with kvcoder (plan 08 §8.4), kept in its own store.

export const kebab = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** A connector or connector command name: lowercase kebab case (ADR 0009, 100). */
export const wordSchema = z.string().regex(kebab, 'Use lowercase kebab case, such as todo or open-items.');

/** A binary connector: a program the agent runs in the real shell; `help` is the line that prints its help, when that isn't `--help`. */
export const binarySchema = z.object({ check: z.string().min(1), install: z.string().min(1).exactOptional(), help: z.string().min(1).exactOptional() });

export const exampleSchema = z.object({ description: z.string().min(1), input: z.json() });

/** A commands connector's command: its name, the registering extension's public command, and examples. `help` is every connector's own. */
export const connectorCommandSchema = z.object({ name: wordSchema.refine((name) => name !== 'help', "help is every connector's own command; name this one differently."), command: z.string().min(1), examples: z.array(exampleSchema).exactOptional() });

const commandsConnectorSchema = z.strictObject({ name: wordSchema, description: z.string().min(1), commands: z.array(connectorCommandSchema).min(1) });
const programConnectorSchema = z.strictObject({ name: wordSchema, description: z.string().min(1), binary: binarySchema });

/** One connector as an extension registers it: its own commands, or a program. */
export const connectorSchema = z.union([commandsConnectorSchema, programConnectorSchema]);

/** What `kvcoder.connector.register` takes: one connector, or several that are registered together or not at all (ADR 0011, 26). */
export const connectorRegisterSchema = z.union([commandsConnectorSchema, programConnectorSchema, z.strictObject({ connectors: z.array(connectorSchema).min(1) })]);

/** A binary connector from the `kvcoder.connectors` setting. */
export const binaryConnectorSchema = z.object({ name: wordSchema, description: z.string().min(1), binary: binarySchema });

export const connectorDocSchema = z.object({
  owner: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(['commands', 'binary']),
  commands: z.array(z.object({ name: z.string(), command: z.string(), examples: z.array(exampleSchema) })).nullable(),
  binary: z.object({ check: z.string(), install: z.string().nullable(), help: z.string().nullable().default(null) }).nullable(),
});

/** The session points (plan 08 §8.4). */
export const sessionPointSchema = z.enum(['kvcoder.session.created', 'kvcoder.session.deleted', 'kvcoder.session.forked', 'kvcoder.turn.started', 'kvcoder.turn.ended', 'kvcoder.session.waiting']);

export const handlerDocSchema = z.object({ owner: z.string(), point: sessionPointSchema, command: z.string() });

export const handlerJobDocSchema = z.object({ jobId: z.string(), at: z.number() });

export const sectionDocSchema = z.object({ owner: z.string(), sectionId: z.string(), title: z.string(), order: z.number(), content: z.string(), sessionId: z.string().nullable() });

export type ConnectorDoc = z.output<typeof connectorDocSchema>;
export type SectionDoc = z.output<typeof sectionDocSchema>;
export type SessionPoint = z.output<typeof sessionPointSchema>;
