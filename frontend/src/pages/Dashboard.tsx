import { useEffect, useState, type ReactNode } from "react"
import {
  Activity,
  ActivityIcon,
  Cpu,
  FileJson,
  Flame,
  GaugeCircle,
  Globe,
  ImageIcon,
  RadioTower,
  Server,
  Shield,
  ShieldAlert,
  Video,
} from "lucide-react"
import { toast } from "sonner"
import { getAuthHeader } from "../lib/auth"
import { API_BASE } from "../lib/api"

type AccountRow = {
  email: string
  status: string
  inflight: number
  max_inflight: number
  consecutive_failures: number
  rate_limit_strikes: number
  last_request_finished: number
}

type Status = {
  accounts?: {
    total?: number
    valid?: number
    rate_limited?: number
    invalid?: number
    in_use?: number
    global_in_use?: number
    waiting?: number
    max_inflight_per_account?: number
    max_queue_size?: number
  }
  per_account?: AccountRow[]
  chat_id_pool?: {
    total_cached?: number
    target_per_account?: number
    ttl_seconds?: number
    per_account?: Record<string, number>
  } | null
  runtime?: {
    mode?: string
    goroutines_note?: string
  }
  request_runtime?: {
    mode?: string
    browser_required_for_requests?: boolean
    description?: string
  }
  browser_automation?: {
    mode?: string
    description?: string
  }
}

