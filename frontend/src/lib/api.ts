/**
 * Base URL API Backend.
 *
 * - Pengembangan lokal: biarkan kosong, diproxy oleh Vite ke http://localhost:7860
 * - Docker produksi: biarkan kosong, diproxy oleh nginx ke backend:7860
 * - Vercel / Frontend mandiri: atur VITE_API_BASE_URL=https://your-backend.example.com
 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE_URL as string) ?? ''
