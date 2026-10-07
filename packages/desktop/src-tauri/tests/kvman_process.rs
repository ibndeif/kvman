#![allow(clippy::unwrap_used)]

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::time::{Duration, Instant};

use kvman_desktop::kvman_process::{kill_tree, spawn, start_command, KvmanProcess, Platform, StartCommand, Stopped};
use kvman_desktop::lines::{read_line, Line};

const WAIT: Duration = Duration::from_secs(15);

enum Seen {
    Line(String),
    End,
}

/// The fake kvman in one of its modes, with what it writes and its end sent to the receiver.
fn fake(mode: &str, file: Option<&Path>) -> (KvmanProcess, Receiver<Seen>) {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake-kvman.mjs");
    let mut args = vec![fixture.display().to_string(), mode.to_owned()];
    args.extend(file.map(|path| path.display().to_string()));
    let start = StartCommand {
        program: PathBuf::from("node"),
        args,
        folder: std::env::temp_dir(),
        path: std::env::var("PATH").unwrap(),
    };
    let (seen, receiver) = channel();
    let ended = seen.clone();
    let process = spawn(&start, move |line| seen.send(Seen::Line(line)).unwrap(), move || ended.send(Seen::End).unwrap()).unwrap();
    (process, receiver)
}

fn next_line(receiver: &Receiver<Seen>) -> Line {
    match receiver.recv_timeout(WAIT).unwrap() {
        Seen::Line(text) => read_line(&text).unwrap(),
        Seen::End => panic!("kvman ended before its next line."),
    }
}

fn ended(receiver: &Receiver<Seen>) -> bool {
    matches!(receiver.recv_timeout(WAIT), Ok(Seen::End))
}

#[test]
fn m3_2_h13_closing_stops_kvman_and_ends_its_process_tree_after_the_wait() {
    let (polite, lines) = fake("exits-on-close", None);
    assert!(matches!(next_line(&lines), Line::Running { port: 3737, .. }));
    assert_eq!(polite.stop(WAIT).unwrap(), Stopped::Exited);
    assert!(ended(&lines));

    let pids = std::env::temp_dir().join(format!("kvman-desktop-pids-{}.json", std::process::id()));
    let (stubborn, lines) = fake("ignores-close", Some(&pids));
    assert!(matches!(next_line(&lines), Line::Running { .. }));
    let written: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&pids).unwrap()).unwrap();
    assert_eq!(written["pid"].as_u64(), Some(u64::from(stubborn.pid())));
    assert!(written["child"].as_u64().is_some_and(|child| child != u64::from(stubborn.pid())));
    // The child holds kvman's stdout, so the end comes only once the whole tree is gone.
    assert_eq!(stubborn.stop(Duration::from_millis(300)).unwrap(), Stopped::Killed);
    assert!(ended(&lines));
    std::fs::remove_file(&pids).unwrap();

    let unix = kill_tree(Platform::Unix, 4321);
    assert_eq!((unix.program, unix.args), ("kill", vec!["-KILL".to_owned(), "--".to_owned(), "-4321".to_owned()]));
    let windows = kill_tree(Platform::Windows, 4321);
    assert_eq!(
        (windows.program, windows.args),
        ("taskkill", vec!["/PID".to_owned(), "4321".to_owned(), "/T".to_owned(), "/F".to_owned()])
    );
}

#[test]
fn m3_2_e3_how_kvman_is_started() {
    let node = Path::new("/app/node/bin/node");
    let entry = Path::new("/app/kvman/dist/main.js");
    let linux = start_command(node, entry, Path::new("/home/ahmed"), Some("/usr/bin"), Platform::Unix);
    assert_eq!(linux.program, node);
    assert_eq!(linux.args, ["/app/kvman/dist/main.js", "--pipe", "--no-open"]);
    assert_eq!(linux.folder, Path::new("/home/ahmed"));
    assert_eq!(linux.path, "/usr/bin:/app/node/bin");
    let windows = start_command(node, entry, Path::new("/home/ahmed"), Some("/usr/bin"), Platform::Windows);
    assert_eq!(windows.path, "/usr/bin;/app/node/bin");
    assert_eq!(start_command(node, entry, Path::new("/home/ahmed"), None, Platform::Unix).path, "/app/node/bin");
    assert_eq!(start_command(node, entry, Path::new("/home/ahmed"), Some(""), Platform::Unix).path, "/app/node/bin");
}

#[test]
fn m3_2_e4_the_lines_of_a_real_child_are_read_and_an_answer_reaches_it() {
    let (kvman, lines) = fake("trust", None);
    let Line::Trust { language, versions } = next_line(&lines) else {
        panic!("The first line is not a trust line.")
    };
    assert_eq!((language.as_str(), versions[0].name.as_str()), ("en", "@acme/hello"));
    kvman.write_line(r#"{"trust":true}"#).unwrap();
    assert!(matches!(next_line(&lines), Line::Running { port: 3737, .. }));
    assert_eq!(kvman.stop(WAIT).unwrap(), Stopped::Exited);
    assert!(ended(&lines));
    assert!(kvman.write_line("late").is_err());

    let (silent, lines) = fake("exits-at-once", None);
    assert!(ended(&lines));
    assert_eq!(silent.stop(WAIT).unwrap(), Stopped::Exited);
}

#[test]
fn m3_2_e20_a_kvman_that_exits_inside_the_wait_is_not_killed() {
    let (kvman, lines) = fake("exits-on-close", None);
    next_line(&lines);
    let asked = Instant::now();
    assert_eq!(kvman.stop(WAIT).unwrap(), Stopped::Exited);
    assert!(asked.elapsed() < WAIT);
}
