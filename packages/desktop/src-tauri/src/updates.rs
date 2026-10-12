//! What the app does with the updater's answer (plan 14 §14.7). Asking for the newest version, comparing it, and
//! checking its signature are the updater plugin's; this decides what is offered and how.

use serde::Serialize;
use tauri_plugin_updater::Update;

/// An update whose bytes passed the updater's signature check, ready to install after kvman stops.
pub struct DownloadedUpdate {
    update: Update,
    bytes: Vec<u8>,
}

impl DownloadedUpdate {
    pub async fn download(update: Update) -> tauri_plugin_updater::Result<Self> {
        let bytes = update.download(|_, _| {}, || {}).await?;
        Ok(Self { update, bytes })
    }

    pub fn install(self) -> tauri_plugin_updater::Result<()> {
        self.update.install(self.bytes)
    }
}

/// Where a `.deb` install, which can't replace itself, gets the new version.
pub const RELEASE_PAGE: &str = "https://github.com/ibndeif/kvman/releases/latest";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Installed {
    /// The app can replace itself: an AppImage, a macOS app, or a Windows install.
    Replaceable,
    /// The system's package manager owns the app's files, as for a `.deb`.
    Packaged,
}

/// On Linux only an AppImage, which says so in `APPIMAGE`, replaces itself.
pub fn installed_as(linux: bool, appimage: Option<&str>) -> Installed {
    if linux && appimage.is_none_or(str::is_empty) {
        Installed::Packaged
    } else {
        Installed::Replaceable
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Checked {
    Newer(String),
    Nothing,
    /// The check failed; nothing is shown, and the next launch checks again.
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Offer {
    pub version: String,
    pub action: &'static str,
}

pub fn offer(checked: Checked, installed: Installed) -> Option<Offer> {
    match checked {
        Checked::Newer(version) => Some(Offer {
            version,
            action: if installed == Installed::Replaceable { "install" } else { "download" },
        }),
        Checked::Nothing | Checked::Failed => None,
    }
}
