# The desktop app

This page is for people who use kvman in its own window instead of a browser tab. When you finish, you will know what the app shows when it starts, how it asks about extensions, and what closing it does.

The desktop app runs the same kvman as `npm i -g kvman` does. It starts kvman for you, with its own Node.js, so you don't need a terminal. Everything inside the window is the same web app ([web-app.md](web-app.md)).

The installers aren't published yet. For now the app runs from kvman's repository (see the repository's README).

## Starting

1. The window opens and shows a progress mark while kvman starts.
2. If your preset names extensions that aren't bundled and that you haven't accepted, a dialog lists them and asks **Run them?** **Accept** runs them. **Quit** closes the app, and nothing runs.
3. If kvman can't start, a dialog says **kvman could not start**, with the error code, its message, and a hint ([troubleshooting.md](troubleshooting.md)). **Quit** closes the app.
4. Otherwise you see the home screen.

Starting the app a second time brings up the window that is already open.

## The home screen

```text
Choose a workspace

🏠 Home             ~
📁 clinic-notes     ~/work/clinic-notes   ✕
📁 my-app           ~/projects/my-app      ✕

[ Open a folder… ]
```

- Click a row to open that workspace. The window becomes the app from then on, and the workspace picker in the top bar switches workspaces ([workspaces.md](workspaces.md)).
- **✕** closes a workspace without asking. Its data is kept, and it comes back when you open its folder again.
- **Open a folder…** opens your system's folder dialog. The chosen folder opens at once.

The home screen shows again at the next launch. It follows kvman's language and theme.

## While you work

- A link to another site opens in your system's browser, never in a second window.
- A downloaded file is saved in your Downloads folder. A name that is taken there gets a number, such as `report (1).pdf`, so nothing is replaced.
- In the chat's send box on Linux, Ctrl+V with a copied image (a screenshot, say) attaches it. If the clipboard can't be read, a message says to use the attach button.
- When kvman restarts after a change to its extensions, the window stays and the app comes back by itself.

## Closing

Closing the window stops kvman, then the app quits. If kvman was already running when you opened the app (for example in a terminal), the app used that kvman instead of starting its own: closing the window then leaves it running.

If kvman stops unexpectedly while the window is open, a dialog says so and names the log file, `logs/kvman.log` in your home folder.

## Apps built on kvman

A product built on kvman can be a desktop app of its own, with its own name and icon. Such an app opens straight into the product, with no home screen. It keeps its own data in a folder of its own (`~/.<its id>`), so it never shares chats, keys, or workspaces with kvman. It doesn't update itself: a new version is a new installer from whoever made it.

## Next

- [web-app.md](web-app.md)
- [workspaces.md](workspaces.md)
