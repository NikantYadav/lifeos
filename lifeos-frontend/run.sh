#!/usr/bin/env bash
# Boots Waydroid (or targets an already-connected device/emulator) and runs
# the Expo dev client against it. Env vars (EXPO_PUBLIC_*) are loaded by Expo
# itself from .env.local — nothing to inject here, unlike a Flutter
# --dart-define setup.
#
# Usage:
#   ./run.sh                        # boot Waydroid at 400x800 (default), expo start --dev-client
#   ./run.sh -w 1080 -h 2400        # boot Waydroid at a specific resolution
#   ./run.sh -d emulator-5554       # skip Waydroid, target an already-running device/emulator
#   ./run.sh --no-waydroid          # skip Waydroid entirely, just run expo start --dev-client
#   ./run.sh build                  # local Gradle debug APK build (android/gradlew assembleDebug)
#   ./run.sh install                # build + adb install onto the Waydroid/target device
#
# Quitting (Ctrl-C, or `q` inside the Expo dev-client CLI) stops the Waydroid
# session + container automatically, unless you passed --no-waydroid/-d.
# The container-stop step needs a cached sudo timestamp to actually run —
# if it silently doesn't, `sudo systemctl stop waydroid-container` by hand.
#
# Requires the Waydroid container service to already be running
# (`sudo systemctl start waydroid-container`) — this script does not manage
# sudo-gated host setup (ip_forward/iptables/systemd), since those need a
# real password prompt. Run those manually first; see project memory /
# conversation history for the exact commands if the container won't start.

set -euo pipefail

cd "$(dirname "$0")"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
WAYDROID_BIN=(/usr/bin/python3 /usr/bin/waydroid)

# ── Args ─────────────────────────────────────────────────────────────────
SUBCMD="run"
USE_WAYDROID=1
WD_WIDTH=400
WD_HEIGHT=600
WD_DENSITY=""
TARGET_DEVICE=""
REMAINING_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    build|install|run)
      SUBCMD="$1"
      shift
      ;;
    -w|--width)
      WD_WIDTH="${2:-}"
      shift 2
      ;;
    -h|--height)
      WD_HEIGHT="${2:-}"
      shift 2
      ;;
    --density)
      WD_DENSITY="${2:-}"
      shift 2
      ;;
    -d|--device)
      TARGET_DEVICE="${2:-}"
      USE_WAYDROID=0
      shift 2
      ;;
    --no-waydroid)
      USE_WAYDROID=0
      shift
      ;;
    *)
      REMAINING_ARGS+=("$1")
      shift
      ;;
  esac
done

# ── Cleanup on exit ──────────────────────────────────────────────────────
# Stop the Waydroid session/container whenever this script exits — normal
# end, Ctrl-C (SIGINT), or Expo's own `q` quit (which returns control to
# this script, which then falls through to the end and hits the same trap).
# Only armed for `run` (the long-lived Expo session you actually quit out
# of) — `build`/`install` are one-shot and returning from them isn't a
# "you're done with the device" signal, just "the subcommand finished"; the
# app you just installed should still be usable afterward, not torn down
# out from under you before you've opened it.
waydroid_cleanup() {
  trap - INT TERM EXIT
  if [[ "$USE_WAYDROID" == "1" && "$SUBCMD" == "run" ]]; then
    echo
    echo "→ Stopping Waydroid session"
    "${WAYDROID_BIN[@]}" session stop >/dev/null 2>&1 || true
    # -n: never prompt for a password here — a stale sudo timestamp would
    # otherwise hang cleanup on a prompt nobody's watching for. If it fails
    # silently, `sudo systemctl stop waydroid-container` by hand finishes it.
    sudo -n systemctl stop waydroid-container >/dev/null 2>&1 || true
  fi
}
trap waydroid_cleanup INT TERM EXIT

