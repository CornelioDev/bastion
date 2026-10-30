// SPDX-License-Identifier: MIT OR Apache-2.0

//! Entry point of the Bastion desktop app; the app itself is in the
//! `bastion_desktop_lib` library.

// Release builds use the Windows GUI subsystem, so starting the app does not
// also open a console window. Debug builds keep the console for logs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![forbid(unsafe_code)]

use std::process::ExitCode;

fn main() -> ExitCode {
    match bastion_desktop_lib::run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            // Printed with `Display` rather than the `Debug` output that
            // returning the error from `main` would give.
            eprintln!("bastion-desktop: {err}");
            ExitCode::FAILURE
        }
    }
}
