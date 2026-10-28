// SPDX-License-Identifier: MIT OR Apache-2.0

//! The Bastion native messaging host. The browser starts it on behalf of the
//! Bastion extension, and it relays messages between the extension (over
//! stdin and stdout) and the Bastion service (over a named pipe).
//!
//! It handles input coming from the browser, so it never contains `unsafe`
//! code. Allowing it, for example for FFI, is an architectural change that
//! needs an ADR.

#![forbid(unsafe_code)]

fn main() {}
