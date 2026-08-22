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
    let mut candidate_dirs: Vec<PathBuf> = Vec::new();

    // 1. App Resource Directory (Tauri Packaged App)
    if let Ok(res_dir) = app.path().resource_dir() {
        candidate_dirs.push(res_dir.join("resources").join("server"));
        candidate_dirs.push(res_dir.join("server"));
        candidate_dirs.push(res_dir);
    }

    // 2. Executable Parent Directory (Portable exe / Installed folder)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidate_dirs.push(exe_dir.join("resources").join("server"));
            candidate_dirs.push(exe_dir.join("server"));
        }
    }

    // 3. Local Development Workspace
    let project_root = find_project_root();
    candidate_dirs.push(project_root.join("src-tauri").join("resources").join("server"));
    candidate_dirs.push(project_root.join("server"));

    // Check each candidate directory for dist/server.js or server.js
    for dir in candidate_dirs {
        let server_js_path = if dir.join("dist").join("server.js").exists() {
            Some(dir.join("dist").join("server.js"))
        } else if dir.join("server.js").exists() {
            Some(dir.join("server.js"))
        } else {
            None
        };

        if let Some(script) = server_js_path {
            let mut cmd = Command::new("node");
            cmd.arg(&script);
            cmd.current_dir(&dir);
            cmd.env("NODE_PATH", dir.join("node_modules"));
            return Some((dir, cmd));
        }

        if dir.join("src").join("server.ts").exists() {
            let mut cmd = if cfg!(target_os = "windows") {
                let mut c = Command::new("cmd");
                c.args(&["/C", "npm", "run", "dev"]);
                c
            } else {
                let mut c = Command::new("npm");
                c.args(&["run", "dev"]);
                c
            };
            cmd.current_dir(&dir);
            return Some((dir, cmd));
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

    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("./concord_data"));
    let _ = std::fs::create_dir_all(&app_data_dir);

    let (_server_dir, mut cmd) = match resolve_server_execution(&app) {
        Some(res) => res,
        None => {
            return Err("Não foi possível localizar os arquivos do servidor Concord. Certifique-se de que os recursos foram incluídos no pacote.".to_string());
        }
    };

    cmd.env("CONCORD_DATA_DIR", &app_data_dir);
    cmd.env("PORT", "3000");

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Falha ao iniciar o Node.js para o servidor local: {}. Verifique se o Node.js está instalado.", e))?;

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

