#!/bin/bash
# EC2 user data for Amazon Linux 2023: installs Docker and the Compose plugin
# and clones Opencom to /opt/opencom. Then add /opt/opencom/.env and run
#   cd /opt/opencom && OPENCOM_DOMAIN=chat.example.com docker compose up -d --build
set -euxo pipefail

dnf install -y docker git
systemctl enable --now docker
usermod -aG docker ec2-user

arch=$(uname -m)
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/v2.39.4/docker-compose-linux-${arch}" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
curl -fsSL "https://github.com/docker/buildx/releases/download/v0.29.1/buildx-v0.29.1.linux-$([ "$arch" = aarch64 ] && echo arm64 || echo amd64)" \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx

git clone https://github.com/yapsgg/opencom /opt/opencom
chown -R ec2-user:ec2-user /opt/opencom
