# report-service

Microservice untuk membuat **laporan PDF secara asynchronous** untuk sistem **WPS** (Wood Processing System, "WPS Ratimdo"). Dibangun dengan [Bun](https://bun.sh) + [Hono](https://hono.dev), antrian [BullMQ](https://docs.bullmq.io) + Redis, dan rendering PDF via [Gotenberg](https://gotenberg.dev).

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

Service ini **tidak menerbitkan token**. Token JWT diterbitkan oleh WPS backend; service ini hanya **memverifikasi** dengan `JWT_SECRET` yang sama dan mengambil **username** dari payload (field yang dipakai diatur lewat `JWT_USERNAME_CLAIM`).

## Menjalankan lokal (dev)

Prasyarat: [Bun](https://bun.sh) 1.2+, Docker (untuk Redis & Gotenberg).

```sh
bun install                                        # install dependency
cp .env.example .env                               # lalu isi kredensial DB
docker compose -f docker-compose.dev.yml up -d     # infra: Redis + Gotenberg
bun run dev                                        # API di port 5003
bun run dev:worker                                 # worker (proses terpisah)
bun run dev:token budi                             # buat JWT testing (username: budi)
```

Verifikasi cepat: `bun run typecheck`, `bun test`, dan `curl.exe http://localhost:5003/health`.

Dokumentasi interaktif API: buka `http://localhost:5003/docs` (spec mentah di `/docs/openapi.json`).

## Menjalankan dengan Docker (full stack)

```sh
cp .env.example .env     # wajib ada sebelum compose up
docker compose build
docker compose up -d
docker compose ps        # api (healthy), worker, redis (healthy), gotenberg
```

Catatan penting:

- Di dalam container, `localhost` berarti container itu sendiri. Redis dan Gotenberg sudah di-override ke nama service-nya. **SQL Server** diambil dari `.env` — kalau DB ada di mesin host (Docker Desktop Windows), set `DB_SERVER=host.docker.internal`.
- `api` dan `worker` berbagi named volume `report-storage` (worker menulis PDF, API menyajikannya).
- Matikan stack dengan `docker compose down` — **jangan** pakai `-v` kecuali sengaja menghapus data.

## Endpoint

| Method | Path | Auth | Fungsi |
|---|---|---|---|
| GET | `/health` | tidak | Liveness. Tidak menyentuh DB/Redis. |
| GET | `/health/ready` | tidak | Cek DB, Redis, Gotenberg. 503 jika ada yang gagal. |
| POST | `/reports` | Bearer | Buat job. Body `{ "type": "example", "params": { ... } }`. Balas 202 `{ jobId, status: "pending" }`. |
| GET | `/reports/:id` | Bearer | Status job + progress + hasil. |
| GET | `/reports/:id/download` | Bearer | Unduh PDF (hanya jika `completed`). |
| GET (WS) | `/ws/reports/:jobId?token=<jwt>` | token di query | Progress realtime. |

Pesan WebSocket: `snapshot` (selalu pertama) → `progress` → `completed`/`failed`, lalu server menutup koneksi.

Semua error berformat seragam:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Input tidak valid", "details": [] } }
```

Kode error: `VALIDATION_ERROR` (400), `UNKNOWN_REPORT_TYPE` (400), `UNAUTHORIZED` (401), `NOT_FOUND` (404), `REPORT_NOT_READY` (409), `FILE_EXPIRED` (410), `PAYLOAD_TOO_LARGE` (413), `INTERNAL_ERROR` (500).

Job hanya bisa diakses pemiliknya; job milik user lain dibalas **404** (keberadaan job tidak bocor).

## Laporan yang tersedia

| type | Parameter | Sumber data |
|---|---|---|
| `example` | `{ title?: string (1–100, default "Laporan Contoh"), rows?: number (1–500, default 20) }` | Dummy di memori (bukti pipeline) |
| `mutasi-kayu-bulat` | `{ tglAwal: "YYYY-MM-DD", tglAkhir: "YYYY-MM-DD" }` (`tglAkhir` ≥ `tglAwal`) | Stored procedure `dbo.SP_Mutasi_KayuBulat` |
| `mutasi-barang-jadi` | `{ tglAwal: "YYYY-MM-DD", tglAkhir: "YYYY-MM-DD" }` (`tglAkhir` ≥ `tglAwal`) | Stored procedure `dbo.SP_Mutasi_BarangJadi` + `dbo.SP_SubMutasi_BarangJadi` (landscape, 2 bagian) |

Contoh:

```sh
curl.exe -X POST http://localhost:5003/reports -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d "{\"type\":\"mutasi-kayu-bulat\",\"params\":{\"tglAwal\":\"2025-01-01\",\"tglAkhir\":\"2025-01-31\"}}"
```

## Menambah laporan baru

Salin `src/reports/example.ts`, sesuaikan, lalu daftarkan di `src/reports/registry.ts`. Tipe interface ada di `src/reports/types.ts` (`ReportDefinition`).

**Penempatan file:** laporan yang menyentuh database WPS diletakkan di `src/reports/wps/` (mis. `src/reports/wps/mutasi-kayu-bulat.ts`); laporan umum/tanpa DB tetap di `src/reports/`.

## Menambah laporan baru

**Standar: laporan 1 stored procedure (tabel tunggal)** — pakai factory `createSingleTableReport` dari `src/reports/wps/template.ts`. File laporan **tanpa styling**; judul, subtitle periode, tabel (zebra rows, baris Total opsional), footer, dan orientasi otomatis dari template:

```ts
// src/reports/wps/mutasi-xxx.ts
import { createSingleTableReport } from './template'

export const mutasiXxxReport = createSingleTableReport({
  type: 'mutasi-xxx',
  title: 'Laporan Mutasi XXX (m3)',
  spName: 'SP_Mutasi_Xxx',
  landscape: false, // true kalau landscape
  columns: [
    { label: 'No', kind: 'no', width: '30px' },
    { label: 'Jenis', kind: 'label', field: 'Jenis', width: '180px' },
    { label: 'Saldo Awal', kind: 'number', field: 'SaldoAwal' },
    { label: 'Saldo Akhir', kind: 'number', field: 'SaldoAkhir' },
  ],
  // totals: true, // opsional: baris Total (jumlah semua kolom number)
})
```

Lalu daftarkan di `src/reports/registry.ts`.

**Penempatan file:** laporan yang menyentuh database WPS diletakkan di `src/reports/wps/` (mis. `src/reports/wps/mutasi-kayu-bulat.ts`); laporan umum/tanpa DB tetap di `src/reports/`.

**Kasus khusus** (2 SP / tabel ganda / header bergrup seperti `mutasi-barang-jadi`, atau parameter non-periode): tulis `fetchData` + `render` sendiri di file laporan — pakai blok bangunan template (`renderWpsReportPage`, `buildReportTable`, `formatNumber4`, `formatTanggalId`) supaya tampilan tetap konsisten, jangan menulis CSS sendiri. Tanpa DB, tiru `src/reports/example.ts`.</think><tool_call>edit<arg_key>newString</arg_key><arg_value>`fetchData` menerima `ctx.pool` berupa **promise lazy** — koneksi SQL Server baru dibuka saat promise itu di-await, jadi laporan yang tidak butuh DB tidak pernah membuka koneksi.

Dua pola query yang sah (selalu berparameter, **jangan** menyambung string SQL dengan input user):

```ts
// 1. Stored procedure
async fetchData(params, { pool }) {
  const conn = await pool
  const result = await conn.request()
    .input('bulan', sql.VarChar(7), params.bulan)
    .execute('nama_stored_procedure')
  return result.recordset
}

// 2. Query manual
async fetchData(params, { pool }) {
  const conn = await pool
  const result = await conn.request()
    .input('bulan', sql.VarChar(7), params.bulan)
    .query('SELECT ... FROM tabel WHERE bulan = @bulan')
  return result.recordset
}
```

Aturan template HTML (`render`): **semua** nilai dari DB/user wajib lewat `escapeHtml`; template tidak boleh bergantung JavaScript (JS Chromium dinonaktifkan di Gotenberg); gambar pakai `data:` URI base64.

## Testing

```sh
bun run typecheck   # tsc --noEmit
bun test            # unit test (env, html, registry)
bun run scripts/ws-test.ts <jobId> <token>   # klien WebSocket manual
```

## Troubleshooting

- **`/health/ready`: DB `false`** — SQL Server tidak terjangkau atau kredensial salah. Dari Docker, `DB_SERVER=localhost` pasti gagal; pakai `host.docker.internal`. Pastikan TCP/IP aktif dan port `1433` terbuka.
- **`/health/ready`: Redis `false`** — infra belum jalan: `docker compose -f docker-compose.dev.yml up -d`.
- **Gotenberg gagal start** — cek `docker compose logs gotenberg` (biasanya flag tidak dikenali oleh versi image).
- **WebSocket ditolak (`Expected 101`)** — token salah/kedaluwarsa, atau job bukan milik Anda. Token dari `bun run dev:token <username>`.
- **`409 REPORT_NOT_READY` saat download** — job belum `completed`; pantau lewat `GET /reports/:id` atau WebSocket.
- **`410 FILE_EXPIRED`** — file sudah dihapus retensi (`FILE_RETENTION_DAYS`, default 7 hari).
- **Worker tidak memproses job** — pastikan `bun run dev:worker` (atau container `worker`) hidup dan Redis terjangkau.
- **`bun run typecheck` gagal soal import `hono/jwt`** — pastikan `tsconfig.json` memakai `moduleResolution: "bundler"`.

## Lingkup & batas saat ini

- Laporan tersedia: `example` (dummy) dan `mutasi-kayu-bulat` (SP `dbo.SP_Mutasi_KayuBulat`).
- Nama field username di payload JWT WPS (`JWT_USERNAME_CLAIM`) dan algoritma JWT (`JWT_ALG`) masih default dan **belum dikonfirmasi** terhadap token WPS asli.
- Kredensial SQL Server production belum diisi; semua pengujian memakai laporan `example`.
