#!/usr/bin/env bash
set -e

cd /opt/allerp

echo "[remote] Extracting project archive..."
tar -xzf allerp-deploy.tar.gz
rm -f allerp-deploy.tar.gz

echo "[remote] Ensuring proper permissions..."
chmod -R u+rwX,go+rX /opt/allerp
mkdir -p /opt/allerp/data /opt/allerp/backups

echo "[remote] Stopping existing containers if any..."
sudo docker compose down --remove-orphans || true
sudo docker rm -f allerp-app allerp-nginx 2>/dev/null || true

echo "[remote] Building and starting Docker container (ARM64 Native)..."
sudo docker compose build --no-cache allerp-app
sudo docker compose up -d
sudo docker builder prune -f || true

echo "[remote] Current container status:"
sudo docker compose ps

echo "[remote] All done on remote server."
