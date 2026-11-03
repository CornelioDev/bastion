// SPDX-License-Identifier: MIT OR Apache-2.0

//! Time, as the rest of the crate sees it: the [`Clock`] trait, the
//! [`MonotonicInstant`] it returns, and [`FakeClock`] for tests.
//!
//! `keitora-core` never reads the system clock itself: whoever uses it passes
//! in a [`Clock`]. The service implements one on top of the operating system
//! (F2), and tests use [`FakeClock`], whose time moves only when the test
//! moves it.
//!
//! # Two readings
//!
//! A clock gives two different readings, because they answer different
//! questions:
//!
//! - [`Clock::monotonic`] measures how much time has passed. It never goes
//!   backwards and ignores changes to the system time, so it is what decides
//!   how long a session has left: moving the Windows clock forward must not
//!   end a strict session early (`docs/threat-model.md`, "Change the system
//!   clock").
//! - [`Clock::wall`] is the calendar time shown to the user and stored in
//!   history. The user can change it, backwards included, so nothing that
//!   enforces a session relies on it.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, SystemTime};

#[cfg(test)]
mod tests;

/// A source of time.
///
/// The trait is object safe, so code can hold a `&dyn Clock` or an
/// `Arc<dyn Clock + Send + Sync>`, or take a generic `C: Clock`.
pub trait Clock {
    /// A reading on a monotonic timeline: it never goes backwards and isn't
    /// affected by changes to the system time. Use it to measure durations.
    fn monotonic(&self) -> MonotonicInstant;

    /// The system's calendar time, which the user can change at any moment,
    /// backwards included. Use it to show or record dates, never to measure
    /// how much time has passed.
    fn wall(&self) -> SystemTime;
}

/// A point on a monotonic timeline, stored as the time elapsed since an
/// origin the [`Clock`] picks (for example, when the service started).
///
/// Instants are only comparable when they come from the same clock, as
/// different clocks can pick different origins.
///
/// This exists because [`std::time::Instant`] can only be created by reading
/// the system clock, which this crate doesn't do. None of its methods panics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct MonotonicInstant {
    since_origin: Duration,
}

impl MonotonicInstant {
    /// The instant `since_origin` after the clock's origin. A [`Clock`]
    /// implementation uses this to build its readings.
    #[must_use]
    pub const fn from_duration_since_origin(since_origin: Duration) -> Self {
        Self { since_origin }
    }

    /// The time from `earlier` to `self`, or `None` if `earlier` is later
    /// than `self`.
    #[must_use]
    pub fn checked_duration_since(self, earlier: Self) -> Option<Duration> {
        self.since_origin.checked_sub(earlier.since_origin)
    }

    /// The time from `earlier` to `self`, or zero if `earlier` is later than
    /// `self`.
    #[must_use]
    pub fn saturating_duration_since(self, earlier: Self) -> Duration {
        self.since_origin.saturating_sub(earlier.since_origin)
    }

    /// The instant `duration` after `self`, or `None` if it can't be
    /// represented.
    #[must_use]
    pub fn checked_add(self, duration: Duration) -> Option<Self> {
        self.since_origin
            .checked_add(duration)
            .map(Self::from_duration_since_origin)
    }
}

/// A [`Clock`] for tests, in this crate and in others, whose time changes
/// only when the test changes it.
///
/// Every clone shares the same time, so a test can keep one handle and move
/// time with it while the code under test holds another. Clones can be used
/// from several threads.
///
/// The monotonic reading starts at the origin
/// (`MonotonicInstant::from_duration_since_origin(Duration::ZERO)`); the wall
/// reading starts at the time given to [`FakeClock::new`].
///
/// ```
/// use std::time::{Duration, UNIX_EPOCH};
///
/// use keitora_core::clock::{Clock, FakeClock};
///
/// let clock = FakeClock::new(UNIX_EPOCH);
/// let start = clock.monotonic();
///
/// clock.advance(Duration::from_secs(60))?;
/// clock.set_wall(UNIX_EPOCH); // The user turns the clock back.
///
/// assert_eq!(clock.monotonic().checked_duration_since(start), Some(Duration::from_secs(60)));
/// assert_eq!(clock.wall(), UNIX_EPOCH);
/// # Ok::<(), keitora_core::clock::AdvanceError>(())
/// ```
///
/// It is compiled in every build, not only for tests. `cfg(test)` would hide
/// it from other crates' tests and from this crate's integration tests. A
/// feature such as `test-util` would work for other crates, but this crate's
/// own integration tests could only turn it on through a dev-dependency on
/// itself, which `scripts/check-unit-test-layout.mjs` rejects, as it does any
/// local dependency it doesn't list.
#[derive(Debug, Clone)]
pub struct FakeClock {
    /// The time every clone reads and changes.
    now: Arc<Mutex<Readings>>,
}

/// Both readings of a [`FakeClock`], kept together so that they change at
/// once.
#[derive(Debug, Clone, Copy)]
struct Readings {
    monotonic: MonotonicInstant,
    wall: SystemTime,
}

impl FakeClock {
    /// A clock whose wall reading is `wall` and whose monotonic reading is at
    /// the origin.
    #[must_use]
    pub fn new(wall: SystemTime) -> Self {
        let readings = Readings {
            monotonic: MonotonicInstant::from_duration_since_origin(Duration::ZERO),
            wall,
        };
        Self {
            now: Arc::new(Mutex::new(readings)),
        }
    }

    /// Lets `by` pass: both readings move forward by exactly `by`.
    ///
    /// # Errors
    ///
    /// Returns [`AdvanceError`] if either reading can't represent the result.
    /// Neither reading changes then, and the clock stays usable.
    pub fn advance(&self, by: Duration) -> Result<(), AdvanceError> {
        let mut now = self.lock();
        let monotonic = now.monotonic.checked_add(by).ok_or(AdvanceError { by })?;
        let wall = now.wall.checked_add(by).ok_or(AdvanceError { by })?;
        *now = Readings { monotonic, wall };
        Ok(())
    }

    /// Sets the wall reading to `wall`, as when the user changes the system
    /// time, forwards or backwards. The monotonic reading doesn't move.
    pub fn set_wall(&self, wall: SystemTime) {
        self.lock().wall = wall;
    }

    /// Locks the shared readings.
    ///
    /// A lock is poisoned when a thread panics while holding it. No code here
    /// can panic while holding it, and every change writes both readings at
    /// once, so they are consistent even then: this takes the readings
    /// anyway instead of panicking, as code outside tests mustn't.
    fn lock(&self) -> MutexGuard<'_, Readings> {
        self.now.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Clock for FakeClock {
    fn monotonic(&self) -> MonotonicInstant {
        self.lock().monotonic
    }

    fn wall(&self) -> SystemTime {
        self.lock().wall
    }
}

/// The error of [`FakeClock::advance`] when a reading can't move forward by
/// the requested duration, because the result doesn't fit in its type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("can't advance the fake clock by {by:?}: the time would be out of range")]
pub struct AdvanceError {
    /// The duration the clock was asked to advance by.
    by: Duration,
}
