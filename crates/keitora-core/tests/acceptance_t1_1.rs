// SPDX-License-Identifier: MIT OR Apache-2.0

//! Acceptance tests for T-1.1: the data model (`Blocklist`, `Target`,
//! `AppIdentifiers`, `SitePattern`), its JSON shape and its validation.
//!
//! # Expected public API
//!
//! Everything lives in `keitora_core::model`:
//!
//! - `Blocklist`, `Target`, `AppIdentifiers` and `SitePattern`, each
//!   implementing `serde::Serialize`, `serde::Deserialize`, `Debug` and
//!   `PartialEq`.
//! - `Blocklist::validate(&self) -> Result<(), E>`, where `E` implements
//!   `std::error::Error`. Invalid input may be rejected either by
//!   deserialization or by `validate`; the tests only require that it is
//!   rejected by one of them, and that valid input passes both.
//! - Public `usize` constants, whose values the developer picks:
//!   - `MAX_TARGETS`: most targets (sites and apps together) in one blocklist.
//!   - `MAX_EXCEPTIONS`: most exceptions in one blocklist.
//!   - `MAX_NAME_LEN`: longest blocklist name and app name.
//!   - `MAX_PATTERN_LEN`: longest site pattern, in a target or an exception.
//!   - `MAX_APP_ID_LEN`: longest value of each `AppIdentifiers` field
//!     (`windows_exe`, `windows_path`, `android_package`, `ios_token`).
//!
//!   The boundary tests use ASCII text only, so they hold whether lengths are
//!   counted in bytes or in characters; the developer documents which.
//!
//! # JSON shape (chosen here, following `docs/architecture.md`)
//!
//! ```json
//! {
//!   "id": "3f0c6b1e-8a52-4c1d-9e2b-7d4a1f6c0b9e",
//!   "name": "Deep work",
//!   "color": "#e5484d",
//!   "targets": [
//!     { "kind": "site", "pattern": "youtube.com" },
//!     { "kind": "app", "name": "Steam", "ids": { "windows_exe": "steam.exe" } }
//!   ],
//!   "exceptions": ["youtube.com/feed/subscriptions"],
//!   "block_during_breaks": false
//! }
//! ```
//!
//! `Target` is tagged by `kind` (`"site"` or `"app"`), a `SitePattern` is a
//! plain JSON string, and an `AppIdentifiers` field that is not set is left out
//! of the JSON rather than written as `null`.
//!
//! # Criteria covered
//!
//! - **AC1** — types are `serde`-serializable; JSON round-trip tests:
//!   `blocklist_round_trips_through_json_unchanged`,
//!   `blocklist_with_no_targets_or_exceptions_round_trips`,
//!   `blocklist_name_with_non_ascii_text_round_trips`,
//!   `site_target_round_trips_as_kind_site_with_a_pattern`,
//!   `app_target_round_trips_as_kind_app_with_name_and_ids`,
//!   `app_identifiers_with_every_platform_round_trip`,
//!   `app_identifiers_that_are_not_set_are_left_out_of_the_json`,
//!   `site_pattern_round_trips_as_a_plain_string`,
//!   `target_with_an_unknown_kind_is_rejected`,
//!   `site_target_without_a_pattern_is_rejected`,
//!   `blocklist_with_malformed_targets_is_rejected`,
//!   `well_formed_blocklist_passes_validation`,
//!   `documented_site_pattern_forms_pass_validation`.
//! - **S1** (#11) — an app path is opaque text that is only compared, never
//!   opened or resolved; validation rejects UNC, device and relative paths:
//!   `windows_path_accepts_fully_qualified_drive_paths`,
//!   `windows_path_that_does_not_exist_is_accepted`,
//!   `windows_path_text_is_kept_verbatim_through_json`,
//!   `windows_path_rejects_unc_paths`,
//!   `windows_path_rejects_device_paths`,
//!   `windows_path_rejects_relative_paths`,
//!   `windows_path_rejects_an_empty_path`.
//!   Whether the code ever opens or resolves a path can't be observed from a
//!   test; review checks that `keitora-core` uses no file system API.
//! - **S2** (#15) — the number of targets and the length of names and
//!   patterns have defined maximums, and validation rejects values above them:
//!   `blocklist_accepts_exactly_max_targets`,
//!   `blocklist_rejects_one_target_over_max_targets`,
//!   `apps_and_sites_count_together_toward_max_targets`,
//!   `blocklist_accepts_exactly_max_exceptions`,
//!   `blocklist_rejects_one_exception_over_max_exceptions`,
//!   `blocklist_name_at_max_length_is_accepted_and_one_more_is_rejected`,
//!   `app_name_at_max_length_is_accepted_and_one_more_is_rejected`,
//!   `site_pattern_at_max_length_is_accepted_and_one_more_is_rejected`,
//!   `exception_pattern_at_max_length_is_accepted_and_one_more_is_rejected`,
//!   `app_identifiers_at_max_length_are_accepted_and_one_more_is_rejected`,
//!   `empty_site_pattern_is_rejected`.

