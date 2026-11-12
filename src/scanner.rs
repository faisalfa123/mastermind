//! Pre-install scanner: ELF validation + high-confidence malware heuristics (+ optional VirusTotal).
use serde::Serialize;

#[derive(Debug, Serialize, Default)]
pub struct Verdict {
    pub blocked: bool,
    pub reasons: Vec<String>,
    pub warnings: Vec<String>,
}

const MAX_SIZE: usize = 96 * 1024 * 1024;
// High confidence: miners, reverse shells, known botnets. Any hit blocks the install.
const BLOCK: &[&str] = &[
    "xmrig", "stratum+tcp://", "stratum+ssl://", "cryptonight", "randomx", "bash -i >&", "/dev/tcp/",
    "nc -e /bin", "mirai", "gafgyt", "kinsing", "minerd", "coinhive",
];
// Suspicious but legitimate software may contain them: shown as warnings only.
const WARN: &[&str] = &["/etc/shadow", "authorized_keys", "LD_PRELOAD", "chmod u+s", "/proc/self/mem", "ptrace"];

fn contains(hay: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty() && hay.windows(needle.len()).any(|w| w == needle)
}

pub fn scan(bytes: &[u8]) -> Verdict {
    let mut v = Verdict::default();
    if bytes.len() > MAX_SIZE {
        v.reasons.push("file too large".into());
    }
    if bytes.len() < 64 || &bytes[..4] != b"\x7fELF" {
        v.reasons.push("not an ELF executable".into());
    } else {
        if bytes[4] != 2 || bytes[5] != 1 {
            v.reasons.push("not 64-bit little-endian".into());
        }
        let machine = u16::from_le_bytes([bytes[18], bytes[19]]);
        if machine != 183 {
            v.reasons.push(format!("wrong architecture (e_machine={machine}), expected aarch64"));
        }
        let et = u16::from_le_bytes([bytes[16], bytes[17]]);
        if et != 2 && et != 3 {
            v.reasons.push("ELF type is not executable".into());
        }
    }
    for p in BLOCK {
        if contains(bytes, p.as_bytes()) {
            v.reasons.push(format!("malicious indicator: {p}"));
        }
    }
    for p in WARN {
        if contains(bytes, p.as_bytes()) {
            v.warnings.push(format!("suspicious string: {p}"));
        }
    }
    v.blocked = !v.reasons.is_empty();
    v
}

/// Optional VirusTotal hash lookup. `Ok(None)` = unknown hash; `Ok(Some(n))` = n engines flagged malicious.
pub fn virustotal(sha256: &str, key: &str) -> Result<Option<u32>, String> {
    let url = format!("https://www.virustotal.com/api/v3/files/{sha256}");
    match ureq::get(&url).set("x-apikey", key).timeout(std::time::Duration::from_secs(15)).call() {
        Ok(r) => {
            let j: serde_json::Value = r.into_json().map_err(|e| e.to_string())?;
            Ok(Some(j["data"]["attributes"]["last_analysis_stats"]["malicious"].as_u64().unwrap_or(0) as u32))
        }
        Err(ureq::Error::Status(404, _)) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn elf(machine: u16, extra: &[u8]) -> Vec<u8> {
        let mut b = vec![0u8; 64];
        b[..4].copy_from_slice(b"\x7fELF");
        b[4] = 2;
        b[5] = 1;
        b[16] = 2;
        b[18..20].copy_from_slice(&machine.to_le_bytes());
        b.extend_from_slice(extra);
        b
    }
    #[test] fn clean_arm64() { assert!(!scan(&elf(183, b"hello")).blocked); }
    #[test] fn wrong_arch() { assert!(scan(&elf(62, b"")).blocked); }
    #[test] fn not_elf() { assert!(scan(b"#!/bin/sh\necho hi\n").blocked); }
    #[test] fn miner() { assert!(scan(&elf(183, b"..stratum+tcp://pool..")).blocked); }
    #[test] fn warn_only() { let v = scan(&elf(183, b"LD_PRELOAD")); assert!(!v.blocked && !v.warnings.is_empty()); }
}
