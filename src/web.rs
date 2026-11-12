//! HTTPS web server: auth, sessions, CSRF, JSON API, embedded PWA assets, watchdogs.
use crate::auth::{self, Lockout};
use crate::config::Config;
use crate::discover::{self, Entry, Unconfigured};
use crate::installer;
use crate::ipc;
use crate::store::{self, Store};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tiny_http::{Header, Method, Request, Response, Server, SslConfig};

const IDLE: Duration = Duration::from_secs(15 * 60);
const ABS: Duration = Duration::from_secs(8 * 3600);
const CAT_TTL: Duration = Duration::from_secs(3600);

struct Session { csrf: String, created: Instant, last: Instant }
#[derive(Default)]
struct Cat { at: Option<Instant>, entries: Vec<Entry>, bad: Vec<Unconfigured> }

pub struct App {
    cfg: Config,
    store: Mutex<Store>,
    sessions: Mutex<HashMap<String, Session>>,
    lockout: Mutex<Lockout>,
    cat: Mutex<Cat>,
    last_totp: Mutex<u64>,
    install_lock: Mutex<()>,
}

type Resp = Response<std::io::Cursor<Vec<u8>>>;

fn hdr(k: &str, v: &str) -> Header { Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap() }

fn secure(mut r: Resp, cache: &str) -> Resp {
    for (k, v) in [
        ("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"),
        ("Strict-Transport-Security", "max-age=63072000"),
        ("X-Content-Type-Options", "nosniff"),
        ("X-Frame-Options", "DENY"),
        ("Referrer-Policy", "no-referrer"),
        ("Cross-Origin-Opener-Policy", "same-origin"),
        ("Cross-Origin-Resource-Policy", "same-origin"),
        ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
        ("Cache-Control", cache),
    ] { r.add_header(hdr(k, v)); }
    r
}

fn json_resp(code: u16, v: Value) -> Resp {
    secure(Response::from_string(v.to_string()).with_status_code(code).with_header(hdr("Content-Type", "application/json")), "no-store")
}
fn err(code: u16, m: &str) -> Resp { json_resp(code, json!({"error": m})) }
fn asset(data: &[u8], ct: &str) -> Resp { secure(Response::from_data(data.to_vec()).with_header(hdr("Content-Type", ct)), "no-cache") }

fn header_of(req: &Request, name: &str) -> Option<String> {
    req.headers().iter().find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name)).map(|h| h.value.as_str().to_string())
}

fn cookie_token(req: &Request) -> Option<String> {
    header_of(req, "Cookie")?.split(';').filter_map(|c| c.trim().strip_prefix("mm_session=")).next().map(String::from)
}

impl App {
    fn session(&self, req: &Request) -> Option<(String, String)> {
        let tok = cookie_token(req)?;
        let mut m = self.sessions.lock().unwrap();
        let now = Instant::now();
        m.retain(|_, s| now.duration_since(s.last) < IDLE && now.duration_since(s.created) < ABS);
        let s = m.get_mut(&tok)?;
        s.last = now;
        Some((tok, s.csrf.clone()))
    }

    /// Matched TOTP step without consuming it (so a wrong password can't burn a valid code).
    fn totp_peek(&self, code: &str) -> Option<u64> {
        let st = self.store.lock().unwrap();
        let secret = auth::base32_decode(&st.state.admin.as_ref()?.totp_b32)?;
        drop(st);
        auth::totp_match(&secret, store::now(), code)
    }

    /// Consumes a step: each 30 s code is accepted once (replay protection).
    fn totp_consume(&self, step: Option<u64>) -> bool {
        match step {
            Some(step) => { let mut l = self.last_totp.lock().unwrap(); if step <= *l { false } else { *l = step; true } }
            None => false,
        }
    }

    fn totp_ok(&self, code: &str) -> bool {
        let step = self.totp_peek(code);
        self.totp_consume(step)
    }