#![cfg(test)]

use keitora_core::model::{
    AppIdentifiers, Blocklist, MAX_APP_ID_LEN, MAX_EXCEPTIONS, MAX_NAME_LEN, MAX_PATTERN_LEN,
    MAX_TARGETS, SitePattern, Target,
};
use serde_json::{Value, json};

const ID: &str = "3f0c6b1e-8a52-4c1d-9e2b-7d4a1f6c0b9e";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// A site target as JSON.
fn site(pattern: &str) -> Value {
    json!({ "kind": "site", "pattern": pattern })
}

/// An app target as JSON.
fn app(name: &str, ids: Value) -> Value {
    json!({ "kind": "app", "name": name, "ids": ids })
}

/// A blocklist as JSON with the given name, targets and exceptions.
fn blocklist(name: &str, targets: Vec<Value>, exceptions: Vec<Value>) -> Value {
    json!({
        "id": ID,
        "name": name,
        "color": "#e5484d",
        "targets": targets,
        "exceptions": exceptions,
        "block_during_breaks": false,
    })
}

/// A realistic blocklist with every kind of value set; it is valid.
fn full_blocklist() -> Value {
    json!({
        "id": ID,
        "name": "Deep work",
        "color": "#e5484d",
        "targets": [
            { "kind": "site", "pattern": "youtube.com" },
            { "kind": "site", "pattern": "*.reddit.com" },
            { "kind": "site", "pattern": "youtube.com/shorts" },
            {
                "kind": "app",
                "name": "Steam",
                "ids": {
                    "windows_exe": "steam.exe",
                    "windows_path": "C:\\Program Files (x86)\\Steam\\steam.exe",
                },
            },
            {
                "kind": "app",
                "name": "WhatsApp",
                "ids": {
                    "windows_exe": "WhatsApp.exe",
                    "android_package": "com.whatsapp",
                    "ios_token": "opaque-device-local-token",
                },
            },
        ],
        "exceptions": ["youtube.com/feed/subscriptions", "old.reddit.com/r/rust"],
        "block_during_breaks": true,
    })
}

/// A blocklist with a single app whose only identifier is `windows_path`.
fn with_windows_path(path: &str) -> Value {
    blocklist(
        "Games",
        vec![app("Game", json!({ "windows_path": path }))],
        vec![],
    )
}

/// Deserializes `json` as a `Blocklist` and validates it. `Err` says which
/// step rejected it.
fn check(json: Value) -> Result<(), String> {
    let parsed: Blocklist =
        serde_json::from_value(json).map_err(|e| format!("deserialization: {e}"))?;
    parsed.validate().map_err(|e| describe(&e))
}

/// Formats a validation error; requires it to be a real error type.
fn describe<E: std::error::Error>(error: &E) -> String {
    format!("validation: {error}")
}

fn assert_accepted(json: Value, what: &str) {
    if let Err(reason) = check(json) {
        panic!("{what} should be accepted, but was rejected by {reason}");
    }
}

fn assert_rejected(json: Value, what: &str) {
    assert!(
        check(json).is_err(),
        "{what} should be rejected, but was accepted"
    );
}

