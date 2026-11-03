// SPDX-License-Identifier: MIT OR Apache-2.0

use super::*;

/// A valid blocklist with a site, an app and an exception.
fn valid() -> Blocklist {
    Blocklist {
        id: "3f0c6b1e-8a52-4c1d-9e2b-7d4a1f6c0b9e".to_owned(),
        name: "Deep work".to_owned(),
        color: "#e5484d".to_owned(),
        targets: vec![site("youtube.com"), app(exe("steam.exe"))],
        exceptions: vec![SitePattern::new("youtube.com/feed")],
        block_during_breaks: false,
    }
}

fn site(pattern: &str) -> Target {
    Target::Site {
        pattern: SitePattern::new(pattern),
    }
}

fn app(ids: AppIdentifiers) -> Target {
    Target::App {
        name: "Steam".to_owned(),
        ids,
    }
}

fn exe(name: &str) -> AppIdentifiers {
    AppIdentifiers {
        windows_exe: Some(name.to_owned()),
        ..AppIdentifiers::default()
    }
}

fn path(path: &str) -> AppIdentifiers {
    AppIdentifiers {
        windows_path: Some(path.to_owned()),
        ..AppIdentifiers::default()
    }
}

/// `valid()` with its app's identifiers replaced.
fn with_ids(ids: AppIdentifiers) -> Blocklist {
    Blocklist {
        targets: vec![site("youtube.com"), app(ids)],
        ..valid()
    }
}

/// Validates a blocklist that must be rejected, and returns why.
fn rejection(blocklist: &Blocklist) -> (String, ValidationErrorKind) {
    let error = blocklist
        .validate()
        .expect_err("the blocklist should be rejected");
    (error.field().to_owned(), error.kind())
}

fn rejected_as(field: &str, kind: ValidationErrorKind) -> (String, ValidationErrorKind) {
    (field.to_owned(), kind)
}

#[test]
fn a_valid_blocklist_passes() {
    assert_eq!(valid().validate(), Ok(()));
}

#[test]
fn id_is_bounded() {
    let at_max = Blocklist {
        id: "a".repeat(MAX_ID_LEN),
        ..valid()
    };
    assert_eq!(at_max.validate(), Ok(()));

    let over_max = Blocklist {
        id: "a".repeat(MAX_ID_LEN + 1),
        ..valid()
    };
    assert_eq!(
        rejection(&over_max),
        rejected_as(
            "id",
            ValidationErrorKind::TooLong {
                len: MAX_ID_LEN + 1,
                max: MAX_ID_LEN
            }
        )
    );
}

#[test]
fn id_must_not_be_empty_or_hold_control_characters() {
    let empty = Blocklist {
        id: String::new(),
        ..valid()
    };
    assert_eq!(
        rejection(&empty),
        rejected_as("id", ValidationErrorKind::Empty)
    );

    let control = Blocklist {
        id: "3f0c\n6b1e".to_owned(),
        ..valid()
    };
    assert_eq!(
        rejection(&control),
        rejected_as("id", ValidationErrorKind::ControlCharacter)
    );
}

#[test]
fn name_must_not_be_empty_or_hold_control_characters() {
    let empty = Blocklist {
        name: String::new(),
        ..valid()
    };
    assert_eq!(
        rejection(&empty),
        rejected_as("name", ValidationErrorKind::Empty)
    );

    for name in [
        "Deep\nwork",
        "Deep\twork",
        "Deep\u{7f}work",
        "Deep\u{85}work",
    ] {
        let control = Blocklist {
            name: name.to_owned(),
            ..valid()
        };
        assert_eq!(
            rejection(&control),
            rejected_as("name", ValidationErrorKind::ControlCharacter),
            "{name:?}"
        );
    }
}

#[test]
fn lengths_count_bytes_not_characters() {
    // "é" is 2 bytes of UTF-8, so this name has MAX_NAME_LEN / 2 characters.
    let at_max = Blocklist {
        name: "é".repeat(MAX_NAME_LEN / 2),
        ..valid()
    };
    assert_eq!(at_max.name.len(), MAX_NAME_LEN);
    assert_eq!(at_max.validate(), Ok(()));

    let over_max = Blocklist {
        name: format!("{}a", at_max.name),
        ..valid()
    };
    assert_eq!(
        rejection(&over_max),
        rejected_as(
            "name",
            ValidationErrorKind::TooLong {
                len: MAX_NAME_LEN + 1,
                max: MAX_NAME_LEN
            }
        )
    );
}

#[test]
fn color_in_the_form_rrggbb_of_any_case_passes() {
    for color in ["#e5484d", "#E5484D", "#0a0B0c", "#000000", "#ffffff"] {
        let blocklist = Blocklist {
            color: color.to_owned(),
            ..valid()
        };
        assert_eq!(blocklist.validate(), Ok(()), "{color}");
    }
}

