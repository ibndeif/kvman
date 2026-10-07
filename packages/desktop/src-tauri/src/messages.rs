//! The shell's own text (plan 14 §14.9): a catalog with `en` and `ar`, and the dialogs made from it. Arabic is shown
//! for `ar`; any other language, and none, is English (ADR 0038, 38 and 41).

use std::collections::HashMap;
use std::sync::OnceLock;

use crate::lines::{ExtensionVersion, Problem};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    English,
    Arabic,
}

impl Language {
    pub fn of(code: Option<&str>) -> Self {
        if code == Some("ar") {
            Self::Arabic
        } else {
            Self::English
        }
    }

    pub fn code(self) -> &'static str {
        match self {
            Self::English => "en",
            Self::Arabic => "ar",
        }
    }
}

pub type Catalog = HashMap<String, String>;

// A catalog that can't be read is an empty one, whose texts show as their keys; the catalog tests keep both readable.
fn parsed(source: &str) -> Catalog {
    serde_json::from_str(source).unwrap_or_default()
}

pub fn catalog(language: Language) -> &'static Catalog {
    static ENGLISH: OnceLock<Catalog> = OnceLock::new();
    static ARABIC: OnceLock<Catalog> = OnceLock::new();
    match language {
        Language::English => ENGLISH.get_or_init(|| parsed(include_str!("../../locales/en.json"))),
        Language::Arabic => ARABIC.get_or_init(|| parsed(include_str!("../../locales/ar.json"))),
    }
}

pub fn text(language: Language, key: &str) -> String {
    catalog(language).get(key).cloned().unwrap_or_else(|| key.to_owned())
}

/// Puts each `{name}` of a catalog text in its place.
pub fn fill(text: &str, params: &[(&str, &str)]) -> String {
    params.iter().fold(text.to_owned(), |filled, (name, value)| filled.replace(&format!("{{{name}}}"), value))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrustDialog {
    pub body: String,
    pub accept: String,
    pub decline: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notice {
    pub title: String,
    pub body: String,
    pub button: String,
}

/// The trust question (plan 14 §14.4). At a restart its first button declines and stays (ADR 0038, 43).
pub fn trust_dialog(language: Language, versions: &[ExtensionVersion], at_restart: bool) -> TrustDialog {
    let listed: Vec<String> = versions
        .iter()
        .map(|version| format!("  • {}@{} ({})", version.name, version.version, version.source))
        .collect();
    let decline = if at_restart { "desktop.trust.decline" } else { "desktop.quit" };
    TrustDialog {
        body: format!(
            "{}\n\n{}\n\n{}",
            text(language, "desktop.trust.intro"),
            listed.join("\n"),
            text(language, "desktop.trust.question")
        ),
        accept: text(language, "desktop.trust.accept"),
        decline: text(language, decline),
    }
}

const HINTED: [&str; 4] = ["KVMAN_RUNNING", "PORT_IN_USE", "EXTENSION_INVALID", "VALIDATION_FAILED"];

pub fn hint(language: Language, code: &str, log_file: &str) -> String {
    if HINTED.contains(&code) {
        text(language, &format!("desktop.failed.hint.{code}"))
    } else {
        fill(&text(language, "desktop.failed.hint.other"), &[("file", log_file)])
    }
}

pub fn failed_notice(language: Language, problem: &Problem, log_file: &str) -> Notice {
    Notice {
        title: text(language, "desktop.failed.title"),
        body: format!("{}: {}\n\n{}", problem.code, problem.message, hint(language, &problem.code, log_file)),
        button: text(language, "desktop.quit"),
    }
}

pub fn stopped_notice(language: Language, log_file: &str) -> Notice {
    Notice {
        title: text(language, "desktop.stopped.title"),
        body: fill(&text(language, "desktop.stopped.details"), &[("file", log_file)]),
        button: text(language, "desktop.quit"),
    }
}
