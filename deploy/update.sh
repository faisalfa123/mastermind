#!/bin/sh
# ==============================================================================
#  🧠 Mastermind Updater Script
#  Aman memperbarui binary Mastermind tanpa error "text file busy" (curl 23)
# ==============================================================================
set -eu

REPO="faisalfa123/mastermind"
TMP_BIN="/tmp/mastermind-update"
TARGET_BIN="/usr/local/bin/mastermind"

if [ "$(id -u)" -ne 0 ]; then
    echo "✗ Skrip ini harus dijalankan dengan hak akses root: sudo sh deploy/update.sh" >&2
    exit 1
fi

echo "==> 1. Menghentikan service Mastermind..."
systemctl stop mastermind-web mastermind-helper 2>/dev/null || true

echo "==> 2. Mengunduh binary arm64 rilis terbaru dari GitHub ($REPO)..."
curl -fsSL "https://github.com/$REPO/releases/latest/download/mastermind-linux-arm64" -o "$TMP_BIN"
chmod +x "$TMP_BIN"

echo "==> 3. Memasang binary baru ke $TARGET_BIN..."
install -m 0755 "$TMP_BIN" "$TARGET_BIN"
rm -f "$TMP_BIN"

echo "==> 4. Menjalankan kembali service Mastermind..."
systemctl daemon-reload
systemctl start mastermind-helper mastermind-web

echo "==> 5. Memeriksa status service..."
sleep 1
if systemctl is-active --quiet mastermind-web; then
    echo "✓ Mastermind berhasil diperbarui dan aktif!"
else
    echo "⚠ Periksa status service dengan: sudo systemctl status mastermind-web"
fi