#[test]
fn color_in_any_other_form_is_rejected() {
    for color in [
        "",
        "e5484d",
        "#e5484",
        "#e5484dd",
        "#e5484d00",
        "#gggggg",
        "#e5 84d",
        "##e5484",
        "red",
        "rgb(229, 72, 77)",
        "#e5484\u{e9}",
        "#\u{ff10}\u{ff10}\u{ff10}",
    ] {
        let blocklist = Blocklist {
            color: color.to_owned(),
            ..valid()
        };
        assert_eq!(
            rejection(&blocklist),
            rejected_as("color", ValidationErrorKind::NotAColor),
            "{color:?}"
        );
    }

    let long = Blocklist {
        color: format!("#{}", "a".repeat(10_000)),
        ..valid()
    };
    assert_eq!(
        rejection(&long),
        rejected_as("color", ValidationErrorKind::NotAColor)
    );
}

#[test]
fn too_many_targets_or_exceptions_name_the_list() {
    let targets = Blocklist {
        targets: vec![site("example.com"); MAX_TARGETS + 1],
        ..valid()
    };
    assert_eq!(
        rejection(&targets),
        rejected_as(
            "targets",
            ValidationErrorKind::TooMany {
                count: MAX_TARGETS + 1,
                max: MAX_TARGETS
            }
        )
    );

    let exceptions = Blocklist {
        exceptions: vec![SitePattern::new("example.com/a"); MAX_EXCEPTIONS + 1],
        ..valid()
    };
    assert_eq!(
        rejection(&exceptions),
        rejected_as(
            "exceptions",
            ValidationErrorKind::TooMany {
                count: MAX_EXCEPTIONS + 1,
                max: MAX_EXCEPTIONS
            }
        )
    );
}

#[test]
fn counts_are_checked_before_the_items_they_count() {
    // Every target is invalid too, but the count is what's reported, so a
    // long list is rejected without looking at each item.
    let blocklist = Blocklist {
        targets: vec![site(""); MAX_TARGETS + 1],
        ..valid()
    };
    assert_eq!(
        rejection(&blocklist).1,
        ValidationErrorKind::TooMany {
            count: MAX_TARGETS + 1,
            max: MAX_TARGETS
        }
    );
}

#[test]
fn errors_name_the_json_path_of_the_value() {
    let pattern = Blocklist {
        targets: vec![site("youtube.com"), site("x.com"), site("")],
        ..valid()
    };
    assert_eq!(
        rejection(&pattern),
        rejected_as("targets[2].pattern", ValidationErrorKind::Empty)
    );

    let app_name = Blocklist {
        targets: vec![Target::App {
            name: String::new(),
            ids: exe("steam.exe"),
        }],
        ..valid()
    };
    assert_eq!(
        rejection(&app_name),
        rejected_as("targets[0].name", ValidationErrorKind::Empty)
    );

    let exception = Blocklist {
        exceptions: vec![
            SitePattern::new("youtube.com/feed"),
            SitePattern::new("a\nb"),
        ],
        ..valid()
    };
    assert_eq!(
        rejection(&exception),
        rejected_as("exceptions[1]", ValidationErrorKind::ControlCharacter)
    );
}

#[test]
fn an_app_needs_at_least_one_identifier() {
    assert_eq!(
        rejection(&with_ids(AppIdentifiers::default())),
        rejected_as("targets[1].ids", ValidationErrorKind::NoIdentifier)
    );
}

#[test]
fn an_app_with_identifiers_for_other_platforms_only_passes() {
    let android = AppIdentifiers {
        android_package: Some("com.whatsapp".to_owned()),
        ..AppIdentifiers::default()
    };
    assert_eq!(with_ids(android).validate(), Ok(()));

    let ios = AppIdentifiers {
        ios_token: Some("opaque-device-local-token".to_owned()),
        ..AppIdentifiers::default()
    };
    assert_eq!(with_ids(ios).validate(), Ok(()));
}

#[test]
fn identifiers_that_are_set_must_not_be_empty() {
    let cases = [
        ("targets[1].ids.windows_exe", exe("")),
        ("targets[1].ids.windows_path", path("")),
        (
            "targets[1].ids.android_package",
            AppIdentifiers {
                android_package: Some(String::new()),
                ..exe("steam.exe")
            },
        ),
        (
            "targets[1].ids.ios_token",
            AppIdentifiers {
                ios_token: Some(String::new()),
                ..exe("steam.exe")
            },
        ),
    ];
    for (field, ids) in cases {
        assert_eq!(
            rejection(&with_ids(ids)),
            rejected_as(field, ValidationErrorKind::Empty)
        );
    }
}

