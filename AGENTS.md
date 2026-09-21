# AGENTS.md — report-service

Instruksi kerja untuk Code Agent. Baca **seluruh file ini** sebelum mengubah apa pun.

---

## 0. Aturan Main (WAJIB)

1. Kerjakan **berurutan** Fase 1 sampai 9 (bagian 12). Setiap fase punya kriteria "Selesai jika". Jangan lanjut ke fase berikutnya kalau kriteria belum terpenuhi.
2. **Jangan berasumsi.** Kalau ada hal penting yang tidak dijelaskan di file ini, **berhenti dan tanya user** (satu pertanyaan ringkas). Jangan menebak nama tabel, stored procedure, atau kolom database.
3. **Jangan menambah package** di luar daftar di bagian 3. Kalau terpaksa perlu, tanya dulu.
4. **Jangan menjalankan perintah destruktif**: `rm -rf`, `docker system prune`, `docker compose down -v`, `git reset --hard`, `git push --force`.
5. **Jangan commit atau push** kecuali user meminta.
6. **Jangan pernah** menulis secret asli (password, `JWT_SECRET`) ke file yang masuk Git. Hanya `.env.example` dengan nilai contoh.
7. Bahasa:
   - Balasan ke user: **Bahasa Indonesia**, santai, singkat.
   - Kode, nama variabel, nama file, log: **English**.
   - Pesan error di response API (`message`): **Bahasa Indonesia**.
8. Setelah selesai, beri laporan singkat: apa yang dibuat, perintah verifikasi yang dijalankan beserta hasilnya, dan hal yang masih perlu dikonfirmasi user (bagian 14).
9. Kalau sebuah verifikasi gagal: perbaiki akar masalahnya. Jangan menonaktifkan pengecekan (`// @ts-ignore`, menghapus test) supaya lolos.

---

## 1. Konteks Proyek

- **Lokasi proyek:** `D:\Projects\panen\report-service` (Windows).
- **Fungsi:** microservice yang membuat laporan **PDF** secara **asynchronous** untuk sistem **WPS** (Wood Processing System, "WPS Ratimdo").
- **WPS backend** adalah service terpisah (Node.js 20 + Express + SQL Server, port `5002`). Service itulah yang **menerbitkan token JWT** (library `jsonwebtoken`, secret di env `JWT_SECRET`).
- **report-service TIDAK membuat token.** Service ini hanya **memverifikasi** token dari WPS dengan `JWT_SECRET` yang sama, lalu mengambil **username** dari payload.
- Alur kerja:

```
Client ──POST /reports (Bearer JWT)──▶ API (Hono)
                                        │ verifikasi JWT, validasi Zod
                                        │ masukkan job ke BullMQ  ──▶ Redis
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

---

## 2. Kondisi Awal Repositori (sudah ada)

- `package.json` dengan semua dependency sudah terinstall (lihat bagian 3).
- `src/index.ts` masih template "Hello Hono!" (`export default app`).
- `tsconfig.json` minimal (`strict`, `types: ["bun"]`, `jsx` untuk `hono/jsx`).
- `.gitignore` hanya berisi `node_modules/`.
- `README.md` masih bawaan template.
- **Belum ada:** `.env`, struktur folder `src/`, Docker, script tambahan, test.

---

## 3. Tech Stack (final, jangan diganti)

| Layer | Pilihan | Catatan |
|---|---|---|
| Runtime | **Bun** | Bun otomatis membaca `.env`. **Jangan** install `dotenv`. |
| Framework | **Hono** `^4.13` | |
| Validasi | **Zod v4** + `@hono/zod-validator` | `@hono/zod-openapi` hanya untuk fase opsional, lihat bagian 13. |
| Realtime | **WebSocket** via `hono/bun` (`createBunWebSocket`) | |
| Database | **Microsoft SQL Server** via `mssql` `^12` | |
| Auth | **`verify` dari `hono/jwt`** | Secret sama dengan WPS. |
| Queue | **BullMQ** `^6` + **Redis 7** (Docker) | |
| PDF | **Gotenberg 8** (Docker, dipanggil lewat HTTP `fetch`) | **Bukan package npm.** |
| Logging | **pino** | Tanpa `pino-pretty`. |
| Test | `bun test` | |

Satu-satunya package tambahan yang **diizinkan**:

```bash
bun add -d typescript
```

(untuk script `typecheck`).

Yang berjalan sebagai container Docker: **Redis** dan **Gotenberg** (infrastruktur), serta **API** dan **worker** (aplikasi ini, satu image, dua perintah berbeda).

---

## 4. Struktur Folder Target

```
report-service/
├── AGENTS.md
├── README.md                      # ganti dengan dokumentasi service
├── Dockerfile
├── .dockerignore
├── docker-compose.yml             # full stack (api + worker + redis + gotenberg)
├── docker-compose.dev.yml         # infra saja (redis + gotenberg), untuk dev lokal
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── storage/
│   └── .gitkeep
├── scripts/
│   ├── dev-token.ts               # buat JWT untuk testing lokal
│   └── ws-test.ts                 # klien WebSocket untuk testing
├── tests/
│   ├── env.test.ts
│   ├── html.test.ts
│   └── registry.test.ts
└── src/
    ├── index.ts                   # entry API: export default { port, fetch, websocket }
    ├── worker.ts                  # entry worker BullMQ
    ├── app.ts                     # membuat instance Hono (tanpa start server)
    ├── types.ts                   # tipe Hono env (Variables)
    ├── config/
    │   └── env.ts                 # validasi env dengan Zod
    ├── lib/
    │   ├── logger.ts              # pino
    │   ├── errors.ts              # AppError + format error seragam
    │   └── ws.ts                  # createBunWebSocket (satu-satunya tempat)
    ├── middleware/
    │   └── auth.ts                # verifikasi JWT (HTTP + WebSocket)
    ├── db/
    │   └── mssql.ts               # connection pool (lazy)
    ├── queue/
    │   ├── connection.ts          # opsi koneksi Redis
    │   ├── report.queue.ts        # Queue + tipe job
    │   └── events.ts              # QueueEvents + broker WebSocket
    ├── reports/
    │   ├── types.ts               # interface ReportDefinition
    │   ├── registry.ts            # daftar jenis laporan
    │   └── example.ts             # laporan contoh (tanpa database)
    ├── services/
    │   ├── pdf.ts                 # panggil Gotenberg
    │   └── storage.ts             # simpan/baca file
    ├── templates/
    │   └── html.ts                # escapeHtml + layout dasar
    └── routes/
        ├── health.ts
        ├── reports.ts
        └── ws.ts
