use kvman_desktop::navigation::{browsable, navigation, Verdict};
use kvman_desktop::session::{Action, Happening, Session};

#[test]
fn m3_2_h12_a_new_window_and_another_origin_open_in_the_systems_browser() {
    assert_eq!(navigation("http://127.0.0.1:3737/kvwebui/settings", Some(3737)), Verdict::Stay);
    assert_eq!(navigation("http://127.0.0.1:3737/?workspace=home", Some(3737)), Verdict::Stay);
    assert_eq!(navigation("https://example.com/", Some(3737)), Verdict::Browser);
    let mut session = Session::new(std::path::Path::new("/h"));
    for url in ["http://127.0.0.1:3737/x", "https://example.com/"] {
        assert_eq!(session.handle(Happening::NewWindow(url.into())), [Action::OpenInBrowser(url.into())]);
    }
}

#[test]
fn m3_2_e18_only_kvmans_own_origin_and_the_shells_own_page_stay_in_the_window() {
    for url in [
        "http://localhost:3737/",
        "http://127.0.0.1:3738/",
        "https://127.0.0.1:3737/",
        "http://127.0.0.1:3737.example.com/",
        "http://127.0.0.1:37370/",
        "http://127.0.0.1:3737@example.com/",
    ] {
        assert_eq!(navigation(url, Some(3737)), Verdict::Browser, "{url}");
    }
    assert_eq!(navigation("http://127.0.0.1:3737", Some(3737)), Verdict::Stay);
    assert_eq!(navigation("http://127.0.0.1:3737/", None), Verdict::Browser);
    for url in [
        "tauri://localhost/index.html",
        "tauri://localhost",
        "http://tauri.localhost/index.html",
        "https://tauri.localhost/",
    ] {
        assert_eq!(navigation(url, None), Verdict::Stay, "{url}");
    }
    assert_eq!(navigation("tauri://localhost.example.com/", None), Verdict::Browser);
}

#[test]
fn m3_2_e29_only_a_web_address_is_handed_to_the_systems_browser() {
    for url in ["https://example.com/", "http://example.com/a?b#c", "HTTPS://EXAMPLE.COM/", "http://127.0.0.1:9000/"] {
        assert!(browsable(url), "{url}");
    }
    let refused = [
        "file:///etc/passwd",
        "javascript:alert(1)",
        "data:text/html,x",
        "vscode://open?x",
        "ms-msdt:/id",
        "smb://host/share",
        "about:blank",
        "http:example.com",
        "https:/x",
        "",
        "example.com",
    ];
    for url in refused {
        assert!(!browsable(url), "{url}");
    }
    let mut session = Session::new(std::path::Path::new("/h"));
    session.handle(Happening::Line(r#"{"kind":"running","url":"http://127.0.0.1:3737/?workspace=home","port":3737}"#.into()));
    session.handle(Happening::Chosen("home".into()));
    for url in ["file:///etc/passwd", "vscode://open?x", "javascript:alert(1)"] {
        assert_eq!(session.handle(Happening::NewWindow(url.into())), [], "{url}");
        assert_eq!(session.handle(Happening::PageStarted(url.into())), [Action::Load("http://127.0.0.1:3737/".into())], "{url}");
    }
}
