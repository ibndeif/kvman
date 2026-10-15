//! Where the Node and the kvman that the app runs are (plan 14 §14.3): the ones an installed app brings in its
//! resources, or, for an app run from the repository, the repository's own kvman and the Node on the `PATH`.

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

/// The runtime inside an installed app's resources, as `release/desktop` lays it out.
pub fn bundled_runtime(resources: &Path, platform: Platform) -> Runtime {
    let runtime = resources.join("runtime");
    let node = if platform == Platform::Windows {
        runtime.join("node").join("node.exe")
    } else {
        runtime.join("node").join("bin").join("node")
    };
    Runtime {
        node,
        entry: runtime.join("kvman").join("dist").join("main.js"),
    }
}

/// The bundled runtime when the app has one, else the repository's.
pub fn choose_runtime(resources: Option<&Path>, path: &str, platform: Platform, exists: &dyn Fn(&Path) -> bool) -> Option<Runtime> {
    let bundled = resources
        .map(|folder| bundled_runtime(folder, platform))
        .filter(|runtime| exists(&runtime.node) && exists(&runtime.entry));
    bundled.or_else(|| {
        Some(Runtime {
            node: node_on_path(path, platform, exists)?,
            entry: repository_entry(Path::new(env!("CARGO_MANIFEST_DIR"))),
        })
    })
}

/// kvman's home folder: `KVMAN_HOME`, else `.kvman` in the user's home folder (plan 01 §1.3).
pub fn kvman_home(variable: Option<&str>, user_folder: &Path) -> PathBuf {
    match variable {
        Some(folder) if !folder.is_empty() => PathBuf::from(folder),
        _ => user_folder.join(".kvman"),
    }
}

/// A branded app's name and id, which the brand build writes into its runtime (plan 14 §14.9, ADR 0082, 14).
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Brand {
    pub name: String,
    pub id: String,
}

/// The brand in an installed app's resources: none when it has no brand file, as kvman's own app hasn't, and an error
/// for one that can't be read or isn't a brand.
pub fn brand_of(resources: Option<&Path>, read: &dyn Fn(&Path) -> std::io::Result<String>) -> Result<Option<Brand>, String> {
    let Some(folder) = resources else { return Ok(None) };
    let file = folder.join("runtime").join("brand").join("brand.json");
    match read(&file) {
        Ok(text) => serde_json::from_str(&text).map(Some).map_err(|error| format!("{} isn't a brand: {error}", file.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("{} can't be read: {error}", file.display())),
    }
}

/// The preset a branded app starts.
pub fn brand_preset(resources: &Path) -> PathBuf {
    resources.join("runtime").join("brand").join("preset.json")
}

/// A branded app's own home folder, so it never meets a running kvman Coder.
pub fn brand_home(user_folder: &Path, brand: &Brand) -> PathBuf {
    user_folder.join(format!(".{}", brand.id))
}
