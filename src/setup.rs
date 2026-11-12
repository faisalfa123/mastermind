//! Interactive setup wizard (TUI/CLI fallback): sets up bind IP, admin creds, Gmail SMTP, and systemd.
use crate::auth;
use crate::config::{bind_allowed, Config};
use crate::notify;
use crate::store::{Admin, Store};
use std::io::{stdin, stdout, BufRead, IsTerminal, Write};
use std::process::Command;

fn prompt(label: &str, default: Option<&str>) -> String {
    if let Some(d) = default {
        print!("{label} [{d}]: ");
    } else {
        print!("{label}: ");
    }
    let _ = stdout().flush();
    let mut s = String::new();
    let _ = stdin().lock().read_line(&mut s);
    let trimmed = s.trim_end_matches(['\n', '\r']).trim().to_string();
    if trimmed.is_empty() {
        default.unwrap_or("").to_string()
    } else {
        trimmed
    }
}

fn prompt_password(label: &str) -> String {
    let tty = stdin().is_terminal();
    if tty {
        eprint!("{label}: ");
        let _ = std::io::stderr().flush();
        let _ = Command::new("stty").arg("-echo").status();
    } else {
        print!("{label}: ");
        let _ = stdout().flush();
    }
    let mut s = String::new();
    let _ = stdin().lock().read_line(&mut s);
    if tty {
        let _ = Command::new("stty").arg("echo").status();
        eprintln!();
    }
    s.trim_end_matches(['\n', '\r']).to_string()
}

fn detect_ips() -> Vec<String> {
    let mut ips = Vec::new();
    if let Ok(o) = Command::new("hostname").arg("-I").output() {
        let s = String::from_utf8_lossy(&o.stdout);
        for ip in s.split_whitespace() {
            if bind_allowed(ip).is_ok() {
                ips.push(ip.to_string());
            }
        }
    }
    if ips.is_empty() {
        ips.push("127.0.0.1".into());
    }
    ips
}

