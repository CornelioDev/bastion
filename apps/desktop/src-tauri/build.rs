// SPDX-License-Identifier: MIT OR Apache-2.0

//! Build script: lets Tauri read `tauri.conf.json` and the capabilities, and
//! embed the app icon and Windows manifest into the executable.

fn main() {
    tauri_build::build();
}