/// Serializes `value`, asserts the JSON equals `expected`, then deserializes it
/// again and asserts it equals `value`.
fn assert_json_round_trip<T>(expected: &Value)
where
    T: serde::Serialize + serde::de::DeserializeOwned + std::fmt::Debug + PartialEq,
{
    let value: T = serde_json::from_value(expected.clone()).expect("fixture deserializes");
    let written = serde_json::to_value(&value).expect("value serializes");
    assert_eq!(&written, expected, "serialized JSON differs from the input");
    let again: T = serde_json::from_value(written).expect("serialized JSON deserializes");
    assert_eq!(again, value, "value changed after a round trip");
    let text = serde_json::to_string(&value).expect("value serializes to text");
    let from_text: T = serde_json::from_str(&text).expect("text deserializes");
    assert_eq!(
        from_text, value,
        "value changed after a round trip through text"
    );
}

/// A string of `len` ASCII letters.
fn letters(len: usize) -> String {
    "a".repeat(len)
}

/// A path pattern (`example.com/aaa…`) exactly `len` bytes long.
fn pattern_of_len(len: usize) -> String {
    let prefix = "example.com/";
    let rest = len
        .checked_sub(prefix.len())
        .expect("MAX_PATTERN_LEN is long enough for a domain and a path");
    let pattern = format!("{prefix}{}", letters(rest));
    assert_eq!(pattern.len(), len);
    pattern
}

/// `AppIdentifiers` JSON with only `field` set to `value`.
fn single_id(field: &str, value: String) -> Value {
    let mut ids = serde_json::Map::new();
    ids.insert(field.to_owned(), Value::String(value));
    Value::Object(ids)
}

/// `n` distinct site targets.
fn sites(n: usize) -> Vec<Value> {
    (0..n).map(|i| site(&format!("site{i}.example"))).collect()
}

/// `n` distinct exceptions.
fn exceptions(n: usize) -> Vec<Value> {
    (0..n)
        .map(|i| Value::String(format!("example.com/allowed/{i}")))
        .collect()
}

// ---------------------------------------------------------------------------
// AC1 — serde and JSON round trips
// ---------------------------------------------------------------------------

#[test]
fn blocklist_round_trips_through_json_unchanged() {
    assert_json_round_trip::<Blocklist>(&full_blocklist());
}

#[test]
fn blocklist_with_no_targets_or_exceptions_round_trips() {
    let empty = blocklist("New list", vec![], vec![]);
    assert_json_round_trip::<Blocklist>(&empty);
    assert_accepted(empty, "a blocklist with no targets or exceptions");
}

#[test]
fn blocklist_name_with_non_ascii_text_round_trips() {
    let named = blocklist(
        "Redes sociales — ñ, 日本語, 🎮",
        vec![site("x.com")],
        vec![],
    );
    assert_json_round_trip::<Blocklist>(&named);
    assert_accepted(named, "a blocklist whose name has non-ASCII text");
}

#[test]
fn site_target_round_trips_as_kind_site_with_a_pattern() {
    assert_json_round_trip::<Target>(&site("youtube.com"));
    assert_json_round_trip::<Target>(&site("*.reddit.com"));
    assert_json_round_trip::<Target>(&site("youtube.com/shorts"));
}

#[test]
fn app_target_round_trips_as_kind_app_with_name_and_ids() {
    assert_json_round_trip::<Target>(&app(
        "Discord",
        json!({
            "windows_exe": "Discord.exe",
            "windows_path": "C:\\Users\\Ana\\AppData\\Local\\Discord\\app-1.0.9\\Discord.exe",
        }),
    ));
}

#[test]
fn app_identifiers_with_every_platform_round_trip() {
    assert_json_round_trip::<AppIdentifiers>(&json!({
        "windows_exe": "WhatsApp.exe",
        "windows_path": "C:\\Program Files\\WindowsApps\\WhatsApp\\WhatsApp.exe",
        "android_package": "com.whatsapp",
        "ios_token": "opaque-device-local-token",
    }));
}

