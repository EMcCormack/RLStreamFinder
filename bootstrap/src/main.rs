#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
mod windows {
    use std::ffi::c_void;
    use std::mem::size_of;
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use std::thread;
    use std::time::Duration;

    const TH32CS_SNAPPROCESS: u32 = 0x0000_0002;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const POLL_INTERVAL: Duration = Duration::from_secs(5);

    #[repr(C)]
    struct ProcessEntry32W {
        size: u32,
        usage: u32,
        process_id: u32,
        default_heap_id: usize,
        module_id: u32,
        threads: u32,
        parent_process_id: u32,
        priority: i32,
        flags: u32,
        exe_file: [u16; 260],
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateToolhelp32Snapshot(flags: u32, process_id: u32) -> *mut c_void;
        fn Process32FirstW(snapshot: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn Process32NextW(snapshot: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }

    fn rocket_league_running() -> Option<bool> {
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot == (-1_isize as *mut c_void) {
            return None;
        }

        let mut entry = ProcessEntry32W {
            size: size_of::<ProcessEntry32W>() as u32,
            usage: 0,
            process_id: 0,
            default_heap_id: 0,
            module_id: 0,
            threads: 0,
            parent_process_id: 0,
            priority: 0,
            flags: 0,
            exe_file: [0; 260],
        };
        let mut found = false;
        let mut result = unsafe { Process32FirstW(snapshot, &mut entry) };
        if result == 0 {
            unsafe { CloseHandle(snapshot) };
            return None;
        }
        while result != 0 {
            let len = entry
                .exe_file
                .iter()
                .position(|&char| char == 0)
                .unwrap_or(entry.exe_file.len());
            if String::from_utf16_lossy(&entry.exe_file[..len])
                .eq_ignore_ascii_case("RocketLeague.exe")
            {
                found = true;
                break;
            }
            result = unsafe { Process32NextW(snapshot, &mut entry) };
        }
        unsafe { CloseHandle(snapshot) };
        Some(found)
    }

    pub fn run() {
        let Ok(bootstrap_path) = std::env::current_exe() else {
            return;
        };
        let Some(install_root) = bootstrap_path
            .parent()
            .and_then(|path| path.parent())
            .and_then(|path| path.parent())
        else {
            return;
        };
        let update_exe = install_root.join("Update.exe");
        let mut was_running = false;

        loop {
            if !update_exe.exists() {
                return;
            }
            if let Some(running) = rocket_league_running() {
                if running && !was_running {
                    let _ = Command::new(&update_exe)
                        .args([
                            "--processStart",
                            "rl-stream-finder.exe",
                            "--process-start-args",
                            "--launch-in-background",
                        ])
                        .creation_flags(CREATE_NO_WINDOW)
                        .spawn();
                }
                was_running = running;
            }
            thread::sleep(POLL_INTERVAL);
        }
    }
}

#[cfg(windows)]
fn main() {
    windows::run();
}

#[cfg(not(windows))]
fn main() {}
