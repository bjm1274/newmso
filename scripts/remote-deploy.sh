#!/usr/bin/env bash
set -e

cd /opt/allerp

echo "[remote] Extracting project archive..."
tar -xzf allerp-deploy.tar.gz
rm -f allerp-deploy.tar.gz

echo "[remote] Ensuring proper permissions..."
sudo chown -R opc:opc /opt/allerp 2>/dev/null || true
sudo chmod -R u+rwX,go+rX /opt/allerp 2>/dev/null || true
mkdir -p /opt/allerp/data /opt/allerp/backups

echo "[remote] Stopping and removing existing containers..."
sudo docker compose down --remove-orphans || true
sudo docker stop allerp-app allerp-nginx 2>/dev/null || true
sudo docker rm -fv allerp-app allerp-nginx 2>/dev/null || true
sudo docker container prune -f || true

echo "[remote] Building and starting Docker container (ARM64 Native)..."
sudo docker compose build allerp-app
sudo docker compose up -d --force-recreate
sudo docker builder prune -f || true

echo "[remote] Current container status:"
sudo docker compose ps

echo "[remote] All done on remote server."
