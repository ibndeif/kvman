//! Where an address may open (plan 14 §14.6): kvman's own origin and the shell's own page stay in the window, and
//! everything else goes to the system's browser. A request for a new window always does, whatever its address.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Stay,
    Browser,
}

/// The origins Tauri serves the app's own page from: the first on Linux and macOS, the others on Windows.
const SHELL_ORIGINS: [&str; 3] = ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"];

fn is_under(url: &str, origin: &str) -> bool {
    url.strip_prefix(origin).is_some_and(|rest| rest.is_empty() || rest.starts_with(['/', '?', '#']))
}

pub fn navigation(url: &str, kvman_port: Option<u16>) -> Verdict {
    let kvman = kvman_port.is_some_and(|port| is_under(url, &format!("http://127.0.0.1:{port}")));
    if kvman || SHELL_ORIGINS.iter().any(|origin| is_under(url, origin)) {
        Verdict::Stay
    } else {
        Verdict::Browser
    }
}

/// Only a web address is handed to the system's browser. Any other scheme (`file:`, `javascript:`, an app's own) would
/// make the system open or run something a page chose, so it is dropped (ADR 0038, 50).
pub fn browsable(url: &str) -> bool {
    let scheme = url.split_once(':').map_or("", |(scheme, _)| scheme);
    (scheme.eq_ignore_ascii_case("http") || scheme.eq_ignore_ascii_case("https")) && url[scheme.len()..].starts_with("://")
}
