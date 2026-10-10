#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu or Debian server. Run as root:
#   bash server-setup.sh "ssh-ed25519 AAAA... github-actions-deploy"
# The argument is the PUBLIC half of the key GitHub Actions deploys with.
set -euo pipefail

PUBKEY="${1:?Pass the deploy public key as the first argument}"
APP_DIR=/opt/felixlabs
DEPLOY_USER=deploy

apt-get update -qq
apt-get install -y -qq rsync curl ca-certificates
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
# The docker group can control every container on this machine; keep the deploy key private.
usermod -aG docker "$DEPLOY_USER"

SSH_DIR="/home/$DEPLOY_USER/.ssh"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SSH_DIR"
touch "$SSH_DIR/authorized_keys"
grep -qxF "$PUBKEY" "$SSH_DIR/authorized_keys" || echo "$PUBKEY" >> "$SSH_DIR/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$SSH_DIR/authorized_keys"
chmod 600 "$SSH_DIR/authorized_keys"

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/site"

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443
fi

cat <<EOF

Server is ready. Next:
  1. Create $APP_DIR/.env from deploy/.env.example (domain, your email, SMTP login):
       nano $APP_DIR/.env
       chown $DEPLOY_USER:$DEPLOY_USER $APP_DIR/.env
       chmod 600 $APP_DIR/.env
  2. Add the GitHub secrets and run the "Deploy site" workflow (or push to main).
EOF
