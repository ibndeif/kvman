//! The app itself: the window, the dialogs, and kvman's process, doing what the session says (plan 14 §14.4 to
//! §14.6). Nothing is decided here.

use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;

use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

use crate::commands;
use crate::downloads::destination;
use crate::kvman_process::{spawn, start_command, with_brand, KvmanProcess, Platform};
use crate::runtime::{brand_home, brand_of, brand_preset, choose_runtime, kvman_home, Brand};
use crate::session::{Action, Happening, Session};
use crate::updates::DownloadedUpdate;

const WINDOW: &str = "main";
/// The stop sequence's own budget is 10 seconds (plan 02 §2.14).
const STOP_WAIT: Duration = Duration::from_secs(15);

pub struct Shell {
    pub session: Mutex<Session>,
    pub user_folder: PathBuf,
    /// kvman's home folder: the brand's own for a branded app (plan 14 §14.9).
    home: PathBuf,
    brand: Option<Brand>,
    pub downloaded_update: Mutex<Option<DownloadedUpdate>>,
    process: Mutex<Option<Arc<KvmanProcess>>>,
    home_shown: (Mutex<bool>, Condvar),
}

impl Shell {
    /// Blocks until the session has said to show the home screen.
    pub fn wait_for_home(&self) {
        let (shown, changed) = &self.home_shown;
        if let Ok(guard) = shown.lock() {
            // A poisoned lock means a thread died while the app was starting; the caller then finds no port.
            drop(changed.wait_while(guard, |shown| !*shown));
        }
    }

    fn show_home(&self) {
        let (shown, changed) = &self.home_shown;
        if let Ok(mut guard) = shown.lock() {
            *guard = true;
            changed.notify_all();
        }
    }

    fn process(&self) -> Option<Arc<KvmanProcess>> {
        self.process.lock().ok().and_then(|process| process.clone())
    }

    /// The name on the window and the dialogs: the brand's, or kvman's.
    fn title(&self) -> &str {
        self.brand.as_ref().map_or("kvman", |brand| brand.name.as_str())
    }
}

pub fn dispatch(app: &AppHandle, happening: Happening) {
    let shell = app.state::<Shell>();
    let actions = shell.session.lock().map_or_else(|_| vec![Action::Quit], |mut session| session.handle(happening));
    for action in actions {
        perform(app, &shell, action);
    }
}

fn perform(app: &AppHandle, shell: &Shell, action: Action) {
    let window = app.get_webview_window(WINDOW);
    match action {
        Action::FocusWindow => {
            if let Some(window) = window {
                // A window that can't be raised stays where it is; there is nothing else to do about it.
                let _raised = window.unminimize().and_then(|()| window.show()).and_then(|()| window.set_focus());
            }
        }
        Action::ShowTrust(dialog) => {
            let handle = app.clone();
            let buttons = MessageDialogButtons::OkCancelCustom(dialog.accept, dialog.decline);
            app.dialog()
                .message(dialog.body)
                .title(shell.title())
                .kind(MessageDialogKind::Warning)
                .buttons(buttons)
                .show(move |accepted| dispatch(&handle, Happening::TrustAnswered(accepted)));
        }
        Action::ShowNotice(notice) => {
            let handle = app.clone();
            let buttons = MessageDialogButtons::OkCustom(notice.button);
            app.dialog()
                .message(notice.body)
                .title(notice.title)
                .kind(MessageDialogKind::Error)
                .buttons(buttons)
                .show(move |_| dispatch(&handle, Happening::NoticeClosed));
        }
        Action::WriteLine(line) => {
            if let Some(process) = shell.process() {
                // A kvman that is gone can't take the answer, and its end is what the session hears next.
                let _written = process.write_line(line);
            }
        }
        Action::ShowHome => shell.show_home(),
        Action::Load(url) => {
            if let (Some(window), Ok(address)) = (window, Url::parse(&url)) {
                if window.navigate(address).is_err() {
                    app.exit(1);
                }
            }
        }
        Action::OpenInBrowser(url) => {
            // An address the system can't open is left unopened; the window is already back on kvman.
            let _opened = app.opener().open_url(url, None::<&str>);
        }
        Action::StopKvman => stop_kvman(app, shell, window),
        Action::InstallUpdate => install_update(app, shell),
        Action::Quit => app.exit(0),
    }
}

