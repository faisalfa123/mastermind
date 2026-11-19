//! Parser & validator for `<id>.batasan.toml` (per-app rules and limits).
#![allow(dead_code)] // fields consumed by later phases (service backend)
use serde::Deserialize;
use std::fmt;

#[derive(Debug, Deserialize, Clone)]
pub struct Batasan {
    pub app: App,
    pub run: Run,
    #[serde(default)]
    pub limits: Limits,
    #[serde(default)]
    pub permissions: Permissions,
}

#[derive(Debug, Deserialize, Clone)]
pub struct App {
    pub id: String,
    pub repo: String,
    pub asset: String,
    pub language: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Run {
    pub port: u16,
    #[serde(default)]
    pub args: Vec<String>,
    /// 0 = critical ... 100 = lowest (stopped first under memory pressure).
    pub priority: u8,
    /// Optional internal port if the app hardcodes a port and needs transparent forwarding.
    #[serde(default)]
    pub internal_port: Option<u16>,
    /// Optional entrypoint file for node/python/static webapps (relative to app dir).
    #[serde(default)]
    pub entry: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Limits {
    pub memory_max_mb: u32,
    pub cpu_quota_pct: u8,
    pub tasks_max: u32,
}

impl Default for Limits {
    fn default() -> Self {
        Self { memory_max_mb: 64, cpu_quota_pct: 30, tasks_max: 64 }
    }
}

#[derive(Debug, Default, Deserialize, Clone)]
pub struct Permissions {
    #[serde(default)]
    pub paths_rw: Vec<String>,
    #[serde(default)]
    pub paths_ro: Vec<String>,
    #[serde(default)]
    pub outbound: Vec<String>,
    /// Whitelisted helper binaries (e.g. yt-dlp, ffmpeg); copied/downloaded into app sandbox.
    #[serde(default)]
    pub tools: Vec<String>,
    /// Isolate requested tools/libraries inside the app's own sandbox directory.
    #[serde(default = "d_sandbox_true")]
    pub sandbox_tools: bool,
}

fn d_sandbox_true() -> bool { true }

#[derive(Debug)]
pub struct Error(pub String);
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { f.write_str(&self.0) }
}

const LANGS: [&str; 8] = ["go", "rust", "c", "zig", "nim", "node", "python", "static"];
const MAX_MEM_MB: u32 = 512;
pub const TOOLS: [&str; 11] = [
    "yt-dlp", "ffmpeg", "ffprobe", "git", "curl", "python3", "node", "npm", "sqlite3", "convert", "magick",
];
const ALLOWED_EXTERNAL_ROOTS: [&str; 3] = ["/mnt", "/media", "/srv"];
const FORBIDDEN: [&str; 8] = ["/", "/etc", "/root", "/home", "/boot", "/proc", "/sys", "/dev"];
const FORBIDDEN_TREES: [&str; 8] = ["/usr", "/bin", "/sbin", "/lib", "/opt/mastermind", "/var/lib/mastermind", "/run", "/var/run"];

pub fn is_allowed_path(p: &str, jail: &str) -> bool {
    if p == jail || p.starts_with(&format!("{jail}/")) {
        return true;
    }
    let under = |f: &str| p == f || p.starts_with(&format!("{f}/"));
    if FORBIDDEN.iter().any(|f| *f == p || (*f != "/" && under(f))) || FORBIDDEN_TREES.iter().any(|f| under(f)) {
        return false;
    }
    ALLOWED_EXTERNAL_ROOTS.iter().any(|root| p.starts_with(&format!("{root}/")) && p.len() > root.len() + 1)
}

impl Batasan {
    pub fn parse(s: &str) -> Result<Self, Error> {
        let b: Batasan = toml::from_str(s).map_err(|e| Error(e.to_string()))?;
        b.validate()?;
        Ok(b)
    }

