import type { Manifest } from '@kvman/protocol';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { invalid } from './refusal.ts';

type Entity = Manifest['entities'][number];

const binding = /^\{\{\s*\$item\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/;

// The entity types a notification may open: those of the extensions enabled in the message's workspace, or, for a
// global message, the sender's own (ADR 0162).
function entityOf(registry: KernelRegistry, type: string, workspaceId: string | undefined, sender: string | undefined): Entity | undefined {
  const own = sender === undefined ? undefined : registry.manifestOf(sender);
  const manifests = workspaceId === undefined ? (own === undefined ? [] : [own]) : registry.manifestsEnabledIn(workspaceId);
  for (const manifest of manifests) {
    const found = manifest.entities.find((entity) => entity.name === type);
    if (found !== undefined) return found;
  }
  return undefined;
}

// 08 §8.11, ADR 0162: the kernel renders the entity's route with its id, so the tray only navigates. Every
// `{{ $item.… }}` segment must name the entity's idField, since the notification carries only the id.
export function entityRoute(registry: KernelRegistry, entity: { type: string; id: string }, workspaceId: string | undefined, sender: string | undefined): string {
  const found = entityOf(registry, entity.type, workspaceId, sender);
  if (found === undefined) {
    throw invalid('entity.type', `no entity type "${entity.type}" is ${workspaceId === undefined ? "the sender's own" : 'enabled in this workspace'}`);
  }
  const { route, idField } = found;
  if (route === undefined) throw invalid('entity.type', `the entity type "${entity.type}" has no route`, 'register the entity with a route, or send a route instead');
  const segments = route.slice(1).split('/').map((segment) => {
    const bound = binding.exec(segment);
    if (bound === null) return segment;
    if (bound[1] !== idField) {
      throw invalid('entity.type', `the route of "${entity.type}" needs $item.${bound[1] ?? ''}, but a notification names only the ${idField}`, 'send the rendered route instead');
    }
    return encodeURIComponent(entity.id);
  });
  return `/${segments.join('/')}`;
}
