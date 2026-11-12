//! Runtime configuration (/etc/mastermind/config.toml, override with MASTERMIND_CONFIG).
use serde::Deserialize;
use std::net::IpAddr;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    #[serde(default = "d_bind")]
    pub bind: String,
    #[serde(default = "d_port")]
    pub port: u16,
    #[serde(default = "d_data")]
    pub data_dir: String,
    /// Root-owned, read-only for the web user: holds the blacklist.
    #[serde(default = "d_locked")]
    pub locked_dir: String,
    #[serde(default = "d_sock")]
    pub helper_socket: String,
    #[serde(default = "d_apps")]
    pub apps_dir: String,
    #[serde(default = "d_units")]
    pub units_dir: String,
    pub cert: Option<String>,
    pub key: Option<String>,
    #[serde(default = "d_owner")]
    pub github_owner: String,
    pub github_token: Option<String>,
    #[serde(default)]
    pub extra_repos: Vec<String>,
    pub virustotal_key: Option<String>,
    #[serde(default = "d_mem")]
    pub min_free_mem_mb: u64,
    pub ntfy: Option<Ntfy>,
    pub telegram: Option<Telegram>,
    pub smtp: Option<Smtp>,
    pub resend: Option<Resend>,
    #[serde(default)]
    pub dry_run: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Ntfy { pub url: String, pub topic: String, pub token: Option<String> }
#[derive(Debug, Deserialize, Clone)]
pub struct Telegram { pub bot_token: String, pub chat_id: String }
#[derive(Debug, Deserialize, Clone)]
pub struct Resend { pub api_key: String, pub to: String }
#[derive(Debug, Deserialize, Clone)]
pub struct Smtp { pub host: String, pub port: u16, pub user: String, pub password: String, pub from: String, pub to: String }

fn d_bind() -> String { "127.0.0.1".into() }
fn d_port() -> u16 { 8443 }
fn d_data() -> String { "/var/lib/mastermind".into() }
fn d_locked() -> String { "/var/lib/mastermind-locked".into() }
fn d_sock() -> String { "/run/mastermind/helper.sock".into() }
fn d_apps() -> String { "/opt/mastermind/apps".into() }
fn d_units() -> String { "/etc/systemd/system".into() }
fn d_owner() -> String { "faisalfa123".into() }
fn d_mem() -> u64 { 40 }

impl Config {
    pub fn load() -> Result<Config, String> {
        let path = std::env::var("MASTERMIND_CONFIG").unwrap_or_else(|_| "/etc/mastermind/config.toml".into());
        let s = std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))?;
        let c: Config = toml::from_str(&s).map_err(|e| format!("{path}: {e}"))?;
        c.validate()?;
        Ok(c)
    }

    pub fn validate(&self) -> Result<(), String> {
        bind_allowed(&self.bind)
    }
}

/// Only loopback, RFC1918 LAN, link-local, and Tailscale (100.64.0.0/10, fd7a:115c:a1e0::/48) may be bound.
pub fn bind_allowed(bind: &str) -> Result<(), String> {
    let ip: IpAddr = bind.parse().map_err(|_| format!("bind is not an IP: {bind}"))?;
    let ok = match ip {
        IpAddr::V4(v) => {
            let o = v.octets();
            v.is_loopback() || v.is_private() || v.is_link_local() || (o[0] == 100 && (64..128).contains(&o[1]))
        }
        IpAddr::V6(v) => {
            let s = v.segments();
            v.is_loopback() || (s[0] & 0xfe00) == 0xfc00 || (s[0] & 0xffc0) == 0xfe80
        }
    };
    if ok { Ok(()) } else { Err(format!("refusing to bind public/unspecified address {bind}")) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bind_rules() {
        for ok in ["127.0.0.1", "192.168.1.5", "10.0.0.2", "100.101.102.103", "::1", "fd7a:115c:a1e0::1"] {
            assert!(bind_allowed(ok).is_ok(), "{ok}");
        }
        for bad in ["0.0.0.0", "8.8.8.8", "100.128.0.1", "::", "example.com"] {
            assert!(bind_allowed(bad).is_err(), "{bad}");
        }
    }
}