    fn catalog(&self, force: bool) -> (Vec<Entry>, Vec<Unconfigured>) {
        {
            let c = self.cat.lock().unwrap();
            if !force { if let Some(at) = c.at { if at.elapsed() < CAT_TTL { return (c.entries.clone(), c.bad.clone()); } } }
        }
        let (e, b) = discover::discover(&self.cfg);
        let mut c = self.cat.lock().unwrap();
        // Keep the old catalog if GitHub was unreachable (empty result + errors).
        if !(e.is_empty() && !c.entries.is_empty() && !b.is_empty()) { c.entries = e; c.bad = b; }
        c.at = Some(Instant::now());
        (c.entries.clone(), c.bad.clone())
    }
}

fn read_json(req: &mut Request) -> Value {
    let mut b = Vec::new();
    let _ = req.as_reader().take(4096).read_to_end(&mut b);
    serde_json::from_slice(&b).unwrap_or(Value::Null)
}

fn meminfo() -> (u64, u64) {
    let s = std::fs::read_to_string("/proc/meminfo").unwrap_or_default();
    let f = |k: &str| s.lines().find(|l| l.starts_with(k)).and_then(|l| l.split_whitespace().nth(1)).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0) / 1024;
    (f("MemTotal:"), f("MemAvailable:"))
}

fn system_info(app: &App) -> Value {
    let (t, a) = meminfo();
    let load: f64 = std::fs::read_to_string("/proc/loadavg").ok().and_then(|s| s.split_whitespace().next().and_then(|v| v.parse().ok())).unwrap_or(0.0);
    let temp = std::fs::read_to_string("/sys/class/thermal/thermal_zone0/temp").ok().and_then(|s| s.trim().parse::<f64>().ok()).map(|v| (v / 1000.0).round());
    let up = std::fs::read_to_string("/proc/uptime").ok().and_then(|s| s.split_whitespace().next().and_then(|v| v.parse::<f64>().ok())).unwrap_or(0.0) as u64;
    json!({"mem_total_mb": t, "mem_avail_mb": a, "load": load, "temp_c": temp, "uptime_s": up, "lockdown": app.store.lock().unwrap().state.lockdown})
}

fn cgroup_mem_mb(id: &str) -> Option<u64> {
    let p = format!("/sys/fs/cgroup/system.slice/mastermind-{id}.service/memory.current");
    std::fs::read_to_string(p).ok()?.trim().parse::<u64>().ok().map(|b| b / 1048576)
}

fn apps_json(app: &App, force: bool) -> Value {
    let (entries, bad) = app.catalog(force);
    let st = app.store.lock().unwrap().state.clone();
    let mut out: Vec<Value> = Vec::new();
    for e in &entries {
        let inst = st.apps.get(&e.id);
        let status = inst.map(|_| ipc::call(&app.cfg.helper_socket, &format!("status {}", e.id)).unwrap_or_else(|_| "unknown".into()));
        out.push(json!({"id": e.id, "repo": e.repo, "version": e.version, "description": e.description, "priority": e.priority, "port": e.port,
            "memory_max_mb": e.memory_max_mb, "cpu_quota_pct": e.cpu_quota_pct, "language": e.language,
            "installed": inst, "status": status, "update_available": inst.map(|i| i.version != e.version).unwrap_or(false),
            "mem_mb": inst.and_then(|_| cgroup_mem_mb(&e.id))}));
    }
    for (id, i) in &st.apps {
        if entries.iter().any(|e| &e.id == id) { continue; }
        let status = ipc::call(&app.cfg.helper_socket, &format!("status {id}")).unwrap_or_else(|_| "unknown".into());
        out.push(json!({"id": id, "repo": i.repo, "version": i.version, "description": "(tidak ada di katalog)", "priority": i.priority, "port": 0,
            "memory_max_mb": 0, "cpu_quota_pct": 0, "language": "?", "installed": i, "status": status, "update_available": false, "mem_mb": cgroup_mem_mb(id)}));
    }
    json!({"apps": out, "unconfigured": bad, "lockdown": st.lockdown})
}

