import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { targetOf } from './runtime-plan.ts';
import { tryRuntime } from './try-runtime.ts';

// `node release/desktop/try-runtime-main.ts` runs the prepared bundle with no window and no Node on the `PATH`; a
// failure ends the release's job before an installer is built (plan 14 §14.8).

const runtime = path.join(fileURLToPath(new URL('../..', import.meta.url)), 'packages', 'desktop', 'src-tauri', 'runtime');
const systemPath = process.platform === 'win32' ? path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32') : '/usr/bin:/bin';
const tried = await tryRuntime({ runtime, target: targetOf(process.platform, process.arch), systemPath });
console.log(`The bundle runs: kvman answered on port ${String(tried.port)}, with the bundled npm ${tried.npmVersion}.`);
