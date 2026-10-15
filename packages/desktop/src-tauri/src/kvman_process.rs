//! kvman as the app's child process (plan 14 §14.4, §14.6): started with `--pipe`, its lines read as they come, an
//! answer written to it, and its input closed to stop it. A kvman that outlives the wait has its whole tree ended.

use std::io::{self, BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Unix,
    Windows,
}

impl Platform {
    pub fn current() -> Self {
        if cfg!(windows) {
            Self::Windows
        } else {
            Self::Unix
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StartCommand {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub folder: PathBuf,
    /// kvman's `PATH`; the rest of its environment is the app's own, `KVMAN_HOME` included.
    pub path: String,
}

/// The Node folder goes last, so a person's own Node and npm come first (ADR 0038, 22).
pub fn path_with(current: Option<&str>, node_folder: &str, platform: Platform) -> String {
    let separator = if platform == Platform::Windows { ';' } else { ':' };
    match current {
        Some(path) if !path.is_empty() => format!("{path}{separator}{node_folder}"),
        _ => node_folder.to_owned(),
    }
}

pub fn start_command(node: &Path, entry: &Path, user_folder: &Path, current_path: Option<&str>, platform: Platform) -> StartCommand {
    let node_folder = node.parent().map_or_else(String::new, |folder| folder.display().to_string());
    StartCommand {
        program: node.to_path_buf(),
        args: vec![entry.display().to_string(), "--pipe".to_owned(), "--no-open".to_owned()],
        folder: user_folder.to_path_buf(),
        path: path_with(current_path, &node_folder, platform),
    }
}

/// A branded app's kvman: its own home and the brand's preset, added to the start command (plan 14 §14.9).
pub fn with_brand(start: StartCommand, home: &Path, preset: &Path) -> StartCommand {
    let mut args = start.args;
    args.extend(["--home".to_owned(), home.display().to_string(), "--preset".to_owned(), preset.display().to_string()]);
    StartCommand { args, ..start }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KillCommand {
    pub program: &'static str,
    pub args: Vec<String>,
}

/// SIGKILL to the process group on Linux and macOS; `taskkill` with the tree on Windows (plan 14 §14.6).
pub fn kill_tree(platform: Platform, pid: u32) -> KillCommand {
    match platform {
        Platform::Unix => KillCommand {
            program: "kill",
            args: vec!["-KILL".to_owned(), "--".to_owned(), format!("-{pid}")],
        },
        Platform::Windows => KillCommand {
            program: "taskkill",
            args: vec!["/PID".to_owned(), pid.to_string(), "/T".to_owned(), "/F".to_owned()],
        },
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stopped {
    Exited,
    Killed,
}

pub struct KvmanProcess {
    pid: u32,
    input: Mutex<Option<ChildStdin>>,
    ended: Mutex<Receiver<()>>,
}

#[cfg(unix)]
fn own_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

#[cfg(windows)]
fn own_group(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

/// Starts kvman. `on_line` gets each stdout line in order, and `on_end` runs once, after the last line, when the
/// process has ended.
pub fn spawn(start: &StartCommand, on_line: impl Fn(String) + Send + 'static, on_end: impl FnOnce() + Send + 'static) -> io::Result<KvmanProcess> {
    let mut command = Command::new(&start.program);
    command.args(&start.args).current_dir(&start.folder).env("PATH", &start.path);
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    own_group(&mut command);
    let mut child = command.spawn()?;
    let output = child.stdout.take().ok_or_else(|| io::Error::other("kvman has no stdout pipe."))?;
    let input = child.stdin.take();
    let pid = child.id();
    let (ended, when_ended) = channel();
    thread::spawn(move || {
        for line in BufReader::new(output).lines().map_while(Result::ok) {
            on_line(line);
        }
        // The exit status isn't used: a clean stop and a crash both end the session the same way.
        let _status = child.wait();
        on_end();
        // Nobody may be waiting for the end, which is fine.
        let _sent = ended.send(());
    });
    Ok(KvmanProcess {
        pid,
        input: Mutex::new(input),
        ended: Mutex::new(when_ended),
    })
}

impl KvmanProcess {
    pub fn pid(&self) -> u32 {
        self.pid
    }

    pub fn write_line(&self, line: &str) -> io::Result<()> {
        let mut input = self.input.lock().map_err(|_| io::Error::other("kvman's input is poisoned."))?;
        match input.as_mut() {
            Some(pipe) => {
                pipe.write_all(line.as_bytes())?;
                pipe.write_all(b"\n")?;
                pipe.flush()
            }
            None => Err(io::Error::other("kvman's input is closed.")),
        }
    }

    pub fn close_input(&self) -> io::Result<()> {
        self.input
            .lock()
            .map(|mut input| drop(input.take()))
            .map_err(|_| io::Error::other("kvman's input is poisoned."))
    }

    /// Closes kvman's input and waits for it to end; after `wait`, ends its process tree.
    pub fn stop(&self, wait: Duration) -> io::Result<Stopped> {
        self.close_input()?;
        let ended = self.ended.lock().map_err(|_| io::Error::other("kvman's end is poisoned."))?;
        match ended.recv_timeout(wait) {
            Ok(()) | Err(RecvTimeoutError::Disconnected) => Ok(Stopped::Exited),
            Err(RecvTimeoutError::Timeout) => {
                let kill = kill_tree(Platform::current(), self.pid);
                Command::new(kill.program).args(&kill.args).stdout(Stdio::null()).stderr(Stdio::null()).status()?;
                // The tree is gone, so the end follows; a sender that is gone means it already came.
                let _ended = ended.recv();
                Ok(Stopped::Killed)
            }
        }
    }
}