fn handle(app: &Arc<App>, mut req: Request) {
    let method = req.method().clone();
    let url = req.url().split('?').next().unwrap_or("/").to_string();
    let ip = req.remote_addr().map(|a| a.ip().to_string()).unwrap_or_default();

    // Static PWA assets (public: they contain no secrets)
    if method == Method::Get && !url.starts_with("/api/") {
        let r = match url.as_str() {
            "/" | "/index.html" => Some(asset(include_bytes!("../web/index.html"), "text/html; charset=utf-8")),
            "/style.css" => Some(asset(include_bytes!("../web/style.css"), "text/css; charset=utf-8")),
            "/app.js" => Some(asset(include_bytes!("../web/app.js"), "text/javascript; charset=utf-8")),
            "/sw.js" => Some(asset(include_bytes!("../web/sw.js"), "text/javascript; charset=utf-8")),
            "/manifest.webmanifest" => Some(asset(include_bytes!("../web/manifest.webmanifest"), "application/manifest+json")),
            "/pixel.ttf" => Some(asset(include_bytes!("../web/pixel.ttf"), "font/ttf")),
            "/icon-192.png" => Some(asset(include_bytes!("../web/icon-192.png"), "image/png")),
            "/icon-512.png" => Some(asset(include_bytes!("../web/icon-512.png"), "image/png")),
            "/icon-maskable-512.png" => Some(asset(include_bytes!("../web/icon-maskable-512.png"), "image/png")),
            "/favicon.png" => Some(asset(include_bytes!("../web/favicon.png"), "image/png")),
            _ => None,
        };
        let _ = req.respond(r.unwrap_or_else(|| err(404, "not found")));
        return;
    }

    let resp = (|| -> Resp {
        if method == Method::Post {
            // CSRF layer 1: same-origin check when the browser sends Origin.
            if let (Some(o), Some(host)) = (header_of(&req, "Origin"), header_of(&req, "Host")) {
                if o.split("//").nth(1) != Some(host.as_str()) { return err(403, "bad origin"); }
            }
            if !header_of(&req, "Content-Type").map(|c| c.starts_with("application/json")).unwrap_or(false) { return err(415, "json only"); }
        }
        if url == "/api/me" && method == Method::Get {
            return match app.session(&req) { Some((_, c)) => json_resp(200, json!({"csrf": c})), None => json_resp(200, json!({})) };
        }
        if url == "/api/login" && method == Method::Post {
            let b = read_json(&mut req);
            let (ipk, ak) = (format!("ip:{ip}"), "acct".to_string());
            {
                let l = app.lockout.lock().unwrap();
                let now = Instant::now();
                if let Err(d) = l.check(&ipk, now).and(l.check(&ak, now)) { return err(429, &format!("terkunci, coba lagi {} detik", d.as_secs())); }
            }
            let admin = app.store.lock().unwrap().state.admin.clone();
            let Some(admin) = admin else { return err(503, "belum diinisialisasi: jalankan 'mastermind admin init' di SSH"); };
            // Always run the expensive hash so timing doesn't reveal a wrong username.
            let pw_ok = auth::verify_password(b["password"].as_str().unwrap_or(""), &admin.pw_hash);
            let user_ok = b["user"].as_str().unwrap_or("") == admin.user;
            let step = app.totp_peek(b["totp"].as_str().unwrap_or(""));
            let creds_ok = pw_ok && user_ok && step.is_some();
            if !(creds_ok && app.totp_consume(step)) {
                let mut l = app.lockout.lock().unwrap();
                l.fail(&ipk, Instant::now());
                l.fail(&ak, Instant::now());
                drop(l);
                app.store.lock().unwrap().log("system", &format!("login failed from {ip}"));
                std::thread::sleep(Duration::from_millis(400));
                return err(401, "login gagal");
            }
            { let mut l = app.lockout.lock().unwrap(); l.success(&ipk); l.success(&ak); }
            let (tok, csrf) = (auth::random_token(), auth::random_token());
            let now = Instant::now();
            app.sessions.lock().unwrap().insert(tok.clone(), Session { csrf: csrf.clone(), created: now, last: now });
            app.store.lock().unwrap().log("admin", &format!("login from {ip}"));
            crate::notify::send(&app.cfg, "Login", &format!("Login Mastermind dari {ip}"));
            let sec = if app.cfg.cert.is_some() { "; Secure" } else { "" };
            return json_resp(200, json!({"csrf": csrf})).with_header(hdr("Set-Cookie", &format!("mm_session={tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800{sec}")));
        }

        // ---- everything below needs a session; mutations need the CSRF header too ----
        let Some((tok, csrf)) = app.session(&req) else { return err(401, "unauthorized") };
        if method == Method::Post && header_of(&req, "X-CSRF").as_deref() != Some(csrf.as_str()) { return err(403, "csrf"); }
        let seg: Vec<&str> = url.trim_start_matches("/api/").split('/').collect();
        match (&method, seg.as_slice()) {
            (Method::Post, ["logout"]) => {
                app.sessions.lock().unwrap().remove(&tok);
                app.store.lock().unwrap().log("admin", "logout");
                json_resp(200, json!({})).with_header(hdr("Set-Cookie", "mm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"))
            }
            (Method::Get, ["apps"]) => json_resp(200, apps_json(app, false)),
            (Method::Post, ["refresh"]) => json_resp(200, apps_json(app, true)),
            (Method::Get, ["system"]) => json_resp(200, system_info(app)),
            (Method::Get, ["blacklist"]) => json_resp(200, json!({"items": store::read_blacklist(&app.cfg.locked_dir)})),
            (Method::Get, ["audit"]) => {
                let s = app.store.lock().unwrap();
                let items: Vec<Value> = s.audit.entries.iter().rev().take(200).map(|e| json!({"ts": e.ts, "actor": e.actor, "action": e.action})).collect();
                json_resp(200, json!({"intact": s.audit.verify(), "items": items}))
            }
            (Method::Post, ["lockdown"]) => {
                let b = read_json(&mut req);
                if !app.totp_ok(b["totp"].as_str().unwrap_or("")) { return err(403, "kode 2FA salah"); }
                let on = b["on"].as_bool().unwrap_or(false);
                let apps = { let mut s = app.store.lock().unwrap(); s.state.lockdown = on; s.log("admin", &format!("lockdown {on}")); s.save().ok(); s.state.apps.clone() };
                if on { for (id, i) in apps { if i.priority > 10 { let _ = ipc::call(&app.cfg.helper_socket, &format!("stop {id}")); } } }
                crate::notify::send(&app.cfg, "Lockdown", &format!("lockdown = {on}"));
                json_resp(200, json!({"message": if on { "LOCKDOWN aktif" } else { "lockdown dimatikan" }}))
            }
            (Method::Post, ["apps", id, action]) => {
                if !ipc::valid_id(id) { return err(400, "bad id"); }
                let b = read_json(&mut req);
                let lockdown = app.store.lock().unwrap().state.lockdown;
                match *action {
                    "start" | "stop" => {
                        if *action == "start" && lockdown { return err(423, "lockdown aktif"); }
                        if !app.store.lock().unwrap().state.apps.contains_key(*id) { return err(404, "not installed"); }
                        match ipc::call(&app.cfg.helper_socket, &format!("{action} {id}")) {
                            Ok(_) => { app.store.lock().unwrap().log("admin", &format!("{action} {id}")); json_resp(200, json!({"message": "OK"})) }
                            Err(e) => err(500, &e),
                        }
                    }
                    "install" | "update" | "remove" => {
                        if !app.totp_ok(b["totp"].as_str().unwrap_or("")) { return err(403, "kode 2FA salah"); }
                        let _g = app.install_lock.lock().unwrap();
                        if *action == "remove" {
                            return match installer::uninstall(&app.cfg, &app.store, id) { Ok(_) => json_resp(200, json!({"message": "dihapus"})), Err(e) => err(500, &e) };
                        }
                        if lockdown { return err(423, "lockdown aktif"); }
                        let installed = app.store.lock().unwrap().state.apps.contains_key(*id);
                        if *action == "update" && !installed { return err(404, "not installed"); }
                        if *action == "install" && installed { return err(409, "already installed"); }
                        let (entries, _) = app.catalog(false);
                        let Some(e) = entries.iter().find(|e| e.id == *id) else { return err(404, "not in catalog") };
                        match installer::install(&app.cfg, &app.store, e) { Ok(m) => json_resp(200, json!({"message": m})), Err(e) => err(422, &e) }
                    }
                    _ => err(404, "unknown action"),
                }
            }
            _ => err(404, "not found"),
        }
    })();
    let _ = req.respond(resp);
}

