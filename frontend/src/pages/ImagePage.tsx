import { useEffect, useState } from "react"
import { Image as ImageIcon, RefreshCw, Download, Wand2 } from "lucide-react"
import { Button } from "../components/ui/button"
import { toast } from "sonner"
import { getAuthHeader } from "../lib/auth"
import { API_BASE } from "../lib/api"
import {
  FALLBACK_IMAGE_MODELS,
  chooseDefaultModel,
  fetchModelOptions,
  filterImageModels,
  formatModelOptionLabel,
  groupModelOptions,
  type ModelOption,
} from "../lib/models"

const ASPECT_RATIOS = [
  { label: "1:1",  value: "1:1",   w: 1328, h: 1328 },
  { label: "16:9", value: "16:9",  w: 1664, h: 928  },
  { label: "9:16", value: "9:16",  w: 928,  h: 1664 },
  { label: "4:3",  value: "4:3",   w: 1472, h: 1140 },
  { label: "3:4",  value: "3:4",   w: 1140, h: 1472 },
]

interface GeneratedImage {
  url: string
  revised_prompt: string
  ratio: string
  size: string
  width?: number
  height?: number
  naturalWidth?: number
  naturalHeight?: number
  model?: string
}

interface ImageGenerationItem {
  url?: string
  revised_prompt?: string
  ratio?: string
  size?: string
  width?: number
  height?: number
}

interface ImageGenerationResponse {
  data?: ImageGenerationItem[]
  detail?: unknown
  error?: unknown
}

