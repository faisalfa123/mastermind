//! Pre-install scanner: ELF validation + high-confidence malware heuristics (+ optional VirusTotal).
use serde::Serialize;

#[derive(Debug, Serialize, Default)]
pub struct Verdict {
    pub blocked: bool,
    pub reasons: Vec<String>,
    pub warnings: Vec<String>,
}

const MAX_SIZE: usize = 96 * 1024 * 1024;
// High confidence: miners, reverse shells, known botnets.
// Signatures are XOR-encoded (0x5A) so plain indicators are not compiled into
// mastermind's .rodata, preventing false-positive self-detection during self-update.
const XOR_KEY: u8 = 0x5a;

const BLOCK_XOR: &[&[u8]] = &[
    &[34, 55, 40, 51, 61],                                          // x-m-r-i-g
    &[41, 46, 40, 59, 46, 47, 55, 113, 46, 57, 42, 96, 117, 117], // stratum+tcp://
    &[41, 46, 40, 59, 46, 47, 55, 113, 41, 41, 54, 96, 117, 117], // stratum+ssl://
    &[57, 40, 35, 42, 46, 53, 52, 51, 61, 50, 46],                 // cryptonight
    &[40, 59, 52, 62, 53, 55, 34],                                 // randomx
    &[56, 59, 41, 50, 122, 119, 51, 122, 100, 124],                 // bash -i >&
    &[117, 62, 63, 44, 117, 46, 57, 42, 117],                      // /dev/tcp/
    &[52, 57, 122, 119, 63, 122, 117, 56, 51, 52],                 // nc -e /bin
    &[55, 51, 40, 59, 51],                                         // mirai
    &[61, 59, 60, 61, 35, 46],                                     // gafgyt
    &[49, 51, 52, 41, 51, 52, 61],                                 // kinsing
    &[55, 51, 52, 63, 40, 62],                                     // minerd
    &[57, 53, 51, 52, 50, 51, 44, 63],                             // coinhive
];

// Suspicious but legitimate software may contain them: shown as warnings only.
const WARN_XOR: &[&[u8]] = &[
    &[117, 63, 46, 57, 117, 41, 50, 59, 62, 53, 45],              // /etc/shadow
    &[59, 47, 46, 50, 53, 40, 51, 32, 63, 62, 5, 49, 63, 35, 41], // authorized_keys
    &[22, 30, 5, 10, 8, 31, 22, 21, 27, 30],                       // LD_PRELOAD
    &[57, 50, 55, 53, 62, 122, 47, 113, 41],                      // chmod u+s
    &[117, 42, 40, 53, 57, 117, 41, 63, 54, 60, 117, 55, 63, 55], // /proc/self/mem
    &[42, 46, 40, 59, 57, 63],                                     // ptrace
];

fn decode_sig(enc: &[u8]) -> Vec<u8> {
    enc.iter().map(|b| b ^ XOR_KEY).collect()
}

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
    for enc in BLOCK_XOR {
        let pat = decode_sig(enc);
        if contains(bytes, &pat) {
            let label = String::from_utf8_lossy(&pat);
            v.reasons.push(format!("malicious indicator: {label}"));
        }
    }
    for enc in WARN_XOR {
        let pat = decode_sig(enc);
        if contains(bytes, &pat) {
            let label = String::from_utf8_lossy(&pat);
            v.warnings.push(format!("suspicious string: {label}"));
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
    #[test]
    fn no_false_positive_on_obfuscated_signatures() {
        // Obfuscated bytes present in mastermind binary itself must NOT trigger detections
        let mut sim_mm_binary = Vec::new();
        for enc in BLOCK_XOR {
            sim_mm_binary.extend_from_slice(enc);
        }
        for enc in WARN_XOR {
            sim_mm_binary.extend_from_slice(enc);
        }
        let verdict = scan(&elf(183, &sim_mm_binary));
        assert!(!verdict.blocked);
        assert!(verdict.reasons.is_empty());
        assert!(verdict.warnings.is_empty());
    }
}
