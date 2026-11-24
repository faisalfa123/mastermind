//! Install / update / uninstall pipeline (runs in the unprivileged web process; privileged work goes through the helper).
use crate::config::Config;
use crate::discover::{self, Entry};
use crate::ipc;
use crate::scanner;
use crate::store::{self, Installed, Store};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::Path;

pub fn download(url: &str, max: u64) -> Result<Vec<u8>, String> {
    let r = ureq::get(url).set("User-Agent", "mastermind").timeout(std::time::Duration::from_secs(300)).call().map_err(|e| e.to_string())?;
    let mut v = Vec::new();
    r.into_reader().take(max + 1).read_to_end(&mut v).map_err(|e| e.to_string())?;
    if v.len() as u64 > max { return Err("download too large".into()); }
    Ok(v)
}

#[allow(dead_code)]
pub fn install(cfg: &Config, st: &std::sync::Mutex<Store>, e: &Entry) -> Result<String, String> {
    install_with_logger(cfg, st, e, &|_| {})
}

fn rewrite_port_in_toml(toml_str: &str, old_port: u16, new_port: u16) -> String {
    let mut out = Vec::new();
    let mut replaced = false;
    for line in toml_str.lines() {
        let trimmed = line.trim();
        if !replaced && trimmed.starts_with("port") && trimmed.contains(&old_port.to_string()) {
            out.push(format!("port = {new_port}"));
            out.push(format!("internal_port = {old_port}"));
            replaced = true;
        } else {
            out.push(line.to_string());
        }
    }
    out.join("\n") + "\n"
}

