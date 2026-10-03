// What a folder name may be (plan 02 §2.12, ADR 0009, 222): one name, never a path. The rules of each system are here, with
// a branch per platform: Windows refuses more than the others.

const nameLimit = 255;
const windowsForbidden = /[<>:"|?*\u0000-\u001f]/u;
const windowsDevice = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

/** Why `name` can't be a folder name on `platform`, or `undefined` when it can. */
export function folderNameProblem(name: string, platform: NodeJS.Platform = process.platform): string | undefined {
  if (name.trim() === '') return "A folder name can't be empty.";
  if (name.length > nameLimit) return `A folder name is at most ${String(nameLimit)} characters.`;
  if (/[/\\\u0000]/u.test(name)) return 'A folder name is one name, with no / or \\.';
  if (name === '.' || name === '..') return `A folder can't be named ${name}.`;
  if (platform !== 'win32') return undefined;
  if (windowsForbidden.test(name)) return 'A folder name on Windows has none of < > : " | ? * or control characters.';
  if (/[. ]$/u.test(name)) return "A folder name on Windows doesn't end in a dot or a space.";
  if (windowsDevice.test(name)) return `${name} is a reserved name on Windows.`;
  return undefined;
}
