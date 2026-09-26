const unreadableCodes = new Set(['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP']);

// A file-system error that means "this path cannot be read", as opposed to a bug or a failing disk.
export function isUnreadable(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' && unreadableCodes.has(error.code);
}
