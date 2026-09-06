# 🚀 qwen2API - Self-Hosted Qwen API Gateway

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.24+-00ADD8.svg?style=for-the-badge&logo=go&logoColor=white" alt="Go 1.24+" />
  <img src="https://img.shields.io/badge/React-19-61DAFB.svg?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/API-OpenAI%20%7C%20Anthropic%20%7C%20Gemini-green.svg?style=for-the-badge" alt="Multi-Protocol API" />
  <img src="https://img.shields.io/badge/WAF-Bypass%20Android%20APK-orange.svg?style=for-the-badge" alt="WAF Bypass" />
  <img src="https://img.shields.io/badge/Platform-Termux%20%7C%20Linux%20VPS-blue.svg?style=for-the-badge" alt="Termux & Linux" />
  <img src="https://img.shields.io/badge/License-GPL--3.0-blue.svg?style=for-the-badge" alt="License GPL-3.0" />
</p>

Gateway AI mandiri berkinerja tinggi (*High-Performance Self-Hosted Gateway*) yang mengonversi kemampuan resmi **Qwen AI** menjadi API standar yang kompatibel penuh dengan **OpenAI**, **Anthropic**, dan **Google Gemini**.

Dilengkapi sistem **Bypass Alibaba Cloud WAF (RGV587_ERROR)** berbasis protokol Android APK resmi, dukungan **Tool Calling / Function Calling** untuk AI Coding Agent, serta WebUI modern berbahasa Indonesia yang ringan dan siap jalan di **Android Termux** maupun **Server VPS Linux**.

---

## 🌟 Fitur Utama

- 🛡️ **Bypass Alibaba Cloud WAF (Anti RGV587_ERROR)**: Mengintegrasikan protokol resmi Android APK (`ai.qwenlm.chat.android`), signature token `app_waf`, dan ID perangkat unik dinamis. Permintaan terbebas dari blokir tantangan JavaScript slider captcha.
- 🔑 **Login Otomatis Email & Sandi**: Login langsung ke server Qwen (`/api/v2/auths/signin`) dengan enkripsi kata sandi SHA-256. Tidak perlu repot membuka DevTools / F12 untuk menyalin token sesi secara manual (opsi token manual tetap tersedia untuk login Google OAuth).
- 🛠️ **AI Agent & Tool Calling Support (100% Works)**: Kompatibel penuh dengan spesifikasi Function Calling OpenAI (`tools` & `tool_calls`) dan Anthropic (`tool_use`). Teruji sukses untuk autonomous agent seperti **Cline**, **Roo Code**, **Claude Code**, **Cursor**, dan **LangChain**.
- 🖼️ **Image & Video Lab (WanX Media)**: Mendukung pembuatan gambar AI (`/v1/images/generations`) dan video AI (`/v1/videos/generations`) dengan built-in **Media Proxy** dan kebijakan `no-referrer`, mencegah galat `403 denied by Referer ACL` dari CDN Alibaba Cloud.
- 🔄 **Account Pool & Rotasi Otomatis**: Manajemen multi-akun dengan auto-failover, pelacakan rate limit terpisah (chat, image, video), dan sistem sesi pra-hangat (*pre-warm pool*) untuk respons instan.
- 🎨 **WebUI Dashboard Modern**: Dashboard berbasis React 19 + Tailwind CSS + Lucide Icons yang bersih, responsif, dan 100% berbahasa Indonesia untuk mengelola akun, API key, konfigurasi runtime, dan uji coba interaktif.
- 📱 **Termux & VPS Native**: Backend ditulis murni dalam bahasa **Go** dengan penggunaan RAM sangat minim (< 50MB) tanpa ketergantungan browser headless berat (Playwright/Chromium) untuk operasional API harian.

---

## 🏗️ Arsitektur & Alur Kerja

```
[AI Client / Agent (Cline, Roo Code, Chatbox, SDK)]
                       │
                       ▼  (OpenAI / Anthropic / Gemini Format)
             [qwen2API Gateway :7860]
  ├── 1. Autentikasi API Key Klien & Rate Limiter
  ├── 2. Pool Manager: Pilih Akun Sehat (Round-Robin)
  ├── 3. Injeksi Skema Tool Calling & System Prompt
  └── 4. Format Protokol Android APK Resmi:
         ├── User-Agent: Dalvik/2.1.0 ... AliApp(QWENCHAT/2.5.1)
         ├── X-Platform: android | source: app
         ├── Header Keamanan: app_waf + x-device-id
         └── Cookie Jar Sesi Otomatis (acw_tc, dll.)
                       │
                       ▼  (Direct HTTPS Request - Bebas WAF Slider)
           [Alibaba Cloud Qwen Upstream Server]
                       │
                       ▼  (Server-Sent Events / SSE Stream)
             [qwen2API Gateway :7860]
  ├── 1. Parser Tool Calling & Ekstraksi Argumen JSON
  ├── 2. Streaming Token Respon ke Klien
  └── 3. Sanitasi Media CDN via Internal Media Proxy
                       │
                       ▼
[AI Client / Agent Menerima Respons / Eksekusi Tool Sempurna! 🎉]
```

