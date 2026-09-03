import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "../components/ui/button"
import { Check, Copy, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { adminRequestErrorMessage, getAuthHeader, getStoredApiKey } from "../lib/auth"
import { API_BASE } from "../lib/api"

type ApiKeyItem = {
  key: string
  source?: "env" | "managed"
  label?: string
}

function maskKey(key: string) {
  if (key.length <= 14) return "sk-***"
  return `${key.slice(0, 8)}...${key.slice(-6)}`
}

export default function TokensPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([])
  const [copied, setCopied] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [createMode, setCreateMode] = useState<"auto" | "custom">("auto")
  const [customKey, setCustomKey] = useState("")

  const latestKey = useMemo(() => keys[0]?.key || "", [keys])

  const loadKeys = useCallback(() => {
    if (!getStoredApiKey()) {
      setKeys([])
      setLoading(false)
      toast.error("Silakan masukkan ADMIN_KEY atau API Key di menu 'Pengaturan Sistem' terlebih dahulu")
      return
    }
    setLoading(true)
    fetch(`${API_BASE}/api/admin/keys`, { headers: getAuthHeader() })
      .then(async res => {
        if (!res.ok) throw new Error(await adminRequestErrorMessage(res))
        return res.json()
      })
      .then(data => {
        if (Array.isArray(data.items)) {
          setKeys(data.items)
          return
        }
        setKeys((data.keys || []).map((key: string) => ({ key, source: "managed", label: "Key Panel" })))
      })
      .catch(err => toast.error(err instanceof Error ? err.message : "Gagal memuat, periksa Kunci Sesi"))
      .finally(() => setLoading(false))
  }, [])

  const fetchKeys = useCallback(() => {
    loadKeys()
  }, [loadKeys])

  useEffect(() => {
    loadKeys()
  }, [loadKeys])

  const copyToClipboard = async (text: string) => {
    const value = text.trim()
    if (!value) {
      toast.error("Tidak ada teks untuk disalin")
      return
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        throw new Error("clipboard unavailable")
      }
    } catch {
      try {
        const textarea = document.createElement("textarea")
        textarea.value = value
        textarea.setAttribute("readonly", "")
        textarea.style.position = "fixed"
        textarea.style.left = "-9999px"
        document.body.appendChild(textarea)
        textarea.select()
        const ok = document.execCommand("copy")
        document.body.removeChild(textarea)
        if (!ok) {
          throw new Error("copy failed")
        }
      } catch {
        toast.error("Gagal menyalin, periksa izin clipboard browser")
        return
      }
    }
    setCopied(value)
    toast.success("Berhasil disalin ke clipboard")
    window.setTimeout(() => setCopied(null), 1800)
  }

  const handleCreate = () => {
    if (!getStoredApiKey()) {
      toast.error("Silakan masukkan ADMIN_KEY atau API Key di menu 'Pengaturan Sistem'")
      return
    }
    if (createMode === "custom" && !customKey.trim()) {
      toast.error("Masukkan API Key kustom")
      return
    }
    const id = toast.loading(createMode === "custom" ? "Menambahkan API Key kustom..." : "Membuat API Key baru...")
    fetch(`${API_BASE}/api/admin/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({
        mode: createMode,
        key: createMode === "custom" ? customKey.trim() : "",
      }),
    }).then(async res => {
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(createMode === "custom" ? "API Key kustom berhasil ditambahkan" : "API Key baru berhasil dibuat dan disalin ke clipboard", { id })
        if (data.key) void copyToClipboard(data.key)
        setCreateOpen(false)
        setCustomKey("")
        setCreateMode("auto")
        fetchKeys()
      } else {
        toast.error(data.detail || data.error || "Gagal membuat, periksa hak akses", { id })
      }
    }).catch(() => toast.error("Gagal membuat, periksa hak akses", { id }))
  }

  const handleDelete = (item: ApiKeyItem) => {
    if (!getStoredApiKey()) {
      toast.error("Silakan masukkan ADMIN_KEY atau API Key di menu 'Pengaturan Sistem'")
      return
    }
    if (item.source === "env") {
      toast.error("API Key dari environment variable tidak dapat dihapus melalui panel")
      return
    }
    const id = toast.loading("Menghapus API Key...")
    fetch(`${API_BASE}/api/admin/keys/${encodeURIComponent(item.key)}`, {
      method: "DELETE",
      headers: getAuthHeader(),
    }).then(async res => {
      if (res.ok) {
        toast.success("API Key berhasil dihapus", { id })
        fetchKeys()
      } else {
        toast.error(await adminRequestErrorMessage(res), { id })
      }
    }).catch(() => toast.error("Gagal menghapus", { id }))
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/75 bg-card/82 p-6 shadow-[var(--shadow-lift)] backdrop-blur-sm">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-accent/45 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-muted-foreground">API Key</div>
            <h2 className="mt-2 text-4xl font-black tracking-tight">Distribusi API Key</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Kelola Bearer Key untuk klien downstream yang mengakses gateway Go (kompatibel dengan OpenAI, Anthropic, Gemini, Gambar, dan Video).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { fetchKeys(); toast.success("Disegarkan") }} disabled={loading}>
              <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} /> Segarkan
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" /> Buat Key
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[28px] border border-white/75 bg-card/82 p-5 shadow-[var(--shadow-soft)]">
          <div className="text-sm text-muted-foreground">Jumlah API Key</div>
          <div className="mt-3 text-4xl font-black">{keys.length}</div>
        </div>
        <div className="rounded-[28px] border border-white/75 bg-card/82 p-5 shadow-[var(--shadow-soft)]">
          <div className="text-sm text-muted-foreground">Key Terbaru</div>
          <div className="mt-3 truncate font-mono text-xl font-black">{latestKey ? maskKey(latestKey) : "Belum dibuat"}</div>
        </div>
        <div className="rounded-[28px] border border-white/75 bg-card/82 p-5 shadow-[var(--shadow-soft)]">
          <div className="text-sm text-muted-foreground">Metode Autentikasi</div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border bg-accent/70 px-3 py-1 text-sm font-bold text-accent-foreground">
            <ShieldCheck className="size-4" />
            Bearer / x-api-key
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-[30px] border border-white/75 bg-card/86 shadow-[var(--shadow-lift)]">
        <div className="flex items-center justify-between border-b border-border/50 bg-muted/10 px-6 py-5">
          <div>
            <h3 className="text-xl font-black tracking-tight">Daftar API Key</h3>
            <p className="text-sm text-muted-foreground">Key disamarkan secara default, salin untuk mendapatkan nilai lengkap. Key dari environment dihapus via file .env.</p>
          </div>
          <KeyRound className="size-8 text-muted-foreground/30" />
        </div>
        <div className="divide-y divide-border/50">
          {keys.length === 0 ? (
            <div className="grid min-h-72 place-items-center p-8 text-center text-muted-foreground">
              <div>
                <KeyRound className="mx-auto mb-4 size-12 opacity-30" />
                <div className="font-semibold text-foreground">Belum Ada API Key</div>
                <p className="mt-1 text-sm">Klik 'Buat Key' untuk membuat token akses baru atau tentukan melalui variabel lingkungan.</p>
              </div>
            </div>
          ) : (
            keys.map((item, index) => (
              <div key={item.key} className="grid gap-4 px-6 py-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
                <div className="grid size-10 place-items-center rounded-2xl bg-muted font-mono text-sm font-black">{index + 1}</div>
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-bold">{maskKey(item.key)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Nilai disamarkan untuk keamanan tampilan.</span>
                    <span className={`rounded-full border px-2 py-0.5 font-bold ${item.source === "env" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                      {item.label || (item.source === "env" ? "Key Environment" : "Key Panel")}
                    </span>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void copyToClipboard(item.key)}>
                    {copied === item.key ? <Check className="mr-2 size-4 text-emerald-600" /> : <Copy className="mr-2 size-4" />}
                    Salin
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(item)}
                    disabled={item.source === "env"}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    title={item.source === "env" ? "Hapus dari file .env" : "Hapus"}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-white/75 bg-card p-5 shadow-[var(--shadow-lift)]">
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="size-5 text-primary" />
                <h3 className="text-lg font-black">Buat API Key</h3>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setCreateOpen(false)} title="Tutup">
                <X className="size-4" />
              </Button>
            </div>
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 rounded-2xl border bg-muted/30 p-1">
                <button
                  type="button"
                  onClick={() => setCreateMode("auto")}
                  className={`rounded-xl px-3 py-2 text-sm font-bold ${createMode === "auto" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                  Generate Otomatis
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode("custom")}
                  className={`rounded-xl px-3 py-2 text-sm font-bold ${createMode === "custom" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                  Key Kustom
                </button>
              </div>

              {createMode === "custom" && (
                <div className="space-y-2">
                  <label className="text-sm font-bold">API Key</label>
                  <input
                    type="text"
                    value={customKey}
                    onChange={e => setCustomKey(e.target.value)}
                    placeholder="sk-your-custom-key"
                    className="flex h-11 w-full rounded-2xl border border-input bg-background px-3 py-2 font-mono text-sm"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
                <Button onClick={handleCreate}>
                  <Plus className="mr-2 size-4" /> Buat
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
