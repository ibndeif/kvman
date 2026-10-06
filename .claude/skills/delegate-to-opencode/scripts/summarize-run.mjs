// Condense an opencode `--format json` event log into what the reviewer needs to read.
// Usage: node summarize-run.mjs <run-dir>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const runDir = process.argv[2];
if (!runDir) {
  console.error('usage: summarize-run.mjs <run-dir>');
  process.exit(2);
}

const readText = (name) => (existsSync(join(runDir, name)) ? readFileSync(join(runDir, name), 'utf8') : '');

const events = [];
const unparsed = [];
for (const line of readText('events.jsonl').split('\n')) {
  if (!line.trim()) continue;
  try {
    events.push(JSON.parse(line));
  } catch {
    unparsed.push(line);
  }
}

let sessionId = '';
let totalTokens = 0;
let cost = 0;
let steps = 0;
const toolCounts = new Map();
const touchedFiles = new Set();
const shellCommands = [];
const toolErrors = [];
const errorEvents = [];
let textSinceLastTool = [];

const describeInput = (input) => input?.filePath ?? input?.path ?? input?.pattern ?? input?.command ?? '';

for (const event of events) {
  sessionId ||= event.sessionID ?? event.part?.sessionID ?? '';
  const part = event.part ?? {};
  if (event.type === 'step_finish') {
    steps += 1;
    totalTokens += part.tokens?.total ?? 0;
    cost += part.cost ?? 0;
  } else if (event.type === 'text' && part.text) {
    textSinceLastTool.push(part.text);
  } else if (event.type === 'tool_use') {
    textSinceLastTool = [];
    const tool = part.tool ?? 'unknown';
    toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
    const input = part.state?.input ?? {};
    if (['edit', 'write', 'patch', 'multiedit', 'apply_patch'].includes(tool)) {
      touchedFiles.add(describeInput(input) || part.state?.title || '(unknown file)');
    }
    if (tool === 'bash' && input.command) shellCommands.push(input.command);
    if (part.state?.status === 'error') {
      toolErrors.push(`${tool} ${describeInput(input)}: ${String(part.state.error ?? '').slice(0, 300)}`);
    }
  } else if (event.type === 'error') {
    errorEvents.push(JSON.stringify(event.error ?? event).slice(0, 500));
  }
}

const lines = [];
lines.push('== opencode run ==');
lines.push(`session:  ${sessionId || '(none: opencode produced no events)'}`);
lines.push(`exit:     ${readText('exit-code').trim() || '?'}   duration: ${readText('duration-seconds').trim() || '?'}s`);
lines.push(`steps:    ${steps}   tokens: ${totalTokens}   cost: ${cost}`);
lines.push(`tools:    ${[...toolCounts].map(([tool, count]) => `${tool}×${count}`).join(', ') || '(none)'}`);
if (touchedFiles.size) lines.push(`edited (per opencode): ${[...touchedFiles].join(', ')}`);
if (shellCommands.length) {
  lines.push('shell commands:');
  for (const command of shellCommands) lines.push(`  $ ${command.split('\n')[0].slice(0, 200)}`);
}
if (toolErrors.length) {
  lines.push('tool errors:');
  for (const error of toolErrors) lines.push(`  ! ${error}`);
}
if (errorEvents.length) {
  lines.push('run errors:');
  for (const error of errorEvents) lines.push(`  ! ${error}`);
}
const stderr = readText('stderr.log').trim();
if (stderr) lines.push(`stderr (last 1500 chars):\n${stderr.slice(-1500)}`);
if (unparsed.length) lines.push(`unparsed output lines: ${unparsed.length} (see events.jsonl)`);
lines.push('');
lines.push('== final message ==');
lines.push(textSinceLastTool.join('\n').trim() || '(no final text: opencode ended on a tool call or failed)');

const summary = lines.join('\n');
writeFileSync(join(runDir, 'summary.txt'), `${summary}\n`);
console.log(summary);
