// SPDX-License-Identifier: MIT OR Apache-2.0

//! Pure domain logic for Bastion: the data model, the pomodoro engine and the
//! rules that decide which websites and applications are blocked.
//!
//! This crate has no operating-system dependencies: no Windows APIs, no
//! processes, no network, and no direct reads of the system clock (time is
//! always passed in by the caller). That keeps it easy to test and reusable on
//! other platforms.

#![forbid(unsafe_code)]
