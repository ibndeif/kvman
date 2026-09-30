import { kernelCommandSchemas, kernelQuerySchemas, type z } from '@kvman/sdk';
import type { Api } from './client.ts';

// Typed calls to the kernel's own API (plan 02 §2.12), with each answer checked against the SDK's schema.

type Queries = typeof kernelQuerySchemas;
type Commands = typeof kernelCommandSchemas;

export type ExtensionInfo = z.output<Queries['kernel.extensions.list']['output']>[number];
export type SettingInfo = z.output<Queries['kernel.settings.list']['output']>[number];
export type Health = z.output<Queries['kernel.health.get']['output']>;
export type SecretEntry = z.output<Queries['kernel.secrets.list']['output']>[number];

export async function kernelQuery<Name extends keyof Queries>(api: Api, name: Name, input: z.input<Queries[Name]['input']>): Promise<z.output<Queries[Name]['output']>> {
  const schemas: Queries[Name] = kernelQuerySchemas[name];
  return schemas.output.parse(await api.query(name, input)) as z.output<Queries[Name]['output']>;
}

export async function kernelCommand<Name extends keyof Commands>(api: Api, name: Name, input: z.input<Commands[Name]['input']>): Promise<z.output<Commands[Name]['output']>> {
  const schemas: Commands[Name] = kernelCommandSchemas[name];
  return schemas.output.parse((await api.command(name, input)).output) as z.output<Commands[Name]['output']>;
}