---

## ⚡ Panduan Instalasi Cepat

### 1. Instalasi di HP Android (Termux)

```bash
# Update paket Termux dan instal dependensi
pkg update -y && pkg install git golang nodejs-lts -y

# Clone repositori
git clone https://github.com/Cxslin/qwen2API.git
cd qwen2API

# Jalankan build backend dan frontend otomatis
cd frontend && npm install && npm run build && cd ..
cd backend && go build -trimpath -ldflags="-s -w" -o ../bin/qwen2api-backend . && cd ..

# Berikan izin eksekusi pada skrip manajemen
chmod +x start.sh stop.sh update.sh
```

### 2. Jalankan Layanan

```bash
# Menjalankan di background (Daemon)
./start.sh -d

# Memeriksa status log
tail -f logs/output.log

# Menghentikan layanan
./stop.sh
```

Akses Web Dashboard melalui browser di: **`http://localhost:7860`** (atau `http://IP_HP_ANDA:7860`).

### 3. Cara Update ke Versi Terbaru 🔄

Jika terdapat pembaruan fitur atau perbaikan di repositori GitHub, Anda dapat memperbarui proyek dengan sangat mudah:

#### Opsi A: Menggunakan Skrip Otomatis (Rekomendasi)
```bash
./update.sh
```
*Skrip ini akan otomatis menghentikan server lama, menarik commit terbaru dari GitHub, mengompilasi ulang frontend & backend, lalu menyalakan kembali layanan.*

#### Opsi B: Langkah Manual
```bash
# 1. Hentikan server yang sedang berjalan
./stop.sh

# 2. Ambil update terbaru dari GitHub
git pull origin main

# 3. Kompilasi ulang frontend & backend
cd frontend && npm install && npm run build && cd ..
cd backend && go build -trimpath -ldflags="-s -w" -o ../bin/qwen2api-backend . && cd ..

# 4. Jalankan kembali di background
./start.sh -d
```

---

## 🔑 Konfigurasi & Login Akun

1. Buka WebUI di browser: `http://localhost:7860`.
2. Masukkan Admin Key default: `admin123456` (dapat diubah di menu **Pengaturan Sistem**).
3. Buka tab **Manajemen Akun**:
   - **Metode 1 (Rekomendasi)**: Masukkan **Email** dan **Kata Sandi** akun Qwen Anda, lalu klik **Simpan / Login Akun**. Sistem akan login otomatis via API resmi.
   - **Metode 2 (Google OAuth)**: Jika mendaftar via Google Sign-In, salin `token` dari Local Storage browser dan tempel di kolom token manual.
4. Buka tab **API Key** untuk membuat key akses baru yang akan digunakan di aplikasi AI Agent Anda.

---

## 🌐 Endpoint API Utama

Semua endpoint kompatibel dengan format standar OpenAI, Anthropic, dan Google Gemini:

| Protocol | Method | Endpoint | Deskripsi | Auth |
|---|---|---|---|---|
| **OpenAI** | `POST` | `/v1/chat/completions` | Chat Completions (Stream & Non-Stream, Tool Calling) | `Bearer <KEY>` |
| **OpenAI** | `GET` | `/v1/models` | Daftar semua model yang tersedia | `Bearer <KEY>` |
| **OpenAI** | `GET` | `/v1/models/{model}` | Detail kapabilitas model spesifik | `Bearer <KEY>` |
| **OpenAI** | `POST` | `/v1/images/generations` | Pembuatan Gambar AI (WanX 2.1) | `Bearer <KEY>` |
| **OpenAI** | `POST` | `/v1/videos/generations` | Pembuatan Video AI (WanX 2.1) | `Bearer <KEY>` |
| **Anthropic** | `POST` | `/v1/messages` | Format Pesan Anthropic Claude (`tool_use`) | `x-api-key` |
| **Gemini** | `POST` | `/v1beta/models/{model}:generateContent` | Format Google Gemini API | `x-goog-api-key` |
| **Media** | `GET` | `/api/media/proxy?url={url}` | Media Proxy Internal (Anti-403 Referer ACL) | Bebas |
| **Sistem** | `GET` | `/healthz` & `/readyz` | Healthcheck gateway & pool akun | Bebas |