pub fn install_with_logger<F: Fn(&str)>(cfg: &Config, st: &std::sync::Mutex<Store>, e: &Entry, log: &F) -> Result<String, String> {
    log(&format!("[-] Memeriksa status blacklist untuk {}...", e.id));
    let bl = store::read_blacklist(&cfg.locked_dir);
    if bl.iter().any(|b| b.id == e.id || b.repo.eq_ignore_ascii_case(&e.repo)) {
        return Err("app is blacklisted (unlock via SSH)".into());
    }
    let mut b = e.batasan.clone().ok_or("catalog entry has no parsed rules")?;
    let mut batasan_toml = e.batasan_toml.clone();
    let mut soft_warnings: Vec<String> = Vec::new();

    // Check if this is an update of an already-installed app
    let prev_installed = st.lock().unwrap().state.apps.get(&e.id).cloned();
    if let Some(ref existing) = prev_installed {
        log(&format!("[-] Mode Update: menghentikan {} versi {} terlebih dahulu agar port {} bebas...", e.id, existing.version, existing.port));
        let _ = ipc::call(&cfg.helper_socket, &format!("stop {}", e.id));
        std::thread::sleep(std::time::Duration::from_millis(450));
    }

    // Auto-resolve port conflict if another service is holding the requested port
    let mut internal_port = b.run.internal_port;
    if b.run.port > 0 && crate::web::port_in_use(b.run.port) {
        let used_ports: Vec<u16> = st.lock().unwrap().state.apps.iter()
            .filter(|(k, _)| *k != &e.id)
            .map(|(_, v)| v.port)
            .collect();
        if let Some(free_port) = crate::web::find_free_port(10000, 19999, &used_ports) {
            let orig = b.run.port;
            log(&format!("[!] Port {orig} sedang dipakai service lain. Otomatis dialihkan ke port bebas {free_port}."));
            batasan_toml = rewrite_port_in_toml(&batasan_toml, orig, free_port);
            b.run.port = free_port;
            internal_port = Some(orig);
            soft_warnings.push(format!("Port bentrok ({orig}), otomatis dipindah ke port {free_port}"));
        } else {
            return Err(format!("Port {} sudah digunakan dan tidak ada port bebas di rentang 10000-19999", b.run.port));
        }
    }

    log(&format!("[1/5] Mengunduh paket {} ({}) dari {}...", e.id, b.app.language, e.asset_url));
    let bin = download(&e.asset_url, 96 << 20)?;
    log(&format!("[+] Download selesai ({} bytes)", bin.len()));
    let digest = hex::encode(Sha256::digest(&bin));
    if bl.iter().any(|x| x.sha256 == digest) {
        return Err("binary hash is blacklisted".into());
    }

    log("[2/5] Memverifikasi SHA256 integrity (Soft Gate)...");
    let mut verified = true;
    match (&e.checksum_url, &e.pin) {
        (Some(curl), _) => {
            if let Ok(text) = discover::fetch_text(curl) {
                if let Some(expected) = discover::parse_checksum(&text, &b.app.asset) {
                    if expected != digest {
                        verified = false;
                        st.lock().unwrap().log("system", &format!("CHECKSUM WARNING {} {}", e.id, e.version));
                        soft_warnings.push("Checksum SHA256 tidak cocok dengan checksums.txt sumber".into());
                        log(&format!("[!] TANDA PERINGATAN: Checksum tidak cocok (sha256: {}). Melanjutkan ke Hard Gate Malware/Antivirus.", &digest[..16]));
                    } else {
                        log(&format!("[+] Checksum resmi valid (sha256: {})", &digest[..16]));
                    }
                } else {
                    verified = false;
                    soft_warnings.push("Aset tidak tercantum di checksums.txt".into());
                    log(&format!("[!] Peringatan: aset {} tidak terdaftar di checksums.txt (hash: {})", b.app.asset, &digest[..16]));
                }
            } else {
                verified = false;
                soft_warnings.push("Gagal mengambil checksums.txt dari sumber".into());
                log(&format!("[!] Peringatan: gagal mengambil checksums.txt (hash: {})", &digest[..16]));
            }
        }
        (None, Some(pin)) if !pin.is_empty() => {
            if *pin != digest {
                verified = false;
                soft_warnings.push("SHA256 tidak cocok dengan pin admin".into());
                log("[!] Peringatan: SHA256 pin tidak cocok.");
            } else {
                log(&format!("[+] SHA256 pin admin cocok (sha256: {})", &digest[..16]));
            }
        }
        _ => {
            verified = false;
            soft_warnings.push("Tidak memiliki file checksums.txt (unverified)".into());
            log(&format!("[!] Peringatan: tidak ada verifikasi SHA256 (hash: {}).", &digest[..16]));
        }
    }

    // Hard Gate: Static Malware Scanner + ClamAV (if installed) + VirusTotal (if configured)
    log("[3/5] HARD GATE: Memindai malware & antivirus (wajib lolos)...");
    let mut verdict = scanner::scan_for_language(&bin, &b.app.language);
    if let Some(k) = &cfg.virustotal_key {
        match scanner::virustotal(&digest, k) {
            Ok(Some(n)) if n >= 3 => {
                verdict.blocked = true;
                verdict.reasons.push(format!("VirusTotal: {n} engines flag this file"));
            }
            Ok(_) => {}
            Err(err) => verdict.warnings.push(format!("VirusTotal unavailable: {err}")),
        }
    }

    log("[4/5] Menyiapkan isolasi folder, sandbox tool, & file staging...");
    let dir = Path::new(&cfg.data_dir).join("staging").join(&e.id);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let staged_bin = dir.join("bin");
    store::write_atomic(&staged_bin, &bin, 0o600).map_err(|e| e.to_string())?;
    store::write_atomic(&dir.join("batasan.toml"), batasan_toml.as_bytes(), 0o600).map_err(|e| e.to_string())?;

    if !cfg.dry_run {
        scanner::scan_clamav(&staged_bin, &mut verdict);
        log(&format!("[-] Status ClamAV: {}", verdict.clamav_status));
    }

    if verdict.blocked {
        let reason = verdict.reasons.join("; ");
        store::write_atomic(&dir.join("reason.txt"), reason.as_bytes(), 0o600).ok();
        let _ = ipc::call(&cfg.helper_socket, &format!("quarantine {}", e.id));
        st.lock().unwrap().state.apps.remove(&e.id);
        let mut g = st.lock().unwrap();
        g.log("system", &format!("MALWARE blocked+blacklisted {} ({reason})", e.id));
        g.save().ok();
        crate::notify::send(cfg, "Malware blocked", &format!("{} ({}) was blocked and blacklisted: {reason}", e.id, e.repo));
        return Err(format!("DITOLAK (Hard Gate Malware/AV): {reason}"));
    }

    // Privileged install (helper re-validates everything independently, provisions sandbox tools, & does healthcheck)
    log(&format!("[5/5] Memasang service systemd, sandbox tool ({:?}), & jail /var/lib/mastermind/{}...", b.permissions.tools, e.id));
    match ipc::call(&cfg.helper_socket, &format!("install {}", e.id)) {
        Ok(h) => {
            let mut g = st.lock().unwrap();
            let mut all_warnings = soft_warnings;
            all_warnings.extend(verdict.warnings);
            let prev_version = prev_installed.as_ref().map(|p| p.version.clone());
            let mut folder_paths = b.permissions.paths_rw.clone();
            folder_paths.extend(b.permissions.paths_ro.clone());

            // Preserve custom configurations if the app was previously configured by the user
            let final_port = prev_installed.as_ref().map(|p| p.port).unwrap_or(b.run.port);
            let final_mem = prev_installed.as_ref().map(|p| p.memory_max_mb).unwrap_or(b.limits.memory_max_mb);
            let final_cpu = prev_installed.as_ref().map(|p| p.cpu_quota_pct).unwrap_or(b.limits.cpu_quota_pct);
            let final_prio = prev_installed.as_ref().map(|p| p.priority).unwrap_or(b.run.priority);
            let final_autostart = prev_installed.as_ref().map(|p| p.autostart).unwrap_or(true);
            let final_keep_alive = prev_installed.as_ref().map(|p| p.keep_alive).unwrap_or(false);

            g.state.apps.insert(e.id.clone(), Installed {
                version: e.version.clone(),
                sha256: h,
                installed_at: store::now(),
                priority: final_prio,
                repo: e.repo.clone(),
                verified,
                port: final_port,
                memory_max_mb: final_mem,
                cpu_quota_pct: final_cpu,
                autostart: final_autostart,
                envs: prev_installed.as_ref().map(|p| p.envs.clone()).unwrap_or_default(),
                extra_args: prev_installed.as_ref().map(|p| p.extra_args.clone()).unwrap_or_default(),
                is_external: false,
                prev_version,
                warnings: all_warnings.clone(),
                language: b.app.language.clone(),
                sandbox_tools: b.permissions.tools.clone(),
                folder_paths,
                internal_port,
                keep_alive: final_keep_alive,
            });
            g.log("admin", &format!("installed {} {}", e.id, e.version));
            g.save().ok();
            Ok(if all_warnings.is_empty() {
                "installed".into()
            } else {
                format!("installed with warnings: {}", all_warnings.join("; "))
            })
        }
        Err(err) => {
            st.lock().unwrap().log("system", &format!("install failed {}: {err}", e.id));
            Err(err)
        }
    }
}

pub fn rollback(cfg: &Config, st: &std::sync::Mutex<Store>, id: &str) -> Result<String, String> {
    ipc::call(&cfg.helper_socket, &format!("rollback {id}"))?;
    let mut g = st.lock().unwrap();
    if let Some(app) = g.state.apps.get_mut(id) {
        if let Some(prev) = app.prev_version.take() {
            app.version = prev;
        }
    }
    g.log("admin", &format!("rolled back {id}"));
    g.save().ok();
    Ok("rolled back".into())
}

pub fn uninstall(cfg: &Config, st: &std::sync::Mutex<Store>, id: &str) -> Result<(), String> {
    ipc::call(&cfg.helper_socket, &format!("remove {id}"))?;
    let mut g = st.lock().unwrap();
    g.state.apps.remove(id);
    g.log("admin", &format!("uninstalled {id}"));
    g.save().ok();
    Ok(())
}
