#!/bin/sh
# Installer satu baris:
# curl -fsSL https://raw.githubusercontent.com/faisalfa123/mastermind/main/deploy/install-tui.sh -o /tmp/install-tui.sh && sudo sh /tmp/install-tui.sh
set -eu

REPO="faisalfa123/mastermind"
TMP_DIR="$(mktemp -d /tmp/mm-quick.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

printf "\033[1;36m🧠 Mengunduh Mastermind Installer...\033[0m\n"
curl -fsSL "https://raw.githubusercontent.com/$REPO/main/deploy/install.sh" -o "$TMP_DIR/install.sh"
chmod +x "$TMP_DIR/install.sh"

# Sambungkan kembali stdin ke /dev/tty agar TUI dialog/whiptail menerima input keyboard saat di-pipe dari curl
if [ -t 0 ]; then
    sh "$TMP_DIR/install.sh"
elif [ -e /dev/tty ]; then
    sh "$TMP_DIR/install.sh" < /dev/tty
else
    sh "$TMP_DIR/install.sh"
fi