const endpointRows = [
  { icon: FileJson, iconClass: "bg-emerald-500/10 text-emerald-700", path: "POST /v1/chat/completions", tag: "OpenAI", tagClass: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20" },
  { icon: Cpu, iconClass: "bg-blue-500/10 text-blue-700", path: "POST /v1/messages", tag: "Anthropic", tagClass: "bg-blue-500/10 text-blue-700 ring-blue-500/20" },
  { icon: Globe, iconClass: "bg-amber-500/10 text-amber-700", path: "POST /v1beta/models/{model}:generateContent", tag: "Gemini", tagClass: "bg-amber-500/10 text-amber-700 ring-amber-500/20" },
  { icon: ImageIcon, iconClass: "bg-rose-500/10 text-rose-700", path: "POST /v1/images/generations", tag: "Image", tagClass: "bg-rose-500/10 text-rose-700 ring-rose-500/20" },
  { icon: Video, iconClass: "bg-orange-500/10 text-orange-700", path: "POST /v1/videos/generations", tag: "Video", tagClass: "bg-orange-500/10 text-orange-700 ring-orange-500/20" },
  { icon: Shield, iconClass: "bg-stone-500/10 text-stone-700", path: "GET /healthz / readyz", tag: "Probe", tagClass: "bg-stone-500/10 text-stone-700 ring-stone-500/20" },
] as const

export default function Dashboard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [errOnce, setErrOnce] = useState(false)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/status`, { headers: getAuthHeader() })
        if (!res.ok) throw new Error("Unauthorized")
        setStatus(await res.json())
      } catch {
        if (!errOnce) {
          toast.error("Gagal mengambil status, silakan periksa Kunci Sesi di menu Pengaturan Sistem.")
          setErrOnce(true)
        }
      }
    }
    void fetchStatus()
    const timer = window.setInterval(fetchStatus, 3000)
    return () => window.clearInterval(timer)
  }, [errOnce])

  const acc = status?.accounts || {}
  const pool = status?.chat_id_pool
  const rows = status?.per_account || []
  const requestRuntime = status?.request_runtime
  const browserRuntime = status?.browser_automation

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-white/75 bg-card/82 p-6 shadow-[var(--shadow-lift)] backdrop-blur-sm">
        <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-accent/45 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-muted-foreground">Runtime Overview</div>
            <h2 className="mt-2 text-4xl font-black tracking-tight">Ringkasan Sistem</h2>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Alur permintaan HTTP backend Go, konkurensi pool akun, kumpulan API, dan otomatisasi browser. Refresh otomatis tiap 3 detik.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill tone="dark">Go backend</Pill>
            <Pill tone="sage">{requestRuntime?.mode || "direct_http"}</Pill>
            <Pill tone="warm">{browserRuntime?.mode || "playwright"}</Pill>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Server className="size-5" />} title="Akun Valid" value={String(acc.valid ?? 0)} sub={`Total ${acc.total ?? 0} akun`} tone="emerald" />
        <StatCard icon={<Activity className="size-5" />} title="Konkurensi Saat Ini" value={String(acc.in_use ?? 0)} sub={`Batas global ${acc.global_in_use ?? 0}`} tone="blue" />
        <StatCard icon={<ShieldAlert className="size-5" />} title="Permintaan Antrean" value={String(acc.waiting ?? 0)} sub={`Batas antrean ${acc.max_queue_size ?? 0}`} tone="rose" />
        <StatCard icon={<ActivityIcon className="size-5" />} title="Rate Limit / Gagal" value={`${acc.rate_limited ?? 0} / ${acc.invalid ?? 0}`} sub={`Maks per akun ${acc.max_inflight_per_account ?? 0}`} tone="orange" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <InfoCard
          icon={<Flame className="size-5" />}
          title="Pool Pre-warm Chat_ID"
          value={String(pool?.total_cached ?? 0)}
          description={pool ? `Target per akun ${pool.target_per_account} ID, TTL ${Math.round((pool.ttl_seconds || 0) / 60)} menit` : "Pool pre-warm backend Go belum aktif"}
        />
        <InfoCard
          icon={<GaugeCircle className="size-5" />}
          title="Runtime Permintaan"
          value={requestRuntime?.mode || "direct_http"}
          description="Permintaan API reguler terhubung langsung ke HTTP upstream tanpa browser."
        />
        <InfoCard
          icon={<RadioTower className="size-5" />}
          title="Otomatisasi Browser"
          value={browserRuntime?.mode || "playwright"}
          description="Aktivasi email menggunakan otomatisasi Playwright, request API tidak melalui browser."
        />
      </div>

      {rows.length > 0 && (
        <section className="overflow-hidden rounded-[30px] border border-white/75 bg-card/86 shadow-[var(--shadow-lift)]">
          <div className="flex flex-col gap-1 border-b border-border/50 bg-muted/10 px-6 py-5">
            <h3 className="text-xl font-black tracking-tight">Detail Konkurensi Akun</h3>
            <p className="text-sm text-muted-foreground">Pantau permintaan in-flight, kegagalan berulang, dan rate limit setiap akun upstream.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b bg-muted/25 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-bold">Email</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 text-right font-bold">In-flight</th>
                  <th className="px-4 py-3 text-right font-bold">Pre-warm chat_id</th>
                  <th className="px-4 py-3 text-right font-bold">Gagal Berturut</th>
                  <th className="px-4 py-3 text-right font-bold">Rate Limit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map(row => {
                  const warmSize = pool?.per_account?.[row.email] ?? 0
                  return (
                    <tr key={row.email} className="transition hover:bg-black/5 dark:hover:bg-white/5">
                      <td className="px-6 py-4 font-mono text-xs text-foreground/85">{row.email}</td>
                      <td className="px-4 py-4">
                        <span className={statusBadgeClass(row.status)}>{row.status}</span>
                      </td>
                      <td className="px-4 py-4 text-right font-mono">
                        {row.inflight}<span className="text-muted-foreground">/{row.max_inflight}</span>
                      </td>
                      <td className="px-4 py-4 text-right font-mono">{warmSize}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{row.consecutive_failures}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{row.rate_limit_strikes}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-[30px] border border-white/75 bg-card/86 shadow-[var(--shadow-lift)]">
        <div className="border-b border-border/50 bg-muted/10 px-6 py-5">
          <h3 className="text-xl font-black tracking-tight">Kumpulan API Endpoint</h3>
          <p className="text-sm text-muted-foreground">Daftar kompatibilitas protokol yang diekspos oleh router Go.</p>
        </div>
        <div className="divide-y divide-border/50">
          {endpointRows.map(item => (
            <EndpointRow key={item.path} {...item} />
          ))}
        </div>
      </section>
    </div>
  )
}

function StatCard({ icon, title, value, sub, tone }: { icon: ReactNode; title: string; value: string; sub?: string; tone: "emerald" | "blue" | "rose" | "orange" }) {
  const toneClass = {
    emerald: "bg-emerald-500/10 text-emerald-700",
    blue: "bg-blue-500/10 text-blue-700",
    rose: "bg-rose-500/10 text-rose-700",
    orange: "bg-orange-500/10 text-orange-700",
  }[tone]

  return (
    <div className="group overflow-hidden rounded-[28px] border border-white/75 bg-card/82 p-5 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-bold text-muted-foreground">{title}</div>
        <span className={`rounded-2xl p-2 ${toneClass}`}>{icon}</span>
      </div>
      <div className="mt-4 text-4xl font-black tracking-tight">{value}</div>
      {sub ? <div className="mt-2 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

function InfoCard({ icon, title, value, description }: { icon: ReactNode; title: string; value: string; description: string }) {
  return (
    <div className="rounded-[28px] border border-white/75 bg-card/82 p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <span className="rounded-2xl bg-accent/65 p-2 text-accent-foreground">{icon}</span>
        <div>
          <div className="text-sm font-bold text-muted-foreground">{title}</div>
          <div className="font-mono text-lg font-black">{value}</div>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

function EndpointRow({ icon: Icon, iconClass, path, tag, tagClass }: typeof endpointRows[number]) {
  return (
    <div className="flex flex-col gap-3 px-6 py-5 transition hover:bg-black/5 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-white/5">
      <div className="flex min-w-0 items-center gap-4">
        <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${iconClass}`}>
          <Icon className="size-5" />
        </span>
        <div className="break-all font-mono text-sm font-bold text-foreground/85">{path}</div>
      </div>
      <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${tagClass}`}>{tag}</span>
    </div>
  )
}

function Pill({ tone, children }: { tone: "dark" | "sage" | "warm"; children: ReactNode }) {
  const toneClass = {
    dark: "bg-primary text-primary-foreground border-primary/20",
    sage: "bg-accent/70 text-accent-foreground border-accent/70",
    warm: "bg-secondary text-secondary-foreground border-white/75",
  }[tone]
  return <span className={`rounded-full border px-3 py-1 text-xs font-black ${toneClass}`}>{children}</span>
}

function statusBadgeClass(status: string) {
  if (status === "valid") return "inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-500/20"
  if (status === "rate_limited") return "inline-flex rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-700 ring-1 ring-orange-500/20"
  if (status === "banned") return "inline-flex rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-500/20"
  return "inline-flex rounded-full bg-stone-500/10 px-2.5 py-1 text-xs font-bold text-stone-700 ring-1 ring-stone-500/20"
}
