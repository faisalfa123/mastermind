//! Authentication primitives: Argon2id, TOTP (RFC 6238), lockout, session tokens.
use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha1::Sha1;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use subtle::ConstantTimeEq;

// 19 MiB, t=2, p=1: OWASP minimum, sized for a 2 GB ARM board.
fn argon() -> Argon2<'static> {
    Argon2::new(Algorithm::Argon2id, Version::V0x13, Params::new(19 * 1024, 2, 1, None).unwrap())
}

pub fn hash_password(pw: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    argon().hash_password(pw.as_bytes(), &salt).unwrap().to_string()
}

pub fn verify_password(pw: &str, phc: &str) -> bool {
    PasswordHash::new(phc).map(|h| argon().verify_password(pw.as_bytes(), &h).is_ok()).unwrap_or(false)
}

pub fn totp_code(secret: &[u8], unix: u64) -> u32 {
    let mut mac = Hmac::<Sha1>::new_from_slice(secret).unwrap();
    mac.update(&(unix / 30).to_be_bytes());
    let h = mac.finalize().into_bytes();
    let o = (h[19] & 0xf) as usize;
    let n = u32::from_be_bytes([h[o] & 0x7f, h[o + 1], h[o + 2], h[o + 3]]);
    n % 1_000_000
}

pub fn random_token() -> String {
    let mut b = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut b);
    hex::encode(b)
}

/// Escalating lockout per key (IP or account): 5 failures -> 1 min, doubling, cap 1 h.
#[derive(Default)]
pub struct Lockout {
    m: HashMap<String, (u32, Option<Instant>)>,
}

impl Lockout {
    pub fn check(&self, key: &str, now: Instant) -> Result<(), Duration> {
        match self.m.get(key) {
            Some((_, Some(until))) if *until > now => Err(*until - now),
            _ => Ok(()),
        }
    }
    pub fn fail(&mut self, key: &str, now: Instant) {
        let e = self.m.entry(key.to_string()).or_insert((0, None));
        e.0 += 1;
        if e.0 >= 5 {
            let secs = (60u64 << (e.0 - 5).min(6)).min(3600);
            e.1 = Some(now + Duration::from_secs(secs));
        }
    }
    pub fn success(&mut self, key: &str) {
        self.m.remove(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn password() {
        let h = hash_password("s3cret!");
        assert!(h.starts_with("$argon2id$"));
        assert!(verify_password("s3cret!", &h));
        assert!(!verify_password("wrong", &h));
        assert!(!verify_password("x", "garbage"));
    }
    #[test]
    fn totp_rfc6238_vector() {
        // RFC 6238 SHA1 secret "12345678901234567890", T=59 -> 94287082 (last 6: 287082)
        assert_eq!(totp_code(b"12345678901234567890", 59), 287082);
        assert_eq!(totp_match(b"12345678901234567890", 59, "287082"), Some(1));
        assert_eq!(totp_match(b"12345678901234567890", 59, "000000"), None);
    }
    #[test]
    fn lockout() {
        let mut l = Lockout::default();
        let now = Instant::now();
        for _ in 0..4 { l.fail("ip", now); }
        assert!(l.check("ip", now).is_ok());
        l.fail("ip", now);
        assert!(l.check("ip", now).is_err());
        assert!(l.check("ip", now + Duration::from_secs(61)).is_ok());
        l.success("ip");
        assert!(l.check("ip", now).is_ok());
    }
    #[test]
    fn tokens_unique() { assert_ne!(random_token(), random_token()); assert_eq!(random_token().len(), 64); }
}

const B32: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

pub fn base32_encode(data: &[u8]) -> String {
    let (mut out, mut buf, mut bits) = (String::new(), 0u32, 0u32);
    for &b in data {
        buf = (buf << 8) | b as u32;
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(B32[((buf >> bits) & 31) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(B32[((buf << (5 - bits)) & 31) as usize] as char);
    }
    out
}

pub fn base32_decode(s: &str) -> Option<Vec<u8>> {
    let (mut out, mut buf, mut bits) = (Vec::new(), 0u32, 0u32);
    for c in s.bytes().filter(|c| *c != b'=') {
        let v = B32.iter().position(|x| *x == c.to_ascii_uppercase())? as u32;
        buf = (buf << 5) | v;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

pub fn new_totp_secret() -> Vec<u8> {
    let mut b = vec![0u8; 20];
    rand::rngs::OsRng.fill_bytes(&mut b);
    b
}

#[cfg(test)]
mod b32tests {
    use super::*;
    #[test]
    fn roundtrip() {
        let s = new_totp_secret();
        assert_eq!(base32_decode(&base32_encode(&s)).unwrap(), s);
        assert_eq!(base32_encode(b"foobar"), "MZXW6YTBOI");
    }
}

/// Returns the matched 30 s step counter (for replay protection) if `input` is valid.
pub fn totp_match(secret: &[u8], unix: u64, input: &str) -> Option<u64> {
    let mut hit = None;
    for d in [-30i64, 0, 30] {
        let t = (unix as i64 + d).max(0) as u64;
        let want = format!("{:06}", totp_code(secret, t));
        if want.as_bytes().ct_eq(input.as_bytes()).unwrap_u8() == 1 { hit = Some(t / 30); }
    }
    hit
}
