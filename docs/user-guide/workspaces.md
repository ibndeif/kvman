# Workspaces

This page is for anyone working with folders in kvman. You will be able to open folders as workspaces, browse for them, and understand what happens when you start a second `kvman`.

A **workspace** is a folder on disk that kvman has open. Each workspace has its own chats, settings, and data.

## Home and folders

- **Home** is built in: it is the folder kvman keeps its data in (`~/.kvman` by default). It is always open and can't be closed.
- Every other folder you open becomes a workspace with its own name (the folder's name) and its own chats and settings.
- Workspaces are remembered across restarts until you close them. Opening the same folder again gets you the same workspace back.
- Closing a workspace doesn't delete its data: its queued jobs and schedules wait until it's reopened, its running jobs finish, and calls naming it fail `NOT_FOUND`. Closing a workspace moves its browser tab to Home; a tab whose workspace was closed elsewhere learns it and moves to Home with a toast.

## Opening a folder

In the web app:

1. Click the workspace picker in the top bar (it shows the current folder's name, or **Home**).
2. Choose **Open a folder…**.
3. Use the folder browser:
   - The **Places** strip lists Home and each open workspace's folder.
   - The current path shows as clickable segments, and as a path field you can type into.
   - **Back to the folder before** and **Up one folder** buttons move around.
   - The filter box narrows the folder list; **Show hidden folders** reveals dot-folders.
   - Click a sub-folder (or use the arrow keys and Enter) to enter it. A folder that is already a workspace is marked **Open**.
   - **New folder** creates a folder inside the one shown (then you can open it).
   - **Open this folder** opens the folder shown as a workspace in this tab.

The browser starts at the open workspace's folder, or Home's folder from Home, and keeps showing the last folder while another one loads.

## One kvman per home

kvman enforces one running instance per home folder using `kvman.lock`. When one is already running:

- A second bare `kvman` in the same home **hands its folder over**: it tells the running kvman to open the folder you started it from, prints and opens that workspace's URL, and exits with code 0.
- A second `kvman` given a different `--preset` or `--mode` than the running one fails with `KVMAN_RUNNING` instead of handing over.
- If the running kvman is still starting or doesn't answer, the second one also fails `KVMAN_RUNNING`.

So you can keep one kvman and switch folders by running `kvman` again from another folder — but you get one app's worth of settings, extensions, and models per home.

## A second home

To run a separate kvman — for example with different settings or a different preset — give it a different home:

```sh
kvman --home ~/.kvman-work
```

That home has its own database, secrets, settings, and lock, and its own port.

## Next

- [models-and-providers.md](models-and-providers.md)
- [extensions.md](extensions.md)
