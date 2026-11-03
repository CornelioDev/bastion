// SPDX-License-Identifier: MIT OR Apache-2.0

//! Acceptance tests for T-1.2: the `Clock` trait (a monotonic reading and a
//! wall-clock reading) and the fake clock that tests use instead of real time.
//!
//! The roadmap gives no explicit acceptance criteria for T-1.2. The criteria
//! below are derived from the task text, `AGENTS.md` ("Time comes in through
//! the injectable `Clock` trait"; no direct system clock in `keitora-core`),
//! `docs/threat-model.md` ("Change the system clock: remaining time uses a
//! monotonic clock") and issue #19 (a strict session's time when the clock
//! changes), and must be confirmed by the maintainer.
//!
//! # Expected public API
//!
//! Everything lives in `keitora_core::clock`, compiled in every build (no
//! `cfg(test)` or feature gate: `scripts/check-unit-test-layout.mjs` rejects
//! those in this crate):
//!
//! - `trait Clock` with two methods:
//!   - `fn monotonic(&self) -> MonotonicInstant`: a reading that never goes
//!     backwards and ignores changes to the system time.
//!   - `fn wall(&self) -> std::time::SystemTime`: the system's calendar time,
//!     which the user can change, backwards included.
//!
//!   The trait is object safe (`&dyn Clock`, `Box<dyn Clock>`,
//!   `Arc<dyn Clock + Send + Sync>`), usable as a generic bound
//!   (`C: Clock + ?Sized`), and implementable outside the crate, since the
//!   real clock lives in `keitora-service`.
//! - `MonotonicInstant`: a point on a monotonic timeline, stored as the time
//!   elapsed since an origin the clock picks (for example, when the service
//!   started). `std::time::Instant` can't be used because it can only be
//!   built with `Instant::now()`, which `keitora-core` must not call. It is
//!   `Copy`, `Debug`, `Eq` and `Ord`, and has:
//!   - `MonotonicInstant::from_duration_since_origin(Duration) -> Self`, so a
//!     clock outside the crate can build readings;
//!   - `checked_duration_since(self, earlier) -> Option<Duration>` (`None`
//!     when `earlier` is later than `self`);
//!   - `saturating_duration_since(self, earlier) -> Duration` (zero when
//!     `earlier` is later than `self`);
//!   - `checked_add(self, Duration) -> Option<Self>` (`None` on overflow).
//!
//!   None of them panics.
//! - `FakeClock`, a public `Clock` for tests in this crate and in others:
//!   - `FakeClock::new(wall: SystemTime) -> Self`: the wall reading starts at
//!     `wall`; the monotonic reading starts at an origin of the developer's
//!     choosing. Nothing changes until the test changes it.
//!   - `advance(&self, by: Duration) -> Result<(), E>`, `E: std::error::Error`:
//!     time passes, so both readings move forward by exactly `by`. If either
//!     reading can't represent the result, it returns `Err` and changes
//!     neither reading: it never panics, wraps or saturates silently.
//!   - `set_wall(&self, wall: SystemTime)`: the user changes the system time,
//!     forwards or backwards; the monotonic reading doesn't move.
//!   - `Clone`, and every clone shares the same time, so a test can keep a
//!     handle and move time while the engine holds another. `Send + Sync`,
//!     `Debug`.
//!
//! The tests use whole milliseconds for wall-clock changes, since Windows
//! stores `SystemTime` in 100 ns steps.
//!
//! # Criteria covered
//!
//! - **AC1** — the trait exposes a monotonic reading and a wall-clock reading:
//!   `clock_trait_exposes_a_monotonic_and_a_wall_clock_reading`,
//!   `fake_clock_wall_reading_starts_at_the_time_it_was_created_with`,
//!   `fake_clock_readings_do_not_change_until_the_test_changes_them`.
//! - **AC2** — the monotonic reading never goes backwards:
//!   `monotonic_reading_never_goes_backwards_across_advances_and_wall_changes`,
//!   `advancing_by_zero_leaves_both_readings_unchanged`,
//!   `monotonic_instants_are_ordered_by_their_time_since_the_origin`.
//! - **AC3** — the fake clock advances by a chosen `Duration`:
//!   `advancing_moves_the_monotonic_reading_by_exactly_the_chosen_duration`,
//!   `advancing_moves_the_wall_reading_by_the_same_duration`,
//!   `many_small_advances_add_up_exactly`.
//! - **AC4** — the fake's wall clock is set independently, backwards included,
//!   to simulate the user changing the system time:
//!   `setting_the_wall_clock_backwards_changes_only_the_wall_reading`,
//!   `setting_the_wall_clock_forwards_changes_only_the_wall_reading`,
//!   `elapsed_monotonic_time_ignores_wall_clock_changes`,
//!   `advancing_after_setting_the_wall_clock_continues_from_the_new_wall_time`,
//!   `wall_clock_can_be_set_before_the_unix_epoch`.
//! - **AC5** — advancing never panics or overflows silently; an advance that
//!   can't be represented is an error and changes nothing:
//!   `advancing_by_an_unrepresentable_duration_is_an_error_and_changes_nothing`,
//!   `clock_stays_usable_after_a_rejected_advance`,
//!   `monotonic_duration_since_a_later_instant_is_none_or_zero`,
//!   `monotonic_checked_add_reports_overflow_instead_of_panicking`,
//!   `monotonic_checked_add_moves_forward_by_the_duration`.
//! - **AC6** — the fake is public and usable from other crates' tests, and can
//!   be shared with the code under test:
//!   every test in this file (it is a separate crate using only public paths),
//!   `fake_clock_clones_share_the_same_time`,
//!   `fake_clock_can_be_shared_across_threads`,
//!   `clock_types_implement_debug`.
//! - **AC7** — the trait is object safe and generic-friendly, so the engine
//!   (T-1.3) and the snapshot (T-1.7) can take it either way, and the service
//!   can implement it:
//!   `clock_works_as_a_trait_object`,
//!   `clock_works_as_a_generic_parameter`,
//!   `clock_can_be_implemented_outside_the_crate`.
//!
//! Not tested here, verified at validation instead:
//!
//! - **AC8** (L5, F0 security review) — `keitora-core` and `keitora-ipc` can't
//!   read the system clock or start processes: clippy's `disallowed-methods`
//!   for those crates lists `std::time::SystemTime::now`,
//!   `std::time::Instant::now`, `chrono::Utc::now` (if `chrono` is ever used,
//!   without its `clock` feature) and `std::process`, while keeping the
//!   workspace settings. Validation plants such a call and checks that clippy
//!   fails.

