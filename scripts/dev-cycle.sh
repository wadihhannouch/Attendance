#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
SERVICE="${DOCKER_SERVICE:-backend}"
NPM_CMD="${NPM_CMD:-npm run dev}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-90}"
RETRY_DELAY_SECONDS="${RETRY_DELAY_SECONDS:-3}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

ensure_tools() {
  command -v docker >/dev/null 2>&1 || {
    echo "docker is required but not found in PATH"
    exit 1
  }

  command -v npm >/dev/null 2>&1 || {
    echo "npm is required but not found in PATH"
    exit 1
  }
}

wait_for_service() {
  local container_id
  local start_time
  local now
  local elapsed
  local state
  local health_log

  container_id="$(docker compose -f "$COMPOSE_FILE" ps -q "$SERVICE")"
  if [[ -z "$container_id" ]]; then
    log "Service '$SERVICE' container not found in compose file '$COMPOSE_FILE'."
    return 1
  fi

  start_time="$(date +%s)"
  while true; do
    state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || echo missing)"

    if [[ "$state" == "healthy" || "$state" == "running" ]]; then
      log "Service '$SERVICE' is $state."
      return 0
    fi

    if [[ "$state" == "unhealthy" ]]; then
      log "Service '$SERVICE' is unhealthy. Last healthcheck output:"
      health_log="$(docker inspect --format '{{range .State.Health.Log}}{{println .Output}}{{end}}' "$container_id" 2>/dev/null | tail -n 5 || true)"
      if [[ -n "$health_log" ]]; then
        echo "$health_log"
      fi
      log "Recent service logs:"
      docker compose -f "$COMPOSE_FILE" logs --tail=20 "$SERVICE" || true
      return 1
    fi

    now="$(date +%s)"
    elapsed="$((now - start_time))"
    if (( elapsed >= HEALTH_TIMEOUT_SECONDS )); then
      log "Timed out waiting for service '$SERVICE' (last state: $state)."
      return 1
    fi

    log "Waiting for service '$SERVICE' status... current: $state"
    sleep 2
  done
}

run_cycle() {
  local exit_code

  while true; do
    log "Starting cycle: docker compose up for service '$SERVICE'."
    if ! docker compose -f "$COMPOSE_FILE" up -d "$SERVICE"; then
      log "docker compose up failed. Retrying in ${RETRY_DELAY_SECONDS}s."
      sleep "$RETRY_DELAY_SECONDS"
      continue
    fi

    if ! wait_for_service; then
      log "Service check failed. Retrying in ${RETRY_DELAY_SECONDS}s."
      sleep "$RETRY_DELAY_SECONDS"
      continue
    fi

    log "Running npm command: $NPM_CMD"
    set +e
    eval "$NPM_CMD"
    exit_code=$?
    set -e

    log "npm command exited with code $exit_code. Restarting cycle in ${RETRY_DELAY_SECONDS}s."
    sleep "$RETRY_DELAY_SECONDS"
  done
}

ensure_tools
run_cycle
