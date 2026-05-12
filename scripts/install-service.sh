#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/page-monitor"
APP_USER="page-monitor"
SERVICE_NAME="page-monitor"

echo "==> Creating system user (if needed)..."
id -u $APP_USER &>/dev/null || sudo useradd --system --no-create-home --shell /usr/sbin/nologin $APP_USER

echo "==> Creating directories..."
sudo mkdir -p $APP_DIR /var/log/$SERVICE_NAME /var/run
sudo chown $APP_USER:$APP_USER /var/log/$SERVICE_NAME

echo "==> Copying application files..."
sudo cp -r ./ "$APP_DIR/"
sudo chown -R $APP_USER:$APP_USER $APP_DIR

echo "==> Installing systemd service..."
sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<'SERVICEEOF'
[Unit]
Description=Page Monitor Dashboard
After=network.target

[Service]
Type=exec
User=page-monitor
WorkingDirectory=/opt/page-monitor
ExecStart=/usr/bin/node /opt/page-monitor/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=NEXT_TELEMETRY_DISABLED=1
StandardOutput=append:/var/log/page-monitor/out.log
StandardError=append:/var/log/page-monitor/error.log

[Install]
WantedBy=multi-user.target
SERVICEEOF

echo "==> Reloading systemd and enabling service..."
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl start $SERVICE_NAME

echo "==> Service status:"
sudo systemctl status $SERVICE_NAME --no-pager

echo ""
echo "Done! The service is running at http://localhost:3001"
echo "Place a reverse proxy (Caddy/Nginx) in front for SSL."
echo ""
echo "Useful commands:"
echo "  sudo systemctl status $SERVICE_NAME"
echo "  sudo systemctl restart $SERVICE_NAME"
echo "  sudo journalctl -u $SERVICE_NAME -f"
