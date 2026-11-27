#!/bin/sh
set -eu

echo "===================================================="
echo "       🧠 MASTERMIND UNINSTALLER (DietPi/Debian)"
echo "===================================================="

if [ "$(id -u)" -ne 0 ]; then
  echo "Harap jalankan sebagai root: sudo sh uninstall.sh"
  exit 1
fi

echo "==> 1. Menghentikan dan menonaktifkan service Mastermind..."
systemctl stop mastermind-web mastermind-helper 2>/dev/null || true
systemctl disable mastermind-web mastermind-helper 2>/dev/null || true
rm -f /etc/systemd/system/mastermind-web.service /etc/systemd/system/mastermind-helper.service
systemctl daemon-reload

echo "==> 2. Menghapus binary /usr/local/bin/mastermind..."
rm -f /usr/local/bin/mastermind

printf "Hapus juga data & konfigurasi (/etc/mastermind & /var/lib/mastermind)? [y/N]: "
read -r ans || ans="n"
case "$ans" in
  [yY]|[yY][eE][sS])
    rm -rf /etc/mastermind /var/lib/mastermind /var/lib/mastermind-locked /run/mastermind
    echo "✓ Data dan konfigurasi dihapus."
    ;;
  *)
    echo "✓ Data dan konfigurasi dipertahankan."
    ;;
esac

echo "✓ Mastermind berhasil dicopot."
