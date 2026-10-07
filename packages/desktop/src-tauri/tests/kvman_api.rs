#![allow(clippy::unwrap_used)]

mod support;

use kvman_desktop::kvman_api::{ApiFailure, KvmanApi, Workspace};
use support::{catalog, output, settings, workspaces, FakeKvman, CLOSE, LIST, OPEN, SETTINGS};

#[test]
fn m3_2_h16_the_shells_calls_carry_the_host_and_no_origin() {
    let notes = r#"{"id":"0199","name":"notes","path":"/work/notes"}"#;
    let kvman = FakeKvman::start(&[
        (LIST, &[workspaces(&[("home", "ahmed", "/home/ahmed")])]),
        (OPEN, &[output(notes)]),
        (CLOSE, &[output("{}")]),
        (SETTINGS, &[settings(&[("kernel.language", "ar")])]),
        ("/api/locales/ar", &[catalog(&[("kernel.errors.NOT_FOUND", "No {thing} was found.")])]),
    ]);
    let api = KvmanApi::new(kvman.port).unwrap();
    assert_eq!(
        api.workspaces().unwrap(),
        vec![Workspace {
            id: "home".into(),
            name: "ahmed".into(),
            path: "/home/ahmed".into()
        }]
    );
    assert_eq!(api.open_workspace("/work/notes").unwrap().id, "0199");
    api.close_workspace("0199").unwrap();
    assert_eq!(api.settings().unwrap()[0].key, "kernel.language");
    assert_eq!(api.catalog("ar").unwrap()["kernel.errors.NOT_FOUND"], "No {thing} was found.");

    let requests = kvman.requests();
    assert_eq!(requests.len(), 5);
    for request in &requests {
        assert_eq!(request.headers["host"], format!("127.0.0.1:{}", kvman.port), "{}", request.line);
        assert!(!request.headers.contains_key("origin") && !request.headers.contains_key("referer"), "{}", request.line);
    }
    assert_eq!(kvman.bodies(OPEN), [r#"{"input":{"path":"/work/notes"}}"#]);
    assert_eq!(kvman.bodies(CLOSE), [r#"{"input":{"workspaceId":"0199"}}"#]);
    assert_eq!(kvman.bodies(LIST), [r#"{"input":{}}"#]);
    assert_eq!(requests[4].line, "GET /api/locales/ar HTTP/1.1");
}

#[test]
fn m3_2_e13_an_answer_that_is_not_the_envelope_is_a_failure() {
    let kvman = FakeKvman::start(&[
        (LIST, &["not json".to_owned()]),
        (OPEN, &[r#"{"ok":true}"#.to_owned()]),
        (SETTINGS, &[r#"{"ok":false}"#.to_owned()]),
        ("/api/locales/en", &[r#"{"ok":true,"catalog":5}"#.to_owned()]),
    ]);
    let api = KvmanApi::new(kvman.port).unwrap();
    assert_eq!(api.workspaces(), Err(ApiFailure::Unreadable));
    assert_eq!(api.open_workspace("/x"), Err(ApiFailure::Unreadable));
    assert_eq!(api.settings(), Err(ApiFailure::Unreadable));
    assert_eq!(api.catalog("en").map(|_| ()), Err(ApiFailure::Unreadable));
    let nobody = KvmanApi::new(1).unwrap();
    assert_eq!(nobody.workspaces(), Err(ApiFailure::Unreadable));
}