```

---

## 5. Environment Variables

Nama variabel database **sengaja sama** dengan WPS backend.

### `.env.example` (buat persis seperti ini)

```env
# --- App ---
NODE_ENV=development
PORT=5003
LOG_LEVEL=info
# Daftar origin frontend dipisah koma. "*" hanya boleh untuk development.
CORS_ORIGINS=http://localhost:5173

# --- SQL Server (samakan dengan WPS; gunakan user READ-ONLY) ---
DB_SERVER=localhost
DB_PORT=1433
DB_DATABASE=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_ENCRYPT=false
DB_TRUST_CERT=true

# --- JWT (HARUS SAMA PERSIS dengan JWT_SECRET di WPS backend) ---
JWT_SECRET=change_me_min_16_chars
JWT_ALG=HS256
# Nama field username di payload token WPS. BELUM TERKONFIRMASI, lihat bagian 14.
JWT_USERNAME_CLAIM=username

# --- Redis ---
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# --- Gotenberg ---
# Lokal (docker-compose.dev.yml): port 3100. Di dalam Docker: http://gotenberg:3000
GOTENBERG_URL=http://localhost:3100
GOTENBERG_TIMEOUT_MS=60000

# --- Worker & file ---
REPORT_CONCURRENCY=2
STORAGE_DIR=storage
FILE_RETENTION_DAYS=7
```

### Aturan `src/config/env.ts`

- Parse `process.env` dengan Zod, **gagal cepat** (throw dengan pesan jelas menyebut variabel yang salah) saat modul di-import.
- Dipakai oleh API **dan** worker.
- Angka: `z.coerce.number()`.
- **JEBAKAN BOOLEAN:** jangan pakai `z.coerce.boolean()`. String `"false"` akan menjadi `true`. Pakai:

```ts
const boolFromString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
```

- `JWT_SECRET`: minimal 16 karakter. `JWT_ALG`: enum `HS256 | HS384 | HS512`, default `HS256`.
- `REDIS_PASSWORD`: opsional; string kosong dianggap tidak ada.
- `CORS_ORIGINS`: di-split koma, di-trim.
- Export tipe `Env` dan objek `env`. **Tidak ada** `process.env.X` yang dibaca di luar file ini.

---

## 6. API yang Harus Dibuat

Semua response error memakai format seragam:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Input tidak valid", "details": [] } }
```

| Method | Path | Auth | Fungsi |
|---|---|---|---|
| GET | `/health` | tidak | `{ "status": "ok" }`. Tidak menyentuh DB/Redis. |
| GET | `/health/ready` | tidak | Cek DB (`SELECT 1`), Redis (ping), Gotenberg (`GET {GOTENBERG_URL}/health`). 200 kalau semua ok, 503 kalau ada yang gagal. Isi hanya boolean per komponen, **tanpa detail error**. |
| POST | `/reports` | Bearer | Membuat job. Balas **202** `{ jobId, status: "pending" }`. |
| GET | `/reports/:id` | Bearer | Status job. |
| GET | `/reports/:id/download` | Bearer | Unduh PDF (hanya kalau selesai). |
| GET (WS) | `/ws/reports/:jobId?token=<jwt>` | token di query | Progress realtime. |

