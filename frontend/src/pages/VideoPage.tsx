import { useEffect, useState } from "react"
import { Download, Film, RefreshCw, Video as VideoIcon, Wand2 } from "lucide-react"
import { Button } from "../components/ui/button"
import { toast } from "sonner"
import { getAuthHeader } from "../lib/auth"
import { API_BASE } from "../lib/api"
import {
  FALLBACK_VIDEO_MODELS,
  chooseDefaultModel,
  fetchModelOptions,
  filterVideoModels,
  formatModelOptionLabel,
  groupModelOptions,
  type ModelOption,
} from "../lib/models"

const ASPECT_RATIOS = [
  { label: "1:1", value: "1:1", w: 1328, h: 1328 },
  { label: "16:9", value: "16:9", w: 1664, h: 928 },
  { label: "9:16", value: "9:16", w: 928, h: 1664 },
  { label: "4:3", value: "4:3", w: 1472, h: 1140 },
  { label: "3:4", value: "3:4", w: 1140, h: 1472 },
]

const DURATIONS = [3, 5, 8, 10]

interface GeneratedVideo {
  url: string
  revised_prompt: string
  ratio: string
  size: string
  width?: number
  height?: number
  duration?: number
  model?: string
}

interface VideoGenerationItem {
  url?: string
  revised_prompt?: string
  ratio?: string
  size?: string
  width?: number
  height?: number
  duration?: number
}

interface VideoGenerationResponse {
  data?: VideoGenerationItem[]
  detail?: unknown
  error?: unknown
}

