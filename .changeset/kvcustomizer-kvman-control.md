---
'@kvman/kvcustomizer': minor
---

The agent's control of kvman is reviewed and widened (ADR 0022, 5 to 8 and 12 to 15). The person is asked before `kvman model-set`, `settings-set`, `settings-reset`, `extensions-install`, and `extensions-uninstall`. `kvman extensions-install` with a `path:` source resolves the folder against the workspace folder, checks that it is a project with the given package name, and stores it absolute, so a project the agent built can be installed. The `kvman` connector gains the reads `workspaces-list`, `jobs-list`, `jobs-get`, `processes-list`, and `health-get`, and `query-get`, which runs any public query of the running app. The `preview` connector gains `query-get` and `command-run`, which call the previewed project and answer `{ ok, output }` or `{ ok, problem }`. The guide section is a method: building an extension in order, improving one that exists, and managing the app.
