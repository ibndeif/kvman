import type { Message } from '@kvman/protocol';
import type { GrantsSource } from '../router/grants.ts';

// 03 §3.8 "admin", ADRs 0079 and 0118: a person, the kernel, or an extension granted kernel.admin.
export function isAdministrator(grants: GrantsSource, message: Message): boolean {
  const { source } = message;
  if (source === 'kernel' || source.startsWith('user:')) return true;
  const extension = source.startsWith('ext:') ? source.slice('ext:'.length) : undefined;
  const granted = extension === undefined ? undefined : grants.capabilities(extension, message.workspaceId);
  return granted?.requested.some((capability) => capability.name === 'kernel.admin') === true;
}