#[test]
fn identifiers_must_not_hold_control_characters() {
    let token = AppIdentifiers {
        ios_token: Some("token\0".to_owned()),
        ..AppIdentifiers::default()
    };
    assert_eq!(
        rejection(&with_ids(token)),
        rejected_as(
            "targets[1].ids.ios_token",
            ValidationErrorKind::ControlCharacter
        )
    );

    assert_eq!(
        rejection(&with_ids(path("C:\\Games\\game\r\n.exe"))),
        rejected_as(
            "targets[1].ids.windows_path",
            ValidationErrorKind::ControlCharacter
        )
    );
}

#[test]
fn windows_exe_is_a_file_name_not_a_path() {
    for name in [
        "C:\\Steam\\steam.exe",
        "Steam\\steam.exe",
        "Steam/steam.exe",
        "C:steam.exe",
        "\\\\server\\share\\steam.exe",
        "steam?.exe",
        "steam*.exe",
        "steam|x.exe",
        "<steam>.exe",
        "\"steam.exe\"",
    ] {
        assert_eq!(
            rejection(&with_ids(exe(name))),
            rejected_as(
                "targets[1].ids.windows_exe",
                ValidationErrorKind::NotAFileName
            ),
            "{name:?}"
        );
    }

    for name in ["steam.exe", "Epic Games Launcher.exe", "José (x86).exe"] {
        assert_eq!(with_ids(exe(name)).validate(), Ok(()), "{name:?}");
    }
}

#[test]
fn windows_path_needs_an_ascii_drive_letter_a_colon_and_a_backslash() {
    for accepted in ["C:\\", "z:\\x.exe", "C:\\Games/x.exe"] {
        assert_eq!(with_ids(path(accepted)).validate(), Ok(()), "{accepted:?}");
    }
    for rejected in [
        "C:/Games/x.exe",
        "C:",
        "C",
        "1:\\x.exe",
        "\u{c9}:\\x.exe",
        "CC:\\x.exe",
        " C:\\x.exe",
        "\\\\server\\share\\x.exe",
    ] {
        assert_eq!(
            rejection(&with_ids(path(rejected))),
            rejected_as(
                "targets[1].ids.windows_path",
                ValidationErrorKind::NotADrivePath
            ),
            "{rejected:?}"
        );
    }
}

#[test]
fn validation_error_says_where_and_what() {
    let error = rejection(&Blocklist {
        targets: vec![site("")],
        ..valid()
    });
    assert_eq!(error.0, "targets[0].pattern");
    let message = ValidationError::new(error.0, error.1).to_string();
    assert_eq!(message, "targets[0].pattern is empty");
}

#[test]
fn every_kind_of_problem_has_a_message() {
    let cases = [
        (ValidationErrorKind::Empty, "is empty"),
        (
            ValidationErrorKind::TooLong { len: 9, max: 8 },
            "is 9 bytes long, more than the maximum of 8",
        ),
        (
            ValidationErrorKind::TooMany { count: 3, max: 2 },
            "has 3 items, more than the maximum of 2",
        ),
        (
            ValidationErrorKind::ControlCharacter,
            "contains a control character",
        ),
        (
            ValidationErrorKind::NotAColor,
            "is not a color in the form #rrggbb",
        ),
        (
            ValidationErrorKind::NotAFileName,
            "is not a file name: it contains one of the characters < > : \" / \\ | ? *",
        ),
        (
            ValidationErrorKind::NotADrivePath,
            "is not a full path that starts with a drive, such as C:\\",
        ),
        (
            ValidationErrorKind::NoIdentifier,
            "sets no identifier for any platform",
        ),
    ];
    for (kind, message) in cases {
        assert_eq!(kind.to_string(), message);
    }
}

#[test]
fn app_identifiers_are_empty_only_with_no_field_set() {
    assert!(AppIdentifiers::default().is_empty());
    assert!(!exe("steam.exe").is_empty());
    assert!(!path("C:\\steam.exe").is_empty());
    let android = AppIdentifiers {
        android_package: Some("com.whatsapp".to_owned()),
        ..AppIdentifiers::default()
    };
    assert!(!android.is_empty());
    let ios = AppIdentifiers {
        ios_token: Some("token".to_owned()),
        ..AppIdentifiers::default()
    };
    assert!(!ios.is_empty());
}

#[test]
fn site_pattern_keeps_its_text_exactly() {
    for text in ["youtube.com", "*.Reddit.COM", "youtube.com/shorts/"] {
        assert_eq!(SitePattern::new(text).as_str(), text);
        assert_eq!(SitePattern::new(text.to_owned()).as_str(), text);
    }
}
