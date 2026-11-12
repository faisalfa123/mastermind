//! Hash-chained, tamper-evident audit log (each entry commits to the previous one).
use sha2::{Digest, Sha256};

pub struct Entry {
    pub ts: u64,
    pub actor: String,
    pub action: String,
    pub prev: String,
    pub hash: String,
}

#[derive(Default)]
pub struct Log {
    pub entries: Vec<Entry>,
}

fn digest(ts: u64, actor: &str, action: &str, prev: &str) -> String {
    let mut h = Sha256::new();
    for part in [ts.to_string().as_str(), actor, action, prev] {
        h.update((part.len() as u32).to_be_bytes()); // length-prefix: no ambiguity
        h.update(part.as_bytes());
    }
    hex::encode(h.finalize())
}

impl Log {
    pub fn append(&mut self, ts: u64, actor: &str, action: &str) {
        let prev = self.entries.last().map(|e| e.hash.clone()).unwrap_or_else(|| "0".repeat(64));
        let hash = digest(ts, actor, action, &prev);
        self.entries.push(Entry { ts, actor: actor.into(), action: action.into(), prev, hash });
    }
    pub fn verify(&self) -> bool {
        let mut prev = "0".repeat(64);
        self.entries.iter().all(|e| {
            let ok = e.prev == prev && e.hash == digest(e.ts, &e.actor, &e.action, &e.prev);
            prev = e.hash.clone();
            ok
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chain_detects_tamper() {
        let mut l = Log::default();
        l.append(1, "admin", "login");
        l.append(2, "admin", "install senandung");
        assert!(l.verify());
        l.entries[0].action = "nothing".into();
        assert!(!l.verify());
    }
}
