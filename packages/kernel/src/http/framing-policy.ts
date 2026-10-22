// Who may show kvman's pages in a frame (plan 04 §4.2, ADR 0099, 9 and 32): kvman itself, a local page such as kvcoder's
// `url` artifact showing a preview kvman, and a VS Code webview, whose workbench is loaded from `vscode-file:`. A website
// can't, so it can't use kvman's UI from a frame.
export const framingPolicy = "frame-ancestors 'self' http://127.0.0.1:* http://localhost:* vscode-webview: vscode-file:";
