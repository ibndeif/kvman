import { setFlagsFromString } from 'node:v8';

// V8's wasm code GC can free the machine code of a wasm module shared across isolates while another isolate still runs
// it, which crashes the process (SIGSEGV in NativeModule::FreeCode). Every worker runs Node's TypeScript stripper, a
// wasm module, so workers starting and stopping trigger it. The kernel turns that GC off once, before any worker
// starts (ADR 0009, 20); the stripper's compiled code then stays in memory. Remove this once a fixed Node ships.
export function keepWasmCode(): void {
  setFlagsFromString('--no-wasm-code-gc');
}
