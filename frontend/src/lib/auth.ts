/**
 * Normalisasi kredensial manajemen yang ditempel pengguna.
 *
 * Browser tidak dapat langsung membaca data/api_keys.json dari backend; fungsi ini
 * memproses teks yang ditempel pengguna agar terhindar dari prefix "Bearer " atau potongan JSON.
 */
export function normalizeApiKey(input: string): string {
  let value = String(input || "").trim()
  if (!value) return ""

  try {
    const parsed = JSON.parse(value)
    if (typeof parsed === "string") return normalizeApiKey(parsed)
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>
      const direct = record.key || record.api_key || record.apiKey || record.token
      if (typeof direct === "string") return normalizeApiKey(direct)
      if (Array.isArray(record.keys) && typeof record.keys[0] === "string") {
        return normalizeApiKey(record.keys[0])
      }
    }
  } catch {
    // Teks key biasa bukan JSON, lanjutkan penguraian sebagai header/text.
  }

  value = value.replace(/^[\s"'`]+|[\s"'`,]+$/g, "").trim()

  const headerMatch =
    value.match(/^(?:authorization\s*:\s*)?bearer\s+(.+)$/i) ||
    value.match(/^x-api-key\s*:\s*(.+)$/i)
  if (headerMatch?.[1]) {
    value = headerMatch[1].trim()
  } else {
    const embedded =
      value.match(/(?:authorization\s*:\s*)bearer\s+([^\s"'`,]+)/i) ||
      value.match(/(?:^|\s)bearer\s+([^\s"'`,]+)/i) ||
      value.match(/x-api-key\s*:\s*([^\s"'`,]+)/i)
    if (embedded?.[1]) value = embedded[1].trim()
  }

  return value.replace(/^[\s"'`]+|[\s"'`,]+$/g, "").trim()
}

export function getStoredApiKey(): string {
  try {
    const stored = localStorage.getItem('qwen2api_key')
    if (stored && stored.trim()) return normalizeApiKey(stored)
  } catch {
    // Jika localStorage tidak tersedia, kembalikan string kosong.
  }
  return normalizeApiKey((import.meta.env.VITE_DEFAULT_ADMIN_KEY as string | undefined) || '')
}

export function setStoredApiKey(input: string): string {
  const key = normalizeApiKey(input)
  if (!key) return ""
  localStorage.setItem('qwen2api_key', key)
  return key
}

export function clearStoredApiKey() {
  localStorage.removeItem('qwen2api_key')
}

export function getAuthHeader(): Record<string, string> {
  const key = getStoredApiKey()
  if (!key) return {}
  return { Authorization: `Bearer ${key}` }
}

export async function adminRequestErrorMessage(res: Response): Promise<string> {
  let detail = ""
  try {
    const data = await res.clone().json()
    detail = String(data.detail || data.error || data.message || "").trim()
  } catch {
    // Respons error non-JSON hanya menggunakan status HTTP.
  }

  if (res.status === 401) {
    return "Tidak ada Kunci Sesi: Silakan masukkan ADMIN_KEY atau API Key di menu 'Pengaturan Sistem'"
  }
  if (res.status === 403) {
    return "Kunci Sesi tidak cocok: Pastikan API Key sesuai data/api_keys.json tanpa prefix Bearer"
  }
  if (detail) return detail
  return `Permintaan gagal (HTTP ${res.status})`
}
