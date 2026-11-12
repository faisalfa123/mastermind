//! Privileged helper: listens on a unix socket and executes ONLY the closed command set in `ipc`.
//! It never runs shell strings; every systemctl argument is a fixed literal or a validated app id.
use crate::batasan::Batasan;
use crate::config::Config;
use crate::ipc::Command;
use crate::scanner;
use crate::store::{self, Banned};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::os::unix::net::UnixListener;
use std::path::{Path, PathBuf};

fn sha(b: &[u8]) -> String { hex::encode(Sha256::digest(b)) }

/// Reads a regular file without following symlinks (staging dir is writable by the unprivileged web user).
fn read_nofollow(path: &Path, max: u64) -> Result<Vec<u8>, String> {
    let f = fs::OpenOptions::new().read(true).custom_flags(libc::O_NOFOLLOW).open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    if !f.metadata().map_err(|e| e.to_string())?.is_file() { return Err("not a regular file".into()); }
    let mut v = Vec::new();
    f.take(max + 1).read_to_end(&mut v).map_err(|e| e.to_string())?;
    if v.len() as u64 > max { return Err("file too large".into()); }
    Ok(v)
}

fn systemctl(cfg: &Config, args: &[&str]) -> Result<String, String> {
    if cfg.dry_run { return Ok("dry-run".into()); }
    let o = std::process::Command::new("systemctl").args(args).output().map_err(|e| e.to_string())?;
    let out = String::from_utf8_lossy(&o.stdout).trim().to_string();
    if o.status.success() { Ok(out) } else { Err(format!("systemctl {}: {}", args.join(" "), String::from_utf8_lossy(&o.stderr).trim())) }
}

fn unit_name(id: &str) -> String { format!("mastermind-{id}.service") }
fn bin_dir(cfg: &Config, id: &str) -> PathBuf { Path::new(&cfg.apps_dir).join(id) }
fn bin_path(cfg: &Config, id: &str) -> PathBuf { bin_dir(cfg, id).join("bin") }

pub fn handle(cfg: &Config, cmd: Command) -> Result<String, String> {
    match cmd {
        Command::Install(id) => install(cfg, &id),
        Command::Remove(id) => remove(cfg, &id),
        Command::Start(id) => systemctl(cfg, &["start", &unit_name(&id)]).map(|_| String::new()),
        Command::Stop(id) => systemctl(cfg, &["stop", &unit_name(&id)]).map(|_| String::new()),
        Command::Restart(id) => systemctl(cfg, &["restart", &unit_name(&id)]).map(|_| String::new()),
        Command::Status(id) => {
            if cfg.dry_run { return Ok("dry-run".into()); }
            let o = std::process::Command::new("systemctl").args(["is-active", &unit_name(&id)]).output().map_err(|e| e.to_string())?;
            Ok(String::from_utf8_lossy(&o.stdout).trim().to_string())
        }
        Command::Verify(id) => Ok(sha(&read_nofollow(&bin_path(cfg, &id), 96 << 20)?)),
        Command::Quarantine(id) => quarantine(cfg, &id),
    }
}

fn staging(cfg: &Config, id: &str) -> PathBuf { Path::new(&cfg.data_dir).join("staging").join(id) }