    fn validate(&self) -> Result<(), Error> {
        let id = &self.app.id;
        if id.is_empty() || id.len() > 32
            || !id.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        {
            return Err(Error("app.id must be [a-z0-9-], max 32".into()));
        }
        if !LANGS.contains(&self.app.language.as_str()) {
            return Err(Error(format!("language not allowed: {}", self.app.language)));
        }
        if self.app.repo.split('/').count() != 2 {
            return Err(Error("app.repo must be owner/name".into()));
        }
        if self.app.asset.contains('/') || self.app.asset.contains("..") {
            return Err(Error("app.asset must be a plain file name".into()));
        }
        if self.run.port < 1024 { return Err(Error("run.port must be >= 1024".into())); }
        if let Some(ip) = self.run.internal_port {
            if ip < 1024 { return Err(Error("run.internal_port must be >= 1024".into())); }
        }
        if let Some(ref entry) = self.run.entry {
            if entry.is_empty() || entry.starts_with('/') || entry.contains("..") || entry.len() > 128
                || !entry.bytes().all(|c| c.is_ascii_alphanumeric() || b"/._-".contains(&c))
            {
                return Err(Error(format!("run.entry contains forbidden path or characters: {entry}")));
            }
        }
        if self.run.priority > 100 { return Err(Error("run.priority must be 0..=100".into())); }
        for a in &self.run.args {
            if a.is_empty() || a.len() > 128 || !a.bytes().all(|c| c.is_ascii_alphanumeric() || b"._:=/-".contains(&c)) {
                return Err(Error(format!("run.args contains forbidden characters: {a}")));
            }
        }
        let l = &self.limits;
        if l.memory_max_mb == 0 || l.memory_max_mb > MAX_MEM_MB {
            return Err(Error(format!("limits.memory_max_mb must be 1..={MAX_MEM_MB}")));
        }
        if l.cpu_quota_pct == 0 || l.cpu_quota_pct > 100 {
            return Err(Error("limits.cpu_quota_pct must be 1..=100".into()));
        }
        let jail = format!("/var/lib/mastermind/{id}");
        for p in self.permissions.paths_rw.iter().chain(&self.permissions.paths_ro) {
            if !p.starts_with('/') || p.contains("..") || p.contains("//") || p.len() > 200
                || !p.bytes().all(|c| c.is_ascii_alphanumeric() || b"/._-".contains(&c))
                || !is_allowed_path(p, &jail)
            {
                return Err(Error(format!("forbidden path (only /mnt/*, /media/*, /srv/*, or app jail allowed): {p}")));
            }
        }
        for t in &self.permissions.tools {
            if !TOOLS.contains(&t.as_str()) {
                return Err(Error(format!("tool not whitelisted: {t}")));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const OK: &str = r#"
[app]
id = "senandung"
repo = "faisalfa123/Senandung"
asset = "senandung-linux-arm64"
language = "go"
[run]
port = 8080
priority = 50
[limits]
memory_max_mb = 96
cpu_quota_pct = 50
tasks_max = 64
[permissions]
paths_rw = ["/var/lib/mastermind/senandung"]
paths_ro = ["/srv/music"]
"#;
    #[test] fn valid() { assert!(Batasan::parse(OK).is_ok()); }
    #[test] fn webapp_langs_ok() {
        for lang in ["node", "python", "static"] {
            assert!(Batasan::parse(&OK.replace("\"go\"", &format!("\"{lang}\""))).is_ok(), "{lang}");
        }
    }
    #[test] fn bad_lang() { assert!(Batasan::parse(&OK.replace("\"go\"", "\"ruby\"")).is_err()); }
    #[test] fn bad_path() { assert!(Batasan::parse(&OK.replace("/srv/music", "/etc")).is_err()); }
    #[test] fn disallowed_external_root_rejected() { assert!(Batasan::parse(&OK.replace("/srv/music", "/tmp/data")).is_err()); }
    #[test] fn external_rw_ok() { assert!(Batasan::parse(&OK.replace("/var/lib/mastermind/senandung", "/mnt/hdd1/senandung")).is_ok()); }
    #[test] fn external_rw_sub_ok() { assert!(Batasan::parse(&OK.replace("/var/lib/mastermind/senandung", "/mnt/hdd1/senandung/sub")).is_ok()); }
    #[test] fn forbidden_subtree() { for p in ["/etc/x", "/home/u", "/proc/1"] { assert!(Batasan::parse(&OK.replace("/var/lib/mastermind/senandung", p)).is_err(), "{p}"); } }
    #[test] fn sibling_jail_rejected() { assert!(Batasan::parse(&OK.replace("/var/lib/mastermind/senandung", "/var/lib/mastermind/other")).is_err()); }
    #[test] fn bad_tool() { assert!(Batasan::parse(&format!("{OK}tools = [\"bash\"]\n")).is_err()); }
    #[test] fn bad_mem() { assert!(Batasan::parse(&OK.replace("= 96", "= 9000")).is_err()); }
    #[test] fn low_port() { assert!(Batasan::parse(&OK.replace("8080", "80")).is_err()); }
}
