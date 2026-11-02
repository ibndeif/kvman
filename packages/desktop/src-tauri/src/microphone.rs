//! The devices a page in the window may use (plan 14 §14.6; ADR 0115, 51 and 64): the microphone is granted while the
//! window shows kvman's own origin, so kvcoder's record card can record, and refused to any other page; the camera, the
//! screen, and the other devices are refused to every page. A frame inside kvman's page can't ask at all unless kvman
//! lets it with `allow="microphone"`, which it doesn't. Other permissions keep the engine's own handling.

use crate::navigation::is_kvman;
use tauri::webview::{PermissionKind, PermissionResponse};

pub fn permission(kind: &PermissionKind, page: &str, kvman_port: Option<u16>) -> PermissionResponse {
    match kind {
        PermissionKind::Microphone if is_kvman(page, kvman_port) => PermissionResponse::Allow,
        PermissionKind::Microphone | PermissionKind::Camera | PermissionKind::DisplayCapture | PermissionKind::Midi | PermissionKind::Sensors => PermissionResponse::Deny,
        _ => PermissionResponse::Default,
    }
}
