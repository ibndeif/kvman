#![allow(clippy::unwrap_used)]

use kvman_desktop::lines::{read_line, trust_answer, ExtensionVersion, Line, Problem, UnreadableLine};
use serde_json::json;

#[test]
fn m3_2_e1_each_line_is_read_into_its_shape_and_anything_else_is_refused() {
    let hello = ExtensionVersion {
        name: "@acme/hello".into(),
        version: "1.0.0".into(),
        source: "npm:1.0.0".into(),
    };
    let trust = r#"{"kind":"trust","language":"ar","versions":[{"name":"@acme/hello","version":"1.0.0","source":"npm:1.0.0"}]}"#;
    assert_eq!(
        read_line(trust),
        Ok(Line::Trust {
            language: "ar".into(),
            versions: vec![hello]
        })
    );
    let url = "http://127.0.0.1:3737/?workspace=home";
    assert_eq!(
        read_line(&format!(r#"{{"kind":"running","url":"{url}","port":3737}}"#)),
        Ok(Line::Running { url: url.into(), port: 3737 })
    );
    assert_eq!(
        read_line(&format!(r#"{{"kind":"joined","url":"{url}","port":3737}}"#)),
        Ok(Line::Joined { url: url.into(), port: 3737 })
    );
    assert_eq!(read_line(r#"{"kind":"restarting"}"#), Ok(Line::Restarting));

    let params = json!({ "port": 3737 }).as_object().cloned();
    let with_all = r#"{"kind":"failed","language":"en","problem":{"code":"PORT_IN_USE","message":"Taken.","params":{"port":3737}}}"#;
    assert_eq!(
        read_line(with_all),
        Ok(Line::Failed {
            language: Some("en".into()),
            problem: Problem {
                code: "PORT_IN_USE".into(),
                message: "Taken.".into(),
                params
            }
        })
    );
    let bare = r#"{"kind":"failed","problem":{"code":"KVMAN_RUNNING","message":"Running."}}"#;
    assert_eq!(
        read_line(bare),
        Ok(Line::Failed {
            language: None,
            problem: Problem {
                code: "KVMAN_RUNNING".into(),
                message: "Running.".into(),
                params: None
            }
        })
    );

    let refused = [
        "nonsense",
        "",
        r#"{"kind":"other"}"#,
        r#"{"kind":"running","url":"x"}"#,
        r#"{"kind":"running","url":"x","port":1,"more":true}"#,
        r#"{"kind":"running","url":"x","port":70000}"#,
    ];
    for text in refused {
        assert_eq!(read_line(text), Err(UnreadableLine), "{text}");
    }
    assert_eq!(trust_answer(true), r#"{"trust":true}"#);
    assert_eq!(trust_answer(false), r#"{"trust":false}"#);
}