### POST `/reports`

Body:

```json
{ "type": "example", "params": { } }
```

- `type`: harus salah satu key di registry. Kalau tidak dikenal → 400 `UNKNOWN_REPORT_TYPE`.
- `params`: divalidasi dengan `paramsSchema` milik laporan tersebut. Gagal → 400 `VALIDATION_ERROR` dengan `details` dari Zod.
- Job dibuat dengan `jobId: crypto.randomUUID()` (jangan pakai ID auto-increment yang mudah ditebak).
- Data job: `{ type, params, requestedBy: <username dari token> }`.

### GET `/reports/:id`

```json
{
  "id": "…", "type": "example",
  "status": "pending | processing | completed | failed",
  "progress": 0,
  "result": { "fileName": "…", "size": 12345 },
  "error": "pesan singkat jika gagal",
  "createdAt": "ISO-8601"
}
```

Pemetaan status BullMQ: `waiting/delayed/prioritized/waiting-children` → `pending`; `active` → `processing`; `completed` → `completed`; `failed` → `failed`.

### Kepemilikan (KEAMANAN)

Job hanya boleh diakses oleh user yang membuatnya. Kalau `job.data.requestedBy !== username` → balas **404** (bukan 403, supaya keberadaan job tidak bocor). Berlaku untuk status, download, dan WebSocket.

### GET `/reports/:id/download`

- Job tidak ada / bukan milik user → 404.
- Belum `completed` → 409 `REPORT_NOT_READY`.
- Nama file dibentuk **hanya dari jobId** (`report-<jobId>.pdf`), **tidak pernah** dari input user (cegah path traversal).
- Header: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<type>-<jobId>.pdf"`.
- Stream dengan `Bun.file(path)`. Kalau file tidak ada di disk (sudah dibersihkan) → 410 `FILE_EXPIRED`.

### WebSocket `/ws/reports/:jobId?token=`

Alasan token lewat query: browser tidak bisa mengirim header `Authorization` saat membuka WebSocket.

Urutan (semua **sebelum** upgrade, sebagai middleware): verifikasi token → cek job ada dan milik user → baru `upgradeWebSocket`.

Pesan server → klien (JSON):

```json
{ "type": "snapshot",  "jobId": "…", "status": "processing", "progress": 40 }
{ "type": "progress",  "jobId": "…", "progress": 60 }
{ "type": "completed", "jobId": "…", "result": { "fileName": "…", "size": 123 } }
{ "type": "failed",    "jobId": "…", "error": "…" }
```

- Saat `onOpen`, **selalu kirim `snapshot`** dulu. Job bisa saja sudah selesai sebelum WebSocket tersambung. Kalau snapshot sudah `completed`/`failed`, kirim pesan finalnya lalu tutup koneksi.
- Setelah `completed`/`failed`, server menutup koneksi.
- Broker: satu instance `QueueEvents` di proses API + `Map<jobId, Set<socket>>`. Hapus socket dari Map di `onClose`. Dengarkan event `progress`, `completed`, `failed`.
- `returnvalue` di event `completed` bisa berupa string atau objek tergantung versi. Tangani dua-duanya (parse JSON kalau string, dengan try/catch).
- Klien tetap bisa fallback ke `GET /reports/:id`.

---

## 7. Aturan Implementasi per Komponen

### 7.1 `src/lib/ws.ts` dan `src/index.ts` (JEBAKAN UTAMA)

Bun butuh handler `websocket` diekspor di entry. `export default app` **tidak cukup**.

```ts
// src/lib/ws.ts
import { createBunWebSocket } from 'hono/bun'
export const { upgradeWebSocket, websocket } = createBunWebSocket()
```

```ts
// src/index.ts
import { app } from './app'
import { websocket } from './lib/ws'
import { env } from './config/env'

export default { port: env.PORT, fetch: app.fetch, websocket }
```

`createBunWebSocket()` dipanggil **sekali saja** (di `lib/ws.ts`). Route WebSocket dan `index.ts` mengimpor dari sana.

### 7.2 `src/app.ts`

Urutan middleware (penting):
1. `hono/logger` (log memakai path tanpa query string; **jangan pernah** log URL lengkap karena token WebSocket ada di query).
2. `hono/cors` dengan `env.CORS_ORIGINS`, `allowHeaders: ['Authorization', 'Content-Type']`, `allowMethods: ['GET','POST','OPTIONS']`. **Harus sebelum auth** supaya preflight `OPTIONS` lolos.
3. `hono/body-limit` maksimal 1 MB, `onError` → 413 dengan format error seragam.
4. Route: `/health`, `/reports`, `/ws`.
5. `app.onError` (format seragam; `AppError` → status-nya, lainnya → 500 tanpa membocorkan detail) dan `app.notFound` (404 format seragam).