#![cfg(test)]

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use keitora_core::clock::{Clock, FakeClock, MonotonicInstant};

/// 2026-11-03 09:00:00 UTC, in seconds since the Unix epoch.
const START_UNIX_SECS: u64 = 1_793_696_400;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// The wall time every fake clock in these tests starts at.
fn start_wall() -> SystemTime {
    UNIX_EPOCH
        .checked_add(Duration::from_secs(START_UNIX_SECS))
        .expect("the start time fits in a SystemTime")
}

/// A fake clock whose wall reading starts at [`start_wall`].
fn fake() -> FakeClock {
    FakeClock::new(start_wall())
}

/// Monotonic time elapsed from `earlier` to `later`; fails the test if
/// `later` is before `earlier`.
fn elapsed(earlier: MonotonicInstant, later: MonotonicInstant) -> Duration {
    later
        .checked_duration_since(earlier)
        .expect("the monotonic reading went backwards")
}

/// Reads both values through the trait only, as the engine will.
fn read<C: Clock + ?Sized>(clock: &C) -> (MonotonicInstant, SystemTime) {
    (clock.monotonic(), clock.wall())
}

/// Accepts anything that is an error type.
fn assert_is_error<E: std::error::Error>(_error: &E) {}

/// Compiles only if `T` can be shared between threads.
fn assert_send_sync<T: Send + Sync>() {}

/// Compiles only if `T` is `Copy`, `Eq` and `Ord`.
fn assert_copy_ord<T: Copy + Eq + Ord>() {}

/// A clock written outside `keitora-core`, the way the service will write the
/// real one, that always gives the same readings.
#[derive(Debug)]
struct FixedClock {
    monotonic: MonotonicInstant,
    wall: SystemTime,
}