fn install_update(app: &AppHandle, shell: &Shell) {
    let downloaded = shell.downloaded_update.lock().ok().and_then(|mut update| update.take());
    let handle = app.clone();
    drop(thread::spawn(move || {
        if downloaded.is_some_and(|update| update.install().is_ok()) {
            handle.restart();
        } else {
            if let Some(window) = handle.get_webview_window(WINDOW) {
                let _shown = window.show();
            }
            dispatch(&handle, Happening::UpdateInstallFailed);
        }
    }));
}

fn stop_kvman(app: &AppHandle, shell: &Shell, window: Option<tauri::WebviewWindow>) {
    if let Some(window) = window {
        // The window is going away either way; a hide that fails leaves it visible until kvman has stopped.
        let _hidden = window.hide();
    }
    let handle = app.clone();
    match shell.process() {
        // kvman's end is reported by its own reader, which makes the session quit.
        Some(process) => drop(thread::spawn(move || {
            if process.stop(STOP_WAIT).is_err() {
                handle.exit(1);
            }
        })),
        None => handle.exit(0),
    }
}

fn start_kvman(app: &AppHandle, shell: &Shell) {
    let path = std::env::var("PATH").ok();
    let resources = app.path().resource_dir().ok();
    let started = choose_runtime(resources.as_deref(), path.as_deref().unwrap_or_default(), Platform::current(), &|candidate| {
        candidate.is_file()
    })
    .and_then(|runtime| {
        let start = start_command(&runtime.node, &runtime.entry, &shell.user_folder, path.as_deref(), Platform::current());
        let start = match (&shell.brand, resources.as_deref()) {
            (Some(_), Some(folder)) => with_brand(start, &shell.home, &brand_preset(folder)),
            _ => start,
        };
        let (lines, end) = (app.clone(), app.clone());
        spawn(&start, move |line| dispatch(&lines, Happening::Line(line)), move || dispatch(&end, Happening::KvmanEnded)).ok()
    });
    match (started, shell.process.lock()) {
        (Some(process), Ok(mut held)) => *held = Some(Arc::new(process)),
        // A kvman that couldn't be started is one that ended by itself.
        _ => dispatch(app, Happening::KvmanEnded),
    }
}

fn open_window(app: &AppHandle, title: &str) -> tauri::Result<()> {
    let (new_windows, pages, downloads) = (app.clone(), app.clone(), app.clone());
    let window = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(1280.0, 800.0)
        .on_new_window(move |url, _features| {
            dispatch(&new_windows, Happening::NewWindow(url.to_string()));
            NewWindowResponse::Deny
        })
        .on_page_load(move |_window, payload| {
            if payload.event() == PageLoadEvent::Started {
                dispatch(&pages, Happening::PageStarted(payload.url().to_string()));
            }
        })
        .on_download(move |_webview, event| {
            if let DownloadEvent::Requested { destination: place, .. } = event {
                let name = place.file_name().map(|name| name.to_string_lossy().into_owned());
                if let (Ok(folder), Some(name)) = (downloads.path().download_dir(), name) {
                    *place = destination(&folder, &name);
                }
            }
            true
        })
        .build()?;
    let closing = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            dispatch(&closing, Happening::WindowClosed);
        }
    });
    Ok(())
}

pub fn run() -> tauri::Result<()> {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _arguments, _folder| dispatch(app, Happening::SecondLaunch)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::home_load,
            commands::home_continue,
            commands::home_remove,
            commands::home_open_folder
        ])
        .setup(|app| {
            let user_folder = std::env::home_dir().ok_or("This user has no home folder.")?;
            let resources = app.path().resource_dir().ok();
            let brand = brand_of(resources.as_deref(), &|file| std::fs::read_to_string(file))?;
            let home = match &brand {
                Some(brand) => brand_home(&user_folder, brand),
                None => kvman_home(std::env::var("KVMAN_HOME").ok().as_deref(), &user_folder),
            };
            let session = if brand.is_some() { Session::branded(&home) } else { Session::new(&home) };
            let title = brand.as_ref().map_or_else(|| "kvman".to_owned(), |brand| brand.name.clone());
            app.manage(Shell {
                session: Mutex::new(session),
                user_folder,
                home,
                brand,
                downloaded_update: Mutex::new(None),
                process: Mutex::new(None),
                home_shown: (Mutex::new(false), Condvar::new()),
            });
            open_window(app.handle(), &title)?;
            start_kvman(app.handle(), &app.state::<Shell>());
            Ok(())
        })
        .run(tauri::generate_context!())
}
