//! The home screen as the page shows it (plan 14 §14.5): the open workspaces with Home first, kvman's language, and
//! kvwebui's theme, read from kvman; and what its buttons do.

use serde::Serialize;

use crate::kvman_api::{ApiFailure, KvmanApi, Setting, Workspace};
use crate::lines::Problem;
use crate::messages::{catalog, fill, text, Catalog, Language};

const HOME_ID: &str = "home";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HomeRow {
    pub id: String,
    pub name: String,
    pub folder: String,
    pub home: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HomeView {
    pub language: &'static str,
    pub theme: &'static str,
    pub texts: Catalog,
    pub rows: Vec<HomeRow>,
    pub failure: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Opened {
    /// The folder is open as this workspace, and the window continues into it.
    Continue(String),
    Stay(HomeView),
}

/// A folder under the user's home folder is shown with `~`.
pub fn display_folder(path: &str, user_folder: &str, separator: char) -> String {
    let home = user_folder.trim_end_matches(separator);
    match path.strip_prefix(home) {
        Some("") => "~".to_owned(),
        Some(rest) if rest.starts_with(separator) => format!("~{rest}"),
        _ => path.to_owned(),
    }
}

fn setting<'a>(settings: &'a [Setting], key: &str) -> Option<&'a str> {
    settings.iter().find(|setting| setting.key == key).and_then(|setting| setting.value.as_str())
}

/// `kvwebui.theme`, or the system's when the preset has no kvwebui.
pub fn theme_of(settings: &[Setting]) -> &'static str {
    match setting(settings, "kvwebui.theme") {
        Some("light") => "light",
        Some("dark") => "dark",
        _ => "system",
    }
}

pub fn language_of(settings: &[Setting]) -> Language {
    Language::of(setting(settings, "kernel.language"))
}

/// A Problem's translated text, `<namespace>.errors.<CODE>` with its params, or its own English message (§6.7).
pub fn problem_text(kvman_catalog: &Catalog, problem: &Problem) -> String {
    let (namespace, code) = problem.code.split_once('/').unwrap_or(("kernel", &problem.code));
    let Some(translated) = kvman_catalog.get(&format!("{namespace}.errors.{code}")) else {
        return problem.message.clone();
    };
    let shown: Vec<(String, String)> = problem
        .params
        .iter()
        .flatten()
        .map(|(name, value)| (name.clone(), value.as_str().map_or_else(|| value.to_string(), str::to_owned)))
        .collect();
    let params: Vec<(&str, &str)> = shown.iter().map(|(name, value)| (name.as_str(), value.as_str())).collect();
    fill(translated, &params)
}

fn failure_text(api: &KvmanApi, language: Language, failure: &ApiFailure) -> String {
    match failure {
        ApiFailure::Problem(problem) => api
            .catalog(language.code())
            .map_or_else(|_| problem.message.clone(), |kvman_catalog| problem_text(&kvman_catalog, problem)),
        ApiFailure::Unreadable => text(language, "desktop.home.failure"),
    }
}

fn row_of(workspace: Workspace, user_folder: &str, separator: char) -> HomeRow {
    HomeRow {
        home: workspace.id == HOME_ID,
        folder: display_folder(&workspace.path, user_folder, separator),
        id: workspace.id,
        name: workspace.name,
    }
}

fn view(api: &KvmanApi, user_folder: &str, failed: Option<&ApiFailure>) -> HomeView {
    let settings = api.settings();
    let language = settings.as_deref().map_or(Language::English, language_of);
    let workspaces = api.workspaces();
    let first_failure = failed.or(settings.as_ref().err()).or(workspaces.as_ref().err());
    HomeView {
        language: language.code(),
        theme: settings.as_deref().map_or("system", theme_of),
        texts: catalog(language).clone(),
        failure: first_failure.map(|failure| failure_text(api, language, failure)),
        rows: workspaces
            .unwrap_or_default()
            .into_iter()
            .map(|workspace| row_of(workspace, user_folder, std::path::MAIN_SEPARATOR))
            .collect(),
    }
}

/// The home screen of a kvman that can't be reached at all.
pub fn unreachable() -> HomeView {
    let language = Language::English;
    HomeView {
        language: language.code(),
        theme: "system",
        texts: catalog(language).clone(),
        rows: Vec::new(),
        failure: Some(text(language, "desktop.home.failure")),
    }
}

pub fn load(api: &KvmanApi, user_folder: &str) -> HomeView {
    view(api, user_folder, None)
}

/// Closes the workspace and reads the list again; a failure is shown above the list (§14.5).
pub fn remove(api: &KvmanApi, user_folder: &str, workspace_id: &str) -> HomeView {
    view(api, user_folder, api.close_workspace(workspace_id).err().as_ref())
}

/// Opens the folder the dialog answered. A cancelled dialog changes nothing.
pub fn open_folder(api: &KvmanApi, user_folder: &str, chosen: Option<&str>) -> Opened {
    match chosen.map(|folder| api.open_workspace(folder)) {
        None => Opened::Stay(load(api, user_folder)),
        Some(Ok(workspace)) => Opened::Continue(workspace.id),
        Some(Err(failure)) => Opened::Stay(view(api, user_folder, Some(&failure))),
    }
}

/// The language of a home screen, for the session's later dialogs.
pub fn language_shown(view: &HomeView) -> Language {
    Language::of(Some(view.language))
}
