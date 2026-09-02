#!/usr/bin/env bash
# One-shot setup for a fresh Debian/Ubuntu VM (tested target: GCP e2-micro, Debian 12).
# Run as a user with sudo:  bash setup-gcp.sh <git repo url>
set -euo pipefail

REPO_URL="${1:-https://github.com/bataevvlad/prop-crawler.git}"
APP_DIR=/opt/prop-crawler

echo "== installing Node.js 22 LTS"
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl git gnupg
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
node -v && npm -v

echo "== creating service user and app dir"
id -u crawler >/dev/null 2>&1 || sudo useradd --system --create-home --shell /usr/sbin/nologin crawler
if [ ! -d "$APP_DIR/.git" ]; then
  sudo git clone "$REPO_URL" "$APP_DIR"
else
  sudo git -C "$APP_DIR" pull --ff-only
fi
sudo chown -R crawler:crawler "$APP_DIR"

echo "== installing dependencies"
sudo -u crawler bash -c "cd $APP_DIR && npm ci"

if [ ! -f "$APP_DIR/.env" ]; then
  sudo cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  sudo chown crawler:crawler "$APP_DIR/.env"
  sudo chmod 600 "$APP_DIR/.env"
  echo
  echo "!! $APP_DIR/.env created from template. Fill in URLs, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID:"
  echo "   sudo nano $APP_DIR/.env"
fi

echo "== installing systemd service"
sudo cp "$APP_DIR/deploy/crawler.service" /etc/systemd/system/crawler.service
sudo systemctl daemon-reload
sudo systemctl enable crawler

echo
echo "Done. Start with:   sudo systemctl start crawler"
echo "Logs:               journalctl -u crawler -f    or    tail -f $APP_DIR/launchd.log"
echo "Update code:        sudo git -C $APP_DIR pull && sudo -u crawler npm --prefix $APP_DIR ci && sudo systemctl restart crawler"
