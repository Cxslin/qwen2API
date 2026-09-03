import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { Button } from "../components/ui/button"
import {
  Ban,
  CheckCircle2,
  Copy,
  Download,
  FileUp,
  FolderArchive,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  ShieldAlert,
  Trash2,
  UserRound,
  XCircle,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { adminRequestErrorMessage, getAuthHeader, getStoredApiKey } from "../lib/auth"
import { API_BASE } from "../lib/api"

type AccountItem = {
  email: string
  password?: string
  token?: string
  cookies?: string
  username?: string
  valid?: boolean
  inflight?: number
  max_inflight?: number
  rate_limited_until?: number
  rate_limits?: Record<string, AccountRateLimit>
  activation_pending?: boolean
  status_code?: string
  status_text?: string
  last_error?: string
  last_request_started?: number
  last_request_finished?: number
  consecutive_failures?: number
  rate_limit_strikes?: number
  service?: string
  provider?: string
  plan?: string
  pool?: string
  image_quota?: number
  gpt_image_quota?: number
  success_count?: number
  failure_count?: number
  source?: string
  env_name?: string
}

type AccountRateLimit = {
  until?: number
  reason?: string
  last_error?: string
  strikes?: number
}

type ImportAccount = {
  token: string
  email?: string
  password?: string
  username?: string
  cookies?: string
}

type ZipEntry = {
  name: string
  content: string
}

function statusStyle(code?: string) {
  switch (code) {
    case "valid":
      return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25"
    case "pending_activation":
      return "bg-orange-500/12 text-orange-700 dark:text-orange-300 ring-orange-500/25"
    case "rate_limited":
      return "bg-yellow-500/12 text-yellow-700 dark:text-yellow-300 ring-yellow-500/25"
    case "banned":
      return "bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25"
    case "auth_error":
      return "bg-slate-500/12 text-slate-700 dark:text-slate-300 ring-slate-500/25"
    default:
      return "bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25"
  }
}

const RATE_LIMIT_LABELS: Record<string, string> = {
  chat: "Rate Limit Chat",
  image: "Limit Kuota Gambar",
  video: "Limit Kuota Video",
  metadata: "Rate Limit Metadata",
  unknown: "Limit Tidak Diketahui",
  legacy: "Limit Versi Lama",
}

function activeRateLimits(acc: AccountItem) {
  const now = Date.now() / 1000
  const items = Object.entries(acc.rate_limits || {})
    .filter(([, state]) => Number(state?.until || 0) > now)
    .map(([usage, state]) => ({
      usage,
      label: RATE_LIMIT_LABELS[usage] || `Limit ${usage}`,
      until: Number(state.until || 0),
      error: state.last_error || state.reason || "",
    }))

  if ((acc.rate_limited_until || 0) > now && !items.some(item => item.usage === "chat")) {
    items.push({
      usage: "legacy",
      label: "Limit Versi Lama",
      until: Number(acc.rate_limited_until || 0),
      error: acc.last_error || "",
    })
  }

  const order = ["chat", "image", "video", "metadata", "unknown", "legacy"]
  return items.sort((a, b) => order.indexOf(a.usage) - order.indexOf(b.usage))
}

function hasActiveChatLimit(acc: AccountItem) {
  return activeRateLimits(acc).some(item => item.usage === "chat" || item.usage === "legacy")
}

function effectiveStatusCode(acc: AccountItem) {
  if (hasActiveChatLimit(acc)) return "rate_limited"
  if (acc.status_code === "rate_limited" && acc.valid) return "valid"
  return acc.status_code || (acc.valid ? "valid" : "invalid")
}

function formatLimitTime(until: number) {
  return new Date(until * 1000).toLocaleString()
}

function limitSummary(acc: AccountItem) {
  const limits = activeRateLimits(acc)
  if (limits.length === 0) return ""
  return limits.map(item => `${item.label}: pulih ${formatLimitTime(item.until)}`).join("; ")
}

function statusText(acc: AccountItem) {
  switch (effectiveStatusCode(acc)) {
    case "valid": return "Normal"
    case "pending_activation": return "Belum Aktivasi"
    case "rate_limited": return hasActiveChatLimit(acc) ? "Rate Limit Chat" : "Rate Limit"
    case "banned": return "Diblokir"
    case "auth_error": return "Autentikasi Gagal"
    default: return acc.valid ? "Normal" : "Tidak Normal"
  }
}

function statusNote(acc: AccountItem) {
  const limits = activeRateLimits(acc)
  if (limits.length > 0) return limits.map(item => `${item.label}${item.error ? `: ${item.error}` : ""}`).join("; ")
  return acc.last_error || ""
}

function serviceOf(acc: AccountItem) {
  return acc.service || acc.provider || "Qwen"
}

function planOf(acc: AccountItem) {
  return acc.plan || acc.pool || "free"
}

function quotaOf(acc: AccountItem) {
  return Number(acc.gpt_image_quota ?? acc.image_quota ?? 0)
}

function successOf(acc: AccountItem) {
  return Number(acc.success_count ?? Math.max(0, acc.last_request_finished ? 1 : 0))
}

function failureOf(acc: AccountItem) {
  return Number(acc.failure_count ?? acc.consecutive_failures ?? 0)
}

function recoveryText(acc: AccountItem) {
  const summary = limitSummary(acc)
  if (summary) return summary
  if (acc.status_code === "rate_limited") return "Menunggu pemulihan upstream"
  return "-"
}

function maskedToken(token?: string) {
  const value = (token || "").trim()
  if (!value) return "-"
  if (value.length <= 14) return "token-hidden"
  return `${value.slice(0, 8)}••••••${value.slice(-6)}`
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 96) || "account"
}

