//! SSH-only admin CLI (run as root). The web UI has no equivalent of these commands.
use crate::auth;
use crate::config::Config;
use crate::store::{self, Admin, Store};
use std::io::{BufRead, IsTerminal, Write};
use std::process::Command;

fn read_password(prompt: &str) -> String {
    let tty = std::io::stdin().is_terminal();
    if tty {
        eprint!("{prompt}");
        let _ = std::io::stderr().flush();
        let _ = Command::new("stty").arg("-echo").status();
    }
    let mut s = String::new();
    let _ = std::io::stdin().lock().read_line(&mut s);
    if tty { let _ = Command::new("stty").arg("echo").status(); eprintln!(); }
    s.trim_end_matches(['\n', '\r']).to_string()
}

fn require_root() -> Result<(), String> {
    if unsafe { libc::geteuid() } != 0 { return Err("run as root (sudo mastermind admin ...)".into()); }
    Ok(())
}

fn fix_perms(cfg: &Config) {
    let _ = Command::new("chown").args(["-R", "mastermind:mastermind", &cfg.data_dir]).status();
    let _ = Command::new("chmod").args(["0750", &cfg.data_dir]).status();
    if let Some(k) = &cfg.key { let _ = Command::new("chown").args(["root:mastermind", k]).status(); let _ = Command::new("chmod").args(["0640", k]).status(); }
}

fn gen_cert(cfg: &Config) {
    let (Some(c), Some(k)) = (&cfg.cert, &cfg.key) else { return };
    if std::path::Path::new(c).exists() && std::path::Path::new(k).exists() { return; }
    if let Some(p) = std::path::Path::new(c).parent() { let _ = std::fs::create_dir_all(p); }
    let san = format!("subjectAltName=IP:{},DNS:localhost,DNS:mastermind.local", cfg.bind);
    let ok = Command::new("openssl").args(["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "825",
        "-keyout", k, "-out", c, "-subj", "/CN=mastermind", "-addext", &san]).status().map(|s| s.success()).unwrap_or(false);
    eprintln!("{}", if ok { format!("TLS cert generated: {c} (self-signed; or use `tailscale cert` and point config at it)") } else { "openssl failed: create cert/key manually".into() });
}

fn prompt_str(label: &str) -> String {
    eprint!("{label}: ");
    let _ = std::io::stderr().flush();
    let mut s = String::new();
    let _ = std::io::stdin().lock().read_line(&mut s);
    s.trim_end_matches(['\n', '\r']).trim().to_string()
}

fn set_credentials(cfg: &Config, user: Option<String>, new_2fa: bool, new_pw: bool) -> Result<(), String> {
    let mut st = Store::open(&cfg.data_dir).map_err(|e| e.to_string())?;
    let prev = st.state.admin.clone().unwrap_or_default();
    let pw_hash = if new_pw {
        let p = read_password("New password (min 12 chars): ");
        if p.chars().count() < 12 { return Err("password too short (min 12)".into()); }
        if new_pw && std::io::stdin().is_terminal() && read_password("Repeat: ") != p { return Err("passwords differ".into()); }
        auth::hash_password(&p)
    } else { prev.pw_hash.clone() };

    let (two_factor, totp_b32_opt) = if new_2fa {
        println!("\nPilih Metode 2FA:");
        println!("  1) Pertanyaan Keamanan Pribadi (Human Knowing: hobiku, makanan favorit, dll)");
        println!("  2) Google Authenticator / TOTP App (6-digit dinamis)");
        let m = prompt_str("Pilihan (1/2) [1]");
        if m == "2" {
            let b32 = auth::base32_encode(&auth::new_totp_secret());
            (store::TwoFactor::Totp { secret_b32: b32.clone() }, Some(b32))
        } else {
            let q = prompt_str("Pertanyaan Keamanan Pribadi [Apa hobiku?]");
            let question = if q.is_empty() { "Apa hobiku?".to_string() } else { q };
            let a = loop {
                let ans = prompt_str("Jawaban Rahasia Anda");
                if !ans.is_empty() { break ans; }
                println!("Jawaban tidak boleh kosong!");
            };
            (store::TwoFactor::Question { question, answer_hash: auth::hash_answer(&a) }, None)
        }
    } else {
        (prev.get_two_factor(), if prev.totp_b32.is_empty() { None } else { Some(prev.totp_b32.clone()) })
    };

    let user = user.or(if prev.user.is_empty() { None } else { Some(prev.user.clone()) }).unwrap_or_else(|| "admin".into());
    let legacy_b32 = totp_b32_opt.clone().unwrap_or_default();
    st.state.admin = Some(Admin { user: user.clone(), pw_hash, totp_b32: legacy_b32, two_factor: Some(two_factor) });
    st.save().map_err(|e| e.to_string())?;
    st.log("ssh-admin", if new_pw { "credentials set" } else { "2fa reset" });
    if let Some(totp_b32) = totp_b32_opt {
        println!("\nTOTP secret (add to your authenticator app): {totp_b32}");
        println!("otpauth://totp/Mastermind:{user}?secret={totp_b32}&issuer=Mastermind&algorithm=SHA1&digits=6&period=30");
    } else {
        println!("\n✓ 2FA berhasil disetel ke Pertanyaan Keamanan Pribadi!");
    }
    fix_perms(cfg);
    Ok(())
}

pub fn run(args: &[String]) -> Result<(), String> {
    let cfg = Config::load()?;
    let sub = args.first().map(String::as_str).unwrap_or("");
    match sub {
        "blacklist-list" => {
            for b in store::read_blacklist(&cfg.locked_dir) { println!("{}\t{}\t{}\t{}", b.id, b.repo, &b.sha256[..16.min(b.sha256.len())], b.reason); }
            Ok(())
        }
        "audit-verify" => {
            let st = Store::open(&cfg.data_dir).map_err(|e| e.to_string())?;
            println!("{} entries, chain {}", st.audit.entries.len(), if st.audit.verify() { "INTACT" } else { "BROKEN" });
            Ok(())
        }
        _ => {
            require_root()?;
            match sub {
                "init" => { gen_cert(&cfg); set_credentials(&cfg, args.get(1).cloned(), true, true) }
                "passwd" => set_credentials(&cfg, None, false, true),
                "totp-reset" | "2fa-reset" => set_credentials(&cfg, None, true, false),
                "blacklist-remove" => {
                    let id = args.get(1).ok_or("usage: admin blacklist-remove <id>")?;
                    let mut l = store::read_blacklist(&cfg.locked_dir);
                    let n = l.len();
                    l.retain(|b| &b.id != id);
                    if l.len() == n { return Err(format!("{id} not in blacklist")); }
                    store::write_blacklist(&cfg.locked_dir, &l).map_err(|e| e.to_string())?;
                    let mut st = Store::open(&cfg.data_dir).map_err(|e| e.to_string())?;
                    st.log("ssh-admin", &format!("blacklist-remove {id}"));
                    fix_perms(&cfg);
                    println!("removed {id} from blacklist");
                    Ok(())
                }
                _ => Err("usage: mastermind admin <init [user]|passwd|totp-reset|blacklist-list|blacklist-remove <id>|audit-verify>".into()),
            }
        }
    }
}
