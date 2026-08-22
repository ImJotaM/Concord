use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::net::UdpSocket;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{command, AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct ServerManager {
    process: Arc<Mutex<Option<Child>>>,
    logs: Arc<Mutex<Vec<String>>>,
    is_running: Arc<Mutex<bool>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ServerStatusResponse {
    pub is_running: bool,
    pub is_hosted_locally: bool,
    pub port: u16,
    pub lan_ips: Vec<String>,
    pub logs: Vec<String>,
}

fn find_project_root() -> PathBuf {
    let current = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if current.join("server").exists() {
        return current;
    }
    if current.join("src-tauri").exists() {
        return current;
    }
    if let Some(parent) = current.parent() {
        if parent.join("server").exists() {
            return parent.to_path_buf();
        }
    }
    current
}

fn resolve_server_execution(app: &AppHandle) -> Option<(PathBuf, Command)> {
    // 1. Try local development server build
    let project_root = find_project_root();
    let local_server_dist = project_root.join("server").join("dist").join("server.js");
    let local_server_src = project_root.join("server").join("src").join("server.ts");

    if local_server_dist.exists() {
        let mut cmd = Command::new("node");
        cmd.arg("dist/server.js");
        cmd.current_dir(project_root.join("server"));
        return Some((project_root.join("server"), cmd));
    }

    if local_server_src.exists() {
        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.args(&["/C", "npm", "run", "dev"]);
            c
        } else {
            let mut c = Command::new("npm");
            c.args(&["run", "dev"]);
            c
        };
        cmd.current_dir(project_root.join("server"));
        return Some((project_root.join("server"), cmd));
    }

    // 2. Try Tauri bundled resources (installed .exe)
    if let Ok(res_dir) = app.path().resource_dir() {
        let bundled_server_dir = res_dir.join("server");
        let bundled_server_js = bundled_server_dir.join("dist").join("server.js");
        if bundled_server_js.exists() {
            let mut cmd = Command::new("node");
            cmd.arg("dist/server.js");
            cmd.current_dir(&bundled_server_dir);
            return Some((bundled_server_dir, cmd));
        }

        let direct_dist = res_dir.join("dist").join("server.js");
        if direct_dist.exists() {
            let mut cmd = Command::new("node");
            cmd.arg("dist/server.js");
            cmd.current_dir(&res_dir);
            return Some((res_dir, cmd));
        }
    }

    None
}

#[command]
fn get_lan_ips() -> Vec<String> {
    let mut ips = Vec::new();
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(local_addr) = socket.local_addr() {
                let ip_str = local_addr.ip().to_string();
                if ip_str != "127.0.0.1" && !ip_str.is_empty() {
                    ips.push(ip_str);
                }
            }
        }
    }
    if !ips.contains(&"127.0.0.1".to_string()) {
        ips.push("127.0.0.1".to_string());
    }
    ips
}

#[command]
fn get_lan_ip() -> Result<String, String> {
    let ips = get_lan_ips();
    if let Some(primary) = ips.iter().find(|&ip| ip != "127.0.0.1") {
        Ok(primary.clone())
    } else {
        Ok("127.0.0.1".to_string())
    }
}

#[command]
fn get_server_status(state: State<'_, ServerManager>) -> ServerStatusResponse {
    let is_running = *state.is_running.lock().unwrap();
    let logs = state.logs.lock().unwrap().clone();
    let lan_ips = get_lan_ips();

    ServerStatusResponse {
        is_running,
        is_hosted_locally: is_running,
        port: 3000,
        lan_ips,
        logs,
    }
}

#[command]
fn start_local_server(
    app: AppHandle,
    state: State<'_, ServerManager>,
) -> Result<ServerStatusResponse, String> {
    let mut proc_lock = state.process.lock().unwrap();
    let mut running_lock = state.is_running.lock().unwrap();

    if *running_lock {
        let logs = state.logs.lock().unwrap().clone();
        return Ok(ServerStatusResponse {
            is_running: true,
            is_hosted_locally: true,
            port: 3000,
            lan_ips: get_lan_ips(),
            logs,
        });
    }

    let (_server_dir, mut cmd) = resolve_server_execution(&app).unwrap_or_else(|| {
        let root = find_project_root();
        let mut fallback = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.args(&["/C", "npm", "--prefix", "server", "run", "dev"]);
            c
        } else {
            let mut c = Command::new("npm");
            c.args(&["--prefix", "server", "run", "dev"]);
            c
        };
        fallback.current_dir(&root);
        (root.join("server"), fallback)
    });

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Falha ao iniciar processo do servidor local (Certifique-se de ter o Node.js instalado): {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    *proc_lock = Some(child);
    *running_lock = true;

    // Background thread for stdout logs
    if let Some(out) = stdout {
        let app_clone = app.clone();
        let logs_arc = Arc::clone(&state.logs);
        thread::spawn(move || {
            let reader = BufReader::new(out);
            for line in reader.lines().flatten() {
                {
                    let mut l = logs_arc.lock().unwrap();
                    if l.len() >= 300 {
                        l.remove(0);
                    }
                    l.push(line.clone());
                }
                let _ = app_clone.emit("server-log", line);
            }
        });
    }

    // Background thread for stderr logs
    if let Some(err) = stderr {
        let app_clone = app.clone();
        let logs_arc = Arc::clone(&state.logs);
        thread::spawn(move || {
            let reader = BufReader::new(err);
            for line in reader.lines().flatten() {
                {
                    let mut l = logs_arc.lock().unwrap();
                    if l.len() >= 300 {
                        l.remove(0);
                    }
                    l.push(format!("[ERR] {}", line));
                }
                let _ = app_clone.emit("server-log", format!("[ERR] {}", line));
            }
        });
    }

    let logs = state.logs.lock().unwrap().clone();
    Ok(ServerStatusResponse {
        is_running: true,
        is_hosted_locally: true,
        port: 3000,
        lan_ips: get_lan_ips(),
        logs,
    })
}

#[command]
fn stop_local_server(
    app: AppHandle,
    state: State<'_, ServerManager>,
) -> Result<ServerStatusResponse, String> {
    let mut proc_lock = state.process.lock().unwrap();
    let mut running_lock = state.is_running.lock().unwrap();

    if let Some(mut child) = proc_lock.take() {
        let pid = child.id();
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill")
                .args(&["/F", "/T", "/PID", &pid.to_string()])
                .output();
        }
        let _ = child.kill();
        let _ = child.wait();
    }

    *running_lock = false;
    let _ = app.emit("server-status-changed", false);

    let logs = state.logs.lock().unwrap().clone();
    Ok(ServerStatusResponse {
        is_running: false,
        is_hosted_locally: false,
        port: 3000,
        lan_ips: get_lan_ips(),
        logs,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .manage(ServerManager::default())
        .invoke_handler(tauri::generate_handler![
            get_lan_ip,
            get_lan_ips,
            get_server_status,
            start_local_server,
            stop_local_server
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

