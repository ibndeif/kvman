//! The lines of a piped kvman (plan 14 §14.2): each one is read into its shape, and anything else is refused
//! (ADR 0038, 37).

use serde::Deserialize;
use serde_json::{Map, Value};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExtensionVersion {
    pub name: String,
    pub version: String,
    pub source: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Problem {
    pub code: String,
    pub message: String,
    pub params: Option<Map<String, Value>>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum Line {
    Trust { language: String, versions: Vec<ExtensionVersion> },
    Running { url: String, port: u16 },
    Joined { url: String, port: u16 },
    Restarting,
    Failed { language: Option<String>, problem: Problem },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnreadableLine;

pub fn read_line(text: &str) -> Result<Line, UnreadableLine> {
    serde_json::from_str(text).map_err(|_| UnreadableLine)
}

/// The one line the shell writes: the answer to a `trust` line.
pub fn trust_answer(accept: bool) -> &'static str {
    if accept {
        "{\"trust\":true}"
    } else {
        "{\"trust\":false}"
    }
}
