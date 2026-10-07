use kvman_desktop::lines::{ExtensionVersion, Problem};
use kvman_desktop::messages::{catalog, failed_notice, hint, stopped_notice, trust_dialog, Language};

fn english(key: &str) -> String {
    catalog(Language::English)[key].clone()
}

fn arabic(key: &str) -> String {
    catalog(Language::Arabic)[key].clone()
}

#[test]
fn m3_2_e10_the_dialogs_are_arabic_for_ar_and_english_for_anything_else() {
    assert_eq!(Language::of(Some("ar")), Language::Arabic);
    for code in [Some("en"), Some("fr"), None] {
        assert_eq!(Language::of(code), Language::English);
    }
    let versions = [ExtensionVersion {
        name: "kvnotes".into(),
        version: "1.2.0".into(),
        source: "npm:1.2.0".into(),
    }];
    let problem = Problem {
        code: "PORT_IN_USE".into(),
        message: "The port 3737 is already in use.".into(),
        params: None,
    };
    for (language, own) in [(Language::Arabic, arabic as fn(&str) -> String), (Language::English, english as fn(&str) -> String)] {
        let trust = trust_dialog(language, &versions, false);
        assert_eq!(
            trust.body,
            format!("{}\n\n  • kvnotes@1.2.0 (npm:1.2.0)\n\n{}", own("desktop.trust.intro"), own("desktop.trust.question"))
        );
        assert_eq!((trust.accept, trust.decline), (own("desktop.trust.accept"), own("desktop.quit")));
        assert_eq!(trust_dialog(language, &versions, true).decline, own("desktop.trust.decline"));
        let failed = failed_notice(language, &problem, "/h/logs/kvman.log");
        assert_eq!((failed.title, failed.button), (own("desktop.failed.title"), own("desktop.quit")));
        let stopped = stopped_notice(language, "/h/logs/kvman.log");
        assert_eq!(stopped.title, own("desktop.stopped.title"));
        assert!(stopped.body.contains("/h/logs/kvman.log"));
    }
    assert_ne!(arabic("desktop.trust.intro"), english("desktop.trust.intro"));
    assert_eq!(english("desktop.trust.decline"), "Don't run");
}

#[test]
fn m3_2_e11_four_codes_have_their_own_hint_and_any_other_names_the_log_file() {
    let log_file = "/h/logs/kvman.log";
    for language in [Language::English, Language::Arabic] {
        let mut hints = Vec::new();
        for code in ["KVMAN_RUNNING", "PORT_IN_USE", "EXTENSION_INVALID", "VALIDATION_FAILED"] {
            let own = hint(language, code, log_file);
            assert_eq!(own, catalog(language)[&format!("desktop.failed.hint.{code}")]);
            assert!(!own.contains(log_file) && !hints.contains(&own), "{code}");
            hints.push(own);
        }
        let other = hint(language, "INTERNAL", log_file);
        assert!(other.contains(log_file) && !other.contains("{file}"));
    }
}
