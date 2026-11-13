//! Generates hardened systemd units from a validated `.batasan.toml`.
use crate::batasan::Batasan;

pub fn unit(b: &Batasan, bin_path: &str) -> String {
    let id = &b.app.id;
    let p = b.run.priority as u32;
    let cpu_weight = (1000 - p * 9).max(10); // priority 0 -> 1000, 100 -> 100
    let nice = p / 5; // 0..20
    let oom = (p as i32 * 8) - 200; // -200 (protected) .. +600 (killed first)
    let mut rw = String::new();
    for path in &b.permissions.paths_rw { rw.push_str(&format!("BindPaths=-{path}\nRequiresMountsFor={path}\n")); }
    let mut ro = String::new();
    for path in &b.permissions.paths_ro { ro.push_str(&format!("BindReadOnlyPaths={path}\n")); }
    let jail = format!("/var/lib/mastermind/{id}");
    let mut sys = String::new();
    for d in ["/usr/lib", "/lib", "/etc/ssl/certs", "/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf"] {
        sys.push_str(&format!("BindReadOnlyPaths=-{d}\n"));
    }
    if let Some(dir) = std::path::Path::new(bin_path).parent() {
        sys.push_str(&format!("BindReadOnlyPaths={}\n", dir.display()));
    }
    for t in &b.permissions.tools {
        sys.push_str(&format!("BindReadOnlyPaths=-/usr/bin/{t}\n"));
    }
    let args = b.run.args.join(" ");
    let net = if b.permissions.outbound.is_empty() { "IPAddressDeny=any\nIPAddressAllow=localhost\nIPAddressAllow=link-local\nIPAddressAllow=10.0.0.0/8\nIPAddressAllow=172.16.0.0/12\nIPAddressAllow=192.168.0.0/16\nIPAddressAllow=100.64.0.0/10\n" } else { "" };
    format!(
"[Unit]
Description=Mastermind app: {id} ({repo})
After=network.target

[Service]
ExecStart={bin_path} {args}
Environment=PORT={port}
DynamicUser=yes
StateDirectory=mastermind/{id}
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
TemporaryFileSystem=/:ro
BindPaths={jail}
PrivateUsers=yes
ProtectProc=invisible
ProcSubset=pid
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
CapabilityBoundingSet=
AmbientCapabilities=
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @resources
UMask=0077
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
        for needle in ["NoNewPrivileges=yes", "DynamicUser=yes", "CapabilityBoundingSet=\n", "MemoryMax=64M", "IPAddressDeny=any", "OOMScoreAdjust=200", "TemporaryFileSystem=/:ro", "BindPaths=/var/lib/mastermind/x", "ProtectProc=invisible", "Nice=10"] {
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