fn install(cfg: &Config, id: &str) -> Result<String, String> {
    let st = staging(cfg, id);
    let bin = read_nofollow(&st.join("bin"), 96 << 20)?;
    let toml = String::from_utf8(read_nofollow(&st.join("batasan.toml"), 64 << 10)?).map_err(|_| "toml not utf-8")?;
    let b = Batasan::parse(&toml).map_err(|e| e.to_string())?;
    if b.app.id != id { return Err("id mismatch".into()); }
    let digest = sha(&bin);
    // Independent re-checks: the helper trusts nothing the web process staged.
    if store::read_blacklist(&cfg.locked_dir).iter().any(|x| x.id == id || x.sha256 == digest) { return Err("blacklisted".into()); }
    let v = scanner::scan(&bin);
    if v.blocked { return Err(format!("scanner: {}", v.reasons.join("; "))); }

    let dir = bin_dir(cfg, id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::set_permissions(&dir, fs::Permissions::from_mode(0o755)).ok();
    let target = bin_path(cfg, id);
    let prev = dir.join("bin.prev");
    let had_prev = target.exists();
    if had_prev { fs::rename(&target, &prev).map_err(|e| e.to_string())?; }
    store::write_atomic(&target, &bin, 0o755).map_err(|e| e.to_string())?;
    let unit_path = Path::new(&cfg.units_dir).join(unit_name(id));
    store::write_atomic(&unit_path, crate::systemd::unit(&b, &target.to_string_lossy()).as_bytes(), 0o644).map_err(|e| e.to_string())?;
    systemctl(cfg, &["daemon-reload"])?;
    systemctl(cfg, &["enable", &unit_name(id)])?;
    systemctl(cfg, &["restart", &unit_name(id)])?;
    if !cfg.dry_run {
        std::thread::sleep(std::time::Duration::from_secs(3));
        let active = systemctl(cfg, &["is-active", &unit_name(id)]).is_ok();
        if !active {
            if had_prev {
                let _ = fs::rename(&prev, &target);
                let _ = systemctl(cfg, &["restart", &unit_name(id)]);
                return Err("new version failed health check, rolled back".into());
            }
            return Err("service failed to start".into());
        }
    }
    let _ = fs::remove_dir_all(&st);
    Ok(digest)
}

fn remove(cfg: &Config, id: &str) -> Result<String, String> {
    let _ = systemctl(cfg, &["stop", &unit_name(id)]);
    let _ = systemctl(cfg, &["disable", &unit_name(id)]);
    let _ = fs::remove_file(Path::new(&cfg.units_dir).join(unit_name(id)));
    let _ = fs::remove_dir_all(bin_dir(cfg, id));
    let _ = systemctl(cfg, &["daemon-reload"]);
    Ok(String::new())
}

/// Uninstalls the app and adds it to the root-only blacklist (hash + id). Staged files are discarded.
fn quarantine(cfg: &Config, id: &str) -> Result<String, String> {
    let st = staging(cfg, id);
    let bin = read_nofollow(&st.join("bin"), 96 << 20).or_else(|_| read_nofollow(&bin_path(cfg, id), 96 << 20))?;
    let reason = read_nofollow(&st.join("reason.txt"), 512).ok().map(|v| String::from_utf8_lossy(&v).chars().take(200).collect::<String>()).unwrap_or_else(|| "flagged".into());
    let repo = read_nofollow(&st.join("batasan.toml"), 64 << 10).ok().and_then(|v| String::from_utf8(v).ok())
        .and_then(|t| toml::from_str::<toml::Value>(&t).ok()).and_then(|v| v["app"]["repo"].as_str().map(String::from)).unwrap_or_else(|| "unknown".into());
    let mut list = store::read_blacklist(&cfg.locked_dir);
    list.retain(|b| b.id != id);
    list.push(Banned { id: id.into(), repo, sha256: sha(&bin), reason, ts: store::now() });
    store::write_blacklist(&cfg.locked_dir, &list).map_err(|e| e.to_string())?;
    remove(cfg, id)?;
    let _ = fs::remove_dir_all(&st);
    Ok("quarantined".into())
}

pub fn serve(cfg: &Config) -> Result<(), String> {
    let _ = fs::remove_file(&cfg.helper_socket);
    let l = UnixListener::bind(&cfg.helper_socket).map_err(|e| format!("bind {}: {e}", cfg.helper_socket))?;
    fs::set_permissions(&cfg.helper_socket, fs::Permissions::from_mode(0o660)).ok();
    eprintln!("mastermind helper listening on {}", cfg.helper_socket);
    for conn in l.incoming().flatten() {
        let mut line = String::new();
        let mut r = BufReader::new(&conn).take(256);
        if r.read_line(&mut line).is_err() { continue; }
        let reply = match Command::parse(line.trim_end_matches('\n')) {
            Ok(c) => match handle(cfg, c) { Ok(o) => format!("ok {o}"), Err(e) => format!("err {e}") },
            Err(e) => format!("err {e}"),
        };
        let _ = (&conn).write_all(format!("{}\n", reply.replace('\n', " ")).as_bytes());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn elf(extra: &[u8]) -> Vec<u8> {
        let mut b = vec![0u8; 64];
        b[..4].copy_from_slice(b"\x7fELF");
        b[4] = 2; b[5] = 1; b[16] = 2;
        b[18..20].copy_from_slice(&183u16.to_le_bytes());
        b.extend_from_slice(extra);
        b
    }

    fn setup(tag: &str) -> Config {
        let root = std::env::temp_dir().join(format!("mm-h-{tag}-{}", crate::auth::random_token()));
        let r = root.to_str().unwrap();
        for d in ["data", "locked", "apps", "units"] { fs::create_dir_all(root.join(d)).unwrap(); }
        toml::from_str(&format!("data_dir=\"{r}/data\"\nlocked_dir=\"{r}/locked\"\napps_dir=\"{r}/apps\"\nunits_dir=\"{r}/units\"\ndry_run=true\n")).unwrap()
    }

    fn stage(cfg: &Config, id: &str, bin: &[u8]) {
        let d = staging(cfg, id);
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join("bin"), bin).unwrap();
        fs::write(d.join("batasan.toml"), format!("[app]\nid=\"{id}\"\nrepo=\"faisalfa123/{id}\"\nasset=\"{id}\"\nlanguage=\"go\"\n[run]\nport=9000\npriority=40\n")).unwrap();
    }

    #[test]
    fn installs_clean_app_with_hardened_unit() {
        let cfg = setup("ok");
        stage(&cfg, "good", &elf(b"hello"));
        let hash = handle(&cfg, Command::Install("good".into())).unwrap();
        assert_eq!(hash, sha(&elf(b"hello")));
        assert!(bin_path(&cfg, "good").exists());
        let unit = fs::read_to_string(Path::new(&cfg.units_dir).join("mastermind-good.service")).unwrap();
        assert!(unit.contains("NoNewPrivileges=yes") && unit.contains("DynamicUser=yes"));
        assert_eq!(handle(&cfg, Command::Verify("good".into())).unwrap(), hash);
        handle(&cfg, Command::Remove("good".into())).unwrap();
        assert!(!bin_path(&cfg, "good").exists());
    }

    #[test]
    fn helper_rejects_malware_even_if_web_skipped_scan() {
        let cfg = setup("mal");
        stage(&cfg, "evil", &elf(b"connect stratum+tcp://pool"));
        let e = handle(&cfg, Command::Install("evil".into())).unwrap_err();
        assert!(e.contains("scanner"), "{e}");
        assert!(!bin_path(&cfg, "evil").exists());
    }

    #[test]
    fn quarantine_blacklists_and_blocks_reinstall() {
        let cfg = setup("q");
        let bad = elf(b"xmrig");
        stage(&cfg, "evil", &bad);
        fs::write(staging(&cfg, "evil").join("reason.txt"), "miner").unwrap();
        handle(&cfg, Command::Quarantine("evil".into())).unwrap();
        let bl = store::read_blacklist(&cfg.locked_dir);
        assert_eq!(bl.len(), 1);
        assert_eq!(bl[0].sha256, sha(&bad));
        assert_eq!(bl[0].reason, "miner");
        // A renamed copy of the same binary is still refused by hash.
        stage(&cfg, "renamed", &bad);
        assert!(handle(&cfg, Command::Install("renamed".into())).is_err());
    }

    #[test]
    fn symlinked_staging_file_is_refused() {
        let cfg = setup("sym");
        stage(&cfg, "link", &elf(b"x"));
        let b = staging(&cfg, "link").join("bin");
        fs::remove_file(&b).unwrap();
        std::os::unix::fs::symlink("/etc/hostname", &b).unwrap();
        assert!(handle(&cfg, Command::Install("link".into())).is_err());
    }
}
