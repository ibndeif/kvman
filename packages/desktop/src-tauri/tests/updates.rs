use kvman_desktop::updates::{installed_as, offer, Checked, Installed, Offer, RELEASE_PAGE};

fn offered(version: &str, action: &'static str) -> Option<Offer> {
    Some(Offer { version: version.into(), action })
}

#[test]
fn m3_3_h3_a_newer_version_is_offered_and_none_offers_nothing() {
    assert_eq!(offer(Checked::Newer("0.4.0".into()), Installed::Replaceable), offered("0.4.0", "install"));
    assert_eq!(offer(Checked::Nothing, Installed::Replaceable), None);
    let sent = serde_json::to_value(offered("0.4.0", "install")).unwrap_or_default();
    assert_eq!(sent, serde_json::json!({ "version": "0.4.0", "action": "install" }));
}

#[test]
fn m3_3_h4_a_check_that_fails_offers_nothing() {
    assert_eq!(offer(Checked::Failed, Installed::Replaceable), None);
    assert_eq!(offer(Checked::Failed, Installed::Packaged), None);
}

#[test]
fn m3_3_h6_only_an_app_that_can_replace_itself_installs_and_a_deb_install_downloads() {
    assert_eq!(installed_as(true, Some("/home/ahmed/kvman.AppImage")), Installed::Replaceable);
    assert_eq!(installed_as(true, None), Installed::Packaged);
    assert_eq!(installed_as(true, Some("")), Installed::Packaged);
    assert_eq!(installed_as(false, None), Installed::Replaceable);
    assert_eq!(offer(Checked::Newer("0.4.0".into()), installed_as(true, None)), offered("0.4.0", "download"));
    assert_eq!(offer(Checked::Newer("0.4.0".into()), installed_as(false, None)), offered("0.4.0", "install"));
    assert_eq!(RELEASE_PAGE, "https://github.com/ibndeif/kvman/releases/latest");
}