#[test]
fn app_identifiers_that_are_not_set_are_left_out_of_the_json() {
    // Each identifier on its own: the others must not appear as `null`.
    assert_json_round_trip::<AppIdentifiers>(&json!({ "windows_exe": "steam.exe" }));
    assert_json_round_trip::<AppIdentifiers>(&json!({ "windows_path": "D:\\Games\\game.exe" }));
    assert_json_round_trip::<AppIdentifiers>(&json!({ "android_package": "com.spotify.music" }));
    assert_json_round_trip::<AppIdentifiers>(&json!({ "ios_token": "token" }));
}

#[test]
fn site_pattern_round_trips_as_a_plain_string() {
    assert_json_round_trip::<SitePattern>(&json!("youtube.com/feed/subscriptions"));
    assert_json_round_trip::<SitePattern>(&json!("*.reddit.com"));
}

#[test]
fn target_with_an_unknown_kind_is_rejected() {
    let unknown = json!({ "kind": "device", "pattern": "youtube.com" });
    assert!(serde_json::from_value::<Target>(unknown).is_err());
    let untagged = json!({ "pattern": "youtube.com" });
    assert!(serde_json::from_value::<Target>(untagged).is_err());
}

#[test]
fn site_target_without_a_pattern_is_rejected() {
    assert!(serde_json::from_value::<Target>(json!({ "kind": "site" })).is_err());
}

#[test]
fn blocklist_with_malformed_targets_is_rejected() {
    let malformed = [
        json!("youtube.com"),
        json!([42]),
        json!([{ "kind": "app", "name": "Steam", "ids": "steam.exe" }]),
    ];
    for targets in malformed {
        let mut broken = full_blocklist();
        broken["targets"] = targets.clone();
        assert!(
            serde_json::from_value::<Blocklist>(broken).is_err(),
            "a blocklist with targets {targets} should not deserialize"
        );
    }
}

#[test]
fn well_formed_blocklist_passes_validation() {
    assert_accepted(full_blocklist(), "the full example blocklist");
}

#[test]
fn documented_site_pattern_forms_pass_validation() {
    for pattern in ["youtube.com", "*.reddit.com", "youtube.com/shorts"] {
        assert_accepted(
            blocklist("Sites", vec![site(pattern)], vec![]),
            &format!("site target `{pattern}`"),
        );
        assert_accepted(
            blocklist("Sites", vec![], vec![json!(pattern)]),
            &format!("exception `{pattern}`"),
        );
    }
}

// ---------------------------------------------------------------------------
// S1 (#11) — app paths are opaque text; UNC, device and relative are rejected
// ---------------------------------------------------------------------------

#[test]
fn windows_path_accepts_fully_qualified_drive_paths() {
    for path in [
        "C:\\Program Files\\Steam\\steam.exe",
        "C:\\Program Files (x86)\\Epic Games\\Launcher\\EpicGamesLauncher.exe",
        "d:\\games\\game.exe",
        "C:\\Users\\José\\AppData\\Local\\Discord\\Discord.exe",
    ] {
        assert_accepted(with_windows_path(path), &format!("path `{path}`"));
    }
}

#[test]
fn windows_path_that_does_not_exist_is_accepted() {
    // Validation looks at the text only; it never checks the file system.
    assert_accepted(
        with_windows_path("Q:\\Keitora\\does-not-exist\\8c1f2e0a\\ghost.exe"),
        "a path to a file that does not exist",
    );
}

#[test]
fn windows_path_text_is_kept_verbatim_through_json() {
    // Opaque text: no case folding, no `..` or `.` resolution, no separator
    // changes.
    for path in [
        "C:\\Program Files\\Steam\\..\\Steam\\STEAM.EXE",
        "c:\\PROGRAM FILES\\steam\\steam.exe",
        "C:\\Games\\.\\game.exe",
    ] {
        let ids = json!({ "windows_path": path });
        assert_json_round_trip::<AppIdentifiers>(&ids);
        assert_json_round_trip::<Target>(&app("Game", ids));
    }
}

