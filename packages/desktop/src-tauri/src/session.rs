//! What the app does about what happens (plan 14 §14.4 to §14.6): a line from kvman, a button, a second launch, the
//! window closing, kvman ending. It decides and touches nothing, so it is tested without a window (ADR 0038, 36).

use std::path::{Path, PathBuf};

use crate::lines::{read_line, trust_answer, Line, Problem};
use crate::messages::update_failed_notice;
use crate::messages::{failed_notice, stopped_notice, trust_dialog, Language, Notice, TrustDialog};
use crate::navigation::{browsable, navigation, Verdict};
use crate::updates::RELEASE_PAGE;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Happening {
    Line(String),
    TrustAnswered(bool),
    NoticeClosed,
    /// The home screen's choice of a workspace.
    Chosen(String),
    SecondLaunch,
    /// The page asked for a new window with this address.
    NewWindow(String),
    /// The window itself, not a frame inside it, began to load this address.
    PageStarted(String),
    WindowClosed,
    KvmanEnded,
    /// The update is downloaded and its signature holds (§14.7).
    UpdateDownloaded,
    UpdateInstallFailed,
    /// A `.deb` install's "Download".
    UpdateDownloadAsked,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    FocusWindow,
    ShowTrust(TrustDialog),
    ShowNotice(Notice),
    WriteLine(&'static str),
    ShowHome,
    Load(String),
    OpenInBrowser(String),
    /// Hide the window, close kvman's input, wait, and end its process tree if it is still alive (§14.6).
    StopKvman,
    /// Install the downloaded update and start the app again.
    InstallUpdate,
    Quit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Screen {
    Starting,
    Home,
    App,
}

pub struct Session {
    home: PathBuf,
    screen: Screen,
    port: Option<u16>,
    language: Language,
    /// False once kvman said it joined a running one, which the app must not stop.
    owned: bool,
    alive: bool,
    restarting: bool,
    declined_at_launch: bool,
    closing: bool,
    /// The update is ready, and the app is on its way to installing it.
    updating: bool,
    /// A dialog that ends the session is open, or was: nothing more is shown.
    ending: bool,
}

pub fn workspace_url(port: u16, workspace_id: &str) -> String {
    let encoded: String = workspace_id
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')' => char::from(byte).to_string(),
            other => format!("%{other:02X}"),
        })
        .collect();
    format!("http://127.0.0.1:{port}/?workspace={encoded}")
}

impl Session {
    pub fn new(home: &Path) -> Self {
        Self {
            home: home.to_path_buf(),
            screen: Screen::Starting,
            port: None,
            language: Language::English,
            owned: true,
            alive: true,
            restarting: false,
            declined_at_launch: false,
            closing: false,
            updating: false,
            ending: false,
        }
    }

    /// The port of the kvman whose home screen or app is shown.
    pub fn port(&self) -> Option<u16> {
        self.port
    }

    pub fn language(&self) -> Language {
        self.language
    }

    /// The home screen's language, once it is known, for the dialogs that carry none.
    pub fn set_language(&mut self, language: Language) {
        self.language = language;
    }

    fn log_file(&self) -> String {
        self.home.join("logs").join("kvman.log").display().to_string()
    }

    fn end_with(&mut self, notice: Notice) -> Vec<Action> {
        self.ending = true;
        vec![Action::ShowNotice(notice)]
    }

    pub fn handle(&mut self, happening: Happening) -> Vec<Action> {
        match happening {
            Happening::SecondLaunch => vec![Action::FocusWindow],
            Happening::Line(text) => self.line(&text),
            Happening::TrustAnswered(accept) => {
                self.declined_at_launch = !accept && !self.restarting;
                vec![Action::WriteLine(trust_answer(accept))]
            }
            Happening::Chosen(workspace_id) => self.chosen(&workspace_id),
            Happening::NewWindow(url) => Some(Action::OpenInBrowser(url)).into_iter().filter(Self::opens).collect(),
            Happening::PageStarted(url) => self.page_started(&url),
            Happening::NoticeClosed => vec![Action::Quit],
            Happening::WindowClosed => self.window_closed(),
            Happening::KvmanEnded => self.kvman_ended(),
            Happening::UpdateDownloaded => self.update_downloaded(),
            Happening::UpdateInstallFailed => self.end_with(update_failed_notice(self.language)),
            Happening::UpdateDownloadAsked => vec![Action::OpenInBrowser(RELEASE_PAGE.to_owned())],
        }
    }