pub fn run() -> Result<(), String> {
    if unsafe { libc::geteuid() } != 0 && std::env::var("MM_ALLOW_NONROOT").is_err() {
        return Err("Jalankan setup sebagai root: sudo mastermind setup".into());
    }

    println!("\x1b[1;36m====================================================\x1b[0m");
    println!("\x1b[1;33m       🧠 MASTERMIND SETUP WIZARD (Odroid C2 / DietPi) \x1b[0m");
    println!("\x1b[1;36m====================================================\x1b[0m");
    println!("Konfigurasi awal keamanan, IP bind, akun admin, & Gmail SMTP.\n");

    let cfg_path = std::env::var("MASTERMIND_CONFIG").unwrap_or_else(|_| "/etc/mastermind/config.toml".into());
    let mut cfg = Config::load().unwrap_or_else(|_| {
        toml::from_str(
            "bind=\"127.0.0.1\"\nport=8443\ndata_dir=\"/var/lib/mastermind\"\nlocked_dir=\"/var/lib/mastermind-locked\"\napps_dir=\"/opt/mastermind/apps\"\nunits_dir=\"/etc/systemd/system\"\nhelper_socket=\"/run/mastermind/helper.sock\"\ncert=\"/etc/mastermind/tls/cert.pem\"\nkey=\"/etc/mastermind/tls/key.pem\"\ngithub_owner=\"faisalfa123\"\n"
        ).unwrap()
    });

    // 1. IP Bind
    println!("\x1b[1;32m[1/4] Pilih Alamat IP Bind (LAN / Tailscale)\x1b[0m");
    println!("Mastermind menolak bind ke internet publik (0.0.0.0 / IP publik) demi keamanan.");
    let detected = detect_ips();
    println!("IP terdeteksi yang aman: {}", detected.join(", "));
    let default_bind = detected.first().cloned().unwrap_or_else(|| "127.0.0.1".into());
    let bind_ip = loop {
        let val = prompt("Masukkan IP untuk Web UI", Some(&default_bind));
        match bind_allowed(&val) {
            Ok(_) => break val,
            Err(e) => println!("\x1b[1;31mError: {}\x1b[0m. Coba lagi.", e),
        }
    };
    cfg.bind = bind_ip;

    let port_str = prompt("Port HTTPS", Some(&cfg.port.to_string()));
    cfg.port = port_str.parse().unwrap_or(8443);

    // 2. Akun Admin & 2FA
    println!("\n\x1b[1;32m[2/4] Akun Admin & Otentikasi 2FA (TOTP)\x1b[0m");
    let user = prompt("Username Admin", Some("admin"));
    let pw = loop {
        let p1 = prompt_password("Password Admin (minimal 12 karakter)");
        if p1.chars().count() < 12 {
            println!("\x1b[1;31mPassword terlalu pendek, minimal 12 karakter!\x1b[0m");
            continue;
        }
        let p2 = prompt_password("Ulangi Password");
        if p1 != p2 {
            println!("\x1b[1;31mPassword tidak cocok! Coba lagi.\x1b[0m");
            continue;
        }
        break p1;
    };

    let totp_raw = auth::new_totp_secret();
    let totp_b32 = auth::base32_encode(&totp_raw);
    let pw_hash = auth::hash_password(&pw);

    // 3. Notifikasi Email Gmail
    println!("\n\x1b[1;32m[3/4] Notifikasi Email Gmail (SMTP)\x1b[0m");
    println!("Mengirim alert ke email jika ada deteksi malware, login, atau tamper.");
    println!("Untuk Gmail, gunakan Google App Password (16 huruf):");
    println!("(Buka https://myaccount.google.com/apppasswords untuk membuat App Password)");
    let setup_gmail = prompt("Aktifkan notifikasi Gmail sekarang? (y/n)", Some("y")).to_lowercase() == "y";

    if setup_gmail {
        let gmail_addr = loop {
            let addr = prompt("Alamat Email Gmail Anda (contoh: user@gmail.com)", None);
            if addr.contains('@') && addr.contains('.') {
                break addr;
            }
            println!("\x1b[1;31mFormat email tidak valid!\x1b[0m");
        };

        let app_pw = prompt_password("Google App Password 16 huruf (tanpa spasi)");
        let clean_pw = app_pw.replace(' ', "");

        cfg.smtp = Some(crate::config::Smtp {
            host: "smtp.gmail.com".into(),
            port: 465,
            user: gmail_addr.clone(),
            password: clean_pw,
            from: format!("Mastermind <{gmail_addr}>"),
            to: gmail_addr,
        });

        println!("\nMenguji pengiriman email alert...");
        let errs = notify::send_blocking(&cfg, "Setup Berhasil", "Mastermind berhasil dipasang di Odroid C2 / HG680P!");
        if errs.is_empty() {
            println!("\x1b[1;32m✓ Email test terkirim! Cek kotak masuk Gmail Anda.\x1b[0m");
        } else {
            println!("\x1b[1;33mPeringatan: Gagal mengirim email uji:\x1b[0m");
            for e in errs {
                println!("  - {e}");
            }
            println!("Anda dapat mengubah konfigurasi ini nanti di {}", cfg_path);
        }
    }

    // 4. Sertifikat TLS & Simpan Konfigurasi
    println!("\n\x1b[1;32m[4/4] Menyimpan Konfigurasi & TLS\x1b[0m");
    if let Some(parent) = std::path::Path::new(&cfg_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    // Generate self-signed cert jika belum ada
    if let (Some(c), Some(k)) = (&cfg.cert, &cfg.key) {
        if !std::path::Path::new(c).exists() || !std::path::Path::new(k).exists() {
            println!("Membuat sertifikat TLS mandiri (Self-Signed)...");
            if let Some(p) = std::path::Path::new(c).parent() {
                let _ = std::fs::create_dir_all(p);
            }
            let san = format!("subjectAltName=IP:{},IP:127.0.0.1,DNS:localhost,DNS:mastermind.local", cfg.bind);
            let _ = Command::new("openssl")
                .args([
                    "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1",
                    "-nodes", "-days", "825", "-keyout", k, "-out", c,
                    "-subj", "/CN=mastermind", "-addext", &san
                ])
                .status();
        }
    }

    // Simpan file konfigurasi toml
    let mut toml_str = format!(
        "# /etc/mastermind/config.toml\nbind = \"{}\"\nport = {}\ndata_dir = \"{}\"\nlocked_dir = \"{}\"\napps_dir = \"{}\"\nunits_dir = \"{}\"\nhelper_socket = \"{}\"\ngithub_owner = \"{}\"\nmin_free_mem_mb = {}\n",
        cfg.bind, cfg.port, cfg.data_dir, cfg.locked_dir, cfg.apps_dir, cfg.units_dir, cfg.helper_socket, cfg.github_owner, cfg.min_free_mem_mb
    );
    if let (Some(c), Some(k)) = (&cfg.cert, &cfg.key) {
        toml_str.push_str(&format!("cert = \"{c}\"\nkey = \"{k}\"\n"));
    }
    if let Some(s) = &cfg.smtp {
        toml_str.push_str(&format!(
            "\n[smtp]\nhost = \"{}\"\nport = {}\nuser = \"{}\"\npassword = \"{}\"\nfrom = \"{}\"\nto = \"{}\"\n",
            s.host, s.port, s.user, s.password, s.from, s.to
        ));
    }
    if let Some(n) = &cfg.ntfy {
        toml_str.push_str(&format!("\n[ntfy]\nurl = \"{}\"\ntopic = \"{}\"\n", n.url, n.topic));
    }

    std::fs::write(&cfg_path, &toml_str).map_err(|e| format!("Gagal menyimpan {cfg_path}: {e}"))?;
    println!("✓ Konfigurasi disimpan di {cfg_path}");

    // Simpan State Admin & TOTP
    let mut st = Store::open(&cfg.data_dir).map_err(|e| e.to_string())?;
    st.state.admin = Some(Admin {
        user: user.clone(),
        pw_hash,
        totp_b32: totp_b32.clone(),
    });
    st.save().map_err(|e| e.to_string())?;
    st.log("ssh-setup", "Initial setup wizard completed");

    // Perbaiki permission direktori
    let _ = Command::new("chown").args(["-R", "mastermind:mastermind", &cfg.data_dir]).status();
    let _ = Command::new("chmod").args(["0750", &cfg.data_dir]).status();
    let _ = Command::new("chown").args(["root:mastermind", &cfg_path]).status();
    let _ = Command::new("chmod").args(["0640", &cfg_path]).status();
    if let Some(k) = &cfg.key {
        let _ = Command::new("chown").args(["root:mastermind", k]).status();
        let _ = Command::new("chmod").args(["0640", k]).status();
    }

    println!("\n\x1b[1;32m====================================================\x1b[0m");
    println!("\x1b[1;32m             SETUP SELESAI DENGAN SUKSES!           \x1b[0m");
    println!("\x1b[1;32m====================================================\x1b[0m");
    println!("\x1b[1;33mPENTING: Simpan Secret TOTP 2FA Anda:\x1b[0m");
    println!("Secret Base32 : \x1b[1;37m{}\x1b[0m", totp_b32);
    println!("URI Authenticator: \x1b[1;34motpauth://totp/Mastermind:{}?secret={}&issuer=Mastermind&algorithm=SHA1&digits=6&period=30\x1b[0m\n", user, totp_b32);

    println!("Buka Web UI di browser Anda:");
    println!("👉 \x1b[1;36mhttps://{}:{}\x1b[0m", cfg.bind, cfg.port);
    println!("\nAktifkan service systemd:");
    println!("  sudo systemctl daemon-reload");
    println!("  sudo systemctl enable --now mastermind-helper mastermind-web");
    println!("\x1b[1;36m====================================================\x1b[0m\n");

    Ok(())
}
