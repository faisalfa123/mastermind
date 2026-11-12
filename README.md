# 🧠 Mastermind

App manager **native & ultra-ringan** (Rust, single static binary ~3 MB, idle RAM ~3.7 MB) untuk **STB HG680P / Odroid C2** di **DietPi / Debian**.
Install · update · uninstall · start/stop · status aplikasi dari repo Anda lewat Web UI (PWA, gaya 16-bit) —
**tanpa terminal, tanpa root** dari sisi web, anti-malware, dan dengan notifikasi email Gmail & WhatsApp Cloud API.

---

## ⚡ Cara Install Cepat (TUI Wizard)

Jalankan perintah satu baris ini langsung di terminal Odroid C2 / STB HG680P Anda:

```sh
curl -fsSL https://raw.githubusercontent.com/faisalfa123/mastermind/main/deploy/install.sh -o /tmp/install.sh && sudo sh /tmp/install.sh
```

Atau unduh repo manual:
```sh
git clone https://github.com/faisalfa123/mastermind.git
cd mastermind
sudo sh deploy/install.sh
```

Installer TUI otomatis:
1. Mendeteksi arsitektur perangkat (ARM64 / AArch64) dan memasang binary `mastermind`.
2. Membuat user sistem sandbox `mastermind` dan direktori data aman.
3. Memasang unit systemd (`mastermind-helper` dan `mastermind-web`).
4. Membuka **Setup Wizard interaktif (TUI)** untuk:
   - Memilih alamat IP aman (LAN / Tailscale).
   - Menyetel akun admin & secret **2FA (TOTP)**.
   - Mengonfigurasi **Notifikasi Email Gmail** (Google App Password).
   - Menghasilkan sertifikat TLS HTTPS secara otomatis.
5. Mengaktifkan daemon systemd.

---

## 📧 Panduan Notifikasi Email Gmail (SMTP)

Mastermind mengirimkan email otomatis ketika:
- Deteksi malware / binary hash mencurigakan.
- Percobaan login gagal berulang kali (lockout).
- Modifikasi binary terdeteksi (tamper alert).
- Memori perangkat kritis dan watchdog mematikan aplikasi berprioritas rendah.

### Pilihan Metode Notifikasi Email:

#### 1. Resend API (Sangat Direkomendasikan jika tidak bisa Google App Password):
1. Buka [https://resend.com](https://resend.com) lalu daftar akun gratis (cukup sign in dengan GitHub/Email).
2. Masuk ke menu **API Keys** lalu klik **Create API Key**.
3. Salin API key yang berawalan `re_...`.
4. Masukkan API key tersebut dan alamat Gmail Anda saat setup wizard berjalan. Email alert akan langsung dikirim ke Gmail Anda tanpa repot otentikasi SMTP Google.

#### 2. Gmail SMTP (Menggunakan Google App Password 16-Huruf):
1. Buka [Keamanan Akun Google](https://myaccount.google.com/security) (Verifikasi 2 Langkah wajib aktif).
2. Buka [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) lalu buat password aplikasi 16 huruf.
3. Masukkan 16 huruf sandi tersebut saat setup wizard.

Jika ingin menguji email setelah install:
```sh
sudo mastermind notify-test
```

---

## 🛡️ Arsitektur Keamanan & Proteksi Anti-Hack

| Fitur | Implementasi & Manfaat |
|---|---|
| **Akses Terbatas** | Menolak bind ke internet publik (0.0.0.0). Hanya menerima alamat loopback (`127.0.0.1`), LAN pribadi (`192.168.x.x`), atau **Tailscale** (`100.64.0.0/10`). Wajib HTTPS (rustls). |
| **Otentikasi Berlapis** | Password di-hash dengan **Argon2id** (OWASP compliant). Wajib **TOTP 2FA** (RFC 6238) dengan perlindungan *anti-replay* (setiap kode hanya valid 1x). Lockout bertingkat per IP & akun jika 5x gagal. |
| **Aksi Sensitif 2FA Ulang** | Tombol Install, Update, Hapus, dan Lockdown di Web UI selalu meminta input kode TOTP ulang sebelum dieksekusi. |
| **Tanpa Akses Shell / Root** | Pemisahan hak akses: `mastermind-web` berjalan sebagai user biasa tanpa hak istimewa. Segala aksi sistem dikirim lewat Unix Socket ke `mastermind-helper` yang hanya menerima **enum 7 perintah tetap** (`<verb> <id-app>`). Tidak ada eksekusi shell string atau path bebas. |
| **Scanner Malware Mandiri** | File binary diperiksa sebelum diinstal: validasi ELF aarch64, pengecekan string miner (`xmrig`, `stratum`), reverse shell, botnet, dan opsional VirusTotal API. Helper memverifikasi ulang binary sebelum memasangnya. |
| **Blacklist Terkunci** | Binary yang terdeteksi berbahaya langsung dibatalkan, dicopot, dan dimasukkan ke file Blacklist root. Di Web UI hanya bisa dilihat (read-only); penghapusan blacklist **hanya bisa dilakukan lewat terminal SSH**: `sudo mastermind admin blacklist-remove <id>`. |
| **Sandbox systemd per App** | Setiap aplikasi berjalan di bawah isolasi: `DynamicUser=yes`, `NoNewPrivileges=yes`, `ProtectSystem=strict`, `MemoryMax`, `CPUQuota`, dan pembatasan network outbound sesuai rule. |
| **Audit Log Anti-Manipulasi** | Log peristiwa diikat berantai dengan SHA-256 (hash-chain). Jika ada log yang dihapus atau diedit oleh penyerang, rantai hash akan terdeteksi rusak. |

---

## 📦 Menghubungkan Aplikasi: `<id>.batasan.toml`

Mastermind secara otomatis mendeteksi aplikasi dari akun GitHub Anda (`github_owner = "faisalfa123"`). Agar aplikasi Anda dapat diinstal di Mastermind:

1. Buat file `<nama-app>.batasan.toml` di root repository Anda (contoh: `dompetmungil.batasan.toml`, `senandung.batasan.toml`).
2. Sediakan rilis binary `aarch64` / `arm64` dan file `checksums.txt` pada GitHub Releases.

Contoh konfigurasi `senandung.batasan.toml`:
```toml
[app]
id = "senandung"
repo = "faisalfa123/Senandung"
asset = "senandung-linux-arm64"
language = "go"
description = "Spotify-like PWA self-hosted dengan sinkronisasi multi-device"

[run]
port = 8080
priority = 50

[limits]
memory_max_mb = 96
cpu_quota_pct = 50
tasks_max = 64

[permissions]
paths_rw = ["/var/lib/mastermind/senandung"]
paths_ro = ["/srv/music"]
outbound = []
```

Uji validitas file rule kapan saja dengan:
```sh
mastermind validate senandung.batasan.toml
```

---

## 💡 Saran & Rekomendasi Pengembangan Lanjutan

1. **GitHub Actions Workflow Rilis Seragam:**
   - Tambahkan workflow GitHub Actions pada setiap repo Anda (`DompetMungil`, `Senandung`, dll.) yang membuat binary `linux/arm64` musl secara otomatis dan menghasilkan `checksums.txt` (`sha256sum`).
2. **Koneksi Tailscale Subnet Router / Tailscale Serve:**
   - Gunakan `tailscale cert` untuk mendapatkan sertifikat resmi domain MagicDNS Tailscale tanpa browser warning self-signed.
3. **WhatsApp Notifikasi:**
   - Gunakan WhatsApp Cloud API resmi (Meta for Developers) agar aman 100% dari risiko nomor diblokir/banned.
4. **PWA Standalone:**
   - Buka Web UI di Chrome/Brave di HP/Laptop melalui jaringan Tailscale, klik ikon **"Install App / Tambahkan ke Layar Utama"** untuk tampilan aplikasi fullscreen bergaya 16-bit tanpa browser bar.