---

## 📋 Daftar Model yang Didukung

Gateway ini menyediakan akses ke seluruh model resmi Qwen serta mendukung varian mode fitur dan alias kompatibilitas:

### 1. Model Dasar (Base Models)
| Model ID | Deskripsi & Rekomendasi Penggunaan | Kapabilitas Utama |
|---|---|---|
| `qwen3.7-plus` | **Model Rekomendasi Utama** ⚡ — Sangat cepat, cerdas, ideal untuk coding agent (Cline, Roo, Claude Code). | Chat, Tool Use, Vision, Web Search |
| `qwen3.8-max` | Model dengan kapasitas penalaran dan kedalaman logika tertinggi untuk instruksi kompleks. | Chat, Deep Reasoning, Tool Use |
| `qwen3.7-max` | Model performa tinggi untuk penulisan, analisis data, dan tugas komprehensif. | Chat, Reasoning, Tool Use |
| `qwen3.6-plus` | Model generasi 3.6 yang stabil, mendukung beragam fungsi multimedia dan tools. | Chat, Audio/Vision, Tool Use |
| `qwen3.5-plus` | Model handal dan cepat untuk percakapan teks umum. | Chat, Tool Use |
| `qwen3.5-omni-plus` | Model multimodal yang mendukung pemrosesan dokumen, audio, dan visual. | Multimodal Audio & Vision |

### 2. Akhiran Fitur / Suffix Modes
Anda dapat menambahkan akhiran (*suffix*) ke Model ID dasar untuk memicu mode kapabilitas tertentu secara langsung:

| Suffix | Contoh Model ID | Deskripsi Fitur |
|---|---|---|
| `-thinking` | `qwen3.7-plus-thinking` | Mengaktifkan penalaran mendalam (*deep thinking/reasoning token*) sebelum menjawab |
| `-search` | `qwen3.7-plus-search` | Mengaktifkan pencarian web langsung (*real-time live web search*) |
| `-deep-research` | `qwen3.7-plus-deep-research` | Mode riset komprehensif berbasis penelusuran multi-sumber web |
| `-image` | `qwen3.7-plus-image` | Pembuatan gambar AI (*Text-to-Image* via WanX 2.1) |
| `-video` | `qwen3.7-plus-video` | Pembuatan video AI (*Text-to-Video* via WanX 2.1) |
| `-webdev` | `qwen3.7-plus-webdev` | Dioptimalkan khusus untuk pembuatan artefak kode web frontend/fullstack |
| `-slides` | `qwen3.7-plus-slides` | Dioptimalkan khusus untuk pembuatan outline dan konten presentasi |

### 3. Alias Kompatibilitas Otomatis (Model Aliases)
Jika menggunakan aplikasi pihak ketiga yang mewajibkan penamaan model standar, gateway akan secara otomatis mengarahkan permintaan ke model Qwen yang setara:

- **OpenAI Aliases**: `gpt-4o`, `gpt-4-turbo`, `gpt-4`, `gpt-5`, `o1`, `o3` ➔ otomatis dipetakan ke `qwen3.6-plus`
- **OpenAI Mini Aliases**: `gpt-4o-mini`, `gpt-4.1-mini`, `gpt-3.5-turbo`, `o1-mini`, `o3-mini` ➔ otomatis dipetakan ke `qwen3.5-flash`
- **Anthropic Aliases**: `claude-3.5-sonnet`, `claude-sonnet-4-5`, `claude-opus-4-6`, `claude-3-opus` ➔ otomatis dipetakan ke `qwen3.6-plus`; `claude-3-haiku` ➔ `qwen3.5-flash`
- **Gemini Aliases**: `gemini-2.5-pro` ➔ `qwen3.6-plus`; `gemini-2.5-flash` ➔ `qwen3.5-flash`
- **DeepSeek Aliases**: `deepseek-chat`, `deepseek-reasoner` ➔ `qwen3.6-plus`

> [!TIP]
> Untuk memeriksa daftar lengkap model yang aktif secara dinamis melalui API, panggil:
> ```bash
> curl -H "Authorization: Bearer <API_KEY>" http://127.0.0.1:7860/v1/models
> ```

---