function localizeError(error?: string) {
  if (!error) return "Kesalahan tidak diketahui"
  const lower = error.toLowerCase()
  if (lower.includes("activation already in progress")) return "Akun sedang dalam proses aktivasi, silakan refresh sebentar lagi"
  if (lower.includes("activation link or token not found")) return "Tautan aktivasi atau Token tidak ditemukan"
  if (lower.includes("token invalid") || lower.includes("token") || lower.includes("auth")) return "Token tidak valid atau autentikasi gagal"
  return error
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function accountFromRecord(value: unknown): ImportAccount | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const token = getString(record.token) || getString(record.access_token) || getString(record.accessToken)
  if (!token) return null
  return {
    token: token.replace(/^Bearer\s+/i, "").trim(),
    email: getString(record.email) || getString(record.account) || undefined,
    password: getString(record.password) || undefined,
    username: getString(record.username) || undefined,
    cookies: getString(record.cookies) || getString(record.cookie) || undefined,
  }
}

function collectImportAccounts(value: unknown): ImportAccount[] {
  const direct = accountFromRecord(value)
  if (direct) return [direct]
  if (Array.isArray(value)) return value.flatMap(collectImportAccounts)
  if (!value || typeof value !== "object") return []
  const record = value as Record<string, unknown>
  return [record.accounts, record.items, record.data, record.results, record.records, record.list]
    .filter(item => item !== undefined)
    .flatMap(collectImportAccounts)
}

function parseTokenLine(line: string): ImportAccount | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    const accounts = collectImportAccounts(parsed)
    return accounts[0] || null
  } catch {
    // Fall back to text formats below.
  }
  const tabParts = trimmed.split(/[\t,]/).map(item => item.trim()).filter(Boolean)
  if (tabParts.length >= 2 && tabParts[1].length > 16) {
    return { email: tabParts[0], token: tabParts[1].replace(/^Bearer\s+/i, "") }
  }
  const tokenMatch = trimmed.match(/(?:access_token|accessToken|token)\s*[:=]\s*["']?([^"',\s]+)["']?/i)
  const rawToken = tokenMatch?.[1] || trimmed.replace(/^Bearer\s+/i, "")
  return rawToken.length > 16 ? { token: rawToken } : null
}

function parseImportText(text: string): ImportAccount[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    const accounts = collectImportAccounts(parsed)
    if (accounts.length) return accounts
  } catch {
    // Plain line based import.
  }
  return trimmed
    .split(/\r?\n/)
    .flatMap(line => {
      const parsed = parseTokenLine(line)
      return parsed ? [parsed] : []
    })
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function downloadJSON(name: string, data: unknown) {
  downloadBlob(name, new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }))
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = Math.max(1, date.getFullYear() - 1980)
  const dateValue = (day << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: dateValue }
}

function u16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff]
}

function u32(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]
}

