#!/bin/sh
# ==============================================================================
#  🧠 Mastermind TUI Installer
#  Ultra-Lightweight App Manager for Odroid C2 / STB HG680P (DietPi / Debian)
# ==============================================================================
set -eu

REPO="faisalfa123/mastermind"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/mastermind"
DATA_DIR="/var/lib/mastermind"
LOCKED_DIR="/var/lib/mastermind-locked"
APPS_DIR="/opt/mastermind/apps"
SYSTEMD_DIR="/etc/systemd/system"

# ------------------------------------------------------------------------------
# Colors & Helpers
# ------------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

msg_info() { printf "${CYAN}ℹ %s${NC}\n" "$1"; }
msg_ok()   { printf "${GREEN}✓ %s${NC}\n" "$1"; }
msg_warn() { printf "${YELLOW}⚠ %s${NC}\n" "$1"; }
msg_err()  { printf "${RED}✗ %s${NC}\n" "$1" >&2; }

# ------------------------------------------------------------------------------
# Pre-flight Checks
# ------------------------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
    msg_err "Installer ini harus dijalankan sebagai root (gunakan sudo sh install.sh)."
    exit 1
fi

# ------------------------------------------------------------------------------
# UI Engine: Whiptail / Dialog / Text Fallback
# ------------------------------------------------------------------------------
HAS_WHIP=0
if command -v whiptail >/dev/null 2>&1; then
    HAS_WHIP=1
    TUI="whiptail"
elif command -v dialog >/dev/null 2>&1; then
    HAS_WHIP=1
    TUI="dialog"
fi

tui_msg() {
    title="$1"
    text="$2"
    if [ "$HAS_WHIP" -eq 1 ]; then
        "$TUI" --title "$title" --msgbox "$text" 12 65
    else
        printf "\n${BOLD}=== %s ===${NC}\n%s\n\nTekan Enter untuk lanjut..." "$title" "$text"
        read -r _
    fi
}

tui_yesno() {
    title="$1"
    prompt="$2"
    if [ "$HAS_WHIP" -eq 1 ]; then
        if "$TUI" --title "$title" --yesno "$prompt" 10 65; then
            return 0
        else
            return 1
        fi
    else
        printf "${BOLD}%s (y/n) [y]: ${NC}" "$prompt"
        read -r res
        case "${res:-y}" in
            [yY]*) return 0 ;;
            *) return 1 ;;
        esac
    fi
}

# ------------------------------------------------------------------------------
# Banner Sambutan
# ------------------------------------------------------------------------------
clear 2>/dev/null || true
printf "${CYAN}================================================================${NC}\n"
printf "${YELLOW}${BOLD}   🧠 MASTERMIND INSTALLER & SETUP WIZARD (TUI)${NC}\n"
printf "${CYAN}   Ultra-Lightweight App Manager for Odroid C2 / STB HG680P${NC}\n"
printf "${CYAN}================================================================${NC}\n\n"

tui_msg "Mastermind Installer" "Selamat datang di installer Mastermind!\n\nMastermind adalah App Manager native ultra-ringan (Rust) khusus untuk Odroid C2 / STB HG680P (DietPi/Debian).\n\nWizard ini akan memandu Anda memasang binary, mengonfigurasi IP bind, akun admin 2FA, dan notifikasi email Gmail."

# ------------------------------------------------------------------------------
# 1. Lokasi Binary
# ------------------------------------------------------------------------------
BIN_FILE=""
if [ -n "${1:-}" ] && [ -f "$1" ]; then
    BIN_FILE="$1"
    msg_info "Menggunakan binary dari argumen: $BIN_FILE"
elif [ -f "./mastermind-linux-arm64" ]; then
    BIN_FILE="./mastermind-linux-arm64"
    msg_info "Menggunakan binary lokal ./mastermind-linux-arm64"
elif [ -f "./target/release/mastermind" ]; then
    BIN_FILE="./target/release/mastermind"
    msg_info "Menggunakan binary lokal ./target/release/mastermind"
fi

