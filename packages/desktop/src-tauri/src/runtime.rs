//! Where the Node and the kvman that the app runs are. In this phase of the build it is the repository's own kvman and
//! the Node on the `PATH`; the installers bring their own (plan 14 §14.3).

use std::path::{Path, PathBuf};

use crate::kvman_process::Platform;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Runtime {
    pub node: PathBuf,
    pub entry: PathBuf,
}

/// The first `node` in the folders of a `PATH`.
pub fn node_on_path(path: &str, platform: Platform, exists: &dyn Fn(&Path) -> bool) -> Option<PathBuf> {
    let (separator, program) = if platform == Platform::Windows { (';', "node.exe") } else { (':', "node") };
    path.split(separator)
        .filter(|folder| !folder.is_empty())
        .map(|folder| Path::new(folder).join(program))
        .find(|candidate| exists(candidate))
}

/// The repository's built kvman, beside this package.
pub fn repository_entry(manifest_folder: &Path) -> PathBuf {
    manifest_folder.join("..").join("..").join("cli").join("dist").join("main.js")
}

pub fn repository_runtime(path: &str) -> Option<Runtime> {
    let node = node_on_path(path, Platform::current(), &|candidate| candidate.is_file())?;
    Some(Runtime {
        node,
        entry: repository_entry(Path::new(env!("CARGO_MANIFEST_DIR"))),
    })
}

/// kvman's home folder: `KVMAN_HOME`, else `.kvman` in the user's home folder (plan 01 §1.3).
pub fn kvman_home(variable: Option<&str>, user_folder: &Path) -> PathBuf {
    match variable {
        Some(folder) if !folder.is_empty() => PathBuf::from(folder),
        _ => user_folder.join(".kvman"),
    }
}
