// SPDX-License-Identifier: MIT OR Apache-2.0

//! Pure domain logic for Bastion: the data model, the pomodoro engine and the
//! rules that decide which websites and applications are blocked.
//!
//! This crate has no operating-system dependencies: no Windows APIs, no
//! processes, no network, and no direct reads of the system clock (time is
//! always passed in by the caller). That keeps it easy to test and reusable on
//! other platforms.

#![forbid(unsafe_code)]

#[cfg(test)]
mod tests {
    /// Without any function to measure, `cargo llvm-cov` stops with "no coverage
    /// data found" instead of reporting 0 lines, which would fail `just coverage`.
    /// This test is that function, so it has to stay inline: a separate `tests.rs`
    /// is not measured, so the gate would still fail, with 0 lines in its report. It
    /// is the only inline test allowed in this crate, whose unit tests go in a
    /// separate file (AGENTS.md, "Writing Rust tests"), and only until the crate has
    /// real code. Delete it then.
    #[test]
    fn gives_the_coverage_gate_a_line_to_measure() {}
}
