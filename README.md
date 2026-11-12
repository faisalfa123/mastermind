# 🧠 Mastermind

App manager **ultra-ringan** (Rust, satu binary) untuk **STB HG680P / Odroid C2** di **DietPi**.
Install · update · uninstall · start/stop · status aplikasi dari repo Anda lewat Web UI (PWA, gaya 16-bit) —
**tanpa terminal, tanpa root** dari sisi web.

## Keamanan
| Lapisan | Detail |
|---|---|
| Akses | hanya bind ke loopback / LAN (RFC1918) / Tailscale; IP publik ditolak saat start. HTTPS (rustls) |
| Login | Argon2id + **TOTP wajib** (kode sekali pakai, anti-replay), lockout bertingkat per IP & akun, sesi HttpOnly/Secure/SameSite=Strict, idle 15 mnt, CSRF token + cek Origin |
| Aksi sensitif | install/update/hapus/lockdown meminta **kode 2FA ulang** |
| Pemisahan hak | `mastermind-web` (user `mastermind`, tanpa privilege) → unix socket → `mastermind-helper` (root, **tanpa jaringan**) yang hanya menerima 7 perintah tetap `<verb> <app-id>`; tidak ada shell/path bebas |
| Sandbox app | tiap app: systemd `DynamicUser`, `NoNewPrivileges`, `ProtectSystem=strict`, kapabilitas kosong, `SystemCallFilter`, `MemoryMax/CPUQuota/TasksMax`, akses jaringan keluar ditolak kecuali diizinkan |
| Anti-malware | unduh rilis GitHub → **wajib cocok checksum** → validasi ELF aarch64 + heuristik (miner, reverse shell, botnet) + opsional VirusTotal → **diulang oleh helper**. Terdeteksi ⇒ tidak dipasang, di-uninstall, masuk **blacklist** (id + hash) |
| Blacklist | file milik root; UI hanya **baca**. Hapus hanya: `sudo mastermind admin blacklist-remove <id>` lewat SSH |
| Integritas | hash binary terpasang dicek berkala; berubah ⇒ app dihentikan + notifikasi |
| Audit | log berantai-hash (tamper-evident), terlihat di UI & `mastermind admin audit-verify` |
| Memori | watchdog: RAM tersisa < `min_free_mem_mb` ⇒ app berprioritas terendah dihentikan (prioritas ≤10 tidak pernah) |

## Aturan per aplikasi: `<id>.batasan.toml`
Letakkan di root repo aplikasi (lihat [examples/](examples)). Mastermind menemukan repo otomatis
(`github_owner`), memvalidasi, dan menampilkannya di **Katalog**; install tetap butuh klik + 2FA Anda.
Rilis harus memuat aset arm64 **dan** `checksums.txt` (`sha256sum`). Validasi: `mastermind validate x.batasan.toml`.

## Pasang (DietPi, arm64)
```sh
sudo sh deploy/install.sh ./mastermind-linux-arm64     # unduh dari GitHub Actions/Releases
sudo nano /etc/mastermind/config.toml                  # bind (IP Tailscale/LAN), notifikasi
sudo mastermind admin init <user>                      # password + secret TOTP (scan ke Authenticator)
sudo systemctl enable --now mastermind-helper mastermind-web
```
Buka `https://<ip>:8443` → "Install ke layar utama" (PWA).

## Notifikasi
ntfy, Telegram, email SMTP (`mastermind notify-test`). WhatsApp: belum; hanya lewat Cloud API resmi Meta (rencana).

## Pengembangan
`cargo test` (31 tes) · `cargo clippy -- -D warnings` · rilis: `cargo zigbuild --release --target aarch64-unknown-linux-musl`.
Font piksel: Press Start 2P (OFL). Ikon: `python3 scripts/gen_icons.py`.
