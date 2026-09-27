import { join } from 'node:path';

// 01 (the home folder layout): the socket the kv shim reaches the kernel through, and the folder of the shim.
export function socketPathOf(home: string): string {
  return join(home, 'kernel.sock');
}

export function binFolderOf(home: string): string {
  return join(home, 'bin');
}
