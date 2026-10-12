use std::path::Path;

use kvman_desktop::messages::{catalog, Language};
use kvman_desktop::session::{workspace_url, Action, Happening, Session};

const RUNNING: &str = r#"{"kind":"running","url":"http://127.0.0.1:3737/?workspace=home","port":3737}"#;
const MOVED: &str = r#"{"kind":"running","url":"http://127.0.0.1:3999/?workspace=home","port":3999}"#;
const RESTARTING: &str = r#"{"kind":"restarting"}"#;
const TRUST: &str =
    r#"{"kind":"trust","language":"en","versions":[{"name":"kvnotes","version":"1.2.0","source":"npm:1.2.0"},{"name":"my-tool","version":"0.1.0","source":"path:/dev/my-tool"}]}"#;
const DECLINED: &str = r#"{"kind":"failed","language":"en","problem":{"code":"EXTENSION_INVALID","message":"These extension versions weren't accepted."}}"#;

fn session() -> Session {
    Session::new(Path::new("/h"))
}

fn line(session: &mut Session, text: &str) -> Vec<Action> {
    session.handle(Happening::Line(text.to_owned()))
}

fn english(key: &str) -> &'static str {
    &catalog(Language::English)[key]
}

/// A session whose window is past the home screen, in the workspace `w1`.
fn in_the_app() -> Session {
    let mut session = session();
    assert_eq!(line(&mut session, RUNNING), [Action::ShowHome]);
    assert_eq!(session.handle(Happening::Chosen("w1".into())), [Action::Load("http://127.0.0.1:3737/?workspace=w1".into())]);
    session
}

fn notice_title(actions: &[Action]) -> &str {
    match actions.first() {
        Some(Action::ShowNotice(notice)) => &notice.title,
        _ => "",
    }
}

#[test]
fn m3_2_h1_a_second_launch_focuses_the_open_window_and_starts_nothing() {
    let mut session = in_the_app();
    assert_eq!(session.handle(Happening::SecondLaunch), [Action::FocusWindow]);
}

