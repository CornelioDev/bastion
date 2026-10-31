// SPDX-License-Identifier: MIT OR Apache-2.0

//! The protocol spoken between the Bastion service and its clients (the
//! desktop app and the native messaging host): message types, versioning and
//! line-delimited JSON framing.
//!
//! Like `bastion-core`, this crate has no operating-system dependencies, so
//! every client can share it and it can be tested anywhere. The protocol is
//! described in `docs/architecture.md`.

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
