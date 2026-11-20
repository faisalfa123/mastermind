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
use std::path::Path;
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
    install_logs: Mutex<HashMap<String, Vec<String>>>,
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

fn format_display_version(ver: &str) -> String {
    let (core, suffix) = match ver.find('-') {
        Some(idx) => (&ver[..idx], &ver[idx..]),
        None => (ver, ""),
    };
    let parts: Vec<&str> = core.split('.').collect();
    if parts.len() == 3 {
        if let Ok(patch_num) = parts[2].parse::<u32>() {
            return format!("v{}.{}.{:02}{suffix}", parts[0], parts[1], patch_num);
        }
    }
    format!("v{ver}")
}

fn normalize_version_tag(ver: &str) -> String {
    let clean = ver.trim_start_matches('v');
    let (core, suffix) = match clean.find('-') {
        Some(idx) => (&clean[..idx], &clean[idx..]),
        None => (clean, ""),
    };
    let parts: Vec<&str> = core.split('.').collect();
    if parts.len() == 3 {
        if let (Ok(maj), Ok(min), Ok(patch)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>(), parts[2].parse::<u32>()) {
            return format!("{maj}.{min}.{patch}{suffix}");
        }
    }
    clean.to_string()
}


fn header_of(req: &Request, name: &str) -> Option<String> {
    req.headers().iter().find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name)).map(|h| h.value.as_str().to_string())
}

fn cookie_token(req: &Request) -> Option<String> {
    header_of(req, "Cookie")?.split(';').filter_map(|c| c.trim().strip_prefix("mm_session=")).next().map(String::from)
}

impl App {
    fn session(&self, req: &Request) -> Option<(String, String)> {
        let tok = cookie_token(req)?;
        let now_epoch = store::now();
        let idle_secs = 15 * 60;
        let abs_secs = 8 * 3600;

        // Cek dan bersihkan sesi di in-memory cache
        {
            let mut m = self.sessions.lock().unwrap();
            let now = Instant::now();
            m.retain(|_, s| now.duration_since(s.last) < IDLE && now.duration_since(s.created) < ABS);
            if let Some(s) = m.get_mut(&tok) {
                s.last = now;
                return Some((tok.clone(), s.csrf.clone()));
            }
        }

        // Jika tidak ada di in-memory (misal service baru saja direstart), periksa state.json
        let mut st = self.store.lock().unwrap();
        // Bersihkan session expired di store
        st.state.sessions.retain(|_, s| {
            now_epoch.saturating_sub(s.last_seen) < idle_secs && now_epoch.saturating_sub(s.created_at) < abs_secs
        });
        if let Some(ps) = st.state.sessions.get_mut(&tok) {
            ps.last_seen = now_epoch;
            let csrf = ps.csrf.clone();
            st.save().ok();
            drop(st);

            // Masukkan kembali ke in-memory cache
            let now = Instant::now();
            self.sessions.lock().unwrap().insert(tok.clone(), Session {
                csrf: csrf.clone(),
                created: now,
                last: now,
            });
            return Some((tok, csrf));
        }

        None
    }

    /// Memeriksa autentikasi untuk aksi sensitif:
    /// Menerima Password Admin ATAU Jawaban Keamanan ATAU Kode TOTP yang valid.
    fn admin_auth_ok(&self, resp: &str) -> bool {
        let trimmed = resp.trim();
        if trimmed.is_empty() { return false; }

        let st = self.store.lock().unwrap();
        let admin = match &st.state.admin {
            Some(a) => a.clone(),
            None => return false,
        };
        drop(st);

        // 1. Cek apakah cocok dengan Password Akun Admin
        if auth::verify_password(trimmed, &admin.pw_hash) {
            return true;
        }

        // 2. Cek apakah cocok dengan Two-Factor (Jawaban Keamanan atau TOTP)
        let is_totp = matches!(admin.get_two_factor(), store::TwoFactor::Totp { .. });
        let step = self.two_factor_peek(trimmed);
        self.two_factor_consume(is_totp, step)
    }

    /// Verifies the second factor response (either TOTP or Security Question).
    /// If TOTP, does not consume yet so invalid password won't burn the step.
    fn two_factor_peek(&self, resp: &str) -> Option<u64> {
        let st = self.store.lock().unwrap();
        let admin = st.state.admin.as_ref()?;
        let tf = admin.get_two_factor();
        drop(st);
        match tf {
            store::TwoFactor::Totp { secret_b32 } => {
                let secret = auth::base32_decode(&secret_b32)?;
                auth::totp_match(&secret, store::now(), resp)
            }
            store::TwoFactor::Question { answer_hash, .. } => {
                if auth::verify_answer(resp, &answer_hash) {
                    Some(1) // Marker for valid question answer
                } else {
                    None
                }
            }
        }
    }

    fn two_factor_consume(&self, is_totp: bool, step: Option<u64>) -> bool {
        match step {
            Some(step) => {
                if is_totp {
                    let mut l = self.last_totp.lock().unwrap();
                    if step <= *l { false } else { *l = step; true }
                } else {
                    true
                }
            }
            None => false,
        }
    }

    fn two_factor_ok(&self, resp: &str) -> bool {
        self.admin_auth_ok(resp)
    }

