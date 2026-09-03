#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================="
echo "   Memperbarui qwen2API ke Versi Terbaru  "
echo "=========================================="

# 1. Hentikan layanan jika sedang berjalan
if [ -f "$DIR/stop.sh" ]; then
  echo "[1/4] Menghentikan layanan yang sedang berjalan..."
  bash "$DIR/stop.sh" || true
fi

# 2. Tarik update terbaru dari git
echo "[2/4] Mengambil pembaruan terbaru dari GitHub..."
git pull origin main

# 3. Build frontend
echo "[3/4] Mengompilasi WebUI (Frontend)..."
cd "$DIR/frontend"
npm install
npm run build

# 4. Build backend
echo "[4/4] Mengompilasi server Go (Backend)..."
cd "$DIR/backend"
go build -trimpath -ldflags="-s -w" -o "$DIR/bin/qwen2api-backend" .

cd "$DIR"

# 5. Jalankan kembali layanan
echo "[+] Menjalankan kembali qwen2API..."
bash "$DIR/start.sh" -d

echo ""
echo "=========================================="
echo " [+] Pembaruan Berhasil Diselesaikan!     "
echo " WebUI & API: http://127.0.0.1:${PORT:-7860}"
echo "=========================================="
