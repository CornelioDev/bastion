// SPDX-License-Identifier: MIT OR Apache-2.0

//! The protocol spoken between the Bastion service and its clients (the
//! desktop app and the native messaging host): message types, versioning and
//! line-delimited JSON framing.
//!
//! Like `bastion-core`, this crate has no operating-system dependencies, so
//! every client can share it and it can be tested anywhere. The protocol is
//! described in `docs/architecture.md`.

#![forbid(unsafe_code)]
