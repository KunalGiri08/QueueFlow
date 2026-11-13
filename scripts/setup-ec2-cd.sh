#!/usr/bin/env bash
# ==============================================================================
# QueueFlow EC2 Host CD Setup & Verification Script
# Target: AWS EC2 Ubuntu Production Instance (Run once as root)
#
# Requirements & Invariants:
# 1. Non-destructively inspects 'deploy' user (verifies shell /bin/bash, no docker group).
# 2. Inspects existing root binaries (/usr/local/bin/queueflow-deploy and
#    /usr/local/sbin/queueflow-ssh-command) and halts if unexpected files exist.
# 3. Validates sudoers configuration in a temporary file via visudo before atomic install.
# 4. Strictly validates authorized_keys:
#    - Requires exact prefix: restrict,command="/usr/local/sbin/queueflow-ssh-command"
#    - If same key exists unrestricted or with different options, halts for operator review.
#    - Preserves all unrelated authorized keys.
# ==============================================================================

set -euo pipefail

TARGET_PUBKEY="${1:-}"

if [ -z "$TARGET_PUBKEY" ]; then
  echo "Usage: $0 \"<exact_ssh_public_key_string>\"" >&2
  echo "Example: $0 \"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... deploy@queueflow-cd\"" >&2
  exit 1
fi

# Extract the base64 key material to detect if the key exists in any form
KEY_TYPE=$(echo "$TARGET_PUBKEY" | awk '{print $1}')
KEY_MATERIAL=$(echo "$TARGET_PUBKEY" | awk '{print $2}')

if [ -z "$KEY_MATERIAL" ] || [ -z "$KEY_TYPE" ]; then
  echo "::error::Invalid public key string. Expected format: <key-type> <base64-material> [comment]" >&2
  exit 1
fi

REQUIRED_RESTRICTION='restrict,command="/usr/local/sbin/queueflow-ssh-command"'
EXACT_ENTRY="${REQUIRED_RESTRICTION} ${TARGET_PUBKEY}"

echo "=== 1. Inspecting 'deploy' User Account ==="
if id "deploy" &>/dev/null; then
  CURRENT_SHELL=$(getent passwd deploy | cut -d: -f7)
  CURRENT_GROUPS=$(id -Gn deploy)

  echo "[Notice] User 'deploy' exists (shell: $CURRENT_SHELL, groups: $CURRENT_GROUPS)."

  if [ "$CURRENT_SHELL" != "/bin/bash" ]; then
    echo "::error::[Action Required] User 'deploy' exists with shell '$CURRENT_SHELL' instead of '/bin/bash'." >&2
    echo "::error::sshd requires /bin/bash to execute the forced-command wrapper." >&2
    exit 1
  fi

  if [[ " $CURRENT_GROUPS " =~ [[:space:]]docker[[:space:]] ]]; then
    echo "::error::[Action Required] User 'deploy' belongs to the 'docker' group." >&2
    echo "::error::Direct Docker socket access grants root equivalence. Manual operator review required." >&2
    exit 1
  fi
else
  echo "[Setup] Creating dedicated unprivileged 'deploy' user with /bin/bash shell..."
  useradd -m -s /bin/bash deploy
fi

echo "=== 2. Inspecting and Installing Root-Owned Runner & Wrapper ==="
REPO_DIR="${QUEUEFLOW_DIR:-/root/queueflow}"

RUNNER_SRC="$REPO_DIR/scripts/deploy.sh"
RUNNER_DEST="/usr/local/bin/queueflow-deploy"

WRAPPER_SRC="$REPO_DIR/scripts/ssh-command-wrapper.sh"
WRAPPER_DEST="/usr/local/sbin/queueflow-ssh-command"

if [ ! -f "$RUNNER_SRC" ] || [ ! -f "$WRAPPER_SRC" ]; then
  echo "::error::Source scripts not found in $REPO_DIR/scripts." >&2
  exit 1
fi

# Inspect existing runner
if [ -e "$RUNNER_DEST" ]; then
  if cmp -s "$RUNNER_SRC" "$RUNNER_DEST"; then
    echo "[OK] $RUNNER_DEST matches repository version."
  else
    echo "::error::[Action Required] $RUNNER_DEST exists and differs from repository source." >&2
    echo "::error::To prevent overwriting custom operator changes, manual review is required." >&2
    exit 1
  fi