impl Clock for FixedClock {
    fn monotonic(&self) -> MonotonicInstant {
        self.monotonic
    }

    fn wall(&self) -> SystemTime {
        self.wall
    }
}

/// Code that takes a clock by generic parameter, like the engine may.
struct GenericUser<C: Clock> {
    clock: C,
}

impl<C: Clock> GenericUser<C> {
    fn elapsed_since(&self, start: MonotonicInstant) -> Duration {
        elapsed(start, self.clock.monotonic())
    }
}

/// Code that takes a clock as a trait object, like the service may.
struct DynUser {
    clock: Arc<dyn Clock + Send + Sync>,
}

impl DynUser {
    fn elapsed_since(&self, start: MonotonicInstant) -> Duration {
        elapsed(start, self.clock.monotonic())
    }
}

// ---------------------------------------------------------------------------
// AC1 — monotonic and wall-clock readings
// ---------------------------------------------------------------------------

#[test]
fn clock_trait_exposes_a_monotonic_and_a_wall_clock_reading() {
    let clock = fake();
    let (mono_before, wall_before) = read(&clock);

    clock
        .advance(Duration::from_secs(90))
        .expect("advancing 90 s succeeds");
    let (mono_after, wall_after) = read(&clock);

    assert_eq!(elapsed(mono_before, mono_after), Duration::from_secs(90));
    assert_eq!(wall_before, start_wall());
    assert_eq!(wall_after, start_wall() + Duration::from_secs(90));
}

#[test]
fn fake_clock_wall_reading_starts_at_the_time_it_was_created_with() {
    assert_eq!(fake().wall(), start_wall());
    assert_eq!(FakeClock::new(UNIX_EPOCH).wall(), UNIX_EPOCH);
}

#[test]
fn fake_clock_readings_do_not_change_until_the_test_changes_them() {
    let clock = fake();
    let first = read(&clock);
    for _ in 0..1_000 {
        assert_eq!(read(&clock), first);
    }
}

// ---------------------------------------------------------------------------
// AC2 — the monotonic reading never goes backwards
// ---------------------------------------------------------------------------

#[test]
fn monotonic_reading_never_goes_backwards_across_advances_and_wall_changes() {
    let clock = fake();
    let mut previous = clock.monotonic();

    let steps: [(Duration, Option<SystemTime>); 8] = [
        (Duration::from_millis(1), None),
        (
            Duration::ZERO,
            Some(start_wall() - Duration::from_secs(3_600)),
        ),
        (Duration::from_secs(25 * 60), None),
        (Duration::ZERO, Some(UNIX_EPOCH)),
        (
            Duration::from_millis(500),
            Some(start_wall() + Duration::from_secs(86_400 * 365)),
        ),
        (
            Duration::ZERO,
            Some(start_wall() - Duration::from_secs(86_400 * 365 * 10)),
        ),
        (Duration::from_secs(5 * 60), None),
        (Duration::from_secs(86_400), Some(start_wall())),
    ];

    for (advance_by, new_wall) in steps {
        if let Some(wall) = new_wall {
            clock.set_wall(wall);
            let now = clock.monotonic();
            assert_eq!(
                now, previous,
                "setting the wall clock moved the monotonic reading"
            );
        }
        clock.advance(advance_by).expect("a small advance succeeds");
        let now = clock.monotonic();
        assert!(now >= previous, "the monotonic reading went backwards");
        assert_eq!(elapsed(previous, now), advance_by);
        previous = now;
    }
}

#[test]
fn advancing_by_zero_leaves_both_readings_unchanged() {
    let clock = fake();
    clock
        .advance(Duration::from_secs(7))
        .expect("advancing 7 s succeeds");
    let before = read(&clock);

    clock
        .advance(Duration::ZERO)
        .expect("advancing by zero succeeds");

    assert_eq!(read(&clock), before);
}

