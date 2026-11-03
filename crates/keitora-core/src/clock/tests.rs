// SPDX-License-Identifier: MIT OR Apache-2.0

use std::time::UNIX_EPOCH;

use super::*;

fn at(secs: u64) -> MonotonicInstant {
    MonotonicInstant::from_duration_since_origin(Duration::from_secs(secs))
}

#[test]
fn a_new_fake_clock_starts_at_the_origin() {
    let clock = FakeClock::new(UNIX_EPOCH);
    assert_eq!(clock.monotonic(), at(0));
}

#[test]
fn duration_since_the_same_instant_is_zero() {
    assert_eq!(at(5).checked_duration_since(at(5)), Some(Duration::ZERO));
    assert_eq!(at(5).saturating_duration_since(at(5)), Duration::ZERO);
}

#[test]
fn an_advance_the_wall_reading_cant_represent_changes_neither_reading() {
    let clock = FakeClock::new(UNIX_EPOCH);
    clock.advance(Duration::from_secs(1)).unwrap();
    // The monotonic reading can hold this, but no `SystemTime` can: on
    // Windows it ends in the year 30828, about 9.2e11 seconds after 1970.
    let by = Duration::from_secs(u64::MAX / 2);
    assert!(clock.monotonic().checked_add(by).is_some());

    assert_eq!(clock.advance(by), Err(AdvanceError { by }));

    assert_eq!(clock.monotonic(), at(1));
    assert_eq!(clock.wall(), UNIX_EPOCH + Duration::from_secs(1));
}

#[test]
fn an_advance_the_monotonic_reading_cant_represent_changes_neither_reading() {
    let clock = FakeClock::new(UNIX_EPOCH);
    let last = MonotonicInstant::from_duration_since_origin(Duration::MAX);
    clock.now.lock().unwrap().monotonic = last;
    let by = Duration::from_nanos(1);

    assert_eq!(clock.advance(by), Err(AdvanceError { by }));

    assert_eq!(clock.monotonic(), last);
    assert_eq!(clock.wall(), UNIX_EPOCH);
}

#[test]
fn the_error_says_by_how_much_the_clock_couldnt_advance() {
    let message = AdvanceError {
        by: Duration::from_secs(3),
    }
    .to_string();
    assert_eq!(
        message,
        "can't advance the fake clock by 3s: the time would be out of range"
    );
}

#[test]
fn a_poisoned_lock_doesnt_stop_the_clock() {
    let clock = FakeClock::new(UNIX_EPOCH);
    let handle = clock.clone();
    let result = std::thread::spawn(move || {
        let _guard = handle.now.lock().unwrap();
        panic!("a thread panics while it holds the lock");
    })
    .join();
    assert!(result.is_err());
    assert!(clock.now.is_poisoned());

    clock.advance(Duration::from_secs(2)).unwrap();
    clock.set_wall(UNIX_EPOCH);

    assert_eq!(clock.monotonic(), at(2));
    assert_eq!(clock.wall(), UNIX_EPOCH);
}