export default function VideoPage() {
  const [prompt, setPrompt] = useState("")
  const [ratio, setRatio] = useState("16:9")
  const [duration, setDuration] = useState(5)
  const [n, setN] = useState(1)
  const [loading, setLoading] = useState(false)
  const [videos, setVideos] = useState<GeneratedVideo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [model, setModel] = useState("qwen3.6-plus-video")
  const [videoModels, setVideoModels] = useState<ModelOption[]>(FALLBACK_VIDEO_MODELS)

  const selectedRatio = ASPECT_RATIOS.find(r => r.value === ratio)!
  const sizeStr = `${selectedRatio.w}x${selectedRatio.h}`
  const groupedModels = groupModelOptions(videoModels)

  useEffect(() => {
    (async () => {
      try {
        const options = filterVideoModels(await fetchModelOptions())
        setVideoModels(options)
        setModel(current => chooseDefaultModel(options, current, "qwen3.6-plus-video"))
      } catch {
        // keep fallback video model
      }
    })()
  }, [])

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/v1/videos/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          model,
          prompt: prompt.trim(),
          n,
          size: sizeStr,
          ratio,
          aspect_ratio: ratio,
          width: selectedRatio.w,
          height: selectedRatio.h,
          duration,
          response_format: "url",
        }),
      })

      const data = (await res.json()) as VideoGenerationResponse
      if (!res.ok) {
        const detail = data?.detail || data?.error || `HTTP ${res.status}`
        setError(String(detail))
        toast.error(`Gagal generate: ${String(detail).slice(0, 80)}`)
        return
      }

      const newVideos: GeneratedVideo[] = (data.data ?? [])
        .filter((item): item is VideoGenerationItem & { url: string } => typeof item.url === "string" && item.url.length > 0)
        .map(item => ({
          url: item.url,
          revised_prompt: item.revised_prompt || prompt,
          ratio: item.ratio || ratio,
          size: item.size || sizeStr,
          width: item.width,
          height: item.height,
          duration: item.duration || duration,
          model,
        }))

      if (newVideos.length === 0) {
        setError("Tidak ada video yang dihasilkan, silakan coba lagi")
        toast.error("Tidak ada video yang dihasilkan, silakan coba lagi")
        return
      }

      setVideos(prev => [...newVideos, ...prev])
      toast.success(`Berhasil membuat ${newVideos.length} video`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Kesalahan jaringan"
      setError(msg)
      toast.error(`Gagal generate: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (url: string, idx: number) => {
    try {
      const res = await fetch(url, { referrerPolicy: "no-referrer" })
      if (!res.ok) throw new Error("direct fetch failed")
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = `qwen_video_${Date.now()}_${idx}.mp4`
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(`${API_BASE}/api/media/proxy?url=${encodeURIComponent(url)}`, "_blank")
    }
  }

  return (
    <div className="w-full space-y-6">
      <section className="admin-hero p-6">
        <div className="relative z-10">
          <div className="text-xs font-black uppercase tracking-[0.28em] text-muted-foreground">Video Lab</div>
          <h2 className="mt-2 text-4xl font-black tracking-tight">Generate Video</h2>
          <p className="mt-2 text-muted-foreground">Pilih model video untuk membuat video pendek, mendukung rasio, durasi, dan pengunduhan hasil.</p>
        </div>
      </section>

      <div className="admin-card p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Deskripsi Video (Prompt)</label>
          <textarea
            rows={3}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Deskripsikan video yang ingin dibuat, contoh: Jalanan kota berhujan malam hari dengan lampu neon, seekor kucing hitam berjalan pelan, sinematik"
            className="admin-input flex w-full px-3 py-2 text-sm resize-none"
            disabled={loading}
            onKeyDown={e => {
              if (e.key === "Enter" && e.ctrlKey) handleGenerate()
            }}
          />
          <p className="text-xs text-muted-foreground">Ctrl+Enter untuk generate cepat</p>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5 min-w-[260px]">
            <label className="text-sm font-medium">Model Video</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="admin-input h-10 w-full px-3 py-2 text-sm font-mono"
              disabled={loading}
            >
              {groupedModels.map(group => (
                <optgroup key={group.family} label={group.family}>
                  {group.models.map(option => (
                    <option key={option.id} value={option.id}>{formatModelOptionLabel(option)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Rasio Video</label>
            <div className="flex gap-2">
              {ASPECT_RATIOS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setRatio(r.value)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${
                    ratio === r.value
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background/70 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                  disabled={loading}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Durasi Video</label>
            <div className="flex gap-2">
              {DURATIONS.map(v => (
                <button
                  key={v}
                  onClick={() => setDuration(v)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${
                    duration === v
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background/70 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                  disabled={loading}
                >
                  {v}s
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Jumlah Video</label>
            <div className="flex gap-2">
              {[1, 2].map(v => (
                <button
                  key={v}
                  onClick={() => setN(v)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${
                    n === v
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background/70 border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                  disabled={loading}
                >
                  {v} Video
                </button>
              ))}
            </div>
          </div>

          <div className="admin-chip font-mono">
            {sizeStr}
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="ml-auto h-10 px-6 gap-2"
          >
            {loading
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Sedang membuat...</>
              : <><Wand2 className="h-4 w-4" /> Generate Video</>
            }
          </Button>
        </div>

        {error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm">
            {error}
          </div>
        )}
      </div>

      {loading && (
        <div className="admin-card p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <div className="relative">
              <Film className="h-16 w-16 text-muted-foreground/20" />
              <RefreshCw className="h-6 w-6 animate-spin absolute -bottom-1 -right-1 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-medium">Sedang membuat video...</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Pembuatan video memerlukan waktu lebih lama, mohon biarkan halaman tetap terbuka</p>
            </div>
          </div>
        </div>
      )}

      {videos.length > 0 && !loading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Hasil Generate ({videos.length} video)</h3>
            <Button variant="ghost" size="sm" onClick={() => setVideos([])}>
              Bersihkan
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {videos.map((video, idx) => (
              <div key={`${video.url}-${idx}`} className="admin-card overflow-hidden group">
                <div className="relative bg-muted/30">
                  <video
                    src={video.url}
                    controls
                    className="w-full aspect-video bg-black object-contain"
                    preload="metadata"
                    onError={e => {
                      const target = e.currentTarget
                      if (!target.src.includes("/api/media/proxy")) {
                        target.src = `${API_BASE}/api/media/proxy?url=${encodeURIComponent(video.url)}`
                      }
                    }}
                  />
                  <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="secondary" onClick={() => handleDownload(video.url, idx)} className="gap-1.5">
                      <Download className="h-3.5 w-3.5" /> Unduh
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => window.open(`${API_BASE}/api/media/proxy?url=${encodeURIComponent(video.url)}`, "_blank")}>
                      Buka
                    </Button>
                  </div>
                </div>
                <div className="p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="admin-chip font-mono">{video.ratio}</span>
                    <span className="admin-chip font-mono">{video.duration || duration}s</span>
                    <span className="admin-chip font-mono">Minta {video.size}</span>
                    {video.model && <span className="admin-chip font-mono">{video.model}</span>}
                    <span className="truncate">{video.revised_prompt.slice(0, 80)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{video.url}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {videos.length === 0 && !loading && (
        <div className="admin-card p-12">
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <VideoIcon className="h-16 w-16 text-muted-foreground/20" />
            <div className="text-center">
              <p className="font-medium">Belum ada video yang dibuat</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Masukkan deskripsi di atas dan klik 'Generate Video' untuk memulai kreasi</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