#[test]
fn monotonic_instants_are_ordered_by_their_time_since_the_origin() {
    assert_copy_ord::<MonotonicInstant>();

    let origin = MonotonicInstant::from_duration_since_origin(Duration::ZERO);
    let one = MonotonicInstant::from_duration_since_origin(Duration::from_secs(1));
    let two = MonotonicInstant::from_duration_since_origin(Duration::from_secs(2));
    let two_again = MonotonicInstant::from_duration_since_origin(Duration::from_secs(2));

    assert!(origin < one);
    assert!(one < two);
    assert_eq!(two, two_again);
    assert_eq!(
        two.checked_duration_since(origin),
        Some(Duration::from_secs(2))
    );
    assert_eq!(
        two.checked_duration_since(one),
        Some(Duration::from_secs(1))
    );
    assert_eq!(two.checked_duration_since(two_again), Some(Duration::ZERO));
}

// ---------------------------------------------------------------------------
// AC3 — advancing by a chosen duration
// ---------------------------------------------------------------------------

#[test]
fn advancing_moves_the_monotonic_reading_by_exactly_the_chosen_duration() {
    let clock = fake();
    let start = clock.monotonic();

    for (step, expected_total) in [
        (Duration::from_millis(1), Duration::from_millis(1)),
        (Duration::from_millis(1_499), Duration::from_millis(1_500)),
        (
            Duration::from_secs(25 * 60),
            Duration::from_millis(1_500) + Duration::from_secs(25 * 60),
        ),
        (
            Duration::from_secs(86_400 * 30),
            Duration::from_millis(1_500)
                + Duration::from_secs(25 * 60)
                + Duration::from_secs(86_400 * 30),
        ),
    ] {
        let before = clock.monotonic();
        clock.advance(step).expect("a realistic advance succeeds");
        let after = clock.monotonic();
        assert_eq!(elapsed(before, after), step);
        assert_eq!(elapsed(start, after), expected_total);
    }
}

#[test]
fn advancing_moves_the_wall_reading_by_the_same_duration() {
    let clock = fake();

    clock
        .advance(Duration::from_secs(25 * 60))
        .expect("advancing 25 min succeeds");
    assert_eq!(clock.wall(), start_wall() + Duration::from_secs(25 * 60));

    clock
        .advance(Duration::from_millis(250))
        .expect("advancing 250 ms succeeds");
    assert_eq!(
        clock.wall(),
        start_wall() + Duration::from_secs(25 * 60) + Duration::from_millis(250)
    );
}

#[test]
fn many_small_advances_add_up_exactly() {
    let clock = fake();
    let start = clock.monotonic();

    for _ in 0..3_000 {
        clock
            .advance(Duration::from_millis(1))
            .expect("advancing 1 ms succeeds");
    }

    assert_eq!(elapsed(start, clock.monotonic()), Duration::from_secs(3));
    assert_eq!(clock.wall(), start_wall() + Duration::from_secs(3));
}

// ---------------------------------------------------------------------------
// AC4 — the wall clock is set independently, backwards included
// ---------------------------------------------------------------------------

#[test]
fn setting_the_wall_clock_backwards_changes_only_the_wall_reading() {
    let clock = fake();
    clock
        .advance(Duration::from_secs(10 * 60))
        .expect("advancing 10 min succeeds");
    let mono_before = clock.monotonic();
    let earlier = start_wall() - Duration::from_secs(2 * 3_600);

    clock.set_wall(earlier);

    assert_eq!(clock.wall(), earlier);
    assert_eq!(clock.monotonic(), mono_before);
}

#[test]
fn setting_the_wall_clock_forwards_changes_only_the_wall_reading() {
    let clock = fake();
    let mono_before = clock.monotonic();
    let later = start_wall() + Duration::from_secs(86_400 * 7);

    clock.set_wall(later);

    assert_eq!(clock.wall(), later);
    assert_eq!(clock.monotonic(), mono_before);
}

/// The scenario from the threat model and issue #19: during a 25-minute focus
/// period the user moves the system time back and then forward; the time the
/// session has run, measured on the monotonic reading, is unaffected.
#[test]
fn elapsed_monotonic_time_ignores_wall_clock_changes() {
    let clock = fake();
    let session_start = clock.monotonic();

    clock
        .advance(Duration::from_secs(5 * 60))
        .expect("advancing 5 min succeeds");
    clock.set_wall(start_wall() - Duration::from_secs(3 * 3_600));
    clock
        .advance(Duration::from_secs(5 * 60))
        .expect("advancing 5 min succeeds");
    clock.set_wall(start_wall() + Duration::from_secs(86_400));
    clock
        .advance(Duration::from_secs(5 * 60))
        .expect("advancing 5 min succeeds");

    assert_eq!(
        elapsed(session_start, clock.monotonic()),
        Duration::from_secs(15 * 60)
    );
    assert_eq!(
        clock.wall(),
        start_wall() + Duration::from_secs(86_400) + Duration::from_secs(5 * 60)
    );
}