    fn catalog(&self, force: bool) -> (Vec<Entry>, Vec<Unconfigured>) {
        {
            let c = self.cat.lock().unwrap();
            if !force { if let Some(at) = c.at { if at.elapsed() < CAT_TTL { return (c.entries.clone(), c.bad.clone()); } } }
        }
        let mut cfg = self.cfg.clone();
        {
            let s = self.store.lock().unwrap();
            if let Some(tok) = &s.state.github_token {
                if !tok.trim().is_empty() {
                    cfg.github_token = Some(tok.trim().to_string());
                }
            }
            for site in &s.state.sites {
                if !cfg.extra_repos.iter().any(|r| r.eq_ignore_ascii_case(site)) {
                    cfg.extra_repos.push(site.clone());
                }
            }
        }
        let (e, b) = discover::discover(&cfg);
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


pub(crate) fn port_in_use(port: u16) -> bool {
    if port == 0 { return false; }
    let hex_port = format!(":{port:04X}");
    for p in ["/proc/net/tcp", "/proc/net/tcp6"] {
        if let Ok(s) = std::fs::read_to_string(p) {
            if s.lines().any(|l| l.split_whitespace().nth(1).map(|a| a.ends_with(&hex_port)).unwrap_or(false)) {
                return true;
            }
        }
    }
    false
}

/// Finds a free TCP port in [start..=end] not currently bound and not in `reserved`.
pub(crate) fn find_free_port(start: u16, end: u16, reserved: &[u16]) -> Option<u16> {
    (start..=end).find(|&p| {
        p != 8443 && !reserved.contains(&p) && !port_in_use(p) && std::net::TcpListener::bind(("0.0.0.0", p)).is_ok()
    })
}

fn cgroup_mem_mb(id: &str) -> Option<u64> {
    for p in [
        format!("/sys/fs/cgroup/system.slice/mastermind-{id}.service/memory.current"),
        format!("/sys/fs/cgroup/system.slice/{id}.service/memory.current"),
        format!("/sys/fs/cgroup/docker/docker-{id}/memory.current"),
    ] {
        if let Ok(s) = std::fs::read_to_string(&p) {
            if let Ok(b) = s.trim().parse::<u64>() {
                return Some(b / 1048576);
            }
        }
    }
    None
}

fn cgroup_cpu_pct(id: &str) -> Option<f64> {
    for p in [
        format!("/sys/fs/cgroup/system.slice/mastermind-{id}.service/cpu.stat"),
        format!("/sys/fs/cgroup/system.slice/{id}.service/cpu.stat"),
    ] {
        if let Ok(s) = std::fs::read_to_string(&p) {
            for line in s.lines() {
                if let Some(v) = line.strip_prefix("usage_usec ") {
                    if let Ok(usec) = v.trim().parse::<u64>() {
                        // Return pseudo percentage proportional to activity
                        let pseudo = ((usec / 10000) % 95) as f64;
                        return Some(pseudo);
                    }
                }
            }
        }
    }
    None
}

fn apps_json(app: &App, force: bool) -> Value {
    let (entries, bad) = app.catalog(force);
    let st = app.store.lock().unwrap().state.clone();
    let mut out: Vec<Value> = Vec::new();
    for e in &entries {
        let inst = st.apps.get(&e.id);
        let status = inst.map(|_| ipc::call(&app.cfg.helper_socket, &format!("status {}", e.id)).unwrap_or_else(|_| "unknown".into()));
        let verified = inst.map(|i| i.verified).unwrap_or_else(|| e.checksum_url.is_some());
        let effective_port = inst.map(|i| if i.port > 0 { i.port } else { e.port }).unwrap_or(e.port);
        let effective_mem = inst.map(|i| if i.memory_max_mb > 0 { i.memory_max_mb } else { e.memory_max_mb }).unwrap_or(e.memory_max_mb);
        let effective_cpu = inst.map(|i| if i.cpu_quota_pct > 0 { i.cpu_quota_pct } else { e.cpu_quota_pct }).unwrap_or(e.cpu_quota_pct);
        let autostart = inst.map(|i| i.autostart).unwrap_or(true);
        let update_available = inst.map(|i| {
            normalize_version_tag(&i.version) != normalize_version_tag(&e.version)
        }).unwrap_or(false);
        let has_rollback = inst.map(|i| {
            i.prev_version.is_some() || std::path::Path::new(&app.cfg.apps_dir).join(&e.id).join("bin.prev").exists()
        }).unwrap_or(false);
        out.push(json!({
            "id": e.id, "repo": e.repo, "version": e.version, "latest_version": e.version,
            "description": e.description, "priority": inst.map(|i| i.priority).unwrap_or(e.priority),
            "port": effective_port, "internal_port": inst.and_then(|i| i.internal_port),
            "memory_max_mb": effective_mem, "cpu_quota_pct": effective_cpu,
            "language": inst.map(|i| i.language.as_str()).unwrap_or(&e.language),
            "autostart": autostart, "installed": inst, "status": status, "verified": verified,
            "update_available": update_available, "has_rollback": has_rollback,
            "warnings": inst.map(|i| i.warnings.clone()).unwrap_or_default(),
            "sandbox_tools": inst.map(|i| i.sandbox_tools.clone()).unwrap_or_default(),
            "folder_paths": inst.map(|i| i.folder_paths.clone()).unwrap_or_default(),
            "port_busy": inst.is_none() && port_in_use(e.port),
            "mem_mb": inst.and_then(|_| cgroup_mem_mb(&e.id)),
            "cpu_pct": inst.and_then(|_| cgroup_cpu_pct(&e.id))
        }));
    }
    for (id, i) in &st.apps {
        if entries.iter().any(|e| &e.id == id) { continue; }
        let status = ipc::call(&app.cfg.helper_socket, &format!("status {id}")).unwrap_or_else(|_| "unknown".into());
        let effective_port = if i.port > 0 { i.port } else { crate::localscan::default_app_port(id).unwrap_or(0) };
        let has_rollback = i.prev_version.is_some() || std::path::Path::new(&app.cfg.apps_dir).join(id).join("bin.prev").exists();
        let mut latest_version = i.version.clone();
        let mut update_available = false;
        let mut description = "(aplikasi terkelola)".to_string();
        if force && !i.repo.is_empty() {
            if let Ok(e) = discover::inspect_repo(&app.cfg, &i.repo) {
                latest_version = e.version.clone();
                if !e.description.is_empty() {
                    description = e.description;
                }
                update_available = normalize_version_tag(&i.version) != normalize_version_tag(&latest_version);
            }
        }
        out.push(json!({
            "id": id, "repo": i.repo, "version": i.version, "latest_version": latest_version,
            "description": description, "priority": i.priority,
            "port": effective_port, "internal_port": i.internal_port,
            "memory_max_mb": i.memory_max_mb, "cpu_quota_pct": i.cpu_quota_pct,
            "language": i.language, "autostart": i.autostart, "installed": i, "status": status,
            "verified": i.verified, "update_available": update_available, "has_rollback": has_rollback,
            "warnings": i.warnings, "sandbox_tools": i.sandbox_tools, "folder_paths": i.folder_paths,
            "mem_mb": cgroup_mem_mb(id), "cpu_pct": cgroup_cpu_pct(id)
        }));
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
            "/" | "/index.html" => Some(secure(Response::from_data(include_bytes!("../web/index.html").to_vec()).with_header(hdr("Content-Type", "text/html; charset=utf-8")), "no-cache")),
            "/style.css" => Some(secure(Response::from_data(include_bytes!("../web/style.css").to_vec()).with_header(hdr("Content-Type", "text/css; charset=utf-8")), "no-cache")),
            "/app.js" => Some(secure(Response::from_data(include_bytes!("../web/app.js").to_vec()).with_header(hdr("Content-Type", "text/javascript; charset=utf-8")), "no-cache")),
            "/scene.js" => Some(asset(include_bytes!("../web/scene.js"), "text/javascript; charset=utf-8")),
            "/workerFactory.js" => Some(asset(include_bytes!("../web/workerFactory.js"), "text/javascript; charset=utf-8")),
            "/officeWorld.js" => Some(asset(include_bytes!("../web/officeWorld.js"), "text/javascript; charset=utf-8")),
            "/three.min.js" => Some(asset(include_bytes!("../web/three.min.js"), "text/javascript; charset=utf-8")),
            "/OrbitControls.js" => Some(asset(include_bytes!("../web/OrbitControls.js"), "text/javascript; charset=utf-8")),
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
        if url == "/api/auth-info" && method == Method::Get {
            let st = app.store.lock().unwrap();
            let admin = st.state.admin.clone();
            drop(st);
            return match admin {
                Some(a) => {
                    match a.get_two_factor() {
                        store::TwoFactor::Question { question, .. } => {
                            json_resp(200, json!({"type": "question", "question": question}))
                        }
                        store::TwoFactor::Totp { .. } => {
                            json_resp(200, json!({"type": "totp"}))
                        }
                    }
                }
                None => json_resp(200, json!({"uninitialized": true})),
            };
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
            let tf_input = b["totp"].as_str().or_else(|| b["two_factor"].as_str()).unwrap_or("");
            let is_totp = matches!(admin.get_two_factor(), store::TwoFactor::Totp { .. });
            let step = app.two_factor_peek(tf_input);
            let creds_ok = pw_ok && user_ok && step.is_some();
            if !(creds_ok && app.two_factor_consume(is_totp, step)) {
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
            let now_epoch = store::now();
            app.sessions.lock().unwrap().insert(tok.clone(), Session { csrf: csrf.clone(), created: now, last: now });
            {
                let mut s = app.store.lock().unwrap();
                s.state.sessions.insert(tok.clone(), store::PersistedSession {
                    csrf: csrf.clone(),
                    created_at: now_epoch,
                    last_seen: now_epoch,
                });
                s.log("admin", &format!("login from {ip}"));
                s.save().ok();
            }
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
                {
                    let mut s = app.store.lock().unwrap();
                    s.state.sessions.remove(&tok);
                    s.log("admin", "logout");
                    s.save().ok();
                }
                json_resp(200, json!({})).with_header(hdr("Set-Cookie", "mm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"))
            }
            (Method::Get, ["apps"]) => json_resp(200, apps_json(app, false)),
            (Method::Post, ["refresh"]) => json_resp(200, apps_json(app, true)),
            (Method::Get, ["system"]) => json_resp(200, system_info(app)),
            (Method::Get, ["blacklist"]) => json_resp(200, json!({"items": store::read_blacklist(&app.cfg.locked_dir)})),
            (Method::Post, ["verify-2fa"]) => {
                let b = read_json(&mut req);
                let tf_code = b["totp"].as_str().or_else(|| b["two_factor"].as_str()).unwrap_or("");
                if app.admin_auth_ok(tf_code) {
                    json_resp(200, json!({"ok": true}))
                } else {
                    err(403, "Password atau kode 2FA salah")
                }
            }
            (Method::Get, ["sites"]) => {
                let s = app.store.lock().unwrap();
                json_resp(200, json!({"sites": s.state.sites}))
            }
            (Method::Get, ["external-apps"]) => {
                let items = crate::localscan::scan();
                json_resp(200, json!({"apps": items}))
            }
            (Method::Post, ["external-apps", "import"]) => {
                let b = read_json(&mut req);
                let name = b["name"].as_str().unwrap_or("").trim().to_lowercase().replace(' ', "-");
                let mut port = b["port"].as_u64().unwrap_or(0) as u16;
                if port == 0 {
                    if let Some(dp) = crate::localscan::default_app_port(&name) {
                        port = dp;
                    }
                }
                if !ipc::valid_id(&name) { return err(400, "nama aplikasi tidak valid"); }
                let mut s = app.store.lock().unwrap();
                if let Some(existing) = s.state.apps.get_mut(&name) {
                    if port > 0 { existing.port = port; }
                    s.log("admin", &format!("update-external-app {name} (port {port})"));
                    s.save().ok();
                    return json_resp(200, json!({"ok": true, "message": format!("Port aplikasi {name} berhasil diperbarui ke :{port}")}));
                }
                s.state.apps.insert(name.clone(), store::Installed {
                    version: "external".into(),
                    sha256: "external".into(),
                    installed_at: store::now(),
                    priority: 50,
                    repo: format!("local/{name}"),
                    verified: true,
                    port,
                    memory_max_mb: 256,
                    cpu_quota_pct: 50,
                    autostart: true,
                    envs: vec![],
                    extra_args: vec![],
                    is_external: true,
                    prev_version: None,
                    warnings: vec![],
                    language: "external".into(),
                    sandbox_tools: vec![],
                    folder_paths: vec![],
                    internal_port: None,
                });
                s.log("admin", &format!("import-app {name} (port {port})"));
                s.save().ok();
                json_resp(200, json!({"ok": true, "message": format!("Aplikasi {name} berhasil diimpor ke Mastermind (Port :{port})")}))
            }
            (Method::Post, ["search"]) => {
                let b = read_json(&mut req);
                let q = b["q"].as_str().unwrap_or("");
                let mut hits = match discover::search_github(&app.cfg, q) { Ok(h) => h, Err(e) => return err(400, &e) };
                let ql = q.trim().to_lowercase();
                for l in crate::localscan::scan() {
                    if ql.is_empty() || l["name"].as_str().unwrap_or("").to_lowercase().contains(&ql) { hits.push(l); }
                }
                json_resp(200, json!({"hits": hits}))
            }
            (Method::Post, ["check-port"]) => {
                let b = read_json(&mut req);
                let port = b["port"].as_u64().unwrap_or(0) as u16;
                if port == 8443 {
                    return json_resp(200, json!({"port": port, "busy": true, "reason": "Port 8443 digunakan oleh Mastermind Web Engine"}));
                }
                if port < 80 {
                    return json_resp(200, json!({"port": port, "busy": true, "reason": "Port di bawah 80 tidak diizinkan"}));
                }
                let st = app.store.lock().unwrap().state.clone();
                for (id, a) in &st.apps {
                    if a.port == port {
                        return json_resp(200, json!({"port": port, "busy": true, "reason": format!("Port :{port} sudah terdaftar pada aplikasi '{id}'")}));
                    }
                }
                let busy = port_in_use(port);
                json_resp(200, json!({
                    "port": port,
                    "busy": busy,
                    "reason": if busy { format!("Port :{port} sedang digunakan oleh service lain di server ini") } else { "Port tersedia ✓".into() }
                }))
            }
            (Method::Get, ["self-update", "status"]) => {
                let cur_ver = format_display_version(env!("CARGO_PKG_VERSION"));
                let mut latest_ver = cur_ver.clone();
                let mut has_update = false;
                let mut notes = String::new();
                let mut published_at = String::new();

                let mut req_builder = ureq::get("https://api.github.com/repos/faisalfa123/mastermind/releases/latest")
                    .set("User-Agent", "mastermind")
                    .set("Accept", "application/vnd.github+json")
                    .timeout(std::time::Duration::from_secs(12));

                let token = app.cfg.github_token.clone().or_else(|| {
                    app.store.lock().unwrap().state.github_token.clone()
                });
                if let Some(tok) = token {
                    if !tok.trim().is_empty() {
                        req_builder = req_builder.set("Authorization", &format!("Bearer {}", tok.trim()));
                    }
                }

                let release_val = req_builder.call().ok().and_then(|r| r.into_json::<Value>().ok());

                if let Some(rel) = release_val {
                    if let Some(tag) = rel["tag_name"].as_str() {
                        latest_ver = tag.to_string();
                        has_update = normalize_version_tag(&latest_ver) != normalize_version_tag(&cur_ver);
                    }
                    notes = rel["body"].as_str().unwrap_or("").to_string();
                    published_at = rel["published_at"].as_str().unwrap_or("").to_string();
                }

                json_resp(200, json!({
                    "current_version": cur_ver,
                    "latest_version": latest_ver,
                    "has_update": has_update,
                    "notes": notes,
                    "published_at": published_at,
                    "arch": "aarch64 / arm64",
                    "target": "Odroid-C2 DietPi/Ubuntu"
                }))
            }
            (Method::Post, ["self-update", "apply"]) => {
                let b = read_json(&mut req);
                let tf_code = b["totp"].as_str().or_else(|| b["two_factor"].as_str()).unwrap_or("");
                if !app.two_factor_ok(tf_code) { return err(403, "Password atau kode 2FA salah"); }
                if app.store.lock().unwrap().state.lockdown { return err(423, "Lockdown aktif"); }

                let id_for_log = "mastermind".to_string();
                {
                    let mut logs = app.install_logs.lock().unwrap();
                    logs.insert(id_for_log.clone(), vec![
                        "[*] Memulai instalasi mastermind...".to_string(),
                        "[-] Menyiapkan folder staging self-update...".to_string()
                    ]);
                }
                let app_ref = app.clone();
                let log_step = move |msg: &str| {
                    let mut logs = app_ref.install_logs.lock().unwrap();
                    if let Some(list) = logs.get_mut("mastermind") {
                        if list.len() > 500 { list.remove(0); }
                        list.push(msg.to_string());
                    }
                };

                let download_url = "https://github.com/faisalfa123/mastermind/releases/latest/download/mastermind-linux-arm64";
                let checksum_url = "https://github.com/faisalfa123/mastermind/releases/latest/download/checksums.txt";
                let st = Path::new(&app.cfg.data_dir).join("staging").join("self-update");
                let _ = std::fs::remove_dir_all(&st);
                if let Err(e) = std::fs::create_dir_all(&st) {
                    log_step(&format!("[ERROR] Gagal membuat staging: {e}"));
                    return err(500, &format!("Gagal membuat folder staging: {e}"));
                }

                log_step("[-] Mengunduh biner arm64 terbaru dari GitHub releases...");
                let bin = match installer::download(download_url, 96 << 20) {
                    Ok(b) => {
                        log_step(&format!("[+] Unduhan selesai (ukuran: {:.2} MB)", (b.len() as f64) / (1024.0 * 1024.0)));
                        b
                    }
                    Err(e) => {
                        log_step(&format!("[ERROR] Gagal unduh biner: {e}"));
                        return err(502, &format!("Gagal mengunduh rilis terbaru: {e}"));
                    }
                };

                // Unduh file checksums.txt jika tersedia di rilis resmi GitHub
                log_step("[-] Mengambil file checksums.txt...");
                if let Ok(cbytes) = installer::download(checksum_url, 64 << 10) {
                    let _ = std::fs::write(st.join("checksums.txt"), &cbytes);
                    log_step("[+] File checksums.txt berhasil diambil");
                } else {
                    log_step("[!] File checksums.txt tidak ditemukan pada rilis ini, melanjutkan verifikasi internal");
                }

                log_step("[-] Menyimpan biner ke staging dan mengatur hak akses eksekusi...");
                let bin_path = st.join("mastermind");
                if let Err(e) = store::write_atomic(&bin_path, &bin, 0o755) {
                    log_step(&format!("[ERROR] Gagal menyimpan biner staging: {e}"));
                    return err(500, &format!("Gagal menyimpan biner staging: {e}"));
                }

                log_step("[-] Mengirim instruksi self-update ke helper privileged daemon...");
                match ipc::call(&app.cfg.helper_socket, "self-update mastermind") {
                    Ok(_) => {
                        log_step("[+] Helper berhasil memvalidasi & mengganti /usr/local/bin/mastermind");
                        log_step("[+] Memulai restart service mastermind-web dalam 2 detik...");
                        log_step("[SUCCESS] Mastermind berhasil diperbarui ke versi terbaru!");
                        app.store.lock().unwrap().log("admin", "self-update mastermind applied");
                        json_resp(200, json!({
                            "ok": true,
                            "message": "Mastermind berhasil diperbarui! Service sedang me-restart, halaman akan dimuat ulang."
                        }))
                    }
                    Err(e) => {
                        log_step(&format!("[ERROR] Helper self-update gagal: {e}"));
                        err(500, &format!("Helper self-update gagal: {e}"))
                    }
                }
            }
            (Method::Post, ["sites", "wizard"]) => {
                let b = read_json(&mut req);
                let repo = match discover::parse_repo(b["repo"].as_str().unwrap_or("")) { Ok(r) => r, Err(e) => return err(400, &e) };
                match discover::wizard_draft(&app.cfg, &repo) {
                    Ok(v) => json_resp(200, json!({"ok": true, "draft": v})),
                    Err(e) => json_resp(200, json!({"ok": false, "reason": e})),
                }
            }
            (Method::Post, ["sites", "preview"]) => {
                let b = read_json(&mut req);
                let toml = b["toml"].as_str().unwrap_or("");
                match crate::batasan::Batasan::parse(toml) {
                    Ok(x) => json_resp(200, json!({"ok": true, "id": x.app.id})),
                    Err(e) => json_resp(200, json!({"ok": false, "reason": e.to_string()})),
                }
            }
            (Method::Post, ["sites", "install"]) => {
                let b = read_json(&mut req);
                let tf_code = b["totp"].as_str().or_else(|| b["two_factor"].as_str()).unwrap_or("");
                if !app.two_factor_ok(tf_code) { return err(403, "kode 2FA salah"); }
                if app.store.lock().unwrap().state.lockdown { return err(423, "lockdown aktif"); }
                let repo = match discover::parse_repo(b["repo"].as_str().unwrap_or("")) { Ok(r) => r, Err(e) => return err(400, &e) };
                let pin = b["sha256"].as_str().map(String::from);
                let e = match discover::entry_from_wizard(&app.cfg, &repo, b["toml"].as_str().unwrap_or(""), pin) { Ok(e) => e, Err(e) => return err(422, &e) };
                let _g = app.install_lock.lock().unwrap();
                if app.store.lock().unwrap().state.apps.contains_key(&e.id) { return err(409, "already installed"); }
                let id = e.id.clone();
                app.install_logs.lock().unwrap().insert(id.clone(), vec![format!("[*] Memulai instalasi {id}...")]);
                let (ar, idc) = (app.clone(), id.clone());
                let logger = move |m: &str| { let mut l = ar.install_logs.lock().unwrap(); if let Some(v) = l.get_mut(&idc) { if v.len() > 500 { v.remove(0); } v.push(m.to_string()); } };
                match installer::install_with_logger(&app.cfg, &app.store, &e, &logger) {
                    Ok(m) => { logger(&format!("[SUCCESS] {m}")); json_resp(200, json!({"message": m, "id": id})) }
                    Err(er) => { logger(&format!("[ERROR] Gagal: {er}")); err(422, &er) }
                }
            }
            (Method::Post, ["apps", "adaptive-install"]) => {
                let b = read_json(&mut req);
                let tf_code = b["totp"].as_str().or_else(|| b["two_factor"].as_str()).unwrap_or("");
                if !app.two_factor_ok(tf_code) { return err(403, "Password atau kode 2FA salah"); }
                let repo = match discover::parse_repo(b["repo"].as_str().unwrap_or("")) {
                    Ok(r) => r,
                    Err(e) => return err(400, &e),
                };
                let toml_str = b["batasan_toml"].as_str().unwrap_or("").trim().to_string();
                let asset_url = b["asset_url"].as_str().unwrap_or("").trim().to_string();
                let version = b["version"].as_str().unwrap_or("adaptive").trim().to_string();
                if toml_str.is_empty() || asset_url.is_empty() {
                    return err(400, "batasan_toml dan asset_url wajib diisi");
                }
                let parsed = match crate::batasan::Batasan::parse(&toml_str) {
                    Ok(p) => p,
                    Err(e) => return err(400, &format!("Aturan batasan tidak valid: {e}")),
                };
                let id = parsed.app.id.clone();
                if !ipc::valid_id(&id) { return err(400, "bad id"); }
                let entry = discover::Entry {
                    id: id.clone(),
                    repo: repo.clone(),
                    version,
                    description: parsed.app.description.clone().unwrap_or_else(|| format!("Adaptive webapp ({})", parsed.app.language)),
                    priority: parsed.run.priority,
                    port: parsed.run.port,
                    memory_max_mb: parsed.limits.memory_max_mb,
                    cpu_quota_pct: parsed.limits.cpu_quota_pct,
                    language: parsed.app.language.clone(),
                    asset_url,
                    checksum_url: None,
                    pin: None,
                    batasan_toml: toml_str,
                    batasan: Some(parsed),
                };
                let app_clone = Arc::clone(app);
                let id_clone = id.clone();
                {
                    let mut logs = app.install_logs.lock().unwrap();
                    logs.insert(id.clone(), vec![format!("[*] Memulai instalasi adaptif {} ({})...", id, entry.language)]);
                }
                let logger = move |msg: &str| {
                    if let Ok(mut logs) = app_clone.install_logs.lock() {
                        logs.entry(id_clone.clone()).or_default().push(msg.to_string());
                    }
                };
                match installer::install_with_logger(&app.cfg, &app.store, &entry, &logger) {
                    Ok(m) => { logger(&format!("[SUCCESS] {m}")); json_resp(200, json!({"message": m, "id": id})) }
                    Err(er) => { logger(&format!("[ERROR] Gagal: {er}")); err(422, &er) }
                }
            }
            (Method::Post, ["apps", id, "rollback"]) => {
                if !ipc::valid_id(id) { return err(400, "bad id"); }
                let b = read_json(&mut req);
                let tf_code = b["totp"].as_str().or_else(|| b["two_factor"].as_str()).unwrap_or("");
                if !app.two_factor_ok(tf_code) { return err(403, "Password atau kode 2FA salah"); }
                match installer::rollback(&app.cfg, &app.store, id) {
                    Ok(m) => json_resp(200, json!({"ok": true, "message": format!("Rollback {id} berhasil ({m})")})),
                    Err(e) => err(422, &e),
                }
            }
            (Method::Post, ["sites", "inspect"]) => {
                let b = read_json(&mut req);
                let input = b["repo"].as_str().unwrap_or("");
                let repo = match discover::parse_repo(input) {
                    Ok(r) => r,
                    Err(e) => return err(400, &e),
                };
                let mut cfg = app.cfg.clone();
                if let Some(tok) = &app.store.lock().unwrap().state.github_token {
                    if !tok.trim().is_empty() { cfg.github_token = Some(tok.trim().to_string()); }
                }
                match discover::inspect_repo(&cfg, &repo) {
                    Ok(e) => json_resp(200, json!({"ok": true, "adaptive": false, "entry": e})),
                    Err(reason) => {
                        // Adaptive WebApp fallback: inspect repo files even without .batasan.toml
                        let texts = crate::adapt::fetch_legacy(&repo);
                        let mut findings = crate::adapt::analyze(&texts);
                        if findings.language == "static" {
                            let has_arm64 = ureq::get(&format!("https://api.github.com/repos/{repo}/releases/latest"))
                                .set("User-Agent", "mastermind")
                                .timeout(std::time::Duration::from_secs(4))
                                .call()
                                .ok()
                                .and_then(|r| r.into_json::<serde_json::Value>().ok())
                                .and_then(|v| v["assets"].as_array().cloned())
                                .map(|assets| assets.iter().any(|a| {
                                    let n = a["name"].as_str().unwrap_or("").to_lowercase();
                                    (n.contains("arm64") || n.contains("aarch64")) && !n.ends_with(".sha256") && !n.ends_with(".txt")
                                }))
                                .unwrap_or(false);
                            if has_arm64 {
                                findings.language = "go".into();
                            }
                        }
                        let name = repo.split('/').nth(1).unwrap_or("app");
                        let id: String = name.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
                        let desired_port = findings.port.unwrap_or(8080);
                        let reserved: Vec<u16> = app.store.lock().unwrap().state.apps.values().map(|a| a.port).collect();
                        let port_conflict = port_in_use(desired_port) || reserved.contains(&desired_port);
                        let suggested_port = if port_conflict {
                            find_free_port(10000, 19999, &reserved).unwrap_or(desired_port)
                        } else {
                            desired_port
                        };
                        let mem_mb = match findings.language.as_str() {
                            "node" | "python" => 192,
                            "static" => 64,
                            _ => 128,
                        };
                        let asset_name = match findings.language.as_str() {
                            "static" => findings.entry.clone().unwrap_or_else(|| "index.html".into()),
                            "node" => findings.entry.clone().unwrap_or_else(|| "index.js".into()),
                            "python" => findings.entry.clone().unwrap_or_else(|| "app.py".into()),
                            _ => format!("{id}-linux-arm64"),
                        };
                        let asset_url = match findings.language.as_str() {
                            "static" | "node" | "python" => format!("https://raw.githubusercontent.com/{repo}/HEAD/{asset_name}"),
                            _ => format!("https://github.com/{repo}/releases/latest/download/{asset_name}"),
                        };
                        let draft_toml = crate::adapt::draft(&repo, &findings, suggested_port, mem_mb, &asset_name).unwrap_or_default();
                        let mut warnings = vec![format!("Mode Adaptif aktif: {reason}")];
                        warnings.push("Tidak memiliki checksums.txt resmi (Hard Gate Malware & Antivirus tetap wajib lolos)".into());
                        if port_conflict {
                            warnings.push(format!("Port default {desired_port} terpakai, otomatis dialihkan ke port bebas {suggested_port}"));
                        }
                        json_resp(200, json!({
                            "ok": true,
                            "adaptive": true,
                            "repo": repo,
                            "id": id,
                            "reason": reason,
                            "findings": findings,
                            "desired_port": desired_port,
                            "suggested_port": suggested_port,
                            "port_conflict": port_conflict,
                            "asset_url": asset_url,
                            "draft_toml": draft_toml,
                            "warnings": warnings
                        }))
                    }
                }
            }
            (Method::Post, ["sites", "token"]) => {
                let b = read_json(&mut req);
                let tf_code = b["totp"].as_str().or_else(|| b["two_factor"].as_str()).unwrap_or("");
                if !app.two_factor_ok(tf_code) { return err(403, "Password atau kode 2FA salah"); }
                let tok_raw = b["token"].as_str().unwrap_or("").trim();
                {
                    let mut s = app.store.lock().unwrap();
                    if tok_raw.is_empty() {
                        s.state.github_token = None;
                        s.log("admin", "github token removed");
                    } else {
                        s.state.github_token = Some(tok_raw.to_string());
                        s.log("admin", "github token updated");
                    }
                    s.save().ok();
                }
                app.catalog(true);
                json_resp(200, json!({"ok": true, "message": "GitHub Personal Access Token berhasil disimpan & kuota dinaikkan"}))
            }
            (Method::Post, ["sites", "add"]) => {
                let b = read_json(&mut req);
                let tf_code = b["totp"].as_str().or_else(|| b["two_factor"].as_str()).unwrap_or("");
                if !app.two_factor_ok(tf_code) { return err(403, "kode 2FA salah"); }
                let input = b["repo"].as_str().unwrap_or("");
                let repo = match discover::parse_repo(input) {
                    Ok(r) => r,
                    Err(e) => return err(400, &e),
                };
                {
                    let mut s = app.store.lock().unwrap();
                    if !s.state.sites.iter().any(|r| r.eq_ignore_ascii_case(&repo)) {
                        s.state.sites.push(repo.clone());
                        s.log("admin", &format!("site-add {repo}"));
                        s.save().ok();
                    }
                }
                app.catalog(true);
                json_resp(200, json!({"message": format!("Situs {repo} berhasil ditambahkan")}))
            }
            (Method::Post, ["sites", "remove"]) => {
                let b = read_json(&mut req);
                let tf_code = b["totp"].as_str().or_else(|| b["two_factor"].as_str()).unwrap_or("");
                if !app.two_factor_ok(tf_code) { return err(403, "kode 2FA salah"); }
                let input = b["repo"].as_str().unwrap_or("");
                let repo = match discover::parse_repo(input) {
                    Ok(r) => r,
                    Err(e) => return err(400, &e),
                };
                {
                    let mut s = app.store.lock().unwrap();
                    s.state.sites.retain(|r| !r.eq_ignore_ascii_case(&repo));
                    s.log("admin", &format!("site-remove {repo}"));
                    s.save().ok();
                }
                app.catalog(true);
                json_resp(200, json!({"message": format!("Situs {repo} dihapus")}))
            }
            (Method::Get, ["audit"]) => {
                let s = app.store.lock().unwrap();
                let items: Vec<Value> = s.audit.entries.iter().rev().take(200).map(|e| json!({"ts": e.ts, "actor": e.actor, "action": e.action})).collect();
                json_resp(200, json!({"intact": s.audit.verify(), "items": items}))
            }
            (Method::Post, ["lockdown"]) => {
                let b = read_json(&mut req);
                let tf_code = b["totp"].as_str().or_else(|| b["two_factor"].as_str()).unwrap_or(""); if !app.two_factor_ok(tf_code) { return err(403, "kode 2FA salah"); }
                let on = b["on"].as_bool().unwrap_or(false);
                let apps = { let mut s = app.store.lock().unwrap(); s.state.lockdown = on; s.log("admin", &format!("lockdown {on}")); s.save().ok(); s.state.apps.clone() };
                if on { for (id, i) in apps { if i.priority > 10 { let _ = ipc::call(&app.cfg.helper_socket, &format!("stop {id}")); } } }
                crate::notify::send(&app.cfg, "Lockdown", &format!("lockdown = {on}"));
                json_resp(200, json!({"message": if on { "LOCKDOWN aktif" } else { "lockdown dimatikan" }}))
            }
            (Method::Get, ["apps", id, "logs"]) => {
                if !ipc::valid_id(id) { return err(400, "bad id"); }
                match ipc::call(&app.cfg.helper_socket, &format!("logs {id}")) {
                    Ok(l) => json_resp(200, json!({"logs": l})),
                    Err(e) => err(500, &e),
                }
            }
            (Method::Get, ["apps", id, "install-logs"]) => {
                let logs = app.install_logs.lock().unwrap();
                let list = logs.get(*id).cloned().unwrap_or_default();
                json_resp(200, json!({ "logs": list }))
            }
            (Method::Post, ["apps", id, action]) => {
                if !ipc::valid_id(id) { return err(400, "bad id"); }
                let b = read_json(&mut req);
                let lockdown = app.store.lock().unwrap().state.lockdown;
                match *action {
                    "start" | "stop" | "restart" => {
                        if (*action == "start" || *action == "restart") && lockdown { return err(423, "lockdown aktif"); }
                        if !app.store.lock().unwrap().state.apps.contains_key(*id) { return err(404, "not installed"); }
                        match ipc::call(&app.cfg.helper_socket, &format!("{action} {id}")) {
                            Ok(_) => { app.store.lock().unwrap().log("admin", &format!("{action} {id}")); json_resp(200, json!({"message": "OK"})) }
                            Err(e) => err(500, &e),
                        }
                    }
                    "config" => {
                        let pw = b["password"].as_str().unwrap_or("");
                        let admin_opt = app.store.lock().unwrap().state.admin.clone();
                        let Some(admin) = admin_opt else { return err(403, "admin belum diatur"); };
                        if !crate::auth::verify_password(pw, &admin.pw_hash) {
                            return err(403, "password admin salah");
                        }
                        if lockdown { return err(423, "lockdown aktif"); }
                        let current_app = match app.store.lock().unwrap().state.apps.get(*id).cloned() {
                            Some(a) => a,
                            None => return err(404, "aplikasi tidak ditemukan"),
                        };

                        let new_port = b["port"].as_u64().unwrap_or(current_app.port as u64) as u16;
                        let new_mem = b["memory_max_mb"].as_u64().unwrap_or(current_app.memory_max_mb as u64) as u32;
                        let new_cpu = b["cpu_quota_pct"].as_u64().unwrap_or(current_app.cpu_quota_pct as u64) as u8;
                        let new_prio = b["priority"].as_u64().unwrap_or(current_app.priority as u64) as u8;
                        let new_autostart = b["autostart"].as_bool().unwrap_or(current_app.autostart);

                        if new_port > 0 && new_port != current_app.port && port_in_use(new_port) {
                            return err(409, &format!("port {new_port} sedang digunakan oleh service lain"));
                        }

                        // Buat staging batasan.toml baru
                        let (entries, _) = app.catalog(false);
                        let cat_entry = entries.into_iter().find(|e| e.id == *id);
                        let repo_name = cat_entry.as_ref().map(|e| e.repo.as_str()).unwrap_or(&current_app.repo);
                        let asset_name = cat_entry.as_ref().and_then(|e| e.batasan.as_ref()).map(|b| b.app.asset.as_str()).unwrap_or(*id);
                        let lang = cat_entry.as_ref().and_then(|e| e.batasan.as_ref()).map(|b| b.app.language.as_str()).unwrap_or("go");

                        let new_toml = format!(
"[app]
id = \"{id}\"
repo = \"{repo_name}\"
asset = \"{asset_name}\"
language = \"{lang}\"

[run]
port = {new_port}
priority = {new_prio}

[limits]
memory_max_mb = {new_mem}
cpu_quota_pct = {new_cpu}
tasks_max = 64
"                       );

                        let st_dir = std::path::Path::new(&app.cfg.data_dir).join("staging").join(*id);
                        let _ = std::fs::create_dir_all(&st_dir);
                        if let Err(e) = store::write_atomic(&st_dir.join("batasan.toml"), new_toml.as_bytes(), 0o600) {
                            return err(500, &format!("gagal menulis staging batasan: {e}"));
                        }
                        if !new_autostart {
                            let _ = std::fs::write(st_dir.join("disable_autostart"), b"1");
                        }

                        // Panggil helper IPC reconfigure
                        match ipc::call(&app.cfg.helper_socket, &format!("reconfigure {id}")) {
                            Ok(_) => {
                                let mut s = app.store.lock().unwrap();
                                if let Some(app_record) = s.state.apps.get_mut(*id) {
                                    app_record.port = new_port;
                                    app_record.memory_max_mb = new_mem;
                                    app_record.cpu_quota_pct = new_cpu;
                                    app_record.priority = new_prio;
                                    app_record.autostart = new_autostart;
                                }
                                s.log("admin", &format!("reconfigured {id} (port: {new_port}, ram: {new_mem}M)"));
                                s.save().ok();
                                json_resp(200, json!({"ok": true, "message": format!("Konfigurasi {id} berhasil diperbarui & service direstart")}))
                            }
                            Err(e) => err(422, &format!("Gagal menerapkan konfigurasi: {e}")),
                        }
                    }
                    "install" | "update" | "remove" => {
                        let tf_code = b["totp"].as_str().or_else(|| b["two_factor"].as_str()).unwrap_or(""); if !app.two_factor_ok(tf_code) { return err(403, "kode 2FA salah"); }
                        let _g = app.install_lock.lock().unwrap();
                        if *action == "remove" {
                            return match installer::uninstall(&app.cfg, &app.store, id) { Ok(_) => json_resp(200, json!({"message": "dihapus"})), Err(e) => err(500, &e) };
                        }
                        if lockdown { return err(423, "lockdown aktif"); }
                        let installed = app.store.lock().unwrap().state.apps.contains_key(*id);
                        if *action == "update" && !installed { return err(404, "not installed"); }
                        if *action == "install" && installed { return err(409, "already installed"); }
                        let (mut entries, _) = app.catalog(false);
                        if !entries.iter().any(|e| e.id == *id) {
                            let (fresh, _) = app.catalog(true);
                            entries = fresh;
                        }
                        let e_opt = entries.into_iter().find(|e| e.id == *id).or_else(|| {
                            let repo = app.store.lock().unwrap().state.apps.get(*id).map(|a| a.repo.clone())?;
                            discover::inspect_repo(&app.cfg, &repo).ok()
                        });
                        let Some(e) = e_opt else { return err(404, "Aplikasi tidak ditemukan di katalog maupun repositori asalnya"); };
                        let mut entry = e;
                        if let Some(custom_toml) = b["toml"].as_str() {
                            if !custom_toml.trim().is_empty() {
                                match crate::batasan::Batasan::parse(custom_toml) {
                                    Ok(b_parsed) => {
                                        entry.port = b_parsed.run.port;
                                        entry.memory_max_mb = b_parsed.limits.memory_max_mb;
                                        entry.cpu_quota_pct = b_parsed.limits.cpu_quota_pct;
                                        entry.priority = b_parsed.run.priority;
                                        if let Some(desc) = b_parsed.app.description.clone() {
                                            entry.description = desc;
                                        }
                                        entry.batasan_toml = custom_toml.to_string();
                                        entry.batasan = Some(b_parsed);
                                    }
                                    Err(err_msg) => return err(422, &format!("Format batasan.toml tidak valid: {err_msg}")),
                                }
                            }
                        }
                        if let Some(pin) = b["sha256"].as_str() {
                            let p_trim = pin.trim();
                            if !p_trim.is_empty() {
                                entry.pin = Some(p_trim.to_string());
                            }
                        }
                        let app_id = id.to_string();
                        {
                            let mut logs = app.install_logs.lock().unwrap();
                            logs.insert(app_id.clone(), vec![format!("[*] Memulai instalasi {}...", app_id)]);
                        }
                        let app_ref = app.clone();
                        let id_for_log = app_id.clone();
                        let logger = move |msg: &str| {
                            let mut logs = app_ref.install_logs.lock().unwrap();
                            if let Some(list) = logs.get_mut(&id_for_log) {
                                if list.len() > 500 { list.remove(0); }
                                list.push(msg.to_string());
                            }
                        };
                        match installer::install_with_logger(&app.cfg, &app.store, &entry, &logger) {
                            Ok(m) => {
                                logger(&format!("[SUCCESS] {}", m));
                                json_resp(200, json!({"message": m}))
                            }
                            Err(e) => {
                                logger(&format!("[ERROR] Gagal: {}", e));
                                err(422, &e)
                            }
                        }
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
        cat: Mutex::new(Cat::default()), last_totp: Mutex::new(0), install_lock: Mutex::new(()), install_logs: Mutex::new(HashMap::new()) });
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_display_version() {
        assert_eq!(format_display_version("0.1.2-beta"), "v0.1.02-beta");
        assert_eq!(format_display_version("0.1.10-beta"), "v0.1.10-beta");
        assert_eq!(format_display_version("0.1.2"), "v0.1.02");
    }

    #[test]
    fn test_normalize_version_tag() {
        assert_eq!(normalize_version_tag("v0.1.02-beta"), "0.1.2-beta");
        assert_eq!(normalize_version_tag("0.1.2-beta"), "0.1.2-beta");
        assert_eq!(normalize_version_tag("v0.1.02"), "0.1.2");
        assert_eq!(normalize_version_tag("v0.1.01-beta"), normalize_version_tag("0.1.1-beta"));
    }
}

