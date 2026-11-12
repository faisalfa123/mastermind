#!/bin/sh
# Installer satu baris: curl -fsSL https://raw.githubusercontent.com/faisalfa123/mastermind/main/deploy/install-tui.sh | sudo sh
set -eu
REPO="faisalfa123/mastermind"
TMP_DIR="$(mktemp -d /tmp/mm-quick.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

printf "\033[1;36m🧠 Mengunduh Mastermind Installer...\033[0m\n"
curl -fsSL "https://raw.githubusercontent.com/$REPO/main/deploy/install.sh" -o "$TMP_DIR/install.sh"
chmod +x "$TMP_DIR/install.sh"
sh "$TMP_DIR/install.sh"
