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

pub fn install_with_logger<F: Fn(&str)>(cfg: &Config, st: &std::sync::Mutex<Store>, e: &Entry, log: &F) -> Result<String, String> {
    log(&format!("[-] Memeriksa status blacklist untuk {}...", e.id));
    let bl = store::read_blacklist(&cfg.locked_dir);
    if bl.iter().any(|b| b.id == e.id || b.repo.eq_ignore_ascii_case(&e.repo)) { return Err("app is blacklisted (unlock via SSH)".into()); }
    let b = e.batasan.as_ref().ok_or("catalog entry has no parsed rules")?;
    if b.run.port > 0 && crate::web::port_in_use(b.run.port) {
        return Err(format!("Port {} sudah digunakan oleh service lain di server ini. Harap hentikan service yang menggunakan port tersebut atau sesuaikan port di .batasan.toml", b.run.port));
    }
    log(&format!("[1/5] Mengunduh binary {} dari {}...", e.id, e.asset_url));
    let bin = download(&e.asset_url, 96 << 20)?;
    log(&format!("[+] Download selesai ({} bytes)", bin.len()));
    let digest = hex::encode(Sha256::digest(&bin));
    if bl.iter().any(|x| x.sha256 == digest) { return Err("binary hash is blacklisted".into()); }

    log("[2/5] Memverifikasi SHA256 integrity...");
    // 1. integrity: published checksum or pin if available; otherwise install as unverified (with yellow warning)
    let mut verified = true;
    match (&e.checksum_url, &e.pin) {
        (Some(curl), _) => {
            if let Ok(text) = discover::fetch_text(curl) {
                if let Some(expected) = discover::parse_checksum(&text, &b.app.asset) {
                    if expected != digest {
                        st.lock().unwrap().log("system", &format!("CHECKSUM MISMATCH {} {}", e.id, e.version));
                        crate::notify::send(cfg, "Checksum mismatch", &format!("{} {}: downloaded binary does not match published checksum", e.id, e.version));
                        return Err("checksum mismatch".into());
                    }
                    log(&format!("[+] Checksum resmi valid (sha256: {})", &digest[..16]));
                } else {
                    verified = false;
                    log(&format!("[!] Peringatan: aset {} tidak terdaftar di checksums.txt (lanjut tanpa verifikasi SHA256, hash: {})", b.app.asset, &digest[..16]));
                }
            } else {
                verified = false;
                log(&format!("[!] Peringatan: gagal mengambil checksums.txt (lanjut tanpa verifikasi SHA256, hash: {})", &digest[..16]));
            }
        }
        (None, Some(pin)) if !pin.is_empty() => {
            if *pin != digest {
                st.lock().unwrap().log("system", &format!("PIN MISMATCH {} {}", e.id, e.version));
                return Err("SHA256 pin mismatch".into());
            }
            log(&format!("[+] SHA256 pin admin cocok (sha256: {})", &digest[..16]));
        }
        _ => {
            verified = false;
            log(&format!("[!] PERINGATAN KUNING: Tidak ada verifikasi SHA256 / checksums.txt (hash: {}). Melanjutkan instalasi dengan tanda peringatan.", &digest[..16]));
        }
    }

    // 2. static scan (+ optional VirusTotal)
    log("[3/5] Memindai biner terhadap ancaman malware / skrip berbahaya...");
    let mut verdict = scanner::scan(&bin);
    if let Some(k) = &cfg.virustotal_key {
        match scanner::virustotal(&digest, k) {
            Ok(Some(n)) if n >= 3 => { verdict.blocked = true; verdict.reasons.push(format!("VirusTotal: {n} engines flag this file")); }
            Ok(_) => {}
            Err(err) => verdict.warnings.push(format!("VirusTotal unavailable: {err}")),
        }
    }
    log("[4/5] Menyiapkan isolasi folder & file staging...");
    let dir = Path::new(&cfg.data_dir).join("staging").join(&e.id);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    store::write_atomic(&dir.join("bin"), &bin, 0o600).map_err(|e| e.to_string())?;
    store::write_atomic(&dir.join("batasan.toml"), e.batasan_toml.as_bytes(), 0o600).map_err(|e| e.to_string())?;
    if verdict.blocked {
        let reason = verdict.reasons.join("; ");
        store::write_atomic(&dir.join("reason.txt"), reason.as_bytes(), 0o600).ok();
        let _ = ipc::call(&cfg.helper_socket, &format!("quarantine {}", e.id));
        st.lock().unwrap().state.apps.remove(&e.id);
        let mut g = st.lock().unwrap();
        g.log("system", &format!("MALWARE blocked+blacklisted {} ({reason})", e.id));
        g.save().ok();
        crate::notify::send(cfg, "Malware blocked", &format!("{} ({}) was blocked and blacklisted: {reason}", e.id, e.repo));
        return Err(format!("blocked and blacklisted: {reason}"));
    }

    // 3. privileged install (helper re-validates everything independently)
    log(&format!("[5/5] Memasang service systemd & mengunci jail /var/lib/mastermind/{}...", e.id));
    match ipc::call(&cfg.helper_socket, &format!("install {}", e.id)) {
        Ok(h) => {
            let mut g = st.lock().unwrap();
            if !verified {
                verdict.warnings.push("tidak memiliki verifikasi SHA256 (unverified)".into());
            }
            g.state.apps.insert(e.id.clone(), Installed {
                version: e.version.clone(),
                sha256: h,
                installed_at: store::now(),
                priority: b.run.priority,
                repo: e.repo.clone(),
                verified,
                port: b.run.port,
                memory_max_mb: b.limits.memory_max_mb,
                cpu_quota_pct: b.limits.cpu_quota_pct,
                autostart: true,
                envs: vec![],
                extra_args: vec![],
                is_external: false,
            });
            g.log("admin", &format!("installed {} {}", e.id, e.version));
            g.save().ok();
            Ok(if verdict.warnings.is_empty() { "installed".into() } else { format!("installed with warnings: {}", verdict.warnings.join("; ")) })
        }
        Err(err) => { st.lock().unwrap().log("system", &format!("install failed {}: {err}", e.id)); Err(err) }
    }
}

pub fn uninstall(cfg: &Config, st: &std::sync::Mutex<Store>, id: &str) -> Result<(), String> {
    ipc::call(&cfg.helper_socket, &format!("remove {id}"))?;
    let mut g = st.lock().unwrap();
    g.state.apps.remove(id);
    g.log("admin", &format!("uninstalled {id}"));
    g.save().ok();
    Ok(())
}
