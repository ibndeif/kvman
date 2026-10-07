// The home screen's four functions are the only ones the app's page may call (plan 14 §14.9).
fn main() {
    let commands = tauri_build::AppManifest::new().commands(&["home_load", "home_continue", "home_remove", "home_open_folder"]);
    if let Err(error) = tauri_build::try_build(tauri_build::Attributes::new().app_manifest(commands)) {
        panic!("{error:#}");
    }
}
