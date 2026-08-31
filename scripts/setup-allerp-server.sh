#!/usr/bin/env bash
# ============================================================
# scripts/setup-allerp-server.sh
#
# Oracle Cloud AllERP 서버(Oracle Linux 8/9 또는 Ubuntu) 초기 설정 스크립트.
# - Docker Engine & Docker Compose 설치
# - 포트 80, 443, 3000 방화벽 개방
# - /opt/allerp 배포 디렉터리 생성 및 권한 설정
#
# 실행 방법 (서버에서):
#   sudo bash setup-allerp-server.sh
# ============================================================

set -e

echo "===================================================="
echo " Starting AllERP Server Setup (Oracle Cloud / OCI)  "
echo "===================================================="

# 1. OS 감지
if [ -f /etc/oracle-release ] || [ -f /etc/redhat-release ]; then
  OS="ol"
elif [ -f /etc/lsb-release ] || [ -f /etc/debian_version ]; then
  OS="ubuntu"
else
  OS="unknown"
fi

echo "[1/4] Detected OS: $OS"

# 2. Docker & Docker Compose 설치
echo "[2/4] Installing Docker and Docker Compose..."
if [ "$OS" = "ol" ]; then
  sudo dnf config-manager --add-repo=https://download.docker.com/linux/centos/docker-ce.repo || true
  sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin git curl tar
  sudo systemctl enable --now docker
elif [ "$OS" = "ubuntu" ]; then
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg lsb-release git tar
  sudo mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo systemctl enable --now docker
else
  echo "Please install Docker manually on this OS."
fi

# opc 또는 현재 사용자에게 docker 그룹 권한 부여
CURRENT_USER=${SUDO_USER:-$USER}
sudo usermod -aG docker "$CURRENT_USER" || true
echo "Docker installed and user $CURRENT_USER added to docker group."

# 3. 방화벽 포트 개방 (80, 443, 3000)
echo "[3/4] Configuring firewall for ports 80, 443, 3000..."
if command -v firewall-cmd &> /dev/null; then
  sudo firewall-cmd --permanent --add-port=80/tcp || true
  sudo firewall-cmd --permanent --add-port=443/tcp || true
  sudo firewall-cmd --permanent --add-port=3000/tcp || true
  sudo firewall-cmd --reload || true
  echo "Firewalld configured."
elif command -v ufw &> /dev/null; then
  sudo ufw allow 80/tcp || true
  sudo ufw allow 443/tcp || true
  sudo ufw allow 3000/tcp || true
  echo "UFW configured."
elif command -v iptables &> /dev/null; then
  sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT || true
  sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT || true
  sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT || true
  echo "Iptables configured."
fi

# 4. 배포 디렉터리 준비
echo "[4/4] Creating deployment directory /opt/allerp..."
sudo mkdir -p /opt/allerp/data /opt/allerp/backups
sudo chown -R "$CURRENT_USER":"$CURRENT_USER" /opt/allerp

echo "===================================================="
echo " AllERP Server Setup Completed Successfully!        "
echo " Target directory: /opt/allerp                      "
echo " Note: Ensure OCI Security List allows ingress 3000/80/443."
echo "===================================================="
