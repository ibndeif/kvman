use std::path::{Path, PathBuf};

use kvman_desktop::kvman_process::{start_command, Platform};
use kvman_desktop::runtime::{bundled_runtime, choose_runtime, kvman_home, node_on_path, Runtime};

#[test]
fn m3_3_h1_the_app_finds_the_bundled_node_and_kvman_in_its_resources() {
    let unix = bundled_runtime(Path::new("/usr/lib/kvman"), Platform::Unix);
    assert_eq!(
        unix,
        Runtime {
            node: "/usr/lib/kvman/runtime/node/bin/node".into(),
            entry: "/usr/lib/kvman/runtime/kvman/dist/main.js".into()
        }
    );
    let windows = bundled_runtime(Path::new("/app"), Platform::Windows);
    assert_eq!(
        windows,
        Runtime {
            node: Path::new("/app").join("runtime").join("node").join("node.exe"),
            entry: Path::new("/app").join("runtime").join("kvman").join("dist").join("main.js")
        }
    );
}

#[test]
fn m3_3_h2_a_persons_own_node_and_npm_come_first() {
    let bundled = bundled_runtime(Path::new("/usr/lib/kvman"), Platform::Unix);
    let start = start_command(
        &bundled.node,
        &bundled.entry,
        Path::new("/home/ahmed"),
        Some("/home/ahmed/.nvm/bin:/usr/bin"),
        Platform::Unix,
    );
    assert_eq!(start.path, "/home/ahmed/.nvm/bin:/usr/bin:/usr/lib/kvman/runtime/node/bin");
    assert_eq!(start.program, bundled.node);
    assert_eq!(start.args, ["/usr/lib/kvman/runtime/kvman/dist/main.js", "--pipe", "--no-open"]);
}

#[test]
fn m3_3_e2_the_folder_with_node_is_the_one_added_to_kvmans_path() {
    let windows = bundled_runtime(Path::new("/app"), Platform::Windows);
    let start = start_command(&windows.node, &windows.entry, Path::new("/home/ahmed"), Some("C:\\Windows"), Platform::Windows);
    assert_eq!(start.path, format!("C:\\Windows;{}", Path::new("/app").join("runtime").join("node").display()));
}

#[test]
fn m3_3_e5_the_app_runs_the_bundled_runtime_when_it_has_one() {
    let resources = Path::new("/usr/lib/kvman");
    let bundled = bundled_runtime(resources, Platform::Unix);
    let everything = |_: &Path| true;
    assert_eq!(choose_runtime(Some(resources), "/usr/bin", Platform::Unix, &everything), Some(bundled.clone()));

    let only_system = |file: &Path| file == Path::new("/usr/bin/node");
    let repository = choose_runtime(Some(resources), "/opt/none:/usr/bin", Platform::Unix, &only_system);
    let entry: PathBuf = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("cli").join("dist").join("main.js");
    assert_eq!(
        repository,
        Some(Runtime {
            node: "/usr/bin/node".into(),
            entry
        })
    );
    assert_eq!(
        choose_runtime(None, "/usr/bin", Platform::Unix, &only_system).map(|runtime| runtime.node),
        Some("/usr/bin/node".into())
    );

    let half = |file: &Path| file == bundled.node;
    assert_eq!(choose_runtime(Some(resources), "", Platform::Unix, &half), None);
    assert_eq!(
        node_on_path("C:\\a;C:\\b", Platform::Windows, &|file| file == Path::new("C:\\b").join("node.exe")),
        Some(Path::new("C:\\b").join("node.exe"))
    );
    assert_eq!(kvman_home(Some("/data/kv"), Path::new("/home/ahmed")), Path::new("/data/kv"));
    assert_eq!(kvman_home(Some(""), Path::new("/home/ahmed")), Path::new("/home/ahmed/.kvman"));
    assert_eq!(kvman_home(None, Path::new("/home/ahmed")), Path::new("/home/ahmed/.kvman"));
}
