# QA 69 — url artifacts end with their server (ADR 0104)

**Asked.** The owner asked kvcoder to delete expired artifacts, and chose what that means: a `url` artifact whose
server, a background process of the chat, has ended. Their answers are ADR 0104.

Paths are relative to `extensions/kvcoder/`. The integration scenarios run bash, so Linux and macOS.

## Happy path

- **QA69-H1 an exit by itself.** *Given* a chat with the url artifact `preview` at `http://127.0.0.1:4173/app`, the
  url artifact `docs` at `http://localhost:8080`, and the Markdown artifact `notes`, and a background process that
  printed `http://localhost:4173/`, *when* it exits by itself, *then* `preview` is deleted, `docs` and `notes` stay,
  and its message says ``The process exited with code 0.`` then ``Its artifact `preview` was deleted, since nothing
  serves its address now.`` before its output. `test/served-artifacts.test.ts`
- **QA69-H2 the agent's stop.** *Given* the same chat, *when* the agent calls `background stop` on the process,
  *then* the result is `{"stopped":true,"deletedArtifacts":["preview"]}`, `preview` is deleted, and no message
  follows. `test/served-artifacts.test.ts`
- **QA69-H3 the person's Stop.** *When* the person stops the process with `kvcoder.job.cancel`, *then* `preview` is
  deleted and the message says ``The process was stopped by the person.`` then the line of H1.
  `test/served-artifacts.test.ts`
- **QA69-H4 kvman stopped.** *Given* the process runs, *when* kvman restarts, *then* `preview` stays until the chat's
  next message, which deletes it, and the report's line for that run ends ``interrupted because kvman stopped. Its
  artifact `preview` was deleted, since nothing serves its address now.`` `test/served-artifacts.test.ts`
- **QA69-H5 several artifacts.** *Given* `b-site` and `a-site` both at port 4173, *when* the process exits, *then*
  both are deleted and the line is ``Its artifacts `a-site`, `b-site` were deleted, since nothing serves their address
  now.`` `test/unit/served-artifacts.test.ts`

## Edge cases

- **QA69-E1 the person's Restart keeps them.** *When* the person restarts the process with `kvcoder.job.restart`,
  *then* `preview` stays. `test/served-artifacts.test.ts`
- **QA69-E2 an exit inside the startup second deletes nothing.** *Given* `preview` at port 4173, *when* the agent
  starts a line that prints `http://localhost:4173/` and exits at once, *then* `preview` stays.
  `test/served-artifacts.test.ts`
- **QA69-E3 a process that printed no address deletes nothing**, and the agent's `background stop` result is
  `{"stopped":true}` with no `deletedArtifacts`. `test/served-artifacts.test.ts`
- **QA69-E4 a subagent's process.** *Given* the lead's chat has `preview` and a helper started the process, *when*
  it exits, *then* `preview`, which belongs to the chat at the root, is deleted. `test/served-artifacts.test.ts`
- **QA69-E5 matching.** `localhost` and `127.0.0.1` match on the same port; another port, a Markdown or HTML
  artifact holding the same address, and an address without a port against a link on 4173 don't match; an
  `https://localhost` artifact without a port is port 443 and an `http://localhost` one port 80.
  `test/unit/served-artifacts.test.ts`