## 🤖 Integrasi AI Agent & Tools

### 1. Integrasi dengan Cline / Roo Code (VS Code Extension)
- **API Provider**: `OpenAI Compatible`
- **Base URL**: `http://127.0.0.1:7860/v1`
- **API Key**: API Key dari menu **API Key** di WebUI (misal: `sk-...` atau `admin123456`)
- **Model ID**: `qwen3.6-plus` atau `qwen3.7-plus`

### 2. Integrasi dengan Claude Code (Anthropic CLI Agent)
Gateway ini menyediakan endpoint Anthropic penuh (`/v1/messages` dan `/anthropic/v1/messages`) yang mendukung pemanggilan tool otomatis (`Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`).

#### Opsi A: Ekspor Environment Variables
```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:7860"
export ANTHROPIC_API_KEY="admin123456"       # atau API Key kustom Anda
export ANTHROPIC_MODEL="qwen3.7-plus"       # rekomendasi: qwen3.7-plus atau qwen3.8-max
export CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT="1"

claude
```

#### Opsi B: Konfigurasi Permanen `~/.claude/settings.json`
```json
{
  "theme": "dark",
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:7860",
    "ANTHROPIC_API_KEY": "admin123456"
  },
  "model": "qwen3.7-plus"
}
```

> [!TIP]
> - **Jika Claude Code dijalankan di server/VPS yang sama dengan gateway:** Gunakan URL `http://127.0.0.1:7860`.
> - **Jika Claude Code dijalankan di komputer/laptop lokal:** Ganti URL dengan IP server VPS Anda, misalnya `http://IP_VPS_ANDA:7860`.

### 3. Contoh Penggunaan via Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:7860/v1",
    api_key="admin123456"
)

# 1. Chat Biasa
response = client.chat.completions.create(
    model="qwen3.6-plus",
    messages=[{"role": "user", "content": "Halo! Jelaskan komputasi kuantum secara singkat."}]
)
print(response.choices[0].message.content)

# 2. Pemanggilan Tool (Function Calling)
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Cek cuaca terkini",
        "parameters": {
            "type": "object",
            "properties": {"location": {"type": "string"}},
            "required": ["location"]
        }
    }
}]

tool_response = client.chat.completions.create(
    model="qwen3.6-plus",
    messages=[{"role": "user", "content": "Berapa suhu di Jakarta sekarang?"}],
    tools=tools
)
print("Tool Calls:", tool_response.choices[0].message.tool_calls)
```

### 4. Contoh cURL Chat Completions

```bash
curl -X POST http://127.0.0.1:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer admin123456" \
  -d '{
    "model": "qwen3.6-plus",
    "messages": [{"role": "user", "content": "Ceritakan lelucon lucu!"}],
    "stream": false
  }'
```

---

## ⚙️ Variabel Lingkungan (.env)

| Variabel | Default | Deskripsi |
|---|---|---|
| `PORT` | `7860` | Port listen server gateway |
| `ADMIN_KEY` | `admin123456` | Kunci master otorisasi WebUI & API |
| `MAX_RETRIES` | `3` | Jumlah percobaan ulang saat kegagalan upstream |
| `CHAT_ID_POOL_TARGET` | `5` | Jumlah sesi chat pra-hangat per akun |
| `UPSTREAM_STREAM_IDLE_TIMEOUT_SECONDS` | `180` | Batas waktu idle streaming (detik) |

---

## 🙏 Ucapan Terima Kasih & Sumber Referensi

Proyek ini dibangun dan dikembangkan lebih lanjut berdasarkan riset serta fondasi luar biasa dari:

- 🌟 **[YuJunZhiXue/qwen2API](https://github.com/YuJunZhiXue/qwen2API)** — Fondasi awal arsitektur Go backend gateway, adapter protokol multi-format (OpenAI, Anthropic, Gemini), dan sistem pool akun.
- 📱 **[Qwen Android APK Wrapper (`qwen.mjs`)](https://www.kitsulabs.xyz/code/55ee58a5b60c)** oleh Shannz (KitsuLabs) — Referensi implementasi protokol resmi Android APK (`ai.qwenlm.chat.android`), signature token WAF `app_waf`, serta alur login langsung kata sandi SHA-256 (`/api/v2/auths/signin`).

---

## 📄 Lisensi
Proyek ini didistribusikan di bawah lisensi **GNU General Public License v3.0 (GPL-3.0)**. Bebas digunakan, dipelajari, dan dikembangkan untuk kebutuhan personal maupun riset mandiri.
