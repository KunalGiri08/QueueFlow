#!/usr/bin/env bash
# ==============================================================================
# QueueFlow Production Deployment Script
#
# Usage:
#   sudo /usr/local/bin/queueflow-deploy <target_commit_sha>
#   or: sudo /home/ubuntu/queueflow-deploy/scripts/deploy.sh <target_commit_sha>
#
# Requirements & Invariants:
#   1. Acquires a deployment lock to prevent overlapping executions.
#   2. Validates target commit SHA format (40-character hex string).
#   3. Captures existing container name and running image tag for rollback.
#   4. Checks out exact commit SHA in the deployment repository.
#   5. Runs Prisma 7 migrations safely using server environment (/root/queueflow.env).
#   6. Aborts immediately if migrations fail without touching the running container.
#   7. Pulls the exact GHCR SHA-tagged image.
#   8. Recreates the application container with the new image tag.
#   9. Verifies application readiness (/api/health?probe=ready) with bounded retries.
#  10. On failure, explicitly rolls back to the previous image tag and verifies health.
# ==============================================================================

set -euo pipefail

# 1. Deployment Lock to prevent overlapping runs
LOCK_FILE="/var/lock/queueflow-deploy.lock"
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "[Deploy] [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ERROR: Another deployment is currently in progress. Aborting." >&2
  exit 1
fi

echo "[Deploy] [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting QueueFlow production deployment..."

# 2. Target SHA Validation
TARGET_SHA="${1:-}"
if [ -z "$TARGET_SHA" ]; then
  echo "[Deploy] ERROR: Target commit SHA argument is required." >&2
  echo "Usage: $0 <target_commit_sha>" >&2
  exit 1
fi

