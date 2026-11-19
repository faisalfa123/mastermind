mod adapt;
mod admin;
mod audit;
mod auth;
mod batasan;
mod config;
mod discover;
mod helper;
mod installer;
mod ipc;
mod localscan;
mod notify;
mod scanner;
mod setup;
mod store;
mod systemd;
mod web;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let res = match args.first().map(String::as_str) {
        Some("serve") => config::Config::load().and_then(web::serve),
        Some("helper") => config::Config::load().and_then(|c| helper::serve(&c)),
        Some("admin") => admin::run(&args[1..]),
        Some("adopt") => adapt::run(&args[1..]),
        Some("setup") => setup::run(),
        Some("validate") => validate(args.get(1)),
        Some("serve-static") => serve_static(args.get(1), args.get(2)),
        Some("proxy") => run_proxy(args.get(1), args.get(2)),
        Some("notify-test") => config::Config::load().map(|c| {
            let e = notify::send_blocking(&c, "Test", "Mastermind notification test");
            if e.is_empty() { println!("sent"); } else { for x in e { eprintln!("{x}"); } }
        }),
        _ => { println!("mastermind {}\nusage: mastermind <setup|serve|helper|admin|adopt <owner/repo>|validate <file>|serve-static <dir> <port>|proxy <listen> <target>|notify-test>", env!("CARGO_PKG_VERSION")); Ok(()) }
    };
    if let Err(e) = res { eprintln!("error: {e}"); std::process::exit(1); }
}

fn validate(path: Option<&String>) -> Result<(), String> {
    let path = path.ok_or("usage: mastermind validate <id>.batasan.toml")?;
    let s = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let b = batasan::Batasan::parse(&s).map_err(|e| e.to_string())?;
    println!("OK: {} (priority {}, {} MB, {}% CPU)", b.app.id, b.run.priority, b.limits.memory_max_mb, b.limits.cpu_quota_pct);
    Ok(())
}

/// Lightweight static webapp server for jailed static HTML/JS apps.
fn serve_static(dir: Option<&String>, port: Option<&String>) -> Result<(), String> {
    let root = std::path::PathBuf::from(dir.ok_or("usage: mastermind serve-static <dir> <port>")?);
    let port: u16 = port.ok_or("missing port")?.parse().map_err(|_| "invalid port")?;
    let server = tiny_http::Server::http(("0.0.0.0", port)).map_err(|e| e.to_string())?;
    for req in server.incoming_requests() {
        let raw = req.url().split('?').next().unwrap_or("/");
        let rel = raw.trim_start_matches('/');
        if rel.contains("..") {
            let _ = req.respond(tiny_http::Response::from_string("forbidden").with_status_code(403));
            continue;
        }
        let mut target = if rel.is_empty() { root.join("index.html") } else { root.join(rel) };
        if target.is_dir() {
            target = target.join("index.html");
        }
        if !target.exists() {
            target = root.join("index.html");
        }
        match std::fs::read(&target) {
            Ok(data) => {
                let ct = match target.extension().and_then(|e| e.to_str()).unwrap_or("") {
                    "html" | "htm" => "text/html; charset=utf-8",
                    "css" => "text/css; charset=utf-8",
                    "js" | "mjs" => "application/javascript; charset=utf-8",
                    "json" => "application/json",
                    "svg" => "image/svg+xml",
                    "png" => "image/png",
                    "jpg" | "jpeg" => "image/jpeg",
                    "webp" => "image/webp",
                    "ico" => "image/x-icon",
                    _ => "application/octet-stream",
                };
                let hdr = tiny_http::Header::from_bytes("Content-Type", ct).unwrap();
                let _ = req.respond(tiny_http::Response::from_data(data).with_header(hdr));
            }
            Err(_) => {
                let _ = req.respond(tiny_http::Response::from_string("not found").with_status_code(404));
            }
        }
    }
    Ok(())
}

/// Transparent TCP port forwarder for apps with hardcoded conflicting ports.
fn run_proxy(listen: Option<&String>, target: Option<&String>) -> Result<(), String> {
    let lport: u16 = listen.ok_or("usage: mastermind proxy <listen_port> <target_port>")?.parse().map_err(|_| "invalid listen port")?;
    let tport: u16 = target.ok_or("missing target port")?.parse().map_err(|_| "invalid target port")?;
    let listener = std::net::TcpListener::bind(("0.0.0.0", lport)).map_err(|e| e.to_string())?;
    for client in listener.incoming().flatten() {
        std::thread::spawn(move || {
            if let Ok(upstream) = std::net::TcpStream::connect(("127.0.0.1", tport)) {
                let (mut c_r, mut c_w) = (client.try_clone().unwrap(), client);
                let (mut u_r, mut u_w) = (upstream.try_clone().unwrap(), upstream);
                let t1 = std::thread::spawn(move || { let _ = std::io::copy(&mut c_r, &mut u_w); });
                let _ = std::io::copy(&mut u_r, &mut c_w);
                let _ = t1.join();
            }
        });
    }
    Ok(())
}
