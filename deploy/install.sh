#!/bin/sh
# Installs Mastermind on DietPi/Debian (arm64, systemd). Run as root: sudo sh install.sh ./mastermind-linux-arm64
set -eu
BIN="${1:?usage: install.sh <path-to-mastermind-binary>}"
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"
id mastermind >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin mastermind
install -m 0755 "$BIN" /usr/local/bin/mastermind
install -d -m 0750 -o root -g mastermind /etc/mastermind /etc/mastermind/tls
install -d -m 0750 -o mastermind -g mastermind /var/lib/mastermind
install -d -m 0755 -o root -g root /var/lib/mastermind-locked /opt/mastermind /opt/mastermind/apps
[ -f /etc/mastermind/config.toml ] || install -m 0640 -o root -g mastermind "$DIR/config.example.toml" /etc/mastermind/config.toml
install -m 0644 "$DIR/mastermind-helper.service" "$DIR/mastermind-web.service" /etc/systemd/system/
systemctl daemon-reload
echo
echo "1) edit /etc/mastermind/config.toml (bind, notifications)"
echo "2) sudo mastermind admin init <username>     # sets password + prints TOTP secret"
echo "3) sudo systemctl enable --now mastermind-helper mastermind-web"
