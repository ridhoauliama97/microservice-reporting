# report-service

Microservice pembuat **laporan PDF secara asynchronous** untuk sistem **WPS** (Wood Processing System, "WPS Ratimdo").

Client mengirim permintaan laporan, langsung menerima `jobId`, lalu mengambil hasil PDF-nya setelah worker selesai. Pembuatan PDF dilakukan di belakang layar supaya permintaan HTTP tidak tertahan lama.

```
Client ──POST /reports (Bearer JWT)──▶ API (Hono)
                                        │ verifikasi JWT, validasi Zod
                                        │ masukkan job ke BullMQ ──▶ Redis
                                        ▼
                                     balas 202 + jobId
Worker ◀── ambil job dari Redis
  │  1. ambil data dari SQL Server (mssql)
  │  2. render HTML dari template
  │  3. HTML → PDF via Gotenberg (HTTP)
  │  4. simpan file ke storage/
  ▼
Client ◀── WebSocket (progress) / GET /reports/:id / GET /reports/:id/download
```

Service ini **tidak menerbitkan token**. Token JWT diterbitkan oleh WPS backend; service ini hanya **memverifikasi** dengan `JWT_SECRET` yang sama, lalu mengambil **username** dari isi token.

## Tech stack

| Bagian | Teknologi |
|---|---|
| Runtime | [Bun](https://bun.sh) 1.3.14 (dipin di Dockerfile) |
| Bahasa | TypeScript 7 |
| Web framework | [Hono](https://hono.dev) 4 |
| Validasi | [Zod](https://zod.dev) 4 |
| Dokumentasi API | [@hono/zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) |
| Antrian job | [BullMQ](https://docs.bullmq.io) 6 |
| Antrian (koneksi) | [ioredis](https://github.com/redis/ioredis) 6 |
| Database | [mssql](https://github.com/tediousjs/node-mssql) 12 — SQL Server milik WPS |
| Render PDF | [Gotenberg](https://gotenberg.dev) 8 (Chromium) |
| Logging | [pino](https://getpino.io) 10 |
| Infrastruktur | Docker Compose (Redis 7 + Gotenberg 8) |

## Menjalankan

Prasyarat: Docker, dan [Bun](https://bun.sh) 1.3+ untuk perintah pendukung.

```sh
bun install                  # install dependency
cp .env.example .env         # lalu isi kredensial database
docker compose up -d
docker compose ps            # api (healthy), worker, redis (healthy), gotenberg
curl.exe http://localhost:5006/health/ready
```

Empat container: `report-api`, `report-worker`, `report-redis`, `report-gotenberg`. API dan worker memakai image yang sama, hanya perintah jalannya yang berbeda.

Untuk mengembangkan dengan hot reload, jalankan API dan worker di komputer Anda. Redis dan Gotenberg tetap dipakai dari container, karena portnya dipublish ke `127.0.0.1`:

```sh
bun run dev          # API di port 5006
bun run dev:worker   # worker, proses terpisah
```

Membuat token untuk pengujian:

```sh
bun run dev:token budi [jam]     # default user "tester", berlaku 1 jam
```

Menghentikan stack:

```sh
docker compose down     # tanpa -v: volume menyimpan antrean dan PDF
```

Catatan:

- Di dalam container, `localhost` berarti container itu sendiri. Redis dan Gotenberg sudah diarahkan ke nama service-nya. Kalau SQL Server ada di komputer Anda, isi `.env` dengan `DB_SERVER=host.docker.internal`.
- `api` dan `worker` berbagi volume `report-storage` — worker menulis PDF, API menyajikannya.
- Jangan menjalankan Redis atau Gotenberg sendiri di luar Docker. Nanti ada dua antrean terpisah, job tidak saling melihat, dan download membalas `409 REPORT_NOT_READY`.

## Endpoint

| Method | Path | Auth | Fungsi |
|---|---|---|---|
| GET | `/health` | tidak | Liveness. Tidak menyentuh database atau Redis. |
| GET | `/health/ready` | tidak | Cek database, Redis, dan Gotenberg. Membalas 503 jika ada yang gagal. |
| POST | `/reports` | Bearer | Membuat job. Body `{ "type": "...", "params": { ... } }`. Membalas 202 `{ jobId, status: "pending" }`. |
| GET | `/reports/:id` | Bearer | Status job, progress, dan hasil. |
| GET | `/reports/:id/download` | Bearer | Mengunduh PDF (hanya jika job sudah `completed`). |
| GET (WS) | `/ws/reports/:jobId?token=<jwt>` | token di query | Progress secara realtime. |

Pesan WebSocket: `snapshot` (selalu pertama) → `progress` → `completed`/`failed`, lalu server menutup koneksi.

Semua error memakai format yang sama:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Input tidak valid", "details": [] } }
```

Kode error: `VALIDATION_ERROR` (400), `UNKNOWN_REPORT_TYPE` (400), `UNAUTHORIZED` (401), `NOT_FOUND` (404), `REPORT_NOT_READY` (409), `FILE_EXPIRED` (410), `PAYLOAD_TOO_LARGE` (413), `INTERNAL_ERROR` (500).

Job hanya bisa diakses pemiliknya. Job milik user lain dibalas **404**, supaya keberadaannya tidak bocor.

## Dokumentasi

- **Dokumentasi API di dalam service**: buka `http://localhost:5006/docs` saat service berjalan. Isinya penjelasan tiap endpoint, kode error, dan contoh Request/Response. Spec mentahnya di `/docs/openapi.json`.
- **Situs dokumentasi** ada di folder `docs/` (Mintlify). Isinya 9 halaman API dan katalog seluruh jenis laporan yang dikelompokkan per proses. Untuk melihatnya:

  ```sh
  cd docs && npx mint dev
  ```

  Halaman katalog di folder itu **dibuat otomatis** dari `src/reports/registry.ts`, jadi tidak bisa melenceng dari kode. Jangan diedit manual — lihat `AGENTS.md` bagian 11.

## Testing

```sh
bun run typecheck    # tsc --noEmit
bun test             # unit test
bun run e2e          # menjalankan seluruh jenis laporan (butuh API + worker hidup)
```

`bun run e2e` mengirim permintaan untuk setiap jenis laporan, menunggu hasilnya, mengunduh PDF, dan memeriksa bahwa filenya benar-benar PDF. Parameter tiap laporan dibangun dari skema Zod laporan itu sendiri, jadi laporan baru otomatis ikut teruji. Hasilnya tersimpan di `storage/e2e/`.

## Lingkup

- **Yang ada:** pembuatan laporan PDF, antrean job, notifikasi progress lewat WebSocket, retensi file otomatis, dan dokumentasi API.
- **Yang tidak ada:** export Excel, rate limiting, penyimpanan ke S3/MinIO, multi-tenant, dan streaming untuk laporan di atas 50.000 baris.
- **SQL Server tidak disertakan** di Docker Compose. Database milik WPS dipakai apa adanya, hanya dengan user read-only.

## Menambah laporan baru

Panduan lengkapnya ada di `AGENTS.md` bagian 2 dan 3 — di sana dijelaskan cara memakai factory `createSingleTableReport`, kapan perlu menulis `fetchData` dan `render` sendiri, serta aturan styling.

Dua hal yang paling sering terlewat:

- Setelah membuat file laporan, **daftarkan di `src/reports/registry.ts`**. Kalau tidak, tipenya dijawab `400 UNKNOWN_REPORT_TYPE`.
- File laporan **tidak boleh memuat CSS**. Shell dan tabel sudah disediakan template.
