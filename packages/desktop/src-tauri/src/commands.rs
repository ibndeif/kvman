//! What the home screen's page may ask of the shell (plan 14 §14.5). Each call to kvman runs off the main thread.

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::app::{dispatch, Shell};
use crate::home::{self, HomeView, Opened};
use crate::kvman_api::KvmanApi;
use crate::messages::{text, Language};
use crate::session::Happening;

/// The API of the kvman the session shows, and the user's home folder as text.
fn reach(app: &AppHandle) -> Option<(KvmanApi, String)> {
    let shell = app.state::<Shell>();
    let port = shell.session.lock().ok().and_then(|session| session.port())?;
    Some((KvmanApi::new(port).ok()?, shell.user_folder.display().to_string()))
}

fn remember_language(app: &AppHandle, view: &HomeView) {
    if let Ok(mut session) = app.state::<Shell>().session.lock() {
        session.set_language(home::language_shown(view));
    }
}

async fn off_main<Output: Send + 'static>(work: impl FnOnce() -> Output + Send + 'static) -> Result<Output, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn home_load(app: AppHandle) -> Result<HomeView, String> {
    off_main(move || {
        app.state::<Shell>().wait_for_home();
        let view = reach(&app).map_or_else(home::unreachable, |(api, user_folder)| home::load(&api, &user_folder));
        remember_language(&app, &view);
        view
    })
    .await
}

#[tauri::command]
pub fn home_continue(app: AppHandle, workspace_id: String) {
    dispatch(&app, Happening::Chosen(workspace_id));
}

#[tauri::command]
pub async fn home_remove(app: AppHandle, workspace_id: String) -> Result<HomeView, String> {
    off_main(move || reach(&app).map_or_else(home::unreachable, |(api, user_folder)| home::remove(&api, &user_folder, &workspace_id))).await
}

#[tauri::command]
pub async fn home_open_folder(app: AppHandle) -> Result<HomeView, String> {
    off_main(move || {
        let Some((api, user_folder)) = reach(&app) else { return home::unreachable() };
        let language = app.state::<Shell>().session.lock().map_or(Language::English, |session| session.language());
        let chosen = app
            .dialog()
            .file()
            .set_title(text(language, "desktop.home.openTitle"))
            .set_directory(&user_folder)
            .blocking_pick_folder();
        let folder = chosen.and_then(|folder| folder.into_path().ok()).map(|folder| folder.display().to_string());
        match home::open_folder(&api, &user_folder, folder.as_deref()) {
            Opened::Stay(view) => view,
            Opened::Continue(workspace_id) => {
                let view = home::load(&api, &user_folder);
                dispatch(&app, Happening::Chosen(workspace_id));
                view
            }
        }
    })
    .await
}