else
  echo "[Setup] Installing $RUNNER_DEST..."
  install -m 750 -o root -g root "$RUNNER_SRC" "$RUNNER_DEST"
fi

# Inspect existing wrapper
if [ -e "$WRAPPER_DEST" ]; then
  if cmp -s "$WRAPPER_SRC" "$WRAPPER_DEST"; then
    echo "[OK] $WRAPPER_DEST matches repository version."
  else
    echo "::error::[Action Required] $WRAPPER_DEST exists and differs from repository source." >&2
    echo "::error::To prevent overwriting custom operator changes, manual review is required." >&2
    exit 1
  fi
else
  echo "[Setup] Installing $WRAPPER_DEST..."
  install -m 755 -o root -g root "$WRAPPER_SRC" "$WRAPPER_DEST"
fi

echo "=== 3. Sudoers Configuration with visudo Pre-Validation ==="
SUDOERS_DEST="/etc/sudoers.d/queueflow-deploy"
TMP_SUDOERS=$(mktemp /tmp/queueflow-sudoers.XXXXXX)

cat << 'EOF' > "$TMP_SUDOERS"
# Allow 'deploy' user to execute ONLY the root-owned deployment runner with a 40-char hex commit SHA
deploy ALL=(root) NOPASSWD: /usr/local/bin/queueflow-deploy [0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]
EOF

if ! visudo -cf "$TMP_SUDOERS"; then
  echo "::error::Generated sudoers rule failed visudo syntax validation. Aborting." >&2
  rm -f "$TMP_SUDOERS"
  exit 1
fi

if [ -e "$SUDOERS_DEST" ]; then
  if cmp -s "$TMP_SUDOERS" "$SUDOERS_DEST"; then
    echo "[OK] Existing sudoers rule matches intended configuration."
    rm -f "$TMP_SUDOERS"
  else
    echo "::error::[Action Required] $SUDOERS_DEST exists with a differing configuration." >&2
    echo "::error::Manual operator review required to prevent clobbering custom sudoers rules." >&2
    rm -f "$TMP_SUDOERS"
    exit 1
  fi
else
  echo "[Setup] Installing validated sudoers rule to $SUDOERS_DEST..."
  install -m 440 -o root -g root "$TMP_SUDOERS" "$SUDOERS_DEST"
  rm -f "$TMP_SUDOERS"
fi

echo "=== 4. Validating and Configuring SSH authorized_keys ==="
DEPLOY_HOME=$(getent passwd deploy | cut -d: -f6)
SSH_DIR="$DEPLOY_HOME/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"
touch "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

# Check line by line for existing matches of the public key material
EXACT_RESTRICTED_FOUND=false

while IFS= read -r line || [ -n "$line" ]; do
  # Ignore empty lines and comments
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue

  if [[ "$line" == *"$KEY_MATERIAL"* ]]; then
    if [[ "$line" == "$EXACT_ENTRY" ]]; then
      EXACT_RESTRICTED_FOUND=true
    else
      echo "::error::[CRITICAL SECURITY ALERT] Existing key entry found for this public key, but it lacks the exact required restriction!" >&2
      echo "::error::Found line: '$line'" >&2
      echo "::error::Required line: '$EXACT_ENTRY'" >&2
      echo "::error::An unrestricted or improperly restricted key allows arbitrary command execution. Manual operator review required." >&2
      exit 1
    fi
  fi
done < "$AUTH_KEYS"

if [ "$EXACT_RESTRICTED_FOUND" = "true" ]; then
  echo "[OK] Exact restricted key entry is already configured in $AUTH_KEYS."
else
  # Key material was not found; verify no conflicting different key uses queueflow-ssh-command
  if grep -q "queueflow-ssh-command" "$AUTH_KEYS"; then
    echo "::error::[Action Required] A different key entry referencing 'queueflow-ssh-command' already exists in $AUTH_KEYS." >&2
    echo "::error::To avoid key confusion or multiple deploy keys, manual operator review is required." >&2
    exit 1
  fi

  echo "[Setup] Appending exact restricted deployment key to $AUTH_KEYS..."
  echo "$EXACT_ENTRY" >> "$AUTH_KEYS"
  echo "[OK] Key safely appended."
fi

chown -R deploy:deploy "$SSH_DIR"
echo "=== Host Setup Verification Completed Successfully ==="

