//! Native Systemd Orchestrator (v2.0.1) — Shared Environment, Execution-Only.
//! Replaces legacy V1 sandboxing with direct `/etc/systemd/system/bumiayu-*.service` management.
use std::io::Write;
use std::process::{Command, Stdio};

const CLI_BLOCKLIST: &[&str] = &[
    "yt-dlp", "ffmpeg", "ffprobe", "smb", "smbd", "nmbd", "samba",
    "curl", "wget", "git", "sqlite3", "python3", "node", "npm",
];

/// Strict filter: only GUI/WebApps listening on an active HTTP/HTTPS port (> 0) are allowed.
pub fn validate_webapp(slug: &str, port: u16) -> Result<(), String> {
    if slug.is_empty() || !slug.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("slug tidak valid (hanya a-z, 0-9, -, _)".into());
    }
    let lower = slug.to_ascii_lowercase();
    if CLI_BLOCKLIST.iter().any(|&cli| lower == cli || lower.starts_with(&format!("{cli}-"))) {
        return Err(format!("alat CLI '{slug}' ditolak: hanya WebApp GUI dengan port HTTP/HTTPS aktif yang diizinkan"));
    }
    if port == 0 {
        return Err("port HTTP/HTTPS aktif wajib diisi (> 0)".into());
    }
    Ok(())
}

/// Verifies the host Root Shell password before privileged systemd unit registration.
pub fn verify_root_password(root_pw: &str) -> Result<(), String> {
    if root_pw.is_empty() {
        return Err("Password Root Shell wajib diisi".into());
    }
    let mut child = Command::new("su")
        .args(["-c", "true", "root"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("gagal menjalankan verifikasi root shell: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = writeln!(stdin, "{root_pw}");
    }
    let status = child.wait().map_err(|e| format!("gagal menunggu verifikasi root: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("Password Root Shell salah".into())
    }
}

/// Builds a shared-environment systemd unit file (`bumiayu-<slug>.service`).
pub fn build_service_unit(slug: &str, exec_start: &str, work_dir: &str, port: u16) -> String {
    format!(
"[Unit]
Description=Bumiayu WebApp: {slug}
After=network.target

[Service]
Type=simple
WorkingDirectory={work_dir}
ExecStart={exec_start}
Environment=PORT={port}
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
"
    )
}

/// Registers a new WebApp systemd unit in `/etc/systemd/system/bumiayu-<slug>.service`.
pub fn register_service(slug: &str, exec_start: &str, work_dir: &str, port: u16, root_pw: &str) -> Result<String, String> {
    validate_webapp(slug, port)?;
    verify_root_password(root_pw)?;
    let unit_name = format!("bumiayu-{slug}.service");
    let unit_path = format!("/etc/systemd/system/{unit_name}");
    let content = build_service_unit(slug, exec_start, work_dir, port);
    std::fs::write(&unit_path, content)
        .map_err(|e| format!("gagal menulis {unit_path}: {e}"))?;
    let _ = Command::new("systemctl").arg("daemon-reload").status();
    let st = Command::new("systemctl")
        .args(["enable", "--now", &unit_name])
        .status()
        .map_err(|e| format!("gagal menjalankan systemctl: {e}"))?;
    if st.success() {
        Ok(format!("Service {unit_name} terdaftar dan aktif"))
    } else {
        Err(format!("systemctl enable --now {unit_name} gagal"))
    }
}

/// Execution-Only lifecycle control: `start | stop | restart | status`.
pub fn control_service(slug: &str, action: &str) -> Result<String, String> {
    if slug.is_empty() || !slug.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("slug tidak valid".into());
    }
    if !matches!(action, "start" | "stop" | "restart" | "status") {
        return Err("aksi tidak diizinkan (hanya start|stop|restart|status)".into());
    }
    let unit = format!("bumiayu-{slug}.service");
    let out = Command::new("systemctl")
        .args([action, &unit])
        .output()
        .map_err(|e| format!("gagal menjalankan systemctl: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        // Fallback to `<slug>.service` if `bumiayu-<slug>.service` is not used
        let fallback = format!("{slug}.service");
        let out2 = Command::new("systemctl")
            .args([action, &fallback])
            .output()
            .map_err(|e| format!("gagal menjalankan systemctl: {e}"))?;
        if out2.status.success() {
            Ok(String::from_utf8_lossy(&out2.stdout).trim().to_string())
        } else {
            Err(String::from_utf8_lossy(&out2.stderr).trim().to_string())
        }
    }
}
