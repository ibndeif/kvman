#![allow(clippy::unwrap_used)]

mod support;

use std::path::Path;

use kvman_desktop::home::{display_folder, load, open_folder, problem_text, remove, HomeRow, Opened};
use kvman_desktop::kvman_api::KvmanApi;
use kvman_desktop::lines::Problem;
use kvman_desktop::messages::{catalog, Catalog, Language};
use kvman_desktop::session::{Action, Happening, Session};
use serde_json::json;
use support::{catalog as kvman_catalog, output, settings, workspaces, FakeKvman, CLOSE, LIST, NOT_FOUND, OPEN, SETTINGS};

const USER: &str = "/home/ahmed";
const THREE: [(&str, &str, &str); 3] = [
    ("home", "ahmed", "/home/ahmed"),
    ("0199-a", "notes", "/home/ahmed/work/notes"),
    ("0199-b", "data", "/srv/data"),
];
const INVALID: &str = r#"{"ok":false,"problem":{"code":"VALIDATION_FAILED","message":"The path is not a folder."}}"#;

fn row(id: &str, name: &str, folder: &str) -> HomeRow {
    HomeRow {
        id: id.into(),
        name: name.into(),
        folder: folder.into(),
        home: id == "home",
    }
}

fn english_errors() -> String {
    kvman_catalog(&[
        ("kernel.errors.NOT_FOUND", "No {thing} was found."),
        ("kernel.errors.VALIDATION_FAILED", "That is not valid."),
    ])
}