export default function ImagePage() {
  const [prompt, setPrompt] = useState("")
  const [ratio, setRatio] = useState("1:1")
  const [n, setN] = useState(1)
  const [loading, setLoading] = useState(false)
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [model, setModel] = useState("qwen3.6-plus-image")
  const [imageModels, setImageModels] = useState<ModelOption[]>(FALLBACK_IMAGE_MODELS)

  const selectedRatio = ASPECT_RATIOS.find(r => r.value === ratio)!
  const sizeStr = `${selectedRatio.w}x${selectedRatio.h}`
  const groupedModels = groupModelOptions(imageModels)

  useEffect(() => {
    (async () => {
      try {
        const options = filterImageModels(await fetchModelOptions())
        setImageModels(options)
        setModel(current => chooseDefaultModel(options, current, "qwen3.6-plus-image"))
      } catch {
        // keep fallback image model
      }
    })()
  }, [])

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/v1/images/generations`, {
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
          response_format: "url",
        }),
      })

      const data = (await res.json()) as ImageGenerationResponse
      if (!res.ok) {
        const detail = data?.detail || data?.error || `HTTP ${res.status}`
        setError(String(detail))
        toast.error(`Gagal generate: ${String(detail).slice(0, 80)}`)
        return
      }

      const newImages: GeneratedImage[] = (data.data ?? [])
        .filter((item): item is ImageGenerationItem & { url: string } => typeof item.url === "string" && item.url.length > 0)
        .map(item => ({
          url: item.url,
          revised_prompt: item.revised_prompt || prompt,
          ratio: item.ratio || ratio,
          size: item.size || sizeStr,
          width: item.width,
          height: item.height,
          model,
        }))

      if (newImages.length === 0) {
        setError("Tidak ada gambar yang dihasilkan, silakan coba lagi")
        toast.error("Tidak ada gambar yang dihasilkan, silakan coba lagi")
        return
      }

      setImages(prev => [...newImages, ...prev])
      toast.success(`Berhasil membuat ${newImages.length} gambar`)
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
      a.download = `qwen_image_${Date.now()}_${idx}.png`
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(`${API_BASE}/api/media/proxy?url=${encodeURIComponent(url)}`, "_blank")
    }
  }

  const handleImageLoad = (url: string, image: HTMLImageElement) => {
    setImages(prev => prev.map(item => (
      item.url === url
        ? { ...item, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }
        : item
    )))
  }

  const formatActualSize = (img: GeneratedImage) => {
    if (!img.naturalWidth || !img.naturalHeight) return "Mendeteksi dimensi..."
    return `${img.naturalWidth}x${img.naturalHeight}`
  }

  const getRatioStatus = (img: GeneratedImage) => {
    if (!img.naturalWidth || !img.naturalHeight || !img.width || !img.height) return null
    const expected = img.width / img.height
    const actual = img.naturalWidth / img.naturalHeight
    const diff = Math.abs(expected - actual) / expected
    return diff <= 0.03 ? "Rasio Sesuai" : `Rasio aktual ${(actual).toFixed(2)}, berbeda dari permintaan ${img.ratio}`
  }

  return (
    <div className="w-full space-y-6">
      <section className="admin-hero p-6">
        <div className="relative z-10">
          <div className="text-xs font-black uppercase tracking-[0.28em] text-muted-foreground">Image Lab</div>
          <h2 className="mt-2 text-4xl font-black tracking-tight">Generate Gambar</h2>
          <p className="mt-2 text-muted-foreground">Pilih model gambar untuk membuat gambar AI, mendukung berbagai aspek rasio dan resolusi.</p>
        </div>
      </section>

      {/* Input area */}
      <div className="admin-card p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Deskripsi Gambar (Prompt)</label>
          <textarea
            rows={3}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Deskripsikan gambar yang ingin dibuat, contoh: Seekor kucing cyberpunk dengan lampu neon, gaya fotorealistik"
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
            <label className="text-sm font-medium">Model Gambar</label>
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

          {/* Rasio */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Rasio Gambar</label>
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

          {/* Jumlah */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Jumlah Gambar</label>
            <div className="flex gap-2">
              {[1, 2, 4].map(v => (
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
                  {v} Gambar
                </button>
              ))}
            </div>
          </div>

          {/* Ukuran */}
          <div className="admin-chip font-mono">
            {sizeStr}
          </div>

          {/* Tombol Generate */}
          <Button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="ml-auto h-10 px-6 gap-2"
          >
            {loading
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Sedang membuat...</>
              : <><Wand2 className="h-4 w-4" /> Generate Gambar</>
            }
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="admin-card p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <div className="relative">
              <ImageIcon className="h-16 w-16 text-muted-foreground/20" />
              <RefreshCw className="h-6 w-6 animate-spin absolute -bottom-1 -right-1 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-medium">Sedang membuat gambar...</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Proses ini biasanya memerlukan 10-30 detik, mohon menunggu</p>
            </div>
          </div>
        </div>
      )}

      {/* Daftar Gambar */}
      {images.length > 0 && !loading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Hasil Generate ({images.length} gambar)</h3>
            <Button variant="ghost" size="sm" onClick={() => setImages([])}>
              Bersihkan
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {images.map((img, idx) => (
              <div key={`${img.url}-${idx}`} className="admin-card overflow-hidden group">
                <div className="relative bg-muted/30">
                  <img
                    src={img.url}
                    alt={img.revised_prompt}
                    referrerPolicy="no-referrer"
                    className="w-full h-auto object-contain"
                    loading="lazy"
                    onLoad={e => handleImageLoad(img.url, e.currentTarget)}
                    onError={e => {
                      const target = e.currentTarget
                      if (!target.src.includes("/api/media/proxy")) {
                        target.src = `${API_BASE}/api/media/proxy?url=${encodeURIComponent(img.url)}`
                        return
                      }
                      target.style.display = "none"
                      target.nextElementSibling?.classList.remove("hidden")
                    }}
                  />
                  <div className="hidden items-center justify-center p-8 text-muted-foreground text-sm">
                    <ImageIcon className="h-8 w-8 mr-2" /> Gagal memuat gambar
                  </div>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleDownload(img.url, idx)}
                      className="gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" /> Unduh
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => window.open(`${API_BASE}/api/media/proxy?url=${encodeURIComponent(img.url)}`, "_blank")}
                    >
                      Buka di Tab Baru
                    </Button>
                  </div>
                </div>
                <div className="p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="admin-chip font-mono">{img.ratio}</span>
                    <span className="admin-chip font-mono">Minta {img.size}</span>
                    {img.model && <span className="admin-chip font-mono">{img.model}</span>}
                    <span className="admin-chip font-mono">Aktual {formatActualSize(img)}</span>
                    <span className="truncate">{img.revised_prompt.slice(0, 80)}</span>
                  </div>
                  {getRatioStatus(img) && (
                    <div className={`text-xs ${getRatioStatus(img) === "Rasio Sesuai" ? "text-emerald-500" : "text-amber-500"}`}>
                      {getRatioStatus(img)}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground font-mono truncate">{img.url}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {images.length === 0 && !loading && (
        <div className="admin-card p-12">
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <ImageIcon className="h-16 w-16 text-muted-foreground/20" />
            <div className="text-center">
              <p className="font-medium">Belum ada gambar yang dibuat</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Ketik deskripsi di atas dan klik 'Generate Gambar' untuk memulai kreasi</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
