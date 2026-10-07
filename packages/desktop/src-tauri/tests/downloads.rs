#![allow(clippy::unwrap_used)]

use std::fs;

use kvman_desktop::downloads::{destination, free_name};

#[test]
fn m3_2_e19_a_download_whose_name_is_taken_gets_a_number() {
    let folder = std::env::temp_dir().join(format!("kvman-desktop-downloads-{}", std::process::id()));
    fs::create_dir_all(&folder).unwrap();
    for taken in ["report.pdf", "report (1).pdf", "notes", ".env"] {
        fs::write(folder.join(taken), taken).unwrap();
    }
    let saved = |name: &str| destination(&folder, name).file_name().unwrap().to_string_lossy().into_owned();
    assert_eq!(saved("report.pdf"), "report (2).pdf");
    assert_eq!(saved("notes"), "notes (1)");
    assert_eq!(saved(".env"), ".env (1)");
    assert_eq!(saved("new.txt"), "new.txt");
    assert_eq!(fs::read_to_string(folder.join("report.pdf")).unwrap(), "report.pdf");
    assert_eq!(free_name("a.tar.gz", &|name| name == "a.tar.gz"), "a.tar (1).gz");
    fs::remove_dir_all(&folder).unwrap();
}
