//! Helper IPC protocol: a closed set of commands. No shell strings, no free paths.
#[derive(Debug, PartialEq)]
pub enum Command {
    Install(String),
    Remove(String),
    Start(String),
    Stop(String),
    Status(String),
    Verify(String),
    Quarantine(String),
}

use std::io::Read;
pub fn valid_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 32 && s.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

impl Command {
    /// Parses exactly "<verb> <app-id>"; anything else is rejected.
    pub fn parse(line: &str) -> Result<Command, &'static str> {
        let mut it = line.split(' ');
        let (verb, id, extra) = (it.next(), it.next(), it.next());
        let (Some(verb), Some(id), None) = (verb, id, extra) else { return Err("format") };
        if !valid_id(id) { return Err("bad id"); }
        let id = id.to_string();
        match verb {
            "install" => Ok(Command::Install(id)),
            "remove" => Ok(Command::Remove(id)),
            "start" => Ok(Command::Start(id)),
            "stop" => Ok(Command::Stop(id)),
            "status" => Ok(Command::Status(id)),
            "verify" => Ok(Command::Verify(id)),
            "quarantine" => Ok(Command::Quarantine(id)),
            _ => Err("unknown verb"),
        }
    }
}

/// Client side: one request line, one response line.
pub fn call(sock: &str, line: &str) -> Result<String, String> {
    use std::io::{BufRead, BufReader, Write};
    use std::os::unix::net::UnixStream;
    let mut s = UnixStream::connect(sock).map_err(|e| format!("helper unreachable: {e}"))?;
    s.set_read_timeout(Some(std::time::Duration::from_secs(60))).ok();
    s.write_all(format!("{line}\n").as_bytes()).map_err(|e| e.to_string())?;
    let mut out = String::new();
    BufReader::new(s).take(4096).read_line(&mut out).map_err(|e| e.to_string())?;
    let out = out.trim().to_string();
    if let Some(r) = out.strip_prefix("ok") { Ok(r.trim().to_string()) }
    else { Err(out.strip_prefix("err").unwrap_or(&out).trim().to_string()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ok() { assert_eq!(Command::parse("start senandung"), Ok(Command::Start("senandung".into()))); }
    #[test]
    fn rejects_injection() {
        for bad in ["start a;rm -rf /", "start ../etc", "start", "start a b", "exec a", "start A", "start $(id)", "start a\nstop b", ""] {
            assert!(Command::parse(bad).is_err(), "{bad:?}");
        }
    }
}