/// Stops the lowest-priority running app when memory is critically low; checks installed binaries for tampering.
fn watchdogs(app: Arc<App>) {
    let a = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(30));
        let (_, avail) = meminfo();
        if avail == 0 || avail >= a.cfg.min_free_mem_mb { continue; }
        let apps = a.store.lock().unwrap().state.apps.clone();
        let victim = apps.iter().filter(|(_, i)| i.priority > 10)
            .filter(|(id, _)| ipc::call(&a.cfg.helper_socket, &format!("status {id}")).map(|s| s == "active").unwrap_or(false))
            .max_by_key(|(_, i)| i.priority).map(|(id, _)| id.clone());
        if let Some(id) = victim {
            let _ = ipc::call(&a.cfg.helper_socket, &format!("stop {id}"));
            a.store.lock().unwrap().log("system", &format!("low memory ({avail} MB): stopped {id}"));
            crate::notify::send(&a.cfg, "Memori rendah", &format!("{id} dihentikan (sisa {avail} MB)"));
        }
    });
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(60));
        let apps = app.store.lock().unwrap().state.apps.clone();
        for (id, i) in apps {
            if let Ok(h) = ipc::call(&app.cfg.helper_socket, &format!("verify {id}")) {
                if h != i.sha256 {
                    let _ = ipc::call(&app.cfg.helper_socket, &format!("stop {id}"));
                    app.store.lock().unwrap().log("system", &format!("TAMPER: {id} binary changed, stopped"));
                    crate::notify::send(&app.cfg, "TAMPER terdeteksi", &format!("Binary {id} berubah! App dihentikan."));
                }
            }
        }
        std::thread::sleep(Duration::from_secs(6 * 3600));
    });
}

