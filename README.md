# 🧠 Mastermind Core Engine v2.0.1

**Native Systemd Orchestrator & API Provider** ultra-ringan (Rust, single static binary) untuk **STB HG680P / Odroid C2** di **DietPi / Debian**.

Mastermind v2.0.1 mengelola daur hidup aplikasi WebApps GUI secara native melalui `systemd` (`/etc/systemd/system/bumiayu-*.service`) dengan *Shared Environment* (tanpa sandboxing kaku), sehingga aplikasi seperti **Senandung** dapat langsung memanggil binary global OS seperti `yt-dlp` dan `ffmpeg`.

---

## 🏗️ Arsitektur Sistem (v2.0.1)

```text
+-------------------------------------------------------------------+
|                   Bumiayu Hall (Port 1001)                        |
|        Windows Mobile / Metro Tiles Launcher & PWA Client         |
+---------------------------------+---------------------------------+
                                  |
         GET /api/v1/integration/manifest (X-Bumiayu-Bridge-Token)
         POST /api/v1/integration/control  (Execution-Only)
         Reverse Proxy: /p/<slug>/
                                  v
+-------------------------------------------------------------------+
|               Mastermind Core Engine v2.0.1 (Rust)                |
|  - Auth & Root Shell Escalation (Argon2id + 2FA)                  |
|  - Integration API Engine (src/api/integration.rs)                |
|  - Centralized Reverse Proxy (/p/<slug>/)                         |
|  - Systemd Core Service (src/executor.rs)                         |
+---------------------------------+---------------------------------+
                                  |
             systemctl start | stop | restart bumiayu-*
                                  v
+-------------------------------------------------------------------+
|                Linux OS Host (Shared Environment)                 |
|  - /etc/systemd/system/bumiayu-*.service (WebApps GUI + Port)     |
|  - Global CLI Tools: yt-dlp, ffmpeg, python3, node                |
+-------------------------------------------------------------------+
```

---

## ✨ Spesifikasi Fitur v2.0.1
- **Native Systemd Orchestrator (`src/executor.rs`)**: Membuat dan mengelola unit `/etc/systemd/system/bumiayu-*.service` dengan verifikasi **Password Root Shell** saat registrasi aplikasi baru.
- **Filter Ketat Anti-CLI**: Hanya menerima WebApps GUI yang mendengarkan port HTTP/HTTPS aktif; alat CLI (`yt-dlp`, `ffmpeg`, `smb`, dll.) ditolak dari manifes dasbor dan dibiarkan hidup sebagai dependensi global OS.
- **Otoritas Terbatas (Execution-Only)**: Mastermind dan Bumiayu Hall hanya dapat mengontrol status service (`start|stop|restart`) dan memantau resource—tidak mengubah kode sumber atau menghapus binary host.
- **API Integrasi Terproteksi (`src/api/integration.rs`)**:
  - `GET /api/v1/integration/manifest` (dilindungi `X-Bumiayu-Bridge-Token`)
  - `POST /api/v1/integration/control`
  - Centralized Reverse Proxy `/p/<slug>/` (anti-keluar PWA iOS Safari).
- **Keamanan Berlapis**: Argon2id + TOTP/Pertanyaan Keamanan 2FA.
