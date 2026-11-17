//! Read-only scan of existing systemd services so they can be adopted into a jail. Never executes anything.
use serde_json::{json, Value};

pub fn default_app_port(name: &str) -> Option<u16> {
    let lower = name.to_lowercase();
    if lower.contains("immich") { Some(2283) }
    else if lower.contains("nextcloud") { Some(8080) }
    else if lower.contains("jellyfin") || lower.contains("emby") { Some(8096) }
    else if lower.contains("plex") { Some(32400) }
    else if lower.contains("adguard") { Some(3000) }
    else if lower.contains("pihole") { Some(80) }
    else if lower.contains("vaultwarden") || lower.contains("bitwarden") { Some(8000) }
    else if lower.contains("syncthing") { Some(8384) }
    else if lower.contains("transmission") { Some(9091) }
    else if lower.contains("qbittorrent") { Some(8080) }
    else if lower.contains("wireguard") { Some(51820) }
    else if lower.contains("homeassistant") || lower.contains("home-assistant") { Some(8123) }
    else if lower.contains("senandung") { Some(8989) }
    else { None }
}

/// Pure parser (unit-tested): name + ExecStart + port from a unit file's text.
pub fn parse_unit(name: &str, text: &str) -> Option<Value> {
    let exec = text.lines().find_map(|l| l.trim().strip_prefix("ExecStart="))?.trim().to_string();
    let port = text.lines().find_map(|l| {
        let l = l.trim();
        let i = l.find("PORT=").or_else(|| l.find("--port")).or_else(|| l.find("-p "))?;
        let d: String = l[i..].chars().skip_while(|c| !c.is_ascii_digit()).take_while(char::is_ascii_digit).collect();
        d.parse::<u16>().ok()
    }).or_else(|| default_app_port(name));
    Some(json!({"name": name, "exec": exec, "port": port, "source": "sistem"}))
}

const SYSTEM_EXCLUDES: &[&str] = &[
    "systemd", "dbus", "ssh", "sshd", "cron", "getty", "dietpi-", "cloud-init",
    "avahi", "rsyslog", "udev", "wpa_supplicant", "networking", "dhcpcd",
    "fail2ban", "apparmor", "emergency", "rescue", "rc-local", "kmod",
    "ufw", "nftables", "iptables", "bluetooth", "cups", "smartmontools",
    "polkit", "modprobe", "apt", "dpkg", "syslog", "journal", "dropbear"
];

pub fn is_system_service(name: &str) -> bool {
    let lower = name.to_lowercase();
    SYSTEM_EXCLUDES.iter().any(|&ex| lower.contains(ex))
}

pub fn scan() -> Vec<Value> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for dir in &["/etc/systemd/system", "/lib/systemd/system"] {
        if let Ok(rd) = std::fs::read_dir(dir) {
            for e in rd.flatten().take(300) {
                let n = e.file_name().to_string_lossy().to_string();
                if !n.ends_with(".service") || n.starts_with("mastermind") || n.starts_with("app-") { continue; }
                let sname = n.trim_end_matches(".service");
                if is_system_service(sname) || seen.contains(sname) { continue; }
                seen.insert(sname.to_string());
                if let Ok(t) = std::fs::read_to_string(e.path()) {
                    if let Some(v) = parse_unit(sname, &t) { out.push(v); }
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_unit() {
        let v = parse_unit("senandung", "[Service]\nExecStart=/opt/senandung/senandung --port 8081\n").unwrap();
        assert_eq!(v["port"], 8081);
        assert_eq!(v["exec"], "/opt/senandung/senandung --port 8081");
    }
    #[test]
    fn no_exec_is_none() { assert!(parse_unit("x", "[Unit]\n").is_none()); }
}
