//! Generates hardened systemd units from a validated `.batasan.toml`.
use crate::batasan::Batasan;

pub fn unit(b: &Batasan, bin_path: &str) -> String {
    let id = &b.app.id;
    let p = b.run.priority as u32;
    let cpu_weight = (1000 - p * 9).max(10); // priority 0 -> 1000, 100 -> 100
    let nice = p / 5; // 0..20
    let oom = (p as i32 * 8) - 200; // -200 (protected) .. +600 (killed first)
    let mut rw = String::new();
    for path in &b.permissions.paths_rw { rw.push_str(&format!("BindPaths=-{path}\n")); }
    let mut ro = String::new();
    for path in &b.permissions.paths_ro { ro.push_str(&format!("BindReadOnlyPaths={path}\n")); }
    let jail = format!("/var/lib/mastermind/{id}");
    let app_dir = std::path::Path::new(bin_path).parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|| jail.clone());
    let sandbox_dir = format!("{app_dir}/sandbox");
    let sandbox_bin = format!("{sandbox_dir}/bin");
    let sandbox_lib = format!("{sandbox_dir}/lib");

    let mut sys = String::new();
    for d in ["/usr/lib", "/lib", "/etc/ssl", "/etc/ssl/certs", "/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", "/usr/share/zoneinfo", "/bin/sh"] {
        sys.push_str(&format!("BindReadOnlyPaths=-{d}\n"));
    }
    if b.permissions.sandbox_tools || !b.permissions.tools.is_empty() {
        sys.push_str(&format!("BindReadOnlyPaths=-{sandbox_dir}\n"));
    }
    for t in &b.permissions.tools {
        sys.push_str(&format!("BindReadOnlyPaths=-/usr/bin/{t}\n"));
    }

    let mut full_args = Vec::new();
    let exec_cmd = match b.app.language.as_str() {
        "static" => {
            let mm_bin = std::env::current_exe()
                .ok()
                .map(|p| p.to_string_lossy().to_string())
                .filter(|p| p.starts_with("/usr/"))
                .unwrap_or_else(|| "/usr/local/bin/mastermind".into());
            format!("{mm_bin} serve-static {app_dir} {}", b.run.port)
        }
        "node" => {
            let entry = b.run.entry.as_deref().unwrap_or("index.js");
            let mut cmd = format!("/usr/bin/env node {app_dir}/{entry}");
            for a in &b.run.args {
                cmd.push(' ');
                cmd.push_str(a);
            }
            cmd
        }
        "python" => {
            let entry = b.run.entry.as_deref().unwrap_or("app.py");
            let mut cmd = format!("/usr/bin/env python3 {app_dir}/{entry}");
            for a in &b.run.args {
                cmd.push(' ');
                cmd.push_str(a);
            }
            cmd
        }
        _ => {
            if !b.run.args.iter().any(|a| a.starts_with("-port") || a.starts_with("--port")) {
                full_args.push(format!("-port {}", b.run.port));
            }
            for a in &b.run.args {
                full_args.push(a.clone());
            }
            if full_args.is_empty() {
                bin_path.to_string()
            } else {
                format!("{bin_path} {}", full_args.join(" "))
            }
        }
    };

    let net = if b.permissions.outbound.is_empty() { "IPAddressDeny=any\nIPAddressAllow=localhost\nIPAddressAllow=link-local\nIPAddressAllow=10.0.0.0/8\nIPAddressAllow=172.16.0.0/12\nIPAddressAllow=192.168.0.0/16\nIPAddressAllow=100.64.0.0/10\n" } else { "" };
    format!(
"[Unit]
Description=Mastermind app: {id} ({repo})
After=network.target

[Service]
ExecStart={exec_cmd}
Environment=PORT={port}
Environment=PATH={sandbox_bin}:/usr/local/bin:/usr/bin:/bin
Environment=LD_LIBRARY_PATH={sandbox_lib}
Environment=HOME=/var/lib/mastermind/{id}
Environment=XDG_CACHE_HOME=/var/lib/mastermind/{id}/.cache
DynamicUser=yes
StateDirectory=mastermind/{id}
WorkingDirectory={app_dir}
Restart=always
RestartSec=3
StartLimitIntervalSec=60s
StartLimitBurst=5
MemoryMax={mem}M
MemoryHigh={memhigh}M
CPUQuota={cpu}%
CPUWeight={cpu_weight}
TasksMax={tasks}
Nice={nice}
OOMScoreAdjust={oom}
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
BindPaths={jail}
ProtectProc=invisible
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
LockPersonality=yes
RestrictSUIDSGID=yes
RestrictRealtime=yes
RestrictNamespaces=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
UMask=0022
{sys}{rw}{ro}{net}
[Install]
WantedBy=multi-user.target
",
        repo = b.app.repo,
        port = b.run.port,
        mem = b.limits.memory_max_mb,
        memhigh = b.limits.memory_max_mb * 9 / 10,
        cpu = b.limits.cpu_quota_pct,
        tasks = b.limits.tasks_max,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unit_is_hardened() {
        let b = Batasan::parse("[app]\nid=\"x\"\nrepo=\"o/x\"\nasset=\"x\"\nlanguage=\"go\"\n[run]\nport=9000\npriority=50\n").unwrap();
        let u = unit(&b, "/opt/mastermind/apps/x/bin/x");
        for needle in ["NoNewPrivileges=yes", "DynamicUser=yes", "MemoryMax=64M", "IPAddressDeny=any", "OOMScoreAdjust=200", "ProtectSystem=strict", "BindPaths=/var/lib/mastermind/x", "ProtectProc=invisible", "Nice=10"] {
            assert!(u.contains(needle), "missing {needle}");
        }
    }

    #[test]
    fn external_rw_is_bound_only_when_declared() {
        let b = Batasan::parse("[app]\nid=\"x\"\nrepo=\"o/x\"\nasset=\"x\"\nlanguage=\"go\"\n[run]\nport=9000\npriority=50\n[permissions]\npaths_rw=[\"/mnt/hdd1/x\"]\n").unwrap();
        let u = unit(&b, "/opt/mastermind/apps/x/bin/x");
        assert!(u.contains("BindPaths=-/mnt/hdd1/x"));
        assert!(!u.contains("hdd2"));
    }
}