Untuk validasi, `zValidator` **harus** diberi hook agar error Zod memakai format error seragam (`VALIDATION_ERROR`, status 400).

### 7.3 `src/middleware/auth.ts`

Satu implementasi untuk HTTP dan WebSocket, memakai `verify` dari `hono/jwt`.

- Sumber token: header `Authorization: Bearer <token>`. Untuk route WebSocket saja (`allowQueryToken: true`): query `token`.
- `verify(token, env.JWT_SECRET, env.JWT_ALG)`. Ini memeriksa tanda tangan **dan** `exp`. **Jangan** hanya decode tanpa verify: siapa pun bisa memalsukan token.
- Username = `payload[env.JWT_USERNAME_CLAIM]`. Kalau bukan string tidak kosong → 401.
- Set ke context: `c.set('username', username)`. Tipe di `src/types.ts`:

```ts
export type AppEnv = { Variables: { username: string } }
```

- Semua kegagalan (token hilang, salah, kedaluwarsa) → 401 `UNAUTHORIZED`, pesan generik `Token tidak valid atau kedaluwarsa`. Jangan membedakan penyebabnya ke klien.
- Jangan pernah mencatat token ke log.

### 7.4 `src/db/mssql.ts`

- **Lazy singleton**: `getPool()` mengembalikan promise pool yang dibuat saat pertama dipanggil. **Jangan** top-level `await` saat import, supaya `/health` tetap hidup walau database mati.
- Konfigurasi dari `env`: `server: DB_SERVER`, `port: DB_PORT`, `database`, `user`, `password`, `options: { encrypt: DB_ENCRYPT, trustServerCertificate: DB_TRUST_CERT }`, `pool: { max: 10, min: 0 }`.
- Pasang `pool.on('error', …)` yang mencatat ke logger (tanpa handler ini, error koneksi bisa membuat proses crash).
- Kalau koneksi gagal, reset singleton agar percobaan berikutnya mencoba lagi.
- Query **selalu** berparameter dengan tipe eksplisit: `request.input('month', sql.VarChar(7), value)`. Utamakan `request.execute('nama_sp')`. **Dilarang** menyambung string SQL dengan input user.
- Export `closePool()` untuk graceful shutdown.

### 7.5 Queue (`src/queue/*`)

- Koneksi: berikan **objek opsi** (`{ host, port, password? }`), **bukan** instance IORedis. BullMQ akan mengatur `maxRetriesPerRequest` yang benar untuk Worker.
- Nama queue: `report`. Nama job: `generate`.
- `defaultJobOptions`:

```ts
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800 },
}
```

- `QueueEvents` dibuat **hanya di proses API** (untuk WebSocket), dengan koneksinya sendiri.
- Event `progress` hanya terkirim kalau worker memanggil `job.updateProgress(n)`.

### 7.6 `src/worker.ts`

- `new Worker('report', processor, { connection, concurrency: env.REPORT_CONCURRENCY })`.
- **Wajib** pasang listener: `worker.on('error', …)`, `worker.on('failed', …)`, `worker.on('completed', …)` dengan logging. Tanpa `error` listener, error Redis bisa mematikan proses.
- Processor (urutan dan progress):
  1. Ambil definisi dari registry. Tidak ada → `throw new UnrecoverableError('Jenis laporan tidak dikenal')` (impor dari `bullmq`, tidak di-retry).
  2. Validasi ulang `params` dengan `paramsSchema`. Gagal → `UnrecoverableError`.
  3. `updateProgress(10)` → `fetchData` → `updateProgress(50)`.
  4. `render` → HTML → `htmlToPdf` → `updateProgress(85)`.
  5. Simpan file → `updateProgress(100)`.
  6. Return `{ fileName, size, generatedAt }`.
- Error sementara (DB putus, Gotenberg 5xx, timeout) dilempar biasa supaya BullMQ me-retry.
- Graceful shutdown pada `SIGTERM`/`SIGINT`: `await worker.close()`, `closePool()`, lalu `process.exit(0)`.
- Saat start, hapus file di `STORAGE_DIR` yang lebih tua dari `FILE_RETENTION_DAYS` (hanya file `report-*.pdf`).

### 7.7 `src/services/pdf.ts` (Gotenberg)

- Endpoint: `POST {GOTENBERG_URL}/forms/chromium/convert/html`.
- **Nama file wajib `index.html`** (Gotenberg mencari file dengan nama itu). Footer: `footer.html`, header: `header.html`.
- Kirim dengan `FormData`. **Jangan set header `Content-Type` manual**, biarkan `fetch` mengisi boundary.
- Field: `paperWidth=8.27`, `paperHeight=11.69` (A4, satuan inci), margin `marginTop=0.6`, `marginBottom=0.8`, `marginLeft=0.5`, `marginRight=0.5`, `printBackground=true`, `landscape` sesuai hasil `render`.
- Timeout: `AbortSignal.timeout(env.GOTENBERG_TIMEOUT_MS)`.
- Respons tidak ok → throw Error berisi status dan potongan body (maks 300 karakter).
- Return `Uint8Array` dari `arrayBuffer()`.
- Footer nomor halaman memakai class `pageNumber` dan `totalPages`, dan style-nya harus ditulis eksplisit (`font-size`, dst.) karena default Chromium sangat kecil.