#[test]
fn m3_2_h4_a_running_line_shows_the_home_screen_home_first() {
    let kvman = FakeKvman::start(&[(LIST, &[workspaces(&THREE)]), (SETTINGS, &[settings(&[])])]);
    let mut session = Session::new(Path::new("/h"));
    let running = format!(r#"{{"kind":"running","url":"http://127.0.0.1:{0}/?workspace=home","port":{0}}}"#, kvman.port);
    assert_eq!(session.handle(Happening::Line(running)), [Action::ShowHome]);
    let view = load(&KvmanApi::new(session.port().unwrap()).unwrap(), USER);
    assert_eq!(
        view.rows,
        [row("home", "ahmed", "~"), row("0199-a", "notes", "~/work/notes"), row("0199-b", "data", "/srv/data")]
    );
    assert_eq!((view.language, view.theme, view.failure.as_deref()), ("en", "system", None));
    assert_eq!(&view.texts, catalog(Language::English));
    let sent = serde_json::to_value(&view).unwrap();
    assert_eq!(sent["rows"][0], json!({ "id": "home", "name": "ahmed", "folder": "~", "home": true }));
    assert_eq!(sent["failure"], json!(null));
}

#[test]
fn m3_2_h6_remove_closes_the_workspace_and_reads_the_list_again() {
    let kvman = FakeKvman::start(&[(LIST, &[workspaces(&[THREE[0], THREE[2]])]), (CLOSE, &[output("{}")]), (SETTINGS, &[settings(&[])])]);
    let view = remove(&KvmanApi::new(kvman.port).unwrap(), USER, "0199-a");
    assert_eq!(kvman.bodies(CLOSE), [r#"{"input":{"workspaceId":"0199-a"}}"#]);
    assert_eq!(view.rows, [row("home", "ahmed", "~"), row("0199-b", "data", "/srv/data")]);
    assert_eq!(view.failure, None);
    let order: Vec<String> = kvman.requests().iter().map(|request| request.line.clone()).collect();
    assert!(order[0].contains(CLOSE) && order.iter().skip(1).any(|line| line.contains(LIST)));
}

#[test]
fn m3_2_h7_open_a_folder_opens_the_chosen_folder_and_continues_into_it() {
    let kvman = FakeKvman::start(&[(OPEN, &[output(r#"{"id":"0199-c","name":"clinic","path":"/work/clinic"}"#)])]);
    let opened = open_folder(&KvmanApi::new(kvman.port).unwrap(), USER, Some("/work/clinic"));
    assert_eq!(opened, Opened::Continue("0199-c".into()));
    assert_eq!(kvman.bodies(OPEN), [r#"{"input":{"path":"/work/clinic"}}"#]);
    let mut session = Session::new(Path::new("/h"));
    session.handle(Happening::Line(r#"{"kind":"running","url":"http://127.0.0.1:3737/?workspace=home","port":3737}"#.into()));
    assert_eq!(
        session.handle(Happening::Chosen("0199-c".into())),
        [Action::Load("http://127.0.0.1:3737/?workspace=0199-c".into())]
    );
}

#[test]
fn m3_2_h8_a_call_that_fails_shows_its_problems_translated_text_and_the_list_stays() {
    let kvman = FakeKvman::start(&[
        (LIST, &[workspaces(&THREE)]),
        (CLOSE, &[NOT_FOUND.to_owned()]),
        (SETTINGS, &[settings(&[])]),
        ("/api/locales/en", &[english_errors()]),
    ]);
    let view = remove(&KvmanApi::new(kvman.port).unwrap(), USER, "0199-a");
    assert_eq!(view.failure.as_deref(), Some("No workspace was found."));
    assert_eq!(view.rows.len(), 3);
}

#[test]
fn m3_2_h9_the_home_screen_follows_kernel_language() {
    let arabic = FakeKvman::start(&[(LIST, &[workspaces(&THREE)]), (SETTINGS, &[settings(&[("kernel.language", "ar")])])]);
    let view = load(&KvmanApi::new(arabic.port).unwrap(), USER);
    assert_eq!(view.language, "ar");
    assert_eq!(&view.texts, catalog(Language::Arabic));
    let french = FakeKvman::start(&[(LIST, &[workspaces(&THREE)]), (SETTINGS, &[settings(&[("kernel.language", "fr")])])]);
    let view = load(&KvmanApi::new(french.port).unwrap(), USER);
    assert_eq!(view.language, "en");
    assert_eq!(&view.texts, catalog(Language::English));
}

#[test]
fn m3_2_h10_kvwebui_theme_chooses_the_colours() {
    for (stored, shown) in [(Some("light"), "light"), (Some("dark"), "dark"), (Some("system"), "system"), (None, "system")] {
        let values: Vec<(&str, &str)> = stored.map(|theme| ("kvwebui.theme", theme)).into_iter().chain([("kernel.port", "3737")]).collect();
        let kvman = FakeKvman::start(&[(LIST, &[workspaces(&THREE)]), (SETTINGS, &[settings(&values)])]);
        assert_eq!(load(&KvmanApi::new(kvman.port).unwrap(), USER).theme, shown, "{stored:?}");
    }
}

#[test]
fn m3_2_e12_a_folder_is_shown_with_a_tilde_only_under_the_users_home_folder() {
    assert_eq!(display_folder("/home/ahmed", "/home/ahmed", '/'), "~");
    assert_eq!(display_folder("/home/ahmed/work/x", "/home/ahmed", '/'), "~/work/x");
    assert_eq!(display_folder("/home/ahmed/work/x", "/home/ahmed/", '/'), "~/work/x");
    assert_eq!(display_folder("/home/ahmedx/y", "/home/ahmed", '/'), "/home/ahmedx/y");
    assert_eq!(display_folder("/srv/data", "/home/ahmed", '/'), "/srv/data");
    assert_eq!(display_folder(r"C:\Users\ahmed\work", r"C:\Users\ahmed", '\\'), r"~\work");
    assert_eq!(display_folder(r"C:\Users\ahmed", r"C:\Users\ahmed", '\\'), "~");
}

#[test]
fn m3_2_e13_an_answer_that_is_not_the_envelope_shows_the_general_failure_text() {
    let kvman = FakeKvman::start(&[
        (LIST, &[workspaces(&THREE)]),
        (CLOSE, &["not json".to_owned()]),
        (SETTINGS, &[settings(&[("kernel.language", "ar")])]),
    ]);
    let view = remove(&KvmanApi::new(kvman.port).unwrap(), USER, "0199-a");
    assert_eq!(view.failure.as_ref(), Some(&catalog(Language::Arabic)["desktop.home.failure"]));
    assert_eq!(view.rows.len(), 3);

    let silent = FakeKvman::start(&[(LIST, &["not json".to_owned()]), (SETTINGS, &["not json".to_owned()])]);
    let view = load(&KvmanApi::new(silent.port).unwrap(), USER);
    assert_eq!(view.failure.as_ref(), Some(&catalog(Language::English)["desktop.home.failure"]));
    assert_eq!((view.rows.len(), view.language, view.theme), (0, "en", "system"));
}

#[test]
fn m3_2_e14_a_problems_text_params_an_extensions_code_and_a_missing_key() {
    let texts: Catalog = [
        ("kernel.errors.NOT_FOUND", "No {thing} was found, of {count}."),
        ("kvcoder.errors.BUSY", "The agent is busy."),
    ]
    .into_iter()
    .map(|(key, text)| (key.to_owned(), text.to_owned()))
    .collect();
    let problem = |code: &str, params: serde_json::Value| Problem {
        code: code.into(),
        message: "The English message.".into(),
        params: params.as_object().cloned(),
    };
    assert_eq!(
        problem_text(&texts, &problem("NOT_FOUND", json!({ "thing": "workspace", "count": 3 }))),
        "No workspace was found, of 3."
    );
    assert_eq!(problem_text(&texts, &problem("kvcoder/BUSY", json!(null))), "The agent is busy.");
    assert_eq!(problem_text(&texts, &problem("TOO_LARGE", json!({}))), "The English message.");
}

#[test]
fn m3_2_e15_a_cancelled_folder_dialog_changes_nothing() {
    let kvman = FakeKvman::start(&[(LIST, &[workspaces(&THREE)]), (SETTINGS, &[settings(&[])])]);
    let Opened::Stay(view) = open_folder(&KvmanApi::new(kvman.port).unwrap(), USER, None) else {
        panic!("A cancelled dialog continued.")
    };
    assert_eq!((view.rows.len(), view.failure), (3, None));
    assert!(kvman.bodies(OPEN).is_empty());
}

#[test]
fn m3_2_e16_a_folder_that_cannot_be_opened_shows_its_text_and_stays() {
    let kvman = FakeKvman::start(&[
        (LIST, &[workspaces(&THREE)]),
        (OPEN, &[INVALID.to_owned()]),
        (SETTINGS, &[settings(&[])]),
        ("/api/locales/en", &[english_errors()]),
    ]);
    let Opened::Stay(view) = open_folder(&KvmanApi::new(kvman.port).unwrap(), USER, Some("/nowhere")) else {
        panic!("A folder that failed continued.")
    };
    assert_eq!(view.failure.as_deref(), Some("That is not valid."));
    assert_eq!(view.rows.len(), 3);
}
