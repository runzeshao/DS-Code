#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use tauri::Manager;

const FRONTEND_PORT: u16 = 5173;
const API_PORT: u16 = 7878;

struct AppState {
    backend: Mutex<Option<Child>>,
    backend_error: Mutex<Option<String>>,
}

fn find_ds_tui() -> Option<PathBuf> {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = base.parent().and_then(|p| p.parent());
    [
        repo_root.map(|r| r.join("target").join("debug").join("ds-tui.exe")),
        repo_root.map(|r| r.join("target").join("release").join("ds-tui.exe")),
        std::env::current_exe().ok().map(|p| {
            p.parent().unwrap_or(std::path::Path::new(".")).join("ds-tui.exe")
        }),
    ]
    .into_iter()
    .flatten()
    .find(|p| p.exists())
}

fn kill_stale_processes() {
    for port in &[FRONTEND_PORT, API_PORT] {
        let _ = Command::new("powershell")
            .args(["-Command", &format!(
                "Get-NetTCPConnection -LocalPort {} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object {{ Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }}", port
            )])
            .output();
    }
}

/// Start a tiny HTTP server that serves frontend files AND proxies API requests
fn start_frontend_server() -> std::io::Result<()> {
    let static_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("src");

    let listener = TcpListener::bind(format!("127.0.0.1:{}", FRONTEND_PORT))?;
    println!("Frontend server on http://127.0.0.1:{}", FRONTEND_PORT);

    thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(stream) = stream {
                let dir = static_dir.clone();
                thread::spawn(move || handle_connection(stream, &dir));
            }
        }
    });
    Ok(())
}

fn handle_connection(mut stream: TcpStream, static_dir: &PathBuf) {
    let mut reader = BufReader::new(&stream);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }
    let method = parts[0];
    let path = parts[1];

    // Collect headers
    let mut headers = Vec::new();
    let mut content_length = 0;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).is_err() || line.trim().is_empty() {
            break;
        }
        if line.to_lowercase().starts_with("content-length:") {
            if let Ok(len) = line.trim().split(':').nth(1).unwrap_or("0").trim().parse::<usize>() {
                content_length = len;
            }
        }
        headers.push(line.trim().to_string());
    }

    // Read body if present
    let mut body = Vec::new();
    if content_length > 0 {
        let mut buf = vec![0u8; content_length];
        let _ = reader.read_exact(&mut buf);
        body = buf;
    }

    // Route: API proxy or static file
    if path.starts_with("/health") || path.starts_with("/v1/") {
        proxy_api_request(stream, method, path, &headers, &body);
    } else {
        serve_static_file(stream, path, static_dir);
    }
}

fn proxy_api_request(mut stream: TcpStream, method: &str, path: &str, headers: &[String], body: &[u8]) {
    let addr = format!("127.0.0.1:{}", API_PORT);
    if let Ok(mut api_stream) = TcpStream::connect(&addr) {
        let _ = api_stream.set_read_timeout(Some(std::time::Duration::from_secs(30)));

        // Forward request
        let mut req = format!("{} {} HTTP/1.1\r\nHost: {}\r\n", method, path, addr);
        for h in headers {
            if !h.to_lowercase().starts_with("host:") && !h.to_lowercase().starts_with("connection:")
                && !h.to_lowercase().starts_with("origin:")
            {
                req.push_str(h);
                req.push_str("\r\n");
            }
        }
        req.push_str(&format!("Content-Length: {}\r\n", body.len()));
        req.push_str("Connection: close\r\n\r\n");
        let _ = api_stream.write_all(req.as_bytes());
        if !body.is_empty() {
            let _ = api_stream.write_all(body);
        }

        // Read and forward response
        let mut response = Vec::new();
        let _ = api_stream.read_to_end(&mut response);
        let _ = stream.write_all(&response);
    } else {
        let resp = "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 25\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nBackend not available";
        let _ = stream.write_all(resp.as_bytes());
    }
}

fn serve_static_file(mut stream: TcpStream, path: &str, static_dir: &PathBuf) {
    let file_path = if path == "/" || path.is_empty() {
        static_dir.join("index.html")
    } else {
        let clean = path.trim_start_matches('/');
        static_dir.join(clean)
    };

    match std::fs::read(&file_path) {
        Ok(content) => {
            let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("");
            let mime = match ext {
                "html" => "text/html; charset=utf-8",
                "css" => "text/css; charset=utf-8",
                "js" => "application/javascript; charset=utf-8",
                "png" => "image/png",
                "ico" => "image/x-icon",
                "json" => "application/json",
                _ => "application/octet-stream",
            };
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                mime, content.len()
            );
            let _ = stream.write_all(resp.as_bytes());
            let _ = stream.write_all(&content);
        }
        Err(_) => {
            let resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nNot Found";
            let _ = stream.write_all(resp.as_bytes());
        }
    }
}

fn main() {
    // Kill stale processes first
    kill_stale_processes();
    thread::sleep(std::time::Duration::from_millis(500));

    // Start frontend server
    if let Err(e) = start_frontend_server() {
        eprintln!("Failed to start frontend server: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            backend: Mutex::new(None),
            backend_error: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![get_backend_status])
        .setup(|app| {
            let state = app.state::<AppState>();

            match find_ds_tui() {
                Some(path) => {
                    match Command::new(&path).args(["serve", "--http"]).spawn() {
                        Ok(child) => {
                            println!("ds-tui started (PID: {})", child.id());
                            *state.backend.lock().unwrap() = Some(child);
                        }
                        Err(e) => {
                            let msg = format!("启动 ds-tui 失败: {}", e);
                            eprintln!("{}", msg);
                            *state.backend_error.lock().unwrap() = Some(msg);
                        }
                    }
                }
                None => {
                    let msg = "未找到 ds-tui.exe".to_string();
                    eprintln!("{}", msg);
                    *state.backend_error.lock().unwrap() = Some(msg);
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<AppState>() {
                    if let Ok(mut guard) = state.backend.lock() {
                        if let Some(ref mut child) = *guard {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running DS Code desktop");
}

#[tauri::command]
fn get_backend_status(state: tauri::State<AppState>) -> Result<String, String> {
    let err = state.backend_error.lock().map_err(|e| e.to_string())?;
    if let Some(msg) = &*err {
        return Ok(format!("error:{}", msg));
    }
    Ok("ok".to_string())
}
