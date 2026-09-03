import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "../components/ui/button"
import {
  Activity,
  Check,
  Clock,
  Copy,
  Cpu,
  Eye,
  Filter,
  Layers,
  Play,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  User,
  Wrench,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { adminRequestErrorMessage, getAuthHeader, getStoredApiKey } from "../lib/auth"
import { API_BASE } from "../lib/api"

export type ActivityLogItem = {
  id: string
  timestamp: number
  time_formatted: string
  method: string
  path: string
  surface: string
  requested_model: string
  resolved_model: string
  account: string
  chat_id: string
  status: number
  duration_ms: number
  prompt: string
  response: string
  tools?: string[]
  tool_calls?: string[]
  finish_reason?: string
  stream: boolean
  error?: string
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ActivityLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [accountFilter, setAccountFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [surfaceFilter, setSurfaceFilter] = useState("all")
  const [selectedLog, setSelectedLog] = useState<ActivityLogItem | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const fetchLogs = useCallback(
    (silent = false) => {
      if (!getStoredApiKey()) {
        setLogs([])
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      fetch(`${API_BASE}/api/admin/logs?limit=100`, { headers: getAuthHeader() })
        .then(async res => {
          if (!res.ok) throw new Error(await adminRequestErrorMessage(res))
          return res.json()
        })
        .then(data => {
          setLogs(Array.isArray(data.logs) ? data.logs : [])
        })
        .catch(err => {
          if (!silent) toast.error(err instanceof Error ? err.message : "Gagal memuat log aktivitas")
        })
        .finally(() => {
          if (!silent) setLoading(false)
        })
    },
    []
  )

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Polling otomatis setiap 2.5 detik jika autoRefresh aktif
  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(() => {
      fetchLogs(true)
    }, 2500)
    return () => clearInterval(timer)
  }, [autoRefresh, fetchLogs])

  const handleClearLogs = () => {
    if (!confirm("Apakah Anda yakin ingin membersihkan semua riwayat log aktivitas saat ini?")) return
    const toastId = toast.loading("Membersihkan riwayat log...")
    fetch(`${API_BASE}/api/admin/logs`, {
      method: "DELETE",
      headers: getAuthHeader(),
    })
      .then(async res => {
        if (!res.ok) throw new Error(await adminRequestErrorMessage(res))
        setLogs([])
        setSelectedLog(null)
        toast.success("Riwayat log aktivitas berhasil dibersihkan", { id: toastId })
      })
      .catch(err => {
        toast.error(err instanceof Error ? err.message : "Gagal membersihkan log", { id: toastId })
      })
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(label)
        toast.success("Berhasil disalin ke clipboard")
        setTimeout(() => setCopied(null), 1800)
      })
      .catch(() => toast.error("Gagal menyalin"))
  }

  // Daftar akun unik untuk filter
  const uniqueAccounts = useMemo(() => {
    const set = new Set<string>()
    logs.forEach(l => {
      if (l.account) set.add(l.account)
    })
    return Array.from(set)
  }, [logs])

  // Filter log
  const filteredLogs = useMemo(() => {
    return logs.filter(item => {
      if (accountFilter !== "all" && item.account !== accountFilter) return false
      if (statusFilter === "success" && (item.status < 200 || item.status >= 300)) return false
      if (statusFilter === "error" && item.status >= 200 && item.status < 300) return false
      if (surfaceFilter !== "all" && item.surface !== surfaceFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchPrompt = item.prompt?.toLowerCase().includes(q)
        const matchResp = item.response?.toLowerCase().includes(q)
        const matchModel = item.requested_model?.toLowerCase().includes(q)
        const matchAccount = item.account?.toLowerCase().includes(q)
        const matchID = item.id?.toLowerCase().includes(q)
        const matchTools = item.tools?.some(t => t.toLowerCase().includes(q))
        return matchPrompt || matchResp || matchModel || matchAccount || matchID || matchTools
      }
      return true
    })
  }, [logs, accountFilter, statusFilter, surfaceFilter, searchQuery])

  // Ringkasan Statistik
  const stats = useMemo(() => {
    const total = logs.length
    const success = logs.filter(l => l.status >= 200 && l.status < 300).length
    const errors = total - success
    const avgDuration =
      total > 0 ? Math.round(logs.reduce((acc, curr) => acc + (curr.duration_ms || 0), 0) / total) : 0
    return { total, success, errors, avgDuration }
  }, [logs])

  return (
    <div className="w-full space-y-6">
      {/* Hero Header */}
      <section className="admin-hero p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.28em] text-muted-foreground flex items-center gap-2">
            <Terminal className="size-3.5 text-primary" />
            Live Request Monitor
          </div>
          <h2 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">Log Aktivitas Permintaan</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Pantau secara realtime permintaan yang masuk ke gateway, perutean akun Qwen, isi pesan prompt, respon model, dan eksekusi tool calling.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(prev => !prev)}
            className="gap-1.5"
          >
            {autoRefresh ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live Polling (Aktif)
              </>
            ) : (
              <>
                <Play className="size-3.5" />
                Live Polling (Jeda)
              </>
            )}
          </Button>

          <Button variant="outline" size="sm" onClick={() => fetchLogs(false)} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {logs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearLogs} className="text-red-500 hover:text-red-600 gap-1.5">
              <Trash2 className="size-3.5" />
              Bersihkan
            </Button>
          )}
        </div>
      </section>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="admin-card p-4">
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <Activity className="size-3.5 text-blue-500" /> Total Permintaan
          </div>
          <div className="mt-2 text-2xl font-black">{stats.total}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Buffer tersimpan (maks 200)</div>
        </div>

        <div className="admin-card p-4">
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <Zap className="size-3.5 text-emerald-500" /> Sukses (2xx)
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-500">{stats.success}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {stats.total > 0 ? `${Math.round((stats.success / stats.total) * 100)}% berhasil` : "Belum ada request"}
          </div>
        </div>

        <div className="admin-card p-4">
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <Clock className="size-3.5 text-amber-500" /> Rata-rata Latensi
          </div>
          <div className="mt-2 text-2xl font-black text-amber-500">
            {stats.avgDuration > 1000 ? `${(stats.avgDuration / 1000).toFixed(1)}s` : `${stats.avgDuration}ms`}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Waktu respon upstream</div>
        </div>

        <div className="admin-card p-4">
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <User className="size-3.5 text-purple-500" /> Akun Aktif Terlibat
          </div>
          <div className="mt-2 text-2xl font-black text-purple-500">{uniqueAccounts.length}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Akun dalam rotasi pool</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="admin-card p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari prompt, pesan, ID, atau model..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-border/60 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Filter Akun */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="size-3.5" />
            <select
              value={accountFilter}
              onChange={e => setAccountFilter(e.target.value)}
              className="bg-background border border-border/60 rounded-md px-2.5 py-1.5 text-xs focus:outline-none"
            >
              <option value="all">Semua Akun ({uniqueAccounts.length})</option>
              {uniqueAccounts.map(acc => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-background border border-border/60 rounded-md px-2.5 py-1.5 text-xs focus:outline-none"
          >
            <option value="all">Semua Status</option>
            <option value="success">Sukses (2xx)</option>
            <option value="error">Gagal / Error</option>
          </select>

          {/* Filter Surface */}
          <select
            value={surfaceFilter}
            onChange={e => setSurfaceFilter(e.target.value)}
            className="bg-background border border-border/60 rounded-md px-2.5 py-1.5 text-xs focus:outline-none"
          >
            <option value="all">Semua Protokol</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
            <option value="images">Gambar (WanX)</option>
            <option value="videos">Video (WanX)</option>
          </select>
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="admin-card overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Terminal className="size-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="font-medium text-base">Belum ada riwayat aktivitas permintaan</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {logs.length > 0
                ? "Tidak ada log yang cocok dengan kriteria filter saat ini."
                : "Kirim pesan melalui Cline, Roo Code, Chatbox, atau tab 'Uji Coba API' untuk melihat log di sini."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border/50 text-muted-foreground font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Protokol & Path</th>
                  <th className="py-3 px-3">Model</th>
                  <th className="py-3 px-4">Akun Pemroses</th>
                  <th className="py-3 px-4">Ringkasan Pesan (Prompt)</th>
                  <th className="py-3 px-3">Tool Calling</th>
                  <th className="py-3 px-3">Latensi</th>
                  <th className="py-3 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredLogs.map(item => {
                  const isSuccess = item.status >= 200 && item.status < 300
                  const isRateLimit = item.status === 429
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedLog(item)}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-muted-foreground">
                        {item.time_formatted}
                        <div className="text-[10px] text-muted-foreground/60">{item.id}</div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isSuccess
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
                              : isRateLimit
                              ? "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400"
                              : "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <span className="uppercase text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {item.surface}
                          </span>
                          <span className="font-mono text-[11px]">{item.path}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="admin-chip font-mono text-[11px]">
                          {item.requested_model || item.resolved_model || "-"}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.account ? (
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-foreground">
                            <span className="size-2 rounded-full bg-purple-500/80"></span>
                            {item.account}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 max-w-xs truncate">
                        <span className="text-foreground/90 font-mono text-[11px]">
                          {item.prompt ? item.prompt.slice(-90).replace(/\n/g, " ") : item.error || "-"}
                        </span>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {item.tool_calls && item.tool_calls.length > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/30">
                            <Wrench className="size-3" />
                            {item.tool_calls.join(", ")}
                          </span>
                        ) : item.tools && item.tools.length > 0 ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground bg-muted">
                            <Layers className="size-2.5" />
                            {item.tools.length} Tools
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">-</span>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap font-mono text-muted-foreground">
                        {item.duration_ms > 1000
                          ? `${(item.duration_ms / 1000).toFixed(1)}s`
                          : `${item.duration_ms}ms`}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedLog(item)
                          }}
                          className="size-7 p-0"
                        >
                          <Eye className="size-3.5 text-muted-foreground hover:text-foreground" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detail Log */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border shadow-2xl rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                    selectedLog.status >= 200 && selectedLog.status < 300
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                      : "bg-red-500/10 text-red-600 border-red-500/30"
                  }`}
                >
                  HTTP {selectedLog.status}
                </span>
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    Detail Permintaan: <span className="font-mono text-primary">{selectedLog.id}</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Direkam pada {selectedLog.time_formatted} • Durasi: {selectedLog.duration_ms}ms •{" "}
                    {selectedLog.stream ? "SSE Streaming" : "Sinkron (Non-Stream)"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              {/* Routing Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/30 p-3.5 rounded-lg border border-border/40">
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase font-semibold">Akun Pemroses</div>
                  <div className="font-mono font-medium truncate mt-0.5 text-purple-400">
                    {selectedLog.account || "Tidak tercatat"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase font-semibold">Model AI</div>
                  <div className="font-mono font-medium truncate mt-0.5">
                    {selectedLog.requested_model || selectedLog.resolved_model}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase font-semibold">Protokol / Path</div>
                  <div className="font-mono font-medium truncate mt-0.5">
                    {selectedLog.method} {selectedLog.path}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase font-semibold">Chat Sesi ID</div>
                  <div className="font-mono font-medium truncate mt-0.5 text-muted-foreground">
                    {selectedLog.chat_id || "-"}
                  </div>
                </div>
              </div>

              {/* Tools Section (Jika Ada) */}
              {(selectedLog.tools?.length || selectedLog.tool_calls?.length) && (
                <div className="space-y-2 bg-blue-500/5 border border-blue-500/20 p-3.5 rounded-lg">
                  <div className="font-semibold text-blue-500 flex items-center gap-1.5">
                    <Wrench className="size-3.5" /> Informasi Tool Calling (AI Agent)
                  </div>
                  {selectedLog.tool_calls && selectedLog.tool_calls.length > 0 && (
                    <div>
                      <div className="text-muted-foreground text-[11px] mb-1 font-medium">
                        Tool yang Dipicu Model:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedLog.tool_calls.map(tc => (
                          <span
                            key={tc}
                            className="bg-blue-500/15 border border-blue-500/30 text-blue-400 px-2 py-0.5 rounded font-mono font-semibold"
                          >
                            {tc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedLog.tools && selectedLog.tools.length > 0 && (
                    <div>
                      <div className="text-muted-foreground text-[11px] mb-1 font-medium">
                        Daftar Tool Disediakan Klien ({selectedLog.tools.length}):
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedLog.tools.map(t => (
                          <span key={t} className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Prompt / Pesan User */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <User className="size-3.5 text-primary" /> Pesan Masuk / Prompt Klien
                  </span>
                  {selectedLog.prompt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(selectedLog.prompt, "prompt")}
                      className="h-6 text-[11px] gap-1"
                    >
                      {copied === "prompt" ? <Check className="size-3" /> : <Copy className="size-3" />}
                      Salin
                    </Button>
                  )}
                </div>
                <pre className="bg-muted/50 p-3.5 rounded-lg border border-border/50 overflow-x-auto font-mono text-[11px] max-h-48 whitespace-pre-wrap">
                  {selectedLog.prompt || "(Tidak ada pesan prompt tercatat)"}
                </pre>
              </div>

              {/* Respon Model AI */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <Cpu className="size-3.5 text-emerald-500" /> Respon Model Qwen
                  </span>
                  {selectedLog.response && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(selectedLog.response, "response")}
                      className="h-6 text-[11px] gap-1"
                    >
                      {copied === "response" ? <Check className="size-3" /> : <Copy className="size-3" />}
                      Salin
                    </Button>
                  )}
                </div>
                <pre className="bg-muted/50 p-3.5 rounded-lg border border-border/50 overflow-x-auto font-mono text-[11px] max-h-48 whitespace-pre-wrap">
                  {selectedLog.response || selectedLog.error || (selectedLog.status >= 200 && selectedLog.status < 300 ? "(Selesai streaming / Tidak ada teks jawaban langsung)" : "Gagal memproses")}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-muted/20 border-t border-border flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(JSON.stringify(selectedLog, null, 2), "raw_json")}
                className="gap-1.5 text-xs"
              >
                {copied === "raw_json" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                Salin JSON Lengkap
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setSelectedLog(null)}>
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
