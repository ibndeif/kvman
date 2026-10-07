//! A download's place (plan 14 §14.6; ADR 0038, 42): the Downloads folder, under its own name, with a number when the
//! name is taken. Nothing there is replaced.

use std::path::{Path, PathBuf};

fn numbered(name: &str, number: u32) -> String {
    match name.rfind('.') {
        Some(dot) if dot > 0 => format!("{} ({number}){}", &name[..dot], &name[dot..]),
        _ => format!("{name} ({number})"),
    }
}

/// The first of `name`, `name (1)`, `name (2)`… that isn't taken.
pub fn free_name(name: &str, taken: &dyn Fn(&str) -> bool) -> String {
    if !taken(name) {
        return name.to_owned();
    }
    (1..)
        .map(|number| numbered(name, number))
        .find(|candidate| !taken(candidate))
        .unwrap_or_else(|| name.to_owned())
}

pub fn destination(folder: &Path, name: &str) -> PathBuf {
    folder.join(free_name(name, &|candidate| folder.join(candidate).exists()))
}