if ! [[ "$TARGET_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "[Deploy] ERROR: Target commit SHA must be a valid 40-character hexadecimal string. Received: $TARGET_SHA" >&2
  exit 1
fi

# 3. Environment & Directory Setup
APP_DIR="${QUEUEFLOW_DIR:-/home/ubuntu/queueflow-deploy}"
if [ ! -d "$APP_DIR" ]; then
  echo "[Deploy] ERROR: Application directory not found at $APP_DIR" >&2
  exit 1
fi

cd "$APP_DIR" || exit 1

# 4. Source Production Server Environment Safely
if [ -f "/root/queueflow.env" ]; then
  echo "[Deploy] Sourcing environment from /root/queueflow.env"
  export QUEUEFLOW_ENV_FILE="/root/queueflow.env"
  set -a
  # shellcheck disable=SC1091
  source /root/queueflow.env
  set +a
elif [ -f "$APP_DIR/.env" ]; then
  echo "[Deploy] Sourcing environment from $APP_DIR/.env"
  export QUEUEFLOW_ENV_FILE="$APP_DIR/.env"
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/.env"
  set +a
else
  echo "[Deploy] WARNING: Neither /root/queueflow.env nor $APP_DIR/.env found. Relying on existing environment."
  export QUEUEFLOW_ENV_FILE="${QUEUEFLOW_ENV_FILE:-/root/queueflow.env}"
fi

# 5. Dynamically Capture Currently Running Image Tag
PREVIOUS_IMAGE=""
CONTAINER_NAME="queueflow-app"
CURRENT_CONTAINER_ID=$(docker ps -q -f "name=$CONTAINER_NAME" | head -n 1 || true)

if [ -n "$CURRENT_CONTAINER_ID" ]; then
  PREVIOUS_IMAGE=$(docker inspect --format='{{.Config.Image}}' "$CURRENT_CONTAINER_ID" 2>/dev/null || echo "")
  echo "[Deploy] Currently running container: $CONTAINER_NAME ($CURRENT_CONTAINER_ID)"
  echo "[Deploy] Captured previous image: ${PREVIOUS_IMAGE:-[none]}"
else
  echo "[Deploy] WARNING: No running container found matching name '$CONTAINER_NAME'."
fi

# 6. Fetch and Checkout Target Git Commit SHA
echo "[Deploy] Checking out target commit SHA in deployment clone: $TARGET_SHA"
git fetch origin main --depth=100 || git fetch origin main
git checkout -f "$TARGET_SHA"

# 6b. Check for Deployment Script Updates (Audit Notice)
# Never automatically overwrite the root-owned runner from the repo; alert operators if they differ.
RUNNER_PATH="/usr/local/bin/queueflow-deploy"
REPO_SCRIPT="$APP_DIR/scripts/deploy.sh"
if [ -f "$RUNNER_PATH" ] && [ -f "$REPO_SCRIPT" ]; then
  if ! cmp -s "$RUNNER_PATH" "$REPO_SCRIPT"; then
    echo "[Deploy] NOTICE: Repository $REPO_SCRIPT has updates compared to $RUNNER_PATH."
    echo "[Deploy] NOTICE: An operator should review and update the runner manually: sudo cp $REPO_SCRIPT $RUNNER_PATH"
  fi
fi

# 7. Apply Database Migrations (Pre-Flight Gate)
echo "[Deploy] Executing Prisma database migrations..."
if ! npx prisma migrate deploy --config prisma7.config.ts; then
  echo "[Deploy] ERROR: Database migration failed. Aborting deployment before container update." >&2
  echo "[Deploy] The running container has NOT been touched." >&2
  exit 1
fi
echo "[Deploy] Database migrations applied successfully."

# 8. Pull Target Image from GHCR
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/kunalgiri08/queueflow}"
TARGET_IMAGE="${IMAGE_REPO}:${TARGET_SHA}"

echo "[Deploy] Pulling target image from GHCR: $TARGET_IMAGE"
if ! docker pull "$TARGET_IMAGE"; then
  echo "[Deploy] ERROR: Failed to pull image $TARGET_IMAGE. Aborting deployment." >&2
  exit 1
fi

# 9. Recreate Container with New Image Tag
echo "[Deploy] Recreating application container with image tag: $TARGET_SHA"
IMAGE_TAG="$TARGET_SHA" QUEUEFLOW_ENV_FILE="${QUEUEFLOW_ENV_FILE:-/root/queueflow.env}" docker compose -f "$APP_DIR/docker-compose.yml" up -d --no-build app

# 10. Verify Application Readiness Probe
READINESS_URL="http://127.0.0.1:3000/api/health?probe=ready"
MAX_ATTEMPTS=20
SLEEP_SECS=3
HEALTHY=false

echo "[Deploy] Polling application readiness at $READINESS_URL..."
for i in $(seq 1 $MAX_ATTEMPTS); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$READINESS_URL" || true)
  if [ "$STATUS" = "200" ]; then
    echo "[Deploy] Readiness probe passed on attempt $i (HTTP 200)."
    HEALTHY=true
    break
  fi
  echo "[Deploy] Attempt $i/$MAX_ATTEMPTS: status=$STATUS. Retrying in ${SLEEP_SECS}s..."
  sleep "$SLEEP_SECS"
done

# 11. Rollback on Failure
if [ "$HEALTHY" = "false" ]; then
  echo "[Deploy] ERROR: Application readiness probe failed after $((MAX_ATTEMPTS * SLEEP_SECS))s." >&2
  echo "[Deploy] Container logs (last 50 lines):" >&2
  QUEUEFLOW_ENV_FILE="${QUEUEFLOW_ENV_FILE:-/root/queueflow.env}" docker compose -f "$APP_DIR/docker-compose.yml" logs --tail=50 app >&2 || true

  if [ -n "$PREVIOUS_IMAGE" ]; then
    echo "[Deploy] INITIATING AUTOMATIC ROLLBACK to: $PREVIOUS_IMAGE"
    PREV_TAG="${PREVIOUS_IMAGE##*:}"

    if [ -z "$PREV_TAG" ] || [ "$PREV_TAG" = "$TARGET_SHA" ]; then
      echo "[Deploy] ERROR: Cannot rollback: previous image tag ('$PREV_TAG') is invalid or matches target SHA ($TARGET_SHA)." >&2
      exit 1
    fi

    echo "[Deploy] Restoring application container with previous image tag: $PREV_TAG"
    IMAGE_TAG="$PREV_TAG" QUEUEFLOW_ENV_FILE="${QUEUEFLOW_ENV_FILE:-/root/queueflow.env}" docker compose -f "$APP_DIR/docker-compose.yml" up -d --no-build app

    echo "[Deploy] Verifying rollback container readiness at $READINESS_URL..."
    ROLLBACK_HEALTHY=false
    for j in $(seq 1 10); do
      R_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$READINESS_URL" || true)
      if [ "$R_STATUS" = "200" ]; then
        echo "[Deploy] Rollback container readiness probe passed on attempt $j (HTTP 200)."
        ROLLBACK_HEALTHY=true
        break
      fi
      echo "[Deploy] Rollback probe attempt $j/10: status=$R_STATUS. Retrying in 3s..."
      sleep 3
    done

    if [ "$ROLLBACK_HEALTHY" = "false" ]; then
      echo "[Deploy] CRITICAL: Rollback container also failed readiness check." >&2
    else
      echo "[Deploy] Rollback successful: Service restored on previous version ($PREV_TAG)."
    fi
  else
    echo "[Deploy] WARNING: Cannot rollback because no previous image was captured." >&2
  fi

  exit 1
fi

echo "[Deploy] [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] QueueFlow deployment completed successfully for commit: $TARGET_SHA"