```ts
const form = new FormData()
form.append('files', new Blob([html], { type: 'text/html' }), 'index.html')
if (footerHtml) form.append('files', new Blob([footerHtml], { type: 'text/html' }), 'footer.html')
```

### 7.8 `src/templates/html.ts`

- `escapeHtml(value: unknown): string` — escape `& < > " '`; `null`/`undefined` menjadi string kosong.
- **Semua** nilai dari database atau user yang dimasukkan ke HTML **wajib** lewat `escapeHtml`.
- Layout dasar: `<meta charset="utf-8">`, font `Arial`, `table { border-collapse: collapse }`, `thead { display: table-header-group }` (header tabel berulang tiap halaman), `tr { page-break-inside: avoid }`.
- Gotenberg dijalankan dengan JavaScript nonaktif, jadi template **tidak boleh** bergantung pada JS. Gambar/logo pakai `data:` URI base64.

### 7.9 Registry laporan (`src/reports/*`)

```ts
// src/reports/types.ts
import type { z } from 'zod'
import type sql from 'mssql'

export interface RenderMeta<TParams> {
  requestedBy: string
  generatedAt: Date
  params: TParams
}
export interface RenderResult {
  html: string
  footerHtml?: string
  landscape?: boolean
}
export interface ReportDefinition<TParams = unknown, TData = unknown> {
  type: string
  title: string
  paramsSchema: z.ZodType<TParams>
  fetchData(params: TParams, ctx: { pool: sql.ConnectionPool }): Promise<TData>
  render(data: TData, meta: RenderMeta<TParams>): RenderResult
}
```

- `registry.ts` mengekspor `reports: Record<string, ReportDefinition<any, any>>`. Ini **satu-satunya** tempat `any` yang diizinkan (beri komentar alasannya).
- Buat satu laporan **`example`** yang **tidak menyentuh tabel database**: `paramsSchema` = `z.object({ title: z.string().min(1).max(100).default('Laporan Contoh'), rows: z.number().int().min(1).max(500).default(20) })`; `fetchData` membuat data dummy di memori; `render` menghasilkan tabel. Tujuannya membuktikan seluruh pipeline (queue → Gotenberg → file → WebSocket) berjalan.
- **Jangan membuat laporan yang memakai tabel/stored procedure WPS.** Nama-namanya tidak diketahui. Cukup dokumentasikan di README cara menambah laporan baru (salin `example.ts`, ganti `fetchData` dengan `pool.request().input(...).execute('<NAMA_SP>')`, daftarkan di registry).

### 7.10 Logging (`src/lib/logger.ts`)

- `pino({ level: env.LOG_LEVEL, redact: ['req.headers.authorization', '*.password', '*.token'] })`.
- Output JSON (tanpa `pino-pretty`).
- Jangan log body request, token, atau password.

### 7.11 Graceful shutdown API

Di `src/index.ts`: pada `SIGTERM`/`SIGINT` tutup `QueueEvents`, `Queue`, `closePool()`, lalu `process.exit(0)`.

### 7.12 Gaya kode

- TypeScript strict, ES modules, `async/await`.
- **Dilarang `any`** kecuali di registry (7.9).
- Named export; default export hanya di `src/index.ts`.
- Tidak ada `console.log` di kode aplikasi (pakai logger). Di `scripts/` boleh.
- Satu tanggung jawab per file; jangan menaruh logika bisnis di file route.

---

## 8. `package.json` — Perubahan

Pertahankan `dependencies` dan `devDependencies` yang ada. Tambahkan `typescript` (bagian 3) dan ubah `scripts` menjadi:

```json
{
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "dev:worker": "bun run --watch src/worker.ts",
    "start": "bun run src/index.ts",
    "start:worker": "bun run src/worker.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "dev:token": "bun run scripts/dev-token.ts"
  }
}
```

**Kenapa `--watch`, bukan `--hot`:** `--hot` menjalankan ulang modul tanpa me-restart proses, sehingga `Worker`/`QueueEvents` lama tetap hidup dan koneksi Redis menumpuk (job bisa diproses ganda). `--watch` me-restart proses sepenuhnya.

## 9. `tsconfig.json` — Perubahan

