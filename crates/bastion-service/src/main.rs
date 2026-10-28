// SPDX-License-Identifier: MIT OR Apache-2.0

//! The Bastion Windows service, the single source of truth for sessions and
//! blocklists. It persists state, blocks applications and serves the desktop
//! app and the native messaging host over a named pipe.
//!
//! This is the only crate allowed to contain `unsafe` code, and only inside
//! `src/sys/`: one wrapper per Win32 call, each with a `// SAFETY:` comment.

fn main() {}