    fn line(&mut self, text: &str) -> Vec<Action> {
        if self.closing || self.ending {
            return Vec::new();
        }
        match read_line(text) {
            Ok(Line::Trust { language, versions }) => {
                self.language = Language::of(Some(&language));
                vec![Action::ShowTrust(trust_dialog(self.language, &versions, self.restarting))]
            }
            Ok(Line::Running { url, port }) => self.running(&url, port),
            Ok(Line::Joined { port, .. }) => {
                self.owned = false;
                self.port = Some(port);
                self.screen = Screen::Home;
                vec![Action::ShowHome]
            }
            Ok(Line::Restarting) => {
                self.restarting = true;
                Vec::new()
            }
            Ok(Line::Failed { language, problem }) => self.failed(language.as_deref(), &problem),
            Err(_) => {
                let mut actions = self.end_with(stopped_notice(self.language, &self.log_file()));
                actions.push(Action::StopKvman);
                actions
            }
        }
    }

    fn running(&mut self, url: &str, port: u16) -> Vec<Action> {
        let moved = self.port != Some(port);
        self.port = Some(port);
        self.restarting = false;
        match self.screen {
            Screen::Starting => {
                self.screen = Screen::Home;
                vec![Action::ShowHome]
            }
            Screen::App if moved => vec![Action::Load(url.to_owned())],
            Screen::Home | Screen::App => Vec::new(),
        }
    }

    fn failed(&mut self, language: Option<&str>, problem: &Problem) -> Vec<Action> {
        if self.declined_at_launch {
            self.ending = true;
            return vec![Action::Quit];
        }
        let language = language.map_or(Language::English, |code| Language::of(Some(code)));
        self.end_with(failed_notice(language, problem, &self.log_file()))
    }

    fn chosen(&mut self, workspace_id: &str) -> Vec<Action> {
        match (self.screen, self.port) {
            (Screen::Home, Some(port)) if !self.closing && !self.ending => {
                self.screen = Screen::App;
                vec![Action::Load(workspace_url(port, workspace_id))]
            }
            _ => Vec::new(),
        }
    }

    /// An address of another origin is opened in the system's browser, and the window goes back to kvman (§14.6).
    fn page_started(&self, url: &str) -> Vec<Action> {
        if navigation(url, self.port) == Verdict::Stay {
            return Vec::new();
        }
        let back = self.port.map(|port| Action::Load(format!("http://127.0.0.1:{port}/")));
        Some(Action::OpenInBrowser(url.to_owned())).into_iter().filter(Self::opens).chain(back).collect()
    }

    /// Whether an action may be carried out: only a web address goes to the system's browser.
    fn opens(action: &Action) -> bool {
        !matches!(action, Action::OpenInBrowser(url) if !browsable(url))
    }

    fn window_closed(&mut self) -> Vec<Action> {
        if self.closing {
            return Vec::new();
        }
        self.closing = true;
        if self.owned && self.alive {
            vec![Action::StopKvman]
        } else {
            vec![Action::Quit]
        }
    }

    /// kvman is stopped only now, with the update in hand; a kvman the app doesn't own is left alone (§14.7).
    fn update_downloaded(&mut self) -> Vec<Action> {
        if self.closing || self.ending {
            return Vec::new();
        }
        self.closing = true;
        self.updating = true;
        if self.owned && self.alive {
            vec![Action::StopKvman]
        } else {
            vec![Action::InstallUpdate]
        }
    }

    fn kvman_ended(&mut self) -> Vec<Action> {
        self.alive = false;
        if self.updating && !self.ending {
            return vec![Action::InstallUpdate];
        }
        if self.closing || (self.declined_at_launch && !self.ending) {
            self.ending = true;
            return vec![Action::Quit];
        }
        if !self.owned || self.ending {
            return Vec::new();
        }
        self.end_with(stopped_notice(self.language, &self.log_file()))
    }
}