Pertahankan `strict`, `types: ["bun"]`, dan setting `jsx` yang ada. **Tambahkan**:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],
    "module": "Preserve",
    "moduleResolution": "bundler",
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "scripts", "tests"]
}
```

Tanpa `moduleResolution: "bundler"`, TypeScript gagal me-resolve import seperti `hono/jwt` dan `hono/bun`. Kalau `typecheck` menolak itu, perbaiki `tsconfig`, jangan mengakali dengan `ts-ignore`.

## 10. `.gitignore` (isi lengkap)

```gitignore
# deps
node_modules/

# env & secret
.env
.env.*
!.env.example

# runtime
storage/*
!storage/.gitkeep
*.log
dist/
.DS_Store
```

---

## 11. Docker

### `Dockerfile`

```dockerfile
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN mkdir -p /app/storage && chown -R bun:bun /app
USER bun
EXPOSE 5003
CMD ["bun", "run", "src/index.ts"]
```

Bun menjalankan TypeScript langsung, tidak perlu build step. Satu image dipakai untuk API dan worker (beda `command`).

### `.dockerignore`

```
node_modules
.env
.env.*
!.env.example
.git
storage
tests
scripts
*.md
docker-compose*.yml
```

### `docker-compose.dev.yml` (infrastruktur saja, untuk dev lokal)

```yaml
name: report-service-dev

services:
  redis:
    image: redis:7
    container_name: report-dev-redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis-dev-data:/data

  gotenberg:
    image: gotenberg/gotenberg:8
    container_name: report-dev-gotenberg
    restart: unless-stopped
    command:
      - gotenberg
      - --api-timeout=120s
      - --chromium-disable-javascript=true
    ports:
      - "127.0.0.1:3100:3000"

volumes:
  redis-dev-data:
```

Gotenberg dipetakan ke port **3100** di host supaya tidak bentrok dengan port lain. Jika port `6379` sudah dipakai Redis lain di mesin user, ubah sisi kiri (mis. `6380:6379`) dan sesuaikan `REDIS_PORT`.

### `docker-compose.yml` (full stack)

```yaml
name: report-service

x-app: &app
  build: .
  image: report-service:local
  restart: unless-stopped
  env_file: .env
  environment:
    NODE_ENV: production
    REDIS_HOST: redis
    REDIS_PORT: "6379"
    GOTENBERG_URL: http://gotenberg:3000
    STORAGE_DIR: /app/storage
  volumes:
    - report-storage:/app/storage
  depends_on:
    redis:
      condition: service_healthy
    gotenberg:
      condition: service_started

services:
  api:
    <<: *app
    container_name: report-api
    command: ["bun", "run", "src/index.ts"]
    ports:
      - "${PORT:-5003}:${PORT:-5003}"
    healthcheck:
      test: ["CMD", "bun", "-e", "fetch('http://localhost:' + (process.env.PORT || 5003) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  worker:
    <<: *app
    container_name: report-worker
    command: ["bun", "run", "src/worker.ts"]

  redis:
    image: redis:7
    container_name: report-redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  gotenberg:
    image: gotenberg/gotenberg:8
    container_name: report-gotenberg
    restart: unless-stopped
    command:
      - gotenberg
      - --api-timeout=120s
      - --chromium-disable-javascript=true

volumes:
  report-storage:
  redis-data:
```

Catatan Docker yang **wajib dipahami**:

- Di dalam container, `localhost` berarti **container itu sendiri**. Karena itu `REDIS_HOST=redis` dan `GOTENBERG_URL=http://gotenberg:3000` di-override lewat `environment:` (nilai di sini menang atas `env_file`).
- **SQL Server tidak ada di compose** (memakai server yang sudah ada). Dari dalam container, `DB_SERVER=localhost` **tidak akan bekerja**. Kalau SQL Server ada di mesin host (Docker Desktop di Windows), pakai `host.docker.internal`. Kalau di server lain, pakai IP/hostname-nya. Pastikan SQL Server mengaktifkan TCP/IP dan port `1433` bisa dijangkau.
- `api` dan `worker` **harus** berbagi volume `report-storage` (worker menulis PDF, API menyajikannya). Pakai **named volume** (bukan bind mount) agar izin tulis untuk user `bun` benar.
- `.env` harus ada di folder proyek sebelum `docker compose up`.
- Gotenberg dan Redis tidak dipublikasikan ke host di compose produksi; hanya `api` yang terbuka.
- Jika Gotenberg gagal start, cek `docker compose logs gotenberg` (kemungkinan flag tidak dikenali oleh versi image).

---

## 12. Fase Kerja

### Fase 1 — Fondasi
Kerjakan: ubah `package.json` (bagian 8), `tsconfig.json` (9), `.gitignore` (10); `bun add -d typescript`; buat `.env.example`, `storage/.gitkeep`, `src/config/env.ts`, `src/lib/logger.ts`, `src/lib/errors.ts`, `src/types.ts`; buat `.env` lokal dari `.env.example` (jangan di-commit).
**Selesai jika:** `bun run typecheck` lulus. Menjalankan `bun -e "import './src/config/env'"` dengan `.env` valid tidak error, dan dengan `JWT_SECRET` dikosongkan menampilkan pesan error yang menyebut `JWT_SECRET`.

### Fase 2 — App inti
Kerjakan: `src/app.ts`, `src/lib/ws.ts`, `src/index.ts`, `src/routes/health.ts` (sementara `/health/ready` boleh hanya mengecek komponen yang sudah ada), handler error, CORS, body limit.
**Selesai jika:** `bun run dev` berjalan di port `5003`. `curl.exe http://localhost:5003/health` → `{"status":"ok"}`. Path acak → 404 berformat error seragam.

### Fase 3 — Auth JWT
Kerjakan: `src/middleware/auth.ts`, `scripts/dev-token.ts`.

`scripts/dev-token.ts`: membaca `env`, menerima username dari argumen (`process.argv[2]`, default `tester`), membuat token dengan `sign` dari `hono/jwt` (payload `{ [JWT_USERNAME_CLAIM]: username, exp: <sekarang + 3600 detik> }`, algoritma `JWT_ALG`), mencetak token. **Menolak berjalan** kalau `NODE_ENV=production`.
**Selesai jika:** pasang route sementara terlindungi, lalu: tanpa token → 401; token salah → 401; token kedaluwarsa → 401; token dari `bun run dev:token budi` → 200 dan username terbaca `budi`. Route sementara dihapus/diganti di fase 6.

### Fase 4 — Database, Queue, Worker
Kerjakan: `src/db/mssql.ts`, `src/queue/connection.ts`, `src/queue/report.queue.ts`, `src/worker.ts` (processor sementara yang hanya `updateProgress` lalu return), lengkapi `/health/ready` untuk DB dan Redis.
Jalankan infrastruktur: `docker compose -f docker-compose.dev.yml up -d`.
**Selesai jika:** `bun run dev:worker` berjalan tanpa error dan mencatat log "worker ready". `/health/ready` menampilkan Redis `true`. Kalau kredensial DB di `.env` masih contoh, komponen DB `false` dan itu **wajar**; laporkan ke user, jangan dianggap gagal.

### Fase 5 — PDF (Gotenberg) dan laporan contoh
Kerjakan: `src/services/pdf.ts`, `src/services/storage.ts`, `src/templates/html.ts`, `src/reports/*` (termasuk `example`), processor worker lengkap (7.6), `/health/ready` untuk Gotenberg.
**Selesai jika:** dengan infra dev menyala, satu job `example` diproses worker, file `storage/report-<jobId>.pdf` terbentuk, dan file itu berupa PDF valid (diawali `%PDF`, ukuran > 0). Job dengan `type` tidak dikenal langsung `failed` **tanpa retry**.

### Fase 6 — Endpoint laporan
Kerjakan: `src/routes/reports.ts` (POST, status, download) sesuai bagian 6.
**Selesai jika:** semua ini terbukti dengan curl:
- POST tanpa token → 401.
- POST `type` salah → 400 `UNKNOWN_REPORT_TYPE`.
- POST `params` tidak valid → 400 `VALIDATION_ERROR`.
- POST valid → 202 + `jobId`.
- GET status berubah `pending/processing` → `completed`.
- Download mengembalikan PDF yang bisa dibuka.
- Token milik user lain untuk `jobId` yang sama → 404 (status dan download).

### Fase 7 — WebSocket
Kerjakan: `src/queue/events.ts`, `src/routes/ws.ts`, `scripts/ws-test.ts` (klien memakai `WebSocket` bawaan Bun, argumen: `<jobId> <token>`, mencetak semua pesan).
**Selesai jika:** menjalankan `bun run scripts/ws-test.ts <jobId> <token>` untuk job baru menampilkan `snapshot` lalu `progress` lalu `completed`. Untuk job yang sudah selesai, langsung `snapshot` + `completed` lalu koneksi tertutup. Token salah atau job milik orang lain → koneksi ditolak (401/404), bukan tersambung.

### Fase 8 — Docker
Kerjakan: `Dockerfile`, `.dockerignore`, `docker-compose.yml` (bagian 11). Sesuaikan `.env` untuk Docker: `DB_SERVER` yang bisa dijangkau dari container (lihat catatan bagian 11).
Perintah: `docker compose build`, lalu `docker compose up -d`.
**Selesai jika:** `docker compose ps` menampilkan `api` (healthy), `worker`, `redis` (healthy), `gotenberg` berjalan. `curl.exe http://localhost:5003/health` ok. `/health/ready` menunjukkan Redis dan Gotenberg `true`. Alur penuh (POST → status → download → WebSocket) berhasil **dari dalam stack Docker**. Setelah selesai, matikan dengan `docker compose down` (**tanpa `-v`**).

### Fase 9 — Test, README, verifikasi akhir
Kerjakan:
- `tests/env.test.ts`: nilai valid diterima; `JWT_SECRET` pendek ditolak; `"false"` menjadi boolean `false`.
- `tests/html.test.ts`: `escapeHtml` meng-escape `<script>`, tanda kutip, `&`; `null` menjadi string kosong.
- `tests/registry.test.ts`: `example.paramsSchema` menerima default dan menolak `rows: 0`.
- Ganti `README.md`: fungsi service, cara jalan lokal, cara jalan Docker, daftar endpoint, cara menambah laporan baru, troubleshooting.
**Selesai jika:** `bun run typecheck` dan `bun test` lulus. Tidak ada secret di file yang akan ter-commit (`git status` tidak menampilkan `.env`).

---

## 13. Di Luar Lingkup (jangan dikerjakan kecuali diminta)

- Export Excel (`exceljs` belum terinstall).
- Swagger/OpenAPI UI (butuh `@hono/swagger-ui`, belum diinstall; `@hono/zod-openapi` sudah ada untuk fase ini di masa depan).
- Laporan yang memakai tabel/stored procedure WPS.
- Rate limiting, multi-tenant, penyimpanan S3/MinIO.
- Streaming hasil query untuk laporan di atas ±50.000 baris (diskusikan dengan user dulu bila muncul kebutuhan).

---

## 14. Yang Harus Dikonfirmasi ke User (jangan ditebak)

1. **Nama field username di payload JWT WPS** (`username`, `user`, `sub`, atau lainnya). Default sementara `username` lewat `JWT_USERNAME_CLAIM`. Cara cek: login ke WPS di environment development, tempel token di jwt.io, lihat Payload.
2. **Algoritma JWT WPS.** Default `HS256` (bawaan `jsonwebtoken`). Cek di Header token (`alg`).
3. **Kredensial SQL Server** (user read-only) dan lokasi servernya, untuk pengujian dari Docker.
4. **Daftar laporan nyata** (nama stored procedure/query dan parameternya) yang akan ditambahkan setelah pipeline `example` terbukti jalan.

---

## 15. Jebakan Umum (baca sebelum coding)

| Jebakan | Yang benar |
|---|---|
| `z.coerce.boolean()` untuk env | Jadi `true` untuk string `"false"`. Pakai enum `'true'/'false'` + transform. |
| `export default app` di Bun | WebSocket tidak jalan. Export `{ port, fetch, websocket }`. |
| `bun run --hot` untuk worker/API | Menumpuk koneksi Redis dan Worker ganda. Pakai `--watch`. |
| `localhost` di dalam container | Menunjuk ke container itu sendiri. Pakai nama service (`redis`, `gotenberg`) atau `host.docker.internal`. |
| Meneruskan instance IORedis ke BullMQ Worker | Beri objek opsi koneksi, biarkan BullMQ yang mengelola. |
| Hanya decode JWT | Tidak memeriksa tanda tangan. Selalu `verify`. |
| Set `Content-Type` manual pada FormData | Merusak boundary multipart. Biarkan `fetch` yang mengisi. |
| File HTML untuk Gotenberg bernama lain | Harus `index.html`. |
| Top-level `await` untuk koneksi DB | App gagal start kalau DB mati. Pakai lazy `getPool()`. |
| Logging URL lengkap WebSocket | Token di query ikut tercatat. Log path saja. |
| `curl` di PowerShell | Itu alias `Invoke-WebRequest`. Pakai `curl.exe`, dan kirim JSON dari file: `curl.exe -X POST … -H "Content-Type: application/json" -d "@body.json"`. |
| Nilai HTML dari database tanpa escape | Selalu `escapeHtml`. |
| ID job auto-increment | Mudah ditebak. Pakai `crypto.randomUUID()` + cek kepemilikan. |
| Bind mount untuk `storage` di Docker | Masalah izin tulis. Pakai named volume. |
| Menambah `dotenv` | Tidak perlu, Bun membaca `.env` sendiri. |

---

## 16. Definition of Done (seluruh pekerjaan)

- [ ] `bun run typecheck` lulus tanpa error.
- [ ] `bun test` lulus.
- [ ] Lokal: `docker compose -f docker-compose.dev.yml up -d`, `bun run dev`, `bun run dev:worker` menjalankan alur penuh (POST → progress WebSocket → download PDF).
- [ ] Docker: `docker compose up -d --build` menjalankan alur penuh yang sama.
- [ ] Isolasi kepemilikan job terbukti (user lain mendapat 404).
- [ ] Tidak ada secret di file yang ter-commit; `.env` ada di `.gitignore`.
- [ ] `README.md` sudah diganti dokumentasi nyata.
- [ ] Laporan akhir ke user memuat: ringkasan, hasil verifikasi, dan item bagian 14 yang masih terbuka.
