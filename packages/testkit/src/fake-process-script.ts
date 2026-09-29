// ADR 0166: the stand-in the kernel spawns for a fake process. It writes its scripted output and exits with its code;
// the script comes from the testkit as its first argument.
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

const script: unknown = JSON.parse(process.argv[2] ?? '{}');
const fields = typeof script === 'object' && script !== null ? script : {};
for (const chunk of strings('stdout' in fields ? fields.stdout : undefined)) process.stdout.write(chunk);
for (const chunk of strings('stderr' in fields ? fields.stderr : undefined)) process.stderr.write(chunk);
process.exitCode = 'exitCode' in fields && typeof fields.exitCode === 'number' ? fields.exitCode : 0;
