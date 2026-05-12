#!/usr/bin/env bash
set -euo pipefail

CADDYFILE_SRC="./Caddyfile"
CADDYFILE_DST="/etc/caddy/Caddyfile"
DOMAIN="${1:-}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <your-domain.com>"
  echo ""
  echo "Example: $0 monitor.example.com"
  exit 1
fi

if ! command -v caddy &>/dev/null; then
  echo "==> Installing Caddy..."
  sudo apt-get update && sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update && sudo apt-get install -y caddy
fi

echo "==> Configuring Caddy for $DOMAIN..."
sed "s/monitor\.yourdomain\.com/$DOMAIN/g" "$CADDYFILE_SRC" | sudo tee "$CADDYFILE_DST" > /dev/null

echo "==> Restarting Caddy..."
sudo systemctl restart caddy

echo ""
echo "Done! Your dashboard is now served at https://$DOMAIN"
echo ""
echo "Make sure your DNS A record for $DOMAIN points to this server."