if [ -z "$BIN_FILE" ]; then
    msg_info "Mengunduh rilis binary Mastermind dari GitHub ($REPO)..."
    TMP_DIR="$(mktemp -d /tmp/mm-install.XXXXXX)"
    trap 'rm -rf "$TMP_DIR"' EXIT INT TERM
    DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/mastermind-linux-arm64"
    if curl -fsSL "$DOWNLOAD_URL" -o "$TMP_DIR/mastermind"; then
        chmod +x "$TMP_DIR/mastermind"
        BIN_FILE="$TMP_DIR/mastermind"
    else
        msg_err "Gagal mengunduh $DOWNLOAD_URL."
        msg_err "Silakan letakkan binary mastermind-linux-arm64 di direktori saat ini atau jalankan: sh install.sh <path-to-binary>"
        exit 1
    fi
fi

# ------------------------------------------------------------------------------
# 2. Setup System User, Directories, & Binary
# ------------------------------------------------------------------------------
msg_info "Membuat user sistem 'mastermind' dan direktori..."
if ! id mastermind >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin mastermind
    msg_ok "User 'mastermind' berhasil dibuat."
fi

install -d -m 0755 "$INSTALL_DIR"
install -m 0755 "$BIN_FILE" "$INSTALL_DIR/mastermind"
msg_ok "Binary terpasang di $INSTALL_DIR/mastermind"

install -d -m 0750 -o root -g mastermind "$CONFIG_DIR" "$CONFIG_DIR/tls"
install -d -m 0750 -o mastermind -g mastermind "$DATA_DIR"
install -d -m 0755 -o root -g root "$LOCKED_DIR" /opt/mastermind "$APPS_DIR"
msg_ok "Direktori data dan blacklist siap."

# ------------------------------------------------------------------------------
# 3. Setup Systemd Unit Services
# ------------------------------------------------------------------------------
msg_info "Memasang service systemd..."
HELPER_SVC="$SYSTEMD_DIR/mastermind-helper.service"
WEB_SVC="$SYSTEMD_DIR/mastermind-web.service"

cat > "$HELPER_SVC" <<'END_HELPER'
[Unit]
Description=Mastermind privileged helper (closed command set, no network)
After=local-fs.target

[Service]
ExecStart=/usr/local/bin/mastermind helper
Environment=MASTERMIND_CONFIG=/etc/mastermind/config.toml
User=root
Group=mastermind
UMask=0007
RuntimeDirectory=mastermind
RuntimeDirectoryMode=0770
Restart=always
PrivateNetwork=yes
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_UNIX
MemoryMax=32M

[Install]
WantedBy=multi-user.target
END_HELPER

cat > "$WEB_SVC" <<'END_WEB'
[Unit]
Description=Mastermind web UI
After=network-online.target mastermind-helper.service
Wants=network-online.target
Requires=mastermind-helper.service

[Service]
ExecStart=/usr/local/bin/mastermind serve
Environment=MASTERMIND_CONFIG=/etc/mastermind/config.toml
User=mastermind
Group=mastermind
Restart=always
RestartSec=3
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ReadWritePaths=/var/lib/mastermind
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
CapabilityBoundingSet=
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @resources
MemoryMax=48M

[Install]
WantedBy=multi-user.target
END_WEB

if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload 2>/dev/null || true
    msg_ok "Systemd units berhasil dipasang."
fi

# ------------------------------------------------------------------------------
# 4. Jalankan TUI Setup Wizard (IP, Admin, Gmail)
# ------------------------------------------------------------------------------
printf "\n"
msg_info "Memulai Setup Wizard Mastermind interaktif..."
"$INSTALL_DIR/mastermind" setup

# ------------------------------------------------------------------------------
# 5. Aktifkan Service Systemd
# ------------------------------------------------------------------------------
if command -v systemctl >/dev/null 2>&1; then
    if tui_yesno "Aktifkan Service Sekarang?" "Apakah Anda ingin mengaktifkan dan menjalankan Mastermind sekarang?\n(systemctl enable --now mastermind-helper mastermind-web)"; then
        msg_info "Menjalankan service Mastermind..."
        systemctl enable --now mastermind-helper mastermind-web 2>/dev/null || true
        sleep 2
        if systemctl is-active --quiet mastermind-web 2>/dev/null; then
            msg_ok "Mastermind Web Server AKTIF & BERJALAN!"
        else
            msg_warn "Service dimulai. Cek status dengan: systemctl status mastermind-web"
        fi
    fi
fi

printf "\n${GREEN}${BOLD}🎉 Pemasangan Selesai!${NC}\n"
