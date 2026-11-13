#!/usr/bin/env bash
# ==============================================================================
# QueueFlow SSH Forced-Command Wrapper
# Target Path on EC2: /usr/local/sbin/queueflow-ssh-command
# Ownership: root:root (mode 0755)
#
# Purpose:
# Enforces defense-in-depth on SSH connections for the 'deploy' user.
# In /home/deploy/.ssh/authorized_keys:
#   restrict,command="/usr/local/sbin/queueflow-ssh-command" ssh-ed25519 ...
#
# Security Properties:
# - Inspects SSH_ORIGINAL_COMMAND passed by sshd.
# - Accepts ONLY the exact approved deployment command with a single 40-character hex SHA.
# - Rejects all interactive logins, arbitrary commands, extra arguments, and metacharacters.
# - Invokes exclusively: exec sudo /usr/local/bin/queueflow-deploy "$SHA"
# - Never uses eval or dynamic shell execution.
# ==============================================================================

set -euo pipefail

ORIG_CMD="${SSH_ORIGINAL_COMMAND:-}"

# Check for empty command (e.g., interactive SSH session attempt)
if [ -z "$ORIG_CMD" ]; then
  echo "[SSH-Security] ERROR: Interactive shell sessions are not permitted." >&2
  exit 1
fi

# Reject any commands containing shell metacharacters before pattern matching
# Characters rejected: ; & | ` $ ( ) { } < > newline carriage-return
ILLEGAL_CHARS='[;&|`$(){}<>\\'$'\n'$'\r]'
if [[ "$ORIG_CMD" =~ $ILLEGAL_CHARS ]]; then
  echo "[SSH-Security] ERROR: Rejected command containing illegal characters." >&2
  exit 1
fi

# Strictly match the approved deployment invocation:
# Allows:
#   "sudo /usr/local/bin/queueflow-deploy <40-char-hex>"
#   "/usr/local/bin/queueflow-deploy <40-char-hex>"
#   "queueflow-deploy <40-char-hex>"
DEPLOY_REGEX='^(sudo[[:space:]]+)?(/usr/local/bin/)?queueflow-deploy[[:space:]]+([0-9a-fA-F]{40})$'

if [[ "$ORIG_CMD" =~ $DEPLOY_REGEX ]]; then
  SHA="${BASH_REMATCH[3]}"
  # Canonical execution via sudo to root deployment runner
  exec sudo /usr/local/bin/queueflow-deploy "$SHA"
else
  echo "[SSH-Security] ERROR: Command rejected. Unauthorized or malformed deployment request." >&2
  exit 1
fi

