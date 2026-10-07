# kvman desktop

The desktop app's shell: a [Tauri](https://tauri.app) app that runs kvman as a program and shows it in a window. The specification is [`plan/14-desktop.md`](../../plan/14-desktop.md), and its decisions are in [ADR 0038](../../plan/adr/0038-desktop-app.md).

It holds no kvman logic and imports nothing of kvman's. It starts `kvman --pipe --no-open`, reads the lines kvman writes, and calls kvman's HTTP API on `127.0.0.1`.

| Folder | Holds |
|---|---|
| `src-tauri/src` | The shell, in Rust. `session` decides what to do about each line, button, and window event; the modules beside it carry that out. |
| `src-tauri/tests` | Its tests, against a fake kvman program and a fake of kvman's API. |
| `src` and `page` | The home screen's page: TypeScript, one HTML file, and a stylesheet with kvwebui's colours. |
| `locales` | The shell's own text, in English and Arabic. |
| `test` | The page's tests. |

From the repository's root:

```
pnpm build && pnpm desktop:dev    # run the app against the repository's kvman
pnpm desktop:check                # cargo fmt --check, cargo clippy, cargo test
```

It needs Rust with `rustfmt` and `clippy`, and on Linux the libraries in [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/).
