#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDS=$(pgrep -f "qwen2api-backend")

if [ -z "$PIDS" ]; then
  echo "[-] qwen2API tidak sedang berjalan."
else
  echo "[*] Menghentikan qwen2API (PID: $(echo $PIDS | tr '\n' ' '))..."
  kill $PIDS
  sleep 1
  if pgrep -f "qwen2api-backend" > /dev/null; then
    kill -9 $PIDS 2>/dev/null
  fi
  echo "[+] qwen2API berhasil dihentikan."
fi