#[test]
fn advancing_after_setting_the_wall_clock_continues_from_the_new_wall_time() {
    let clock = fake();
    let earlier = start_wall() - Duration::from_secs(3_600);

    clock.set_wall(earlier);
    clock
        .advance(Duration::from_secs(60))
        .expect("advancing 60 s succeeds");

    assert_eq!(clock.wall(), earlier + Duration::from_secs(60));
}

#[test]
fn wall_clock_can_be_set_before_the_unix_epoch() {
    let clock = fake();
    let mono_before = clock.monotonic();
    let before_epoch = UNIX_EPOCH - Duration::from_secs(86_400);

    clock.set_wall(before_epoch);
    assert_eq!(clock.wall(), before_epoch);
    assert_eq!(clock.monotonic(), mono_before);

    clock
        .advance(Duration::from_secs(2 * 86_400))
        .expect("advancing 2 days succeeds");
    assert_eq!(clock.wall(), UNIX_EPOCH + Duration::from_secs(86_400));
}

// ---------------------------------------------------------------------------
// AC5 — no panic and no silent overflow at the edge
// ---------------------------------------------------------------------------

#[test]
fn advancing_by_an_unrepresentable_duration_is_an_error_and_changes_nothing() {
    let clock = fake();
    clock
        .advance(Duration::from_secs(42))
        .expect("advancing 42 s succeeds");
    let before = read(&clock);

    let error = clock
        .advance(Duration::MAX)
        .expect_err("advancing by Duration::MAX can't be represented");
    assert_is_error(&error);
    assert!(
        !error.to_string().is_empty(),
        "the error explains what went wrong"
    );

    assert_eq!(read(&clock), before, "a rejected advance changed the clock");
}

#[test]
fn clock_stays_usable_after_a_rejected_advance() {
    let clock = fake();
    let start = clock.monotonic();

    assert!(clock.advance(Duration::MAX).is_err());
    assert!(clock.advance(Duration::MAX).is_err());
    clock
        .advance(Duration::from_secs(1))
        .expect("a normal advance still succeeds");

    assert_eq!(elapsed(start, clock.monotonic()), Duration::from_secs(1));
    assert_eq!(clock.wall(), start_wall() + Duration::from_secs(1));
}

#[test]
fn monotonic_duration_since_a_later_instant_is_none_or_zero() {
    let clock = fake();
    let earlier = clock.monotonic();
    clock
        .advance(Duration::from_secs(3))
        .expect("advancing 3 s succeeds");
    let later = clock.monotonic();

    assert_eq!(earlier.checked_duration_since(later), None);
    assert_eq!(earlier.saturating_duration_since(later), Duration::ZERO);
    assert_eq!(
        later.saturating_duration_since(earlier),
        Duration::from_secs(3)
    );
}

#[test]
fn monotonic_checked_add_reports_overflow_instead_of_panicking() {
    let clock = fake();
    clock
        .advance(Duration::from_secs(1))
        .expect("advancing 1 s succeeds");
    let now = clock.monotonic();

    assert_eq!(now.checked_add(Duration::MAX), None);

    let far = MonotonicInstant::from_duration_since_origin(Duration::MAX);
    assert_eq!(far.checked_add(Duration::from_nanos(1)), None);
    assert_eq!(far.checked_add(Duration::ZERO), Some(far));
}

#[test]
fn monotonic_checked_add_moves_forward_by_the_duration() {
    let clock = fake();
    let start = clock.monotonic();
    let deadline = start
        .checked_add(Duration::from_secs(25 * 60))
        .expect("a 25-minute deadline fits");

    assert!(deadline > start);
    assert_eq!(elapsed(start, deadline), Duration::from_secs(25 * 60));

    clock
        .advance(Duration::from_secs(25 * 60))
        .expect("advancing 25 min succeeds");
    assert_eq!(clock.monotonic(), deadline);
}