#[test]
fn windows_path_rejects_unc_paths() {
    // Control: the same blocklist with a drive path is accepted, so each
    // rejection below is caused by the path alone.
    assert_accepted(
        with_windows_path("C:\\share\\x.exe"),
        "the drive-path control",
    );
    for path in [
        "\\\\server\\share\\x.exe",
        "\\\\192.168.1.10\\share\\x.exe",
        "\\\\attacker.example@SSL\\DavWWWRoot\\x.exe",
        "//server/share/x.exe",
        "\\\\server/share/x.exe",
        "/\\server\\share\\x.exe",
        "\\/server\\share\\x.exe",
    ] {
        assert_rejected(with_windows_path(path), &format!("UNC path `{path}`"));
    }
}

#[test]
fn windows_path_rejects_device_paths() {
    assert_accepted(
        with_windows_path("C:\\Games\\x.exe"),
        "the drive-path control",
    );
    for path in [
        "\\\\?\\C:\\Games\\x.exe",
        "\\\\.\\C:\\Games\\x.exe",
        "\\\\?\\UNC\\server\\share\\x.exe",
        "\\\\.\\UNC\\server\\share\\x.exe",
        "\\\\?\\Volume{01234567-89ab-cdef-0123-456789abcdef}\\x.exe",
        "\\\\.\\pipe\\keitora",
        "//?/C:/Games/x.exe",
        "//./C:/Games/x.exe",
        // NT object namespace prefix.
        "\\??\\C:\\Games\\x.exe",
    ] {
        assert_rejected(with_windows_path(path), &format!("device path `{path}`"));
    }
}

#[test]
fn windows_path_rejects_relative_paths() {
    assert_accepted(
        with_windows_path("C:\\Steam\\steam.exe"),
        "the drive-path control",
    );
    for path in [
        "steam.exe",
        "Steam\\steam.exe",
        ".\\steam.exe",
        "..\\Steam\\steam.exe",
        "./steam.exe",
        // Relative to the current directory of drive C.
        "C:steam.exe",
        "C:Games\\steam.exe",
        // Rooted, but on whichever drive is current.
        "\\Games\\steam.exe",
        "/Games/steam.exe",
    ] {
        assert_rejected(with_windows_path(path), &format!("relative path `{path}`"));
    }
}

#[test]
fn windows_path_rejects_an_empty_path() {
    assert_rejected(with_windows_path(""), "an empty path");
}

// ---------------------------------------------------------------------------
// S2 (#15) — maximums on counts and lengths, tested at the exact boundary
// ---------------------------------------------------------------------------

#[test]
fn blocklist_accepts_exactly_max_targets() {
    assert_accepted(
        blocklist("Many", sites(MAX_TARGETS), vec![]),
        "a blocklist with MAX_TARGETS targets",
    );
}

#[test]
fn blocklist_rejects_one_target_over_max_targets() {
    assert_rejected(
        blocklist("Many", sites(MAX_TARGETS + 1), vec![]),
        "a blocklist with MAX_TARGETS + 1 targets",
    );
}

#[test]
fn apps_and_sites_count_together_toward_max_targets() {
    let steam = app("Steam", json!({ "windows_exe": "steam.exe" }));

    let mut at_max = sites(MAX_TARGETS - 1);
    at_max.push(steam.clone());
    assert_accepted(
        blocklist("Mixed", at_max, vec![]),
        "MAX_TARGETS - 1 sites plus one app",
    );

    let mut over_max = sites(MAX_TARGETS);
    over_max.push(steam);
    assert_rejected(
        blocklist("Mixed", over_max, vec![]),
        "MAX_TARGETS sites plus one app",
    );
}

#[test]
fn blocklist_accepts_exactly_max_exceptions() {
    assert_accepted(
        blocklist(
            "Many",
            vec![site("example.com")],
            exceptions(MAX_EXCEPTIONS),
        ),
        "a blocklist with MAX_EXCEPTIONS exceptions",
    );
}

#[test]
fn blocklist_rejects_one_exception_over_max_exceptions() {
    assert_rejected(
        blocklist(
            "Many",
            vec![site("example.com")],
            exceptions(MAX_EXCEPTIONS + 1),
        ),
        "a blocklist with MAX_EXCEPTIONS + 1 exceptions",
    );
}

