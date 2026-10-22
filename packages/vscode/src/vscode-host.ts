import * as vscode from 'vscode';
import type { Translate } from './catalog.ts';
import type { Host } from './controller.ts';
import { isKvmanAlive } from './health.ts';
import { installArguments } from './install-task.ts';
import { runVersion, startKvman, type ProgramPlace } from './kvman-process.ts';
import type { TrustVersion } from './lines.ts';
import type { SettingsPanel } from './settings-panel.ts';
import type { ViewHost } from './view-host.ts';

// The controller's host in VS Code (plan 15 §15.3 to §15.6): the kvman program, the install task, the trust message,
// the view, the Settings tab, and VS Code's own ways to open addresses and files.

export type HostParts = { folder: string; view: ViewHost; settings: SettingsPanel; translate: Translate; logFile: string };

export function openWeb(url: string): void {
  void vscode.env.openExternal(vscode.Uri.parse(url, true));
}

export function reportProblem(error: unknown, translate: Translate): void {
  void vscode.window.showErrorMessage(translate('vscode.problem', { message: error instanceof Error ? error.message : String(error) }));
}

function programPlace(folder: string): ProgramPlace {
  const program = vscode.workspace.getConfiguration('kvman').get<string>('path') ?? 'kvman';
  return { program, folder, platform: process.platform, comSpec: process.env['ComSpec'] };
}

function runInstall(update: boolean, translate: Translate): Promise<number | undefined> {
  const task = new vscode.Task({ type: 'kvman' }, vscode.TaskScope.Global, translate('vscode.install'), 'kvman', new vscode.ShellExecution('npm', installArguments(update)));
  // The end is matched by the task's own type, so an install that ends before `executeTask` answers isn't missed.
  return new Promise((resolve, reject) => {
    const ended = vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.execution.task.definition.type !== 'kvman') return;
      ended.dispose();
      resolve(event.exitCode);
    });
    vscode.tasks.executeTask(task).then(undefined, (error: unknown) => {
      ended.dispose();
      reject(error);
    });
  });
}

async function askTrust(versions: TrustVersion[], translate: Translate): Promise<boolean> {
  const accept = translate('vscode.trust.accept');
  const detail = [...versions.map((version) => `• ${version.name}@${version.version} (${version.source})`), '', translate('vscode.trust.question')].join('\n');
  return (await vscode.window.showWarningMessage(translate('vscode.trust.intro'), { modal: true, detail }, accept)) === accept;
}

export function vscodeHost({ folder, view, settings, translate, logFile }: HostParts): Host {
  return {
    render: (shown) => view.render(shown),
    runVersion: () => runVersion(programPlace(folder)),
    runInstall: (update) => runInstall(update, translate),
    startKvman: (handlers) => startKvman(programPlace(folder), handlers),
    askTrust: (versions) => askTrust(versions, translate),
    isAlive: isKvmanAlive,
    openExternal: openWeb,
    openLog: () => void vscode.window.showTextDocument(vscode.Uri.file(logFile)).then(undefined, (error: unknown) => reportProblem(error, translate)),
    openSettings: (url) => settings.open(url),
    sendToFrame: (message) => view.post(message),
    report: (error) => reportProblem(error, translate),
  };
}