// ---------------------------------------------------------------------------
// AC6 — public, shareable fake
// ---------------------------------------------------------------------------

#[test]
fn fake_clock_clones_share_the_same_time() {
    let clock = fake();
    let handle = clock.clone();
    let start = clock.monotonic();

    handle
        .advance(Duration::from_secs(30))
        .expect("advancing 30 s succeeds");
    assert_eq!(elapsed(start, clock.monotonic()), Duration::from_secs(30));
    assert_eq!(clock.wall(), start_wall() + Duration::from_secs(30));

    let earlier = start_wall() - Duration::from_secs(600);
    clock.set_wall(earlier);
    assert_eq!(handle.wall(), earlier);
    assert_eq!(read(&handle), read(&clock));
}

#[test]
fn fake_clock_can_be_shared_across_threads() {
    assert_send_sync::<FakeClock>();

    let clock = fake();
    let start = clock.monotonic();

    std::thread::scope(|scope| {
        for _ in 0..4 {
            let handle = clock.clone();
            scope.spawn(move || {
                for _ in 0..250 {
                    handle
                        .advance(Duration::from_millis(1))
                        .expect("advancing 1 ms succeeds");
                }
            });
        }
    });

    assert_eq!(elapsed(start, clock.monotonic()), Duration::from_secs(1));
    assert_eq!(clock.wall(), start_wall() + Duration::from_secs(1));
}

#[test]
fn clock_types_implement_debug() {
    let clock = fake();
    assert!(!format!("{clock:?}").is_empty());
    assert!(!format!("{:?}", clock.monotonic()).is_empty());
}

// ---------------------------------------------------------------------------
// AC7 — object safe, generic-friendly, implementable outside the crate
// ---------------------------------------------------------------------------

#[test]
fn clock_works_as_a_trait_object() {
    let clock = fake();
    let start = clock.monotonic();

    let boxed: Box<dyn Clock> = Box::new(clock.clone());
    let shared = DynUser {
        clock: Arc::new(clock.clone()),
    };
    let borrowed: &dyn Clock = &clock;

    clock
        .advance(Duration::from_secs(12))
        .expect("advancing 12 s succeeds");

    assert_eq!(elapsed(start, boxed.monotonic()), Duration::from_secs(12));
    assert_eq!(shared.elapsed_since(start), Duration::from_secs(12));
    assert_eq!(read(borrowed), read(&clock));
    assert_eq!(boxed.wall(), start_wall() + Duration::from_secs(12));
}

#[test]
fn clock_works_as_a_generic_parameter() {
    let clock = fake();
    let start = clock.monotonic();
    let user = GenericUser {
        clock: clock.clone(),
    };

    clock
        .advance(Duration::from_secs(5 * 60))
        .expect("advancing 5 min succeeds");

    assert_eq!(user.elapsed_since(start), Duration::from_secs(5 * 60));
    assert_eq!(
        user.clock.wall(),
        start_wall() + Duration::from_secs(5 * 60)
    );
}

#[test]
fn clock_can_be_implemented_outside_the_crate() {
    let monotonic = MonotonicInstant::from_duration_since_origin(Duration::from_secs(3_600));
    let fixed = FixedClock {
        monotonic,
        wall: start_wall(),
    };

    assert_eq!(read(&fixed), (monotonic, start_wall()));

    let as_object: &dyn Clock = &fixed;
    assert_eq!(read(as_object), (monotonic, start_wall()));

    let user = GenericUser { clock: fixed };
    let origin = MonotonicInstant::from_duration_since_origin(Duration::ZERO);
    assert_eq!(user.elapsed_since(origin), Duration::from_secs(3_600));

    let shared = DynUser {
        clock: Arc::new(FixedClock {
            monotonic,
            wall: UNIX_EPOCH,
        }),
    };
    assert_eq!(shared.elapsed_since(origin), Duration::from_secs(3_600));
    assert_eq!(shared.clock.wall(), UNIX_EPOCH);
}