#[test]
fn blocklist_name_at_max_length_is_accepted_and_one_more_is_rejected() {
    assert_accepted(
        blocklist(&letters(MAX_NAME_LEN), vec![], vec![]),
        "a blocklist name of MAX_NAME_LEN",
    );
    assert_rejected(
        blocklist(&letters(MAX_NAME_LEN + 1), vec![], vec![]),
        "a blocklist name of MAX_NAME_LEN + 1",
    );
}

#[test]
fn app_name_at_max_length_is_accepted_and_one_more_is_rejected() {
    let ids = json!({ "windows_exe": "steam.exe" });
    assert_accepted(
        blocklist(
            "Apps",
            vec![app(&letters(MAX_NAME_LEN), ids.clone())],
            vec![],
        ),
        "an app name of MAX_NAME_LEN",
    );
    assert_rejected(
        blocklist("Apps", vec![app(&letters(MAX_NAME_LEN + 1), ids)], vec![]),
        "an app name of MAX_NAME_LEN + 1",
    );
}

#[test]
fn site_pattern_at_max_length_is_accepted_and_one_more_is_rejected() {
    assert_accepted(
        blocklist(
            "Sites",
            vec![site(&pattern_of_len(MAX_PATTERN_LEN))],
            vec![],
        ),
        "a site pattern of MAX_PATTERN_LEN",
    );
    assert_rejected(
        blocklist(
            "Sites",
            vec![site(&pattern_of_len(MAX_PATTERN_LEN + 1))],
            vec![],
        ),
        "a site pattern of MAX_PATTERN_LEN + 1",
    );
}

#[test]
fn exception_pattern_at_max_length_is_accepted_and_one_more_is_rejected() {
    assert_accepted(
        blocklist(
            "Sites",
            vec![],
            vec![json!(pattern_of_len(MAX_PATTERN_LEN))],
        ),
        "an exception of MAX_PATTERN_LEN",
    );
    assert_rejected(
        blocklist(
            "Sites",
            vec![],
            vec![json!(pattern_of_len(MAX_PATTERN_LEN + 1))],
        ),
        "an exception of MAX_PATTERN_LEN + 1",
    );
}

#[test]
fn app_identifiers_at_max_length_are_accepted_and_one_more_is_rejected() {
    // Each value is valid apart from its length.
    let exe = |len: usize| format!("{}.exe", letters(len - 4));
    let path = |len: usize| format!("C:\\{}.exe", letters(len - 7));
    let package = |len: usize| format!("com.{}", letters(len - 4));
    let token = |len: usize| letters(len);

    let cases: [(&str, &dyn Fn(usize) -> String); 4] = [
        ("windows_exe", &exe),
        ("windows_path", &path),
        ("android_package", &package),
        ("ios_token", &token),
    ];
    for (field, make) in cases {
        let at_max = make(MAX_APP_ID_LEN);
        let over_max = make(MAX_APP_ID_LEN + 1);
        assert_eq!(at_max.len(), MAX_APP_ID_LEN);
        assert_eq!(over_max.len(), MAX_APP_ID_LEN + 1);

        assert_accepted(
            blocklist("Apps", vec![app("App", single_id(field, at_max))], vec![]),
            &format!("`{field}` of MAX_APP_ID_LEN"),
        );
        assert_rejected(
            blocklist("Apps", vec![app("App", single_id(field, over_max))], vec![]),
            &format!("`{field}` of MAX_APP_ID_LEN + 1"),
        );
    }
}

#[test]
fn empty_site_pattern_is_rejected() {
    // An empty pattern means nothing, and as an exception it must never be
    // able to exempt every site.
    assert_accepted(
        blocklist(
            "Sites",
            vec![site("youtube.com")],
            vec![json!("youtube.com/feed")],
        ),
        "the non-empty control",
    );
    assert_rejected(
        blocklist("Sites", vec![site("")], vec![]),
        "an empty site target",
    );
    assert_rejected(
        blocklist("Sites", vec![site("youtube.com")], vec![json!("")]),
        "an empty exception",
    );
}
