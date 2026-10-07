// No console window beside the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(error) = kvman_desktop::app::run() {
        eprintln!("kvman could not open its window: {error}");
        std::process::exit(1);
    }
}
