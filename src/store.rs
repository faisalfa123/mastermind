//! Persistent state (JSON, atomic writes) + persisted hash-chained audit log.
use crate::audit::{Entry, Log};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum TwoFactor {
    #[serde(rename = "totp")]
    Totp { secret_b32: String },
    #[serde(rename = "question")]
    Question { question: String, answer_hash: String },
}

impl Default for TwoFactor {
    fn default() -> Self {
        TwoFactor::Totp { secret_b32: String::new() }
    }
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct Admin {
    pub user: String,
    pub pw_hash: String,
    #[serde(default)]
    pub totp_b32: String,
    #[serde(default)]
    pub two_factor: Option<TwoFactor>,
}

impl Admin {
    pub fn get_two_factor(&self) -> TwoFactor {
        if let Some(tf) = &self.two_factor {
            tf.clone()
        } else {
            TwoFactor::Totp { secret_b32: self.totp_b32.clone() }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Installed {
    pub version: String,
    pub sha256: String,
    pub installed_at: u64,
    #[serde(default = "d_prio")]
    pub priority: u8,
    #[serde(default)]
    pub repo: String,
}

fn d_prio() -> u8 { 50 }

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct State {
    pub admin: Option<Admin>,
    #[serde(default)]
    pub apps: BTreeMap<String, Installed>,
    #[serde(default)]
    pub lockdown: bool,
    #[serde(default)]
    pub sites: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Banned {
    pub id: String,
    pub repo: String,
    pub sha256: String,
    pub reason: String,
    pub ts: u64,
}

pub fn now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn write_atomic(path: &Path, data: &[u8], mode: u32) -> std::io::Result<()> {
    use std::os::unix::fs::OpenOptionsExt;
    let tmp = path.with_extension("tmp");
    let mut f = fs::OpenOptions::new().write(true).create(true).truncate(true).mode(mode).open(&tmp)?;
    f.write_all(data)?;
    f.sync_all()?;
    fs::rename(tmp, path)
}

pub struct Store {
    pub dir: PathBuf,
    pub state: State,
    pub audit: Log,
}

impl Store {
    pub fn open(dir: &str) -> std::io::Result<Store> {
        let dir = PathBuf::from(dir);
        fs::create_dir_all(&dir)?;
        let state = fs::read_to_string(dir.join("state.json")).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
        let mut audit = Log::default();
        if let Ok(s) = fs::read_to_string(dir.join("audit.jsonl")) {
            for l in s.lines() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(l) {
                    audit.entries.push(Entry {
                        ts: v["ts"].as_u64().unwrap_or(0),
                        actor: v["actor"].as_str().unwrap_or("").into(),
                        action: v["action"].as_str().unwrap_or("").into(),
                        prev: v["prev"].as_str().unwrap_or("").into(),
                        hash: v["hash"].as_str().unwrap_or("").into(),
                    });
                }
            }
        }
        Ok(Store { dir, state, audit })
    }

    pub fn save(&self) -> std::io::Result<()> {
        write_atomic(&self.dir.join("state.json"), &serde_json::to_vec_pretty(&self.state)?, 0o600)
    }

    pub fn log(&mut self, actor: &str, action: &str) {
        self.audit.append(now(), actor, action);
        let e = self.audit.entries.last().unwrap();
        let line = serde_json::json!({"ts":e.ts,"actor":e.actor,"action":e.action,"prev":e.prev,"hash":e.hash});
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(self.dir.join("audit.jsonl")) {
            let _ = writeln!(f, "{line}");
        }
    }
}

pub fn read_blacklist(locked_dir: &str) -> Vec<Banned> {
    fs::read_to_string(Path::new(locked_dir).join("blacklist.json")).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

/// Only the root helper / root CLI call this; file perms (root 0644 in a root 0755 dir) enforce it.
pub fn write_blacklist(locked_dir: &str, list: &[Banned]) -> std::io::Result<()> {
    fs::create_dir_all(locked_dir)?;
    write_atomic(&Path::new(locked_dir).join("blacklist.json"), &serde_json::to_vec_pretty(list)?, 0o644)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn audit_persists_and_verifies() {
        let d = std::env::temp_dir().join(format!("mm-test-{}", crate::auth::random_token()));
        let d = d.to_str().unwrap();
        let mut s = Store::open(d).unwrap();
        s.log("admin", "login");
        s.log("admin", "install x");
        let s2 = Store::open(d).unwrap();
        assert_eq!(s2.audit.entries.len(), 2);
        assert!(s2.audit.verify());
        let _ = fs::remove_dir_all(d);
    }
    #[test]
    fn blacklist_roundtrip() {
        let d = std::env::temp_dir().join(format!("mm-bl-{}", crate::auth::random_token()));
        let d = d.to_str().unwrap();
        write_blacklist(d, &[Banned { id: "x".into(), repo: "o/x".into(), sha256: "ab".into(), reason: "miner".into(), ts: 1 }]).unwrap();
        assert_eq!(read_blacklist(d).len(), 1);
        let _ = fs::remove_dir_all(d);
    }
}

#[cfg(test)]
mod e2e_seed {
    /// Not a real test: `MM_E2E_DIR=... cargo test seed_e2e -- --ignored` creates a known admin for manual E2E runs.
    #[test]
    #[ignore]
    fn seed_e2e() {
        let dir = std::env::var("MM_E2E_DIR").expect("MM_E2E_DIR");
        let mut s = super::Store::open(&dir).unwrap();
        s.state.admin = Some(super::Admin { user: "admin".into(), pw_hash: crate::auth::hash_password("correct horse battery"), totp_b32: crate::auth::base32_encode(b"12345678901234567890"), two_factor: Some(super::TwoFactor::Totp { secret_b32: crate::auth::base32_encode(b"12345678901234567890") }) });
        s.save().unwrap();
    }
}
