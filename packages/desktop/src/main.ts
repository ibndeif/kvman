import { startHome } from './home.ts';
import { readHomeView, type Shell } from './shell.ts';

// The page's entry: the shell's functions, as Tauri gives them to the app's own page, behind the `Shell` the home
// screen uses.

type Invoke = (command: string, input?: Record<string, unknown>) => Promise<unknown>;

declare global {
  interface Window {
    __TAURI__?: { core: { invoke: Invoke } };
  }
}

function shellOf(invoke: Invoke): Shell {
  return {
    load: async () => readHomeView(await invoke('home_load')),
    continueInto: async (workspaceId) => {
      await invoke('home_continue', { workspaceId });
    },
    remove: async (workspaceId) => readHomeView(await invoke('home_remove', { workspaceId })),
    openFolder: async () => readHomeView(await invoke('home_open_folder')),
  };
}

const tauri = window.__TAURI__;
const root = document.getElementById('home');
if (tauri === undefined || root === null) throw new Error('The home screen runs only inside the kvman desktop app.');
await startHome(root, shellOf(tauri.core.invoke));
