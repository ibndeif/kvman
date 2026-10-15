use std::io::{Error, ErrorKind};
use std::path::{Path, PathBuf};

use kvman_desktop::kvman_process::{start_command, with_brand, Platform};
use kvman_desktop::runtime::{brand_home, brand_of, brand_preset, Brand};
use kvman_desktop::session::{Action, Happening, Session};

const RUNNING: &str = r#"{"kind":"running","url":"http://127.0.0.1:3737/?workspace=home","port":3737}"#;
const JOINED: &str = r#"{"kind":"joined","url":"http://127.0.0.1:3740/?workspace=home","port":3740}"#;

fn research() -> Brand {
    Brand {
        name: "Research Assistant".into(),
        id: "research-assistant".into(),
    }
}

fn line(session: &mut Session, text: &str) -> Vec<Action> {
    session.handle(Happening::Line(text.to_owned()))
}

#[test]
fn qa52_h17_a_branded_app_starts_its_own_kvman_and_opens_straight_into_home() {
    let resources = Path::new("/opt/research");
    let read = |file: &Path| -> std::io::Result<String> {
        assert_eq!(file, Path::new("/opt/research/runtime/brand/brand.json"));
        Ok(r#"{"name":"Research Assistant","id":"research-assistant"}"#.to_owned())
    };
    let brand = brand_of(Some(resources), &read);
    assert_eq!(brand, Ok(Some(research())));

    let home = brand_home(Path::new("/home/sara"), &research());
    assert_eq!(home, PathBuf::from("/home/sara/.research-assistant"));
    let plain = start_command(
        Path::new("/opt/research/runtime/node/bin/node"),
        Path::new("/opt/research/runtime/kvman/dist/main.js"),
        Path::new("/home/sara"),
        None,
        Platform::Unix,
    );
    let branded = with_brand(plain.clone(), &home, &brand_preset(resources));
    let mut expected = plain.args.clone();
    expected.extend(["--home", "/home/sara/.research-assistant", "--preset", "/opt/research/runtime/brand/preset.json"].map(str::to_owned));
    assert_eq!(branded.args, expected);
    assert_eq!((branded.program, branded.folder, branded.path), (plain.program, plain.folder, plain.path));

    let mut session = Session::branded(&home);
    assert_eq!(line(&mut session, RUNNING), [Action::Load("http://127.0.0.1:3737/?workspace=home".into())]);
    let mut joined = Session::branded(&home);
    assert_eq!(line(&mut joined, JOINED), [Action::Load("http://127.0.0.1:3740/?workspace=home".into())]);
}

#[test]
fn qa52_e14_an_app_without_a_brand_is_unchanged_and_a_broken_brand_file_is_an_error() {
    let missing = |_: &Path| -> std::io::Result<String> { Err(Error::from(ErrorKind::NotFound)) };
    assert_eq!(brand_of(Some(Path::new("/usr/lib/kvman")), &missing), Ok(None));
    assert_eq!(brand_of(None, &missing), Ok(None));
    let broken = |_: &Path| -> std::io::Result<String> { Ok(r#"{"name":"X"}"#.to_owned()) };
    assert!(brand_of(Some(Path::new("/opt/x")), &broken).is_err_and(|message| message.contains("isn't a brand")));
    let unreadable = |_: &Path| -> std::io::Result<String> { Err(Error::from(ErrorKind::PermissionDenied)) };
    assert!(brand_of(Some(Path::new("/opt/x")), &unreadable).is_err_and(|message| message.contains("can't be read")));

    let start = start_command(
        Path::new("/usr/bin/node"),
        Path::new("/usr/lib/kvman/main.js"),
        Path::new("/home/sara"),
        None,
        Platform::Unix,
    );
    assert_eq!(start.args, ["/usr/lib/kvman/main.js", "--pipe", "--no-open"]);
    let mut session = Session::new(Path::new("/home/sara/.kvman"));
    assert_eq!(line(&mut session, RUNNING), [Action::ShowHome]);
}