#[test]
fn m3_2_h2_a_trust_line_shows_the_dialog_and_accept_and_quit_answer_it() {
    let mut accepting = session();
    let shown = line(&mut accepting, TRUST);
    let [Action::ShowTrust(dialog)] = shown.as_slice() else { panic!("{shown:?}") };
    assert!(dialog.body.contains("  • kvnotes@1.2.0 (npm:1.2.0)\n  • my-tool@0.1.0 (path:/dev/my-tool)"));
    assert_eq!(
        (dialog.decline.as_str(), dialog.accept.as_str()),
        (english("desktop.quit"), english("desktop.trust.accept"))
    );
    assert_eq!(accepting.handle(Happening::TrustAnswered(true)), [Action::WriteLine(r#"{"trust":true}"#)]);
    assert_eq!(line(&mut accepting, RUNNING), [Action::ShowHome]);

    let mut quitting = session();
    line(&mut quitting, TRUST);
    assert_eq!(quitting.handle(Happening::TrustAnswered(false)), [Action::WriteLine(r#"{"trust":false}"#)]);
    assert_eq!(line(&mut quitting, DECLINED), [Action::Quit]);
    assert_eq!(quitting.handle(Happening::KvmanEnded), []);
}

#[test]
fn m3_2_h3_a_failed_line_shows_the_problem_with_its_hint_and_quit_quits() {
    let mut arabic = session();
    let shown = line(
        &mut arabic,
        r#"{"kind":"failed","language":"ar","problem":{"code":"PORT_IN_USE","message":"The port 3737 is already in use.","params":{"port":3737}}}"#,
    );
    let [Action::ShowNotice(notice)] = shown.as_slice() else { panic!("{shown:?}") };
    let own = catalog(Language::Arabic);
    assert_eq!(notice.title, own["desktop.failed.title"]);
    assert_eq!(
        notice.body,
        format!("PORT_IN_USE: The port 3737 is already in use.\n\n{}", own["desktop.failed.hint.PORT_IN_USE"])
    );
    assert_eq!(notice.button, own["desktop.quit"]);
    assert_eq!(arabic.handle(Happening::KvmanEnded), []);
    assert_eq!(arabic.handle(Happening::NoticeClosed), [Action::Quit]);

    let mut other = session();
    let shown = line(
        &mut other,
        r#"{"kind":"failed","language":"en","problem":{"code":"INTERNAL","message":"Something broke."}}"#,
    );
    let [Action::ShowNotice(notice)] = shown.as_slice() else { panic!("{shown:?}") };
    assert_eq!(notice.title, english("desktop.failed.title"));
    assert!(notice.body.starts_with("INTERNAL: Something broke.\n\n") && notice.body.contains("/h/logs/kvman.log"));

    let mut unknown = session();
    let shown = line(
        &mut unknown,
        r#"{"kind":"failed","problem":{"code":"KVMAN_RUNNING","message":"Another kvman is still starting."}}"#,
    );
    assert_eq!(notice_title(&shown), english("desktop.failed.title"));
}

#[test]
fn m3_2_h5_a_choice_loads_that_workspace_in_the_window() {
    let mut session = session();
    line(&mut session, RUNNING);
    assert_eq!(
        session.handle(Happening::Chosen("0199-a b".into())),
        [Action::Load("http://127.0.0.1:3737/?workspace=0199-a%20b".into())]
    );
    assert_eq!(workspace_url(3737, "home"), "http://127.0.0.1:3737/?workspace=home");
    assert_eq!(workspace_url(1, "a/b&c=d"), "http://127.0.0.1:1/?workspace=a%2Fb%26c%3Dd");
    assert_eq!(session.handle(Happening::Chosen("again".into())), []);
}

#[test]
fn m3_2_h11_a_joined_line_shows_the_home_screen_and_closing_leaves_that_kvman_running() {
    let mut session = session();
    assert_eq!(
        line(&mut session, r#"{"kind":"joined","url":"http://127.0.0.1:4100/?workspace=home","port":4100}"#),
        [Action::ShowHome]
    );
    assert_eq!(session.port(), Some(4100));
    assert_eq!(session.handle(Happening::KvmanEnded), []);
    assert_eq!(session.handle(Happening::Chosen("w1".into())), [Action::Load("http://127.0.0.1:4100/?workspace=w1".into())]);
    assert_eq!(session.handle(Happening::WindowClosed), [Action::Quit]);
}

#[test]
fn m3_2_h12_another_origin_in_the_window_opens_in_the_browser_and_the_window_goes_back() {
    let mut session = in_the_app();
    assert_eq!(session.handle(Happening::PageStarted("http://127.0.0.1:3737/kvwebui/settings".into())), []);
    assert_eq!(session.handle(Happening::PageStarted("tauri://localhost/index.html".into())), []);
    let away = session.handle(Happening::PageStarted("https://example.com/docs".into()));
    assert_eq!(
        away,
        [Action::OpenInBrowser("https://example.com/docs".into()), Action::Load("http://127.0.0.1:3737/".into())]
    );
}

#[test]
fn m3_2_h14_a_running_line_with_another_port_moves_the_window() {
    let mut moved = in_the_app();
    assert_eq!(line(&mut moved, RESTARTING), []);
    assert_eq!(line(&mut moved, MOVED), [Action::Load("http://127.0.0.1:3999/?workspace=home".into())]);
    assert_eq!(moved.port(), Some(3999));

    let mut same = in_the_app();
    assert_eq!(line(&mut same, RESTARTING), []);
    assert_eq!(line(&mut same, RUNNING), []);
}

#[test]
fn m3_2_h15_a_kvman_that_ends_by_itself_shows_the_dialog_that_names_the_log_file() {
    let mut session = in_the_app();
    let shown = session.handle(Happening::KvmanEnded);
    let [Action::ShowNotice(notice)] = shown.as_slice() else { panic!("{shown:?}") };
    assert_eq!(notice.title, english("desktop.stopped.title"));
    assert!(notice.body.contains("/h/logs/kvman.log"));
    assert_eq!(notice.button, english("desktop.quit"));
    assert_eq!(session.handle(Happening::NoticeClosed), [Action::Quit]);
}

#[test]
fn m3_2_e2_a_line_the_shell_cannot_read_ends_the_session() {
    let mut session = in_the_app();
    let shown = line(&mut session, "nonsense");
    assert_eq!(notice_title(&shown), english("desktop.stopped.title"));
    assert_eq!(shown.get(1), Some(&Action::StopKvman));
    assert_eq!(shown.len(), 2);
    assert_eq!(line(&mut session, RUNNING), []);
    assert_eq!(session.handle(Happening::KvmanEnded), []);
    assert_eq!(session.handle(Happening::NoticeClosed), [Action::Quit]);
}

#[test]
fn m3_2_e5_a_kvman_that_ends_before_any_line_shows_the_stopped_dialog() {
    let mut session = session();
    assert_eq!(notice_title(&session.handle(Happening::KvmanEnded)), english("desktop.stopped.title"));
}

#[test]
fn m3_2_e6_at_a_restart_the_first_button_is_dont_run_and_the_window_stays() {
    let mut session = in_the_app();
    line(&mut session, RESTARTING);
    let shown = line(&mut session, TRUST);
    let [Action::ShowTrust(dialog)] = shown.as_slice() else { panic!("{shown:?}") };
    assert_eq!((dialog.decline.as_str(), dialog.accept.as_str()), ("Don't run", english("desktop.trust.accept")));
    assert_eq!(session.handle(Happening::TrustAnswered(false)), [Action::WriteLine(r#"{"trust":false}"#)]);
    assert_eq!(line(&mut session, RUNNING), []);
    assert_eq!(session.handle(Happening::SecondLaunch), [Action::FocusWindow]);
}

#[test]
fn m3_2_e7_a_decline_at_a_restart_that_cannot_be_undone_is_a_failed_start() {
    let mut session = in_the_app();
    line(&mut session, RESTARTING);
    line(&mut session, TRUST);
    session.handle(Happening::TrustAnswered(false));
    let shown = line(&mut session, DECLINED);
    let [Action::ShowNotice(notice)] = shown.as_slice() else { panic!("{shown:?}") };
    assert_eq!(notice.title, english("desktop.failed.title"));
    assert!(notice.body.ends_with(english("desktop.failed.hint.EXTENSION_INVALID")));
    assert_eq!(session.handle(Happening::NoticeClosed), [Action::Quit]);
}

#[test]
fn m3_2_e8_a_second_launch_while_kvman_starts_or_a_dialog_is_open_only_focuses() {
    let mut starting = session();
    assert_eq!(starting.handle(Happening::SecondLaunch), [Action::FocusWindow]);
    let mut asking = session();
    line(&mut asking, TRUST);
    assert_eq!(asking.handle(Happening::SecondLaunch), [Action::FocusWindow]);
}

#[test]
fn m3_2_e9_closing_the_window_while_kvman_starts() {
    let mut session = session();
    assert_eq!(session.handle(Happening::WindowClosed), [Action::StopKvman]);
    assert_eq!(line(&mut session, RUNNING), []);
    assert_eq!(session.handle(Happening::WindowClosed), []);
    assert_eq!(session.handle(Happening::KvmanEnded), [Action::Quit]);
}

#[test]
fn m3_2_e17_a_port_that_changes_while_the_home_screen_shows() {
    let mut session = session();
    line(&mut session, RUNNING);
    assert_eq!(line(&mut session, RESTARTING), []);
    assert_eq!(line(&mut session, MOVED), []);
    assert_eq!(session.handle(Happening::Chosen("w1".into())), [Action::Load("http://127.0.0.1:3999/?workspace=w1".into())]);
}

#[test]
fn m3_2_e21_the_stop_the_app_asked_for_shows_no_dialog() {
    let mut session = in_the_app();
    assert_eq!(session.handle(Happening::WindowClosed), [Action::StopKvman]);
    assert_eq!(session.handle(Happening::KvmanEnded), [Action::Quit]);
}

/// A session on the home screen of a kvman it owns.
fn at_home() -> Session {
    let mut session = session();
    line(&mut session, RUNNING);
    session
}

#[test]
fn m3_3_h5_kvman_is_stopped_only_once_the_update_is_downloaded_and_then_it_is_installed() {
    let mut session = at_home();
    assert_eq!(session.handle(Happening::UpdateDownloaded), [Action::StopKvman]);
    assert_eq!(session.handle(Happening::KvmanEnded), [Action::InstallUpdate]);
    assert_eq!(session.handle(Happening::WindowClosed), []);
}

#[test]
fn m3_3_h6_a_deb_installs_download_opens_the_release_page() {
    let mut session = at_home();
    assert_eq!(
        session.handle(Happening::UpdateDownloadAsked),
        [Action::OpenInBrowser("https://github.com/ibndeif/kvman/releases/latest".into())]
    );
    assert_eq!(session.handle(Happening::Chosen("w1".into())), [Action::Load("http://127.0.0.1:3737/?workspace=w1".into())]);
}

#[test]
fn m3_3_e6_an_update_while_the_app_has_joined_a_kvman_stops_nothing() {
    let mut session = session();
    line(&mut session, r#"{"kind":"joined","url":"http://127.0.0.1:4100/?workspace=home","port":4100}"#);
    session.handle(Happening::KvmanEnded);
    assert_eq!(session.handle(Happening::UpdateDownloaded), [Action::InstallUpdate]);
}

#[test]
fn m3_3_e7_an_update_that_cannot_be_installed_after_kvman_stopped_says_so_and_quits() {
    let mut session = at_home();
    session.handle(Happening::UpdateDownloaded);
    session.handle(Happening::KvmanEnded);
    let shown = session.handle(Happening::UpdateInstallFailed);
    let [Action::ShowNotice(notice)] = shown.as_slice() else { panic!("{shown:?}") };
    assert_eq!(notice.title, "The update could not be installed.");
    assert_eq!(notice.button, english("desktop.quit"));
    assert_eq!(session.handle(Happening::NoticeClosed), [Action::Quit]);
}

#[test]
fn m3_3_e8_a_workspace_chosen_after_the_download_is_not_entered() {
    let mut session = at_home();
    session.handle(Happening::UpdateDownloaded);
    assert_eq!(session.handle(Happening::Chosen("w1".into())), []);
    assert_eq!(line(&mut session, RUNNING), []);
    assert_eq!(session.handle(Happening::UpdateDownloaded), []);
}