function concatBytes(chunks: Uint8Array[]) {
  const size = chunks.reduce((sum, item) => sum + item.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function zipBlob(entries: ZipEntry[]) {
  const enc = new TextEncoder()
  const { time, date } = dosTime()
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = enc.encode(entry.name)
    const content = enc.encode(entry.content)
    const crc = crc32(content)
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date),
      ...u32(crc), ...u32(content.length), ...u32(content.length), ...u16(name.length), ...u16(0),
      ...name, ...content,
    ])
    const central = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date),
      ...u32(crc), ...u32(content.length), ...u32(content.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name,
    ])
    localChunks.push(local)
    centralChunks.push(central)
    offset += local.length
  }

  const centralOffset = offset
  const central = concatBytes(centralChunks)
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(central.length), ...u32(centralOffset), ...u16(0),
  ])
  return new Blob([concatBytes(localChunks), central, end], { type: "application/zip" })
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [token, setToken] = useState("")
  const [verifying, setVerifying] = useState<string | null>(null)
  const [verifyingAll, setVerifyingAll] = useState(false)
  const [bulkText, setBulkText] = useState("")
  const [bulkImporting, setBulkImporting] = useState(false)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [serviceFilter, setServiceFilter] = useState("all")
  const [planFilter, setPlanFilter] = useState("all")
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const deferredQuery = useDeferredValue(query)

  const requireSessionKey = () => {
    if (getStoredApiKey()) return true
    toast.error("Silakan masukkan ADMIN_KEY atau API Key di menu 'Pengaturan Sistem' terlebih dahulu")
    return false
  }

  const readAdminJSON = async (res: Response) => {
    if (!res.ok) throw new Error(await adminRequestErrorMessage(res))
    return res.json().catch(() => ({}))
  }

  const fetchAccounts = (notify = false) => {
    if (!getStoredApiKey()) {
      setAccounts([])
      toast.error("Silakan masukkan ADMIN_KEY atau API Key di menu 'Pengaturan Sistem' terlebih dahulu")
      return
    }
    fetch(`${API_BASE}/api/admin/accounts`, { headers: getAuthHeader() })
      .then(readAdminJSON)
      .then(data => {
        const next = data.accounts || []
        setAccounts(next)
        setSelected(prev => new Set([...prev].filter(email => next.some((acc: AccountItem) => acc.email === email))))
        if (notify) toast.success("Daftar akun disegarkan")
      })
      .catch(err => toast.error(err instanceof Error ? err.message : "Gagal memuat daftar akun, periksa Kunci Sesi"))
  }

  useEffect(() => {
    fetchAccounts()
  }, [])

  const stats = useMemo(() => {
    const result = { total: accounts.length, valid: 0, rateLimited: 0, abnormal: 0, banned: 0, quota: 0, pending: 0, invalid: 0 }
    for (const acc of accounts) {
      const code = effectiveStatusCode(acc)
      if (code === "valid") result.valid += 1
      else if (code === "pending_activation") result.pending += 1
      else if (code === "rate_limited") result.rateLimited += 1
      else if (code === "banned") result.banned += 1
      else result.invalid += 1
      if (activeRateLimits(acc).length > 0 && code !== "rate_limited") result.rateLimited += 1
      result.quota += quotaOf(acc)
    }
    result.abnormal = result.pending + result.invalid
    return result
  }, [accounts])

  const parsedBulkAccounts = useMemo(() => parseImportText(bulkText), [bulkText])
  const serviceOptions = useMemo(() => Array.from(new Set(accounts.map(serviceOf))).sort(), [accounts])
  const planOptions = useMemo(() => Array.from(new Set(accounts.map(planOf))).sort(), [accounts])
  const selectedAccounts = useMemo(() => accounts.filter(acc => selected.has(acc.email)), [accounts, selected])

  const filteredAccounts = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return accounts.filter(acc => {
      const code = effectiveStatusCode(acc)
      const limitText = `${limitSummary(acc)} ${statusNote(acc)}`
      const matchedQuery = !q || [acc.email, acc.username, code, acc.last_error, acc.token, limitText].some(value => String(value || "").toLowerCase().includes(q))
      const matchedStatus = statusFilter === "all" || code === statusFilter || (statusFilter === "valid" && acc.valid) || (statusFilter === "rate_limited" && activeRateLimits(acc).length > 0)
      const matchedService = serviceFilter === "all" || serviceOf(acc) === serviceFilter
      const matchedPlan = planFilter === "all" || planOf(acc) === planFilter
      return matchedQuery && matchedStatus && matchedService && matchedPlan
    })
  }, [accounts, deferredQuery, planFilter, serviceFilter, statusFilter])

  const allFilteredSelected = filteredAccounts.length > 0 && filteredAccounts.every(acc => selected.has(acc.email))

  const toggleSelected = (targetEmail: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(targetEmail)) next.delete(targetEmail)
      else next.add(targetEmail)
      return next
    })
  }

  const toggleAllFiltered = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) filteredAccounts.forEach(acc => next.delete(acc.email))
      else filteredAccounts.forEach(acc => next.add(acc.email))
      return next
    })
  }

  const handleAdd = () => {
    if (!requireSessionKey()) return
    if (!token.trim() && (!email.trim() || !password.trim())) {
      toast.error("Silakan isi Token ATAU masukkan kombinasi Email dan Kata Sandi")
      return
    }
    const id = toast.loading(
      !token.trim() && email.trim() && password.trim()
        ? "Melakukan login via API Android Qwen..."
        : "Menambahkan akun..."
    )
    fetch(`${API_BASE}/api/admin/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({
        email: email || `manual_${Date.now()}@qwen`,
        password,
        token,
      })
    }).then(readAdminJSON)
      .then(data => {
        if (data.ok) {
          toast.success("Akun berhasil ditambahkan ke pool", { id })
          setEmail("")
          setPassword("")
          setToken("")
          fetchAccounts()
        } else {
          toast.error(localizeError(data.error) || "Gagal menambahkan akun", { id, duration: 8000 })
        }
      })
      .catch(err => toast.error(err instanceof Error ? err.message : "Permintaan penambahan akun gagal", { id }))
  }

  const handleDelete = (target: AccountItem) => {
    if (!requireSessionKey()) return
    if (target.source === "env") {
      toast.error("Akun dari environment variable tidak dapat dihapus melalui panel")
      return
    }

    const id = toast.loading(`Menghapus ${target.email}...`)
    fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(target.email)}`, {
      method: "DELETE",
      headers: getAuthHeader(),
    }).then(async res => {
      if (!res.ok) throw new Error(await adminRequestErrorMessage(res))
      toast.success(`Berhasil menghapus ${target.email}`, { id })
      setSelected(prev => {
        const next = new Set(prev)
        next.delete(target.email)
        return next
      })
      fetchAccounts()
    }).catch(err => toast.error(err instanceof Error ? err.message : "Gagal menghapus akun", { id }))
  }

  const handleDeleteSelected = async () => {
    if (!requireSessionKey()) return
    const deletableAccounts = selectedAccounts.filter(acc => acc.source !== "env")
    if (!deletableAccounts.length) {
      toast.error("Silakan pilih akun terlebih dahulu")
      return
    }
    const skipped = selectedAccounts.length - deletableAccounts.length
    const id = toast.loading(`Menghapus ${deletableAccounts.length} akun terpilih...`)
    let ok = 0
    let failed = 0
    for (const acc of deletableAccounts) {
      try {
        const res = await fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(acc.email)}`, {
          method: "DELETE",
          headers: getAuthHeader(),
        })
        if (res.ok) ok += 1
        else failed += 1
      } catch {
        failed += 1
      }
    }
    toast.success(`Penghapusan selesai: Berhasil ${ok}, Gagal ${failed}${skipped ? `, Melewati akun environment ${skipped}` : ""}`, { id, duration: 8000 })
    setSelected(new Set())
    fetchAccounts()
  }

  const handleDeleteAbnormal = async () => {
    if (!requireSessionKey()) return
    const abnormal = accounts.filter(acc => acc.status_code !== "valid" && !acc.valid)
    if (!abnormal.length) {
      toast.success("Tidak ada akun bermasalah yang perlu dihapus")
      return
    }
    const id = toast.loading(`Menghapus ${abnormal.length} akun bermasalah...`)
    let ok = 0
    let failed = 0
    for (const acc of abnormal) {
      try {
        const res = await fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(acc.email)}`, {
          method: "DELETE",
          headers: getAuthHeader(),
        })
        if (res.ok) ok += 1
        else failed += 1
      } catch {
        failed += 1
      }
    }
    toast.success(`Penghapusan akun bermasalah selesai: Berhasil ${ok}, Gagal ${failed}`, { id, duration: 8000 })
    setSelected(new Set())
    fetchAccounts()
  }

  const handleVerify = (targetEmail: string) => {
    if (!requireSessionKey()) return
    setVerifying(targetEmail)
    const id = toast.loading(`Memverifikasi ${targetEmail}...`)
    fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(targetEmail)}/verify`, {
      method: "POST",
      headers: getAuthHeader(),
    }).then(readAdminJSON)
      .then(data => {
        if (data.valid) {
          toast.success(`Verifikasi berhasil: ${targetEmail}`, { id })
        } else {
          toast.error(`Verifikasi gagal: ${statusText(data) || localizeError(data.error)}`, { id, duration: 8000 })
        }
        fetchAccounts()
      })
      .catch(err => toast.error(err instanceof Error ? err.message : "Permintaan verifikasi gagal", { id }))
      .finally(() => setVerifying(null))
  }

  const handleVerifyAll = () => {
    if (!requireSessionKey()) return
    setVerifyingAll(true)
    const id = toast.loading("Memeriksa seluruh akun secara simultan...")
    fetch(`${API_BASE}/api/admin/verify`, {
      method: "POST",
      headers: getAuthHeader(),
    }).then(readAdminJSON)
      .then(data => {
        if (data.ok) {
          toast.success(`Pemeriksaan seluruh akun selesai, konkurensi: ${data.concurrency || 1}`, { id })
        } else {
          toast.error("Pemeriksaan seluruh akun gagal", { id })
        }
        fetchAccounts()
      })
      .catch(err => toast.error(err instanceof Error ? err.message : "Permintaan pemeriksaan seluruh akun gagal", { id }))
      .finally(() => setVerifyingAll(false))
  }

  const handleVerifySelected = async () => {
    if (!requireSessionKey()) return
    if (!selectedAccounts.length) {
      toast.error("Silakan pilih akun terlebih dahulu")
      return
    }
    const id = toast.loading(`Memperbarui info dan kuota ${selectedAccounts.length} akun terpilih...`)
    let ok = 0
    let failed = 0
    for (const acc of selectedAccounts) {
      try {
        const res = await fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(acc.email)}/verify`, {
          method: "POST",
          headers: getAuthHeader(),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.valid) ok += 1
        else failed += 1
      } catch {
        failed += 1
      }
    }
    toast.success(`Pembaruan selesai: Berhasil ${ok}, Gagal ${failed}`, { id, duration: 8000 })
    fetchAccounts()
  }

  const handleActivate = (targetEmail: string) => {
    if (!requireSessionKey()) return
    const id = toast.loading(`Mengaktivasi ${targetEmail}...`)
    fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(targetEmail)}/activate`, {
      method: "POST",
      headers: getAuthHeader(),
    }).then(readAdminJSON)
      .then(data => {
        if (data.pending) {
          toast.success(`Akun sedang diaktivasi, silakan refresh sebentar lagi: ${targetEmail}`, { id, duration: 6000 })
        } else if (data.ok) {
          toast.success(data.message || `Aktivasi berhasil: ${targetEmail}`, { id, duration: 6000 })
        } else {
          toast.error(`Aktivasi gagal: ${localizeError(data.error || data.message)}`, { id, duration: 8000 })
        }
        fetchAccounts()
      })
      .catch(err => toast.error(err instanceof Error ? err.message : "Permintaan aktivasi gagal", { id }))
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ""
    if (!files.length) return
    const chunks = await Promise.all(files.map(file => file.text()))
    setBulkText(prev => [prev, ...chunks].filter(Boolean).join("\n"))
    toast.success(`Berhasil membaca ${files.length} file`)
  }

  const handleBulkImport = async () => {
    if (!requireSessionKey()) return
    const candidates = parsedBulkAccounts
    if (!candidates.length) {
      toast.error("Tidak ada token yang terdeteksi untuk diimpor")
      return
    }
    setBulkImporting(true)
    const id = toast.loading(`Mengimpor ${candidates.length} akun...`)
    let ok = 0
    let failed = 0
    try {
      for (const [index, item] of candidates.entries()) {
        const res = await fetch(`${API_BASE}/api/admin/accounts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          body: JSON.stringify({
            email: item.email || `batch_${Date.now()}_${index + 1}@qwen`,
            password: item.password || "",
            username: item.username || "",
            cookies: item.cookies || "",
            token: item.token,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.ok) ok += 1
        else failed += 1
      }
      toast.success(`Impor akun selesai: Berhasil ${ok}, Gagal ${failed}`, { id, duration: 8000 })
      fetchAccounts()
      if (ok > 0) setBulkText("")
    } catch (err) {
      toast.error(`Impor terputus: ${err instanceof Error ? err.message : "Kesalahan tidak diketahui"}`, { id })
    } finally {
      setBulkImporting(false)
    }
  }

  const handleCopyToken = async (acc: AccountItem) => {
    if (!acc.token) {
      toast.error("Akun ini tidak memiliki token")
      return
    }
    await navigator.clipboard.writeText(acc.token)
    toast.success(`Token ${acc.email} berhasil disalin`)
  }

  const handleEditAccount = async (acc: AccountItem) => {
    if (!requireSessionKey()) return
    const nextEmail = window.prompt("Edit Email", acc.email)
    if (nextEmail === null) return
    const nextPassword = window.prompt("Edit Kata Sandi (opsional)", acc.password || "")
    if (nextPassword === null) return
    const nextUsername = window.prompt("Edit Nama Pengguna (opsional)", acc.username || "")
    if (nextUsername === null) return
    const nextToken = window.prompt("Edit Token", acc.token || "")
    if (nextToken === null) return
    if (!nextToken.trim()) {
      toast.error("Token tidak boleh kosong")
      return
    }
    const id = toast.loading(`Menyimpan ${acc.email}...`)
    const res = await fetch(`${API_BASE}/api/admin/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({
        email: nextEmail.trim() || acc.email,
        password: nextPassword,
        username: nextUsername,
        cookies: acc.cookies || "",
        token: nextToken.trim(),
      }),
    }).catch(() => null)
    if (!res) {
      toast.error("Permintaan simpan akun gagal", { id })
      return
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      toast.error(localizeError(data.error) || "Gagal menyimpan", { id, duration: 8000 })
      return
    }
    if ((nextEmail.trim() || acc.email) !== acc.email) {
      await fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(acc.email)}`, {
        method: "DELETE",
        headers: getAuthHeader(),
      }).catch(() => null)
    }
    toast.success("Akun berhasil disimpan", { id })
    fetchAccounts()
  }

  const exportAccounts = (scope: "all" | "selected", format: "json" | "zip") => {
    const list = scope === "selected" ? selectedAccounts : accounts
    if (!list.length) {
      toast.error(scope === "selected" ? "Silakan pilih akun terlebih dahulu" : "Tidak ada akun untuk diekspor")
      return
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    if (format === "json") {
      downloadJSON(`qwen2api-accounts-${scope}-${stamp}.json`, { accounts: list })
      toast.success("File JSON akun berhasil diekspor")
      return
    }
    const entries: ZipEntry[] = [
      { name: "accounts.json", content: JSON.stringify({ accounts: list }, null, 2) },
      ...list.map(acc => ({ name: `accounts/${safeFileName(acc.email)}.json`, content: JSON.stringify(acc, null, 2) })),
    ]
    downloadBlob(`qwen2api-accounts-${scope}-${stamp}.zip`, zipBlob(entries))
    toast.success("File ZIP akun berhasil diekspor")
  }

  return (
    <div className="space-y-6 relative">
      <input ref={importFileInputRef} type="file" accept=".txt,.json,.csv" multiple className="hidden" onChange={handleImportFile} />

      <section className="relative overflow-hidden rounded-[32px] border border-white/75 bg-card/82 p-6 shadow-[var(--shadow-lift)] backdrop-blur-sm">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-accent/45 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-muted-foreground">Account Fleet</div>
            <h2 className="mt-2 text-4xl font-black tracking-tight">Manajemen Pool Akun</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Kelola pool akun upstream, mendukung penambahan manual, impor file, verifikasi massal, dan pemantauan status.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fetchAccounts(true)}>
              <RefreshCw className="mr-2 size-4" /> Segarkan
            </Button>
            <Button variant="outline" onClick={handleVerifyAll} disabled={verifyingAll}>
              <RefreshCw className={`mr-2 size-4 ${verifyingAll ? "animate-spin" : ""}`} /> Segarkan Info & Kuota Akun
            </Button>
            <Button variant="outline" onClick={() => importFileInputRef.current?.click()}>
              <FileUp className="mr-2 size-4" /> Impor
            </Button>
            <Button variant="outline" onClick={() => exportAccounts("all", "json")}>
              <Download className="mr-2 size-4" /> Ekspor Semua JSON
            </Button>
            <Button variant="outline" onClick={() => exportAccounts("all", "zip")}>
              <FolderArchive className="mr-2 size-4" /> Ekspor Semua ZIP
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard icon={<UserRound className="size-5" />} label="Total Akun" value={stats.total} tone="neutral" />
        <MetricCard icon={<CheckCircle2 className="size-5" />} label="Akun Normal" value={stats.valid} tone="emerald" />
        <MetricCard icon={<ShieldAlert className="size-5" />} label="Rate Limit" value={stats.rateLimited} tone="orange" />
        <MetricCard icon={<XCircle className="size-5" />} label="Akun Bermasalah" value={stats.abnormal} tone="rose" />
        <MetricCard icon={<Ban className="size-5" />} label="Akun Diblokir" value={stats.banned} tone="neutral" />
        <MetricCard icon={<RotateCw className="size-5" />} label="Kuota Media" value={stats.quota} tone="blue" />
      </div>
      <p className="text-xs text-muted-foreground">
        Semua akun valid dapat digunakan untuk chat, gambar, dan video. Limitasi kuota gambar, video, dan chat dicatat terpisah. Kuota media menampilkan data dari upstream (0 jika tidak ada data spesifik).
      </p>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[30px] border border-white/75 bg-card/86 p-6 shadow-[var(--shadow-lift)]">
          <div className="mb-4">
            <h3 className="text-xl font-black tracking-tight">Tambah Akun Qwen</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pilih salah satu metode: <strong>Metode 1 (Rekomendasi)</strong>: Masukkan <strong>Email & Kata Sandi</strong> Qwen untuk login otomatis via protokol Android resmi (bebas blokir Captcha WAF). <strong>Metode 2</strong>: Tempel <strong>Token manual</strong> dari Local Storage browser jika Anda login via Google/OAuth.
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Tips: Jika akun didaftarkan dengan Email & Kata Sandi, cukup isi Email dan Sandi di bawah tanpa perlu menyalin Token dari browser.
            </p>
          </div>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</label>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full rounded-2xl border bg-background px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Kata Sandi</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Kata sandi akun Qwen"
                  className="w-full rounded-2xl border bg-background px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Atau Tempel Token Manual (Opsional)</label>
              <input
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Tempel token dari Local Storage (jika tidak menggunakan Email & Sandi)"
                className="w-full rounded-2xl border bg-background px-4 py-2.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex justify-end pt-1">
              <Button onClick={handleAdd}>
                <Plus className="mr-2 size-4" /> Simpan / Login Akun
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-white/75 bg-card/86 p-6 shadow-[var(--shadow-lift)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black tracking-tight">Impor Massal</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Mendukung format multi-baris token, 'email,token', objek/array JSON, atau format nested accounts/items/data.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => importFileInputRef.current?.click()}>
              <FileUp className="mr-2 size-4" /> Pilih File
            </Button>
          </div>
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            rows={5}
            placeholder={`Satu token per baris, atau format JSON: [{"email":"a@qwen","token":"..."}]`}
            className="w-full rounded-2xl border bg-background p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              Terdeteksi <span className="font-black text-foreground">{parsedBulkAccounts.length}</span> kandidat akun
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setBulkText("")} disabled={!bulkText}>
                Bersihkan
              </Button>
              <Button size="sm" onClick={handleBulkImport} disabled={bulkImporting || parsedBulkAccounts.length === 0}>
                {bulkImporting ? <RefreshCw className="mr-2 size-3 animate-spin" /> : <Plus className="mr-2 size-3" />}
                Impor Akun
              </Button>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-[30px] border border-white/75 bg-card/86 shadow-[var(--shadow-lift)]">
        <div className="flex flex-col gap-4 border-b border-border/50 bg-muted/10 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-black tracking-tight">Daftar Akun</h3>
            <p className="text-sm text-muted-foreground">Menampilkan {filteredAccounts.length} / {accounts.length} akun</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Cari email / username..."
                className="w-full rounded-2xl border bg-background py-2 pl-9 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} className="rounded-2xl border bg-background px-3 py-2 text-xs">
              <option value="all">Semua Layanan</option>
              {serviceOptions.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={planFilter} onChange={e => setPlanFilter(e.target.value)} className="rounded-2xl border bg-background px-3 py-2 text-xs">
              <option value="all">Semua Paket / Pool</option>
              {planOptions.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-2xl border bg-background px-3 py-2 text-xs">
              <option value="all">Semua Status</option>
              <option value="valid">Normal</option>
              <option value="pending_activation">Belum Aktivasi</option>
              <option value="rate_limited">Rate Limit</option>
              <option value="banned">Diblokir</option>
              <option value="auth_error">Autentikasi Gagal</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-background/60 px-5 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDeleteAbnormal}>
              <Trash2 className="mr-1.5 size-3 text-rose-500" /> Hapus Akun Bermasalah
            </Button>
            {selectedAccounts.length > 0 && (
              <>
                <span className="font-bold text-foreground">Dipilih {selectedAccounts.length}</span>
                <Button variant="outline" size="sm" onClick={handleVerifySelected}>
                  <RefreshCw className="mr-1.5 size-3" /> Segarkan Akun Terpilih
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeleteSelected} className="text-rose-600 hover:text-rose-700">
                  <Trash2 className="mr-1.5 size-3" /> Hapus Terpilih
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportAccounts("selected", "json")}>
                  <Download className="mr-1.5 size-3" /> Ekspor JSON Terpilih
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportAccounts("selected", "zip")}>
                  <FolderArchive className="mr-1.5 size-3" /> Ekspor ZIP Terpilih
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-b bg-muted/20 text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} className="rounded" />
                </th>
                <th className="px-3 py-3 font-bold">TOKEN</th>
                <th className="px-3 py-3 font-bold">Penyedia</th>
                <th className="px-3 py-3 font-bold">Paket / Pool</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Informasi Akun</th>
                <th className="px-3 py-3 font-bold">Kuota Media</th>
                <th className="px-3 py-3 font-bold">Batas / Pemulihan</th>
                <th className="px-3 py-3 font-bold">Sukses</th>
                <th className="px-3 py-3 font-bold">Gagal</th>
                <th className="px-4 py-3 text-right font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground">
                    Tidak ada akun yang cocok. Silakan sesuaikan filter atau tambahkan token baru.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map(acc => {
                  const isChecked = selected.has(acc.email)
                  const isTargetVerifying = verifying === acc.email
                  const limits = activeRateLimits(acc)
                  return (
                    <tr key={acc.email} className={`transition hover:bg-black/5 dark:hover:bg-white/5 ${isChecked ? "bg-primary/5" : ""}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={isChecked} onChange={() => toggleSelected(acc.email)} className="rounded" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-muted-foreground">{maskedToken(acc.token)}</span>
                          <button
                            type="button"
                            onClick={() => void handleCopyToken(acc)}
                            className="text-muted-foreground hover:text-foreground"
                            title="Salin token"
                          >
                            <Copy className="size-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-medium text-foreground">{serviceOf(acc)}</td>
                      <td className="px-3 py-3 font-medium text-foreground">{planOf(acc)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusStyle(effectiveStatusCode(acc))}`}>
                          {statusText(acc)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="font-bold text-foreground">{acc.email}</div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>{acc.username || "qwen-user"}</span>
                            {acc.source === "env" && (
                              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-bold text-emerald-600">
                                Environment Variable
                              </span>
                            )}
                          </div>
                          {limits.length > 0 ? (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {limits.map(limit => (
                                <span
                                  key={limit.usage}
                                  className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                                  title={limit.error || undefined}
                                >
                                  {limit.label}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[10px] text-muted-foreground/80">
                              Akun aktif dapat digunakan untuk chat, gambar, dan video.
                            </div>
                          )}
                          {statusNote(acc) && (
                            <div className="max-w-[280px] truncate text-[10px] text-muted-foreground" title={statusNote(acc)}>
                              {statusNote(acc)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono">{quotaOf(acc)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{recoveryText(acc)}</td>
                      <td className="px-3 py-3 font-mono text-emerald-600 dark:text-emerald-400">{successOf(acc)}</td>
                      <td className="px-3 py-3 font-mono text-rose-600 dark:text-rose-400">{failureOf(acc)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {acc.status_code === "pending_activation" && (
                            <Button size="icon" variant="ghost" className="size-7" onClick={() => handleActivate(acc.email)} title="Aktivasi">
                              <Zap className="size-3.5 text-amber-500" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => void handleEditAccount(acc)} title="Edit">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => handleVerify(acc.email)} disabled={isTargetVerifying} title="Segarkan / Verifikasi">
                            <RefreshCw className={`size-3.5 ${isTargetVerifying ? "animate-spin" : ""}`} />
                          </Button>
                          <Button size="icon" variant="ghost" className="size-7 text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30" onClick={() => handleDelete(acc)} disabled={acc.source === "env"} title={acc.source === "env" ? "Hapus dari file .env" : "Hapus"}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function MetricCard({ icon, label, value, tone = "neutral" }: { icon: ReactNode; label: string; value: number; tone?: "neutral" | "emerald" | "orange" | "rose" | "blue" }) {
  const toneClass = {
    neutral: "text-foreground",
    emerald: "text-emerald-600 dark:text-emerald-300",
    orange: "text-orange-600 dark:text-orange-300",
    rose: "text-rose-600 dark:text-rose-300",
    blue: "text-blue-600 dark:text-blue-300",
  }[tone]
  return (
    <div className="rounded-[28px] border border-white/75 bg-card/82 p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{label}</span>
        <span className="opacity-65">{icon}</span>
      </div>
      <div className={`mt-5 text-4xl font-black tracking-tight ${toneClass}`}>{value}</div>
    </div>
  )
}