pub fn serve(cfg: Config) -> Result<(), String> {
    let addr = format!("{}:{}", cfg.bind, cfg.port);
    let server = match (&cfg.cert, &cfg.key) {
        (Some(c), Some(k)) => Server::https(&addr, SslConfig { certificate: std::fs::read(c).map_err(|e| format!("cert: {e}"))?, private_key: std::fs::read(k).map_err(|e| format!("key: {e}"))? }).map_err(|e| e.to_string())?,
        _ => {
            // Plain HTTP is only tolerated on loopback (e.g. behind `tailscale serve`).
            if cfg.bind != "127.0.0.1" && cfg.bind != "::1" { return Err("cert/key required unless bind is loopback".into()); }
            Server::http(&addr).map_err(|e| e.to_string())?
        }
    };
    let store = Store::open(&cfg.data_dir).map_err(|e| format!("store: {e}"))?;
    let app = Arc::new(App { cfg, store: Mutex::new(store), sessions: Mutex::new(HashMap::new()), lockout: Mutex::new(Lockout::default()),
        cat: Mutex::new(Cat::default()), last_totp: Mutex::new(0), install_lock: Mutex::new(()) });
    eprintln!("mastermind web listening on {addr}");
    watchdogs(app.clone());
    let active = Arc::new(AtomicUsize::new(0));
    for req in server.incoming_requests() {
        if active.load(Ordering::Relaxed) >= 16 { let _ = req.respond(err(503, "busy")); continue; }
        active.fetch_add(1, Ordering::Relaxed);
        let (a, c) = (app.clone(), active.clone());
        std::thread::spawn(move || { handle(&a, req); c.fetch_sub(1, Ordering::Relaxed); });
    }
    Ok(())
}
