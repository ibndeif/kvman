use kvman_desktop::microphone::permission;
use kvman_desktop::navigation::is_kvman;
use tauri::webview::{PermissionKind, PermissionResponse};

#[test]
fn m5_10_h6_the_microphone_is_granted_to_kvmans_page_only() {
    let kvman = "http://127.0.0.1:3737/kvcoder/session?workspace=home";
    assert_eq!(permission(&PermissionKind::Microphone, kvman, Some(3737)), PermissionResponse::Allow);
    for page in ["https://example.com/", "http://127.0.0.1:5173/", "tauri://localhost/index.html"] {
        assert_eq!(permission(&PermissionKind::Microphone, page, Some(3737)), PermissionResponse::Deny);
    }
    assert_eq!(permission(&PermissionKind::Microphone, kvman, None), PermissionResponse::Deny);
    assert!(is_kvman(kvman, Some(3737)));
    assert!(!is_kvman("http://127.0.0.1:37370/", Some(3737)));
}

#[test]
fn m5_10_e6_the_camera_the_screen_and_other_devices_are_refused_and_other_permissions_left_alone() {
    let kvman = "http://127.0.0.1:3737/";
    for kind in [PermissionKind::Camera, PermissionKind::DisplayCapture, PermissionKind::Midi, PermissionKind::Sensors] {
        assert_eq!(permission(&kind, kvman, Some(3737)), PermissionResponse::Deny);
    }
    assert_eq!(permission(&PermissionKind::ClipboardRead, kvman, Some(3737)), PermissionResponse::Default);
    assert_eq!(permission(&PermissionKind::Notifications, kvman, Some(3737)), PermissionResponse::Default);
}
