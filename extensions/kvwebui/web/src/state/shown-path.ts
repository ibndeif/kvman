// A folder as the status bar shows it (ADR 0009, 145): under the person's home folder it starts with `~`, in the path's
// own separator (`/` or `\`); any other folder is shown whole.
export function shownPath(folder: string, home: string | undefined): string {
  if (home === undefined || home === '') return folder;
  if (folder === home) return '~';
  const separator = home.includes('\\') ? '\\' : '/';
  return folder.startsWith(home + separator) ? `~${folder.slice(home.length)}` : folder;
}