# ── Waydroid boot ────────────────────────────────────────────────────────
if [[ "$USE_WAYDROID" == "1" ]]; then
  if ! systemctl is-active --quiet waydroid-container; then
    echo "Error: waydroid-container service is not running." >&2
    echo "Run this first, in a real terminal (needs your sudo password):" >&2
    echo "  sudo systemctl start waydroid-container" >&2
    echo "  sudo sysctl -w net.ipv4.ip_forward=1" >&2
    echo "  sudo iptables -P FORWARD ACCEPT" >&2
    exit 1
  fi

  echo "→ Setting Waydroid resolution to ${WD_WIDTH}x${WD_HEIGHT}"
  "${WAYDROID_BIN[@]}" prop set persist.waydroid.width "$WD_WIDTH"
  "${WAYDROID_BIN[@]}" prop set persist.waydroid.height "$WD_HEIGHT"

  echo "→ Starting Waydroid session"
  "${WAYDROID_BIN[@]}" session start >/dev/null 2>&1 &
  "${WAYDROID_BIN[@]}" show-full-ui >/dev/null 2>&1 &

  # Wait for the CONTAINER (not just the session) to be RUNNING with a real
  # IP — Waydroid freezes the container with no foreground UI window, and a
  # frozen container is unreachable over adb ("no route to host"/offline).
  echo "→ Waiting for Waydroid container to be RUNNING"
  WD_IP=""
  for _ in $(seq 1 90); do
    status="$("${WAYDROID_BIN[@]}" status 2>/dev/null || true)"
    if grep -qiE 'Container:[[:space:]]*RUNNING' <<<"$status"; then
      WD_IP="$(grep -i 'IP address' <<<"$status" | awk '{print $NF}')"
      [[ "$WD_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && break
    fi
    WD_IP=""
    sleep 2
  done
  if [[ -z "$WD_IP" ]]; then
    echo "Error: timed out waiting for Waydroid container to be RUNNING." >&2
    echo "Check 'waydroid status' and 'journalctl -u waydroid-container' —" >&2
    echo "a missing/unmounted binder device (/dev/anbox-binder) is a known" >&2
    echo "cause on some kernels and needs host-level investigation." >&2
    exit 1
  fi

  echo "→ Connecting adb to ${WD_IP}:5555"
  connected=0
  for _ in $(seq 1 30); do
    "$ADB" connect "${WD_IP}:5555" >/dev/null 2>&1 || true
    if "$ADB" -s "${WD_IP}:5555" get-state 2>/dev/null | grep -q '^device$'; then
      connected=1
      break
    fi
    sleep 2
  done
  if [[ "$connected" != "1" ]]; then
    echo "Error: could not reach Waydroid via adb at ${WD_IP}:5555 (still" >&2
    echo "'unauthorized' or 'offline'?). Run 'adb devices' for the exact" >&2
    echo "state." >&2
    exit 1
  fi
  echo "→ adb device ${WD_IP}:5555 ready"

  if [[ -z "$WD_DENSITY" ]]; then
    WD_DENSITY=$(( (WD_WIDTH * 160 + 180) / 360 ))
  fi
  echo "→ Setting screen density to ${WD_DENSITY}dpi"
  "$ADB" -s "${WD_IP}:5555" shell wm density "$WD_DENSITY" >/dev/null 2>&1 || true

  TARGET_DEVICE="${WD_IP}:5555"
fi

# ── adb reverse for a local backend ─────────────────────────────────────
# EXPO_PUBLIC_API_BASE_URL in .env.local may point at localhost (e.g. when
# lifeos-backend's `next dev` is running on this machine). Inside
# Waydroid/an emulator, localhost is the device itself, not the host — tunnel
# it over adb so the app's existing localhost URL just works unmodified.
if [[ -f .env.local ]]; then
  API_BASE_URL="$(grep -E '^EXPO_PUBLIC_API_BASE_URL=' .env.local | tail -1 | cut -d= -f2-)"
  if [[ "$API_BASE_URL" == http://localhost:* || "$API_BASE_URL" == http://127.0.0.1:* ]]; then
    LOCAL_PORT="$(sed -E 's#^http://[^:/]+:([0-9]+).*#\1#' <<<"$API_BASE_URL")"
    if [[ "$LOCAL_PORT" =~ ^[0-9]+$ ]]; then
      if [[ -n "$TARGET_DEVICE" ]]; then
        echo "→ adb -s $TARGET_DEVICE reverse tcp:${LOCAL_PORT} → host localhost:${LOCAL_PORT}"
        "$ADB" -s "$TARGET_DEVICE" reverse "tcp:${LOCAL_PORT}" "tcp:${LOCAL_PORT}" || true
      else
        while IFS=$'\t' read -r device state; do
          [[ "$state" == "device" ]] || continue
          echo "→ adb -s $device reverse tcp:${LOCAL_PORT} → host localhost:${LOCAL_PORT}"
          "$ADB" -s "$device" reverse "tcp:${LOCAL_PORT}" "tcp:${LOCAL_PORT}" || true
        done < <("$ADB" devices | tail -n +2)
      fi
    fi
  fi
fi

# ── Subcommands ──────────────────────────────────────────────────────────
case "$SUBCMD" in
  build)
    echo "→ expo prebuild --platform android (skipped if android/ already exists)"
    [[ -d android ]] || npx expo prebuild --platform android
    echo "→ ./android/gradlew :app:assembleDebug"
    (cd android && ./gradlew :app:assembleDebug)
    echo "→ APK: android/app/build/outputs/apk/debug/app-debug.apk"
    ;;
  install)
    [[ -d android ]] || npx expo prebuild --platform android
    (cd android && ./gradlew :app:assembleDebug)
    APK=android/app/build/outputs/apk/debug/app-debug.apk
    if [[ -n "$TARGET_DEVICE" ]]; then
      echo "→ adb -s $TARGET_DEVICE install -r $APK"
      "$ADB" -s "$TARGET_DEVICE" install -r "$APK"
    else
      echo "→ adb install -r $APK"
      "$ADB" install -r "$APK"
    fi
    ;;
  run)
    ARGS=(start --dev-client)
    [[ -n "$TARGET_DEVICE" ]] && echo "→ target device: $TARGET_DEVICE (select it in the Metro device list if prompted)"
    echo "→ npx expo ${ARGS[*]} ${REMAINING_ARGS[*]-}"
    npx expo "${ARGS[@]}" "${REMAINING_ARGS[@]+"${REMAINING_ARGS[@]}"}"
    ;;
esac
