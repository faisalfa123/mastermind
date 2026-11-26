# Changelog

Semua perubahan penting pada **Mastermind** dicatat di file ini.

## Sistem Versi (`A.B.CC`)
- **`A` (Stable / Main Release)**: Rilis stabil yang sudah teruji penuh.
- **`B` (Beta / Unstable Release)**: Rilis dengan penambahan fitur baru lebih banyak daripada perbaikan bug (`-beta`).
- **`CC` (Canary / Nightly Release)**: Rilis perbaikan bug cepat (`01`, `02`, ..., `-canary`).

---

## [0.2.05-canary] - 2026-11-26
### Fixed
- **Keamanan Input Password (`web/app.js`)**: Mengganti `prompt()` bawaan browser pada konfigurasi aplikasi dengan modal in-app (`ask(..., true)` / `<dialog id="dlg">`) agar input password tetap terlindungi di dalam aplikasi.
- **Tipografi, Kontras, & Kebersihan UI (`web/style.css`)**: Meningkatkan ukuran font minimum agar terbaca di layar DPI tinggi, memperbaiki kontras teks error (`.err`), dan mengganti border samping pada `.lock` dengan full border & tint yang bersih.

## [0.2.04-canary] - 2026-11-26
### Fixed
- **Sandbox (`src/systemd.rs`)**: Menambahkan `HOME=/var/lib/mastermind/{id}` dan `XDG_CACHE_HOME=/var/lib/mastermind/{id}/.cache` agar binary sandbox seperti `yt-dlp` (Senandung) dapat berjalan dan menulis cache tanpa gagal.
- **Loading & Login UX (`web/index.html`, `web/app.js`, `web/style.css`)**:
  - Lazy-load seluruh skrip 3D Office World (`three.min.js`, `OrbitControls.js`, `officeWorld.js`, `workers/*`) hanya saat tab Kantor 3D dibuka, mempercepat loading setelah login.
  - Menyembunyikan header, navigasi tab, dan footer saat berada di halaman login (`body.is-login`), lalu menampilkannya dengan animasi halus setelah login berhasil.
  - Menambahkan indikator error visual (`.input-error` + shake) dan pesan error jelas pada form login.
- **UI Theme (`web/style.css`)**: Memperbarui palet warna ke tema **minimalist, modern, & clean** untuk mode siang dan malam.
- **CI/CD (`.github/workflows/ci.yml`)**: Mengaktifkan `generate_release_notes: true` pada GitHub Release.
