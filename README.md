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

### Laporan S4S & Sanding

Parameter `periode` = `{ tglAwal, tglAkhir }` berformat `YYYY-MM-DD` (`tglAkhir` ≥ `tglAwal`).

| type | Parameter | Stored procedure |
|---|---|---|
| `rekap-produksi-s4s-consolidated` | periode | `SP_LapRekapProduksiS4SConsolidated` |
| `rekap-produksi-s4s-per-jenis-per-grade` | periode | `SP_LapRekapProduksiS4SPerJenisPerGrade` |
| `s4s-hidup-detail` | tanpa params (snapshot) | `SP_LapS4SHidupDetail` |
| `umur-s4s-detail` | `{ umur1?, umur2?, umur3?, umur4? }` (default 15/30/60/90, harus naik) | `SP_LapUmurS4S` |
| `dashboard-sanding` | periode | `SPWps_LapDashboardSanding` |
| `ketahanan-barang-sanding` | periode | `SP_LapKetahananBarangSanding` |
| `mutasi-sanding` | periode | `SP_Mutasi_Sanding` + `SP_SubMutasi_Sanding` (landscape, 2 bagian) |
| `rekap-produksi-sanding-consolidated` | periode | `SP_LapRekapProduksiSandingConsolidated` |
| `rekap-produksi-sanding-per-jenis-per-grade` | periode | `SP_LapRekapProduksiSandingPerJenisPerGrade` |
| `sanding-hidup-detail` | tanpa params (snapshot) | `SP_LapSandingHidupDetail` |
| `umur-sanding-detail` | `{ umur1?, umur2?, umur3?, umur4? }` | `SP_LapUmurSanding` |

> Nama kolom 4 SP consolidated/per-jenis (S4S & Sanding) **sudah diverifikasi ke database** dan ternyata berbeda dari tebakan awal: blok input S4S adalah `CCAkhir / Reproses / S4S / ST / WIP` (bukan FJ/MLD), blok input Sanding adalah `CCAkhir / FJ / Moulding / Reproses / Wip / BJ`, dan tidak ada kolom `Sanding` pada keduanya. Yang masih **asumsi**: kolom `NoS4S`/`Kubik` pada laporan hidup, urutan kolom dashboard Sanding, dan `Period1-5` pada laporan umur. Kalau ternyata berbeda, yang perlu diubah hanya konstanta di header file laporan tersebut. `SP_Mutasi_Sanding` sudah terverifikasi dari `rekap-mutasi.ts`.

### Laporan Rangkuman Bahan, Label, dan Kapasitas

Keenam laporan ini **diport dari `D:\Projects\open-api-report`** (service + blade), bukan ditebak dari laporan sekelas. Nama kolom diverifikasi ke database **dan** dicocokkan dengan implementasi reference.

| type | Params body | Stored procedure |
|---|---|---|
| `bahan-terpakai` | `{ tglAkhir }` (dikirim ke `@TglAwal`) | `SPWps_LapBahanTerpakai` + `SPWps_LapSubBahanTerpakai` |
| `bahan-yang-dihasilkan` | `{ tglAkhir }` (dikirim ke `@TglAwal`) | `SPWps_LapBahanYangDihasilkan` |
| `label-nyangkut` | tanpa params | `SPWps_LapLabelNyangkut` |
| `rangkuman-bongkar-susun` | `{ tglAkhir }` (dikirim ke `@TglAwal`) | `SPWps_LapRangkumanBongkarSusun` |
| `rangkuman-jumlah-label-input` | periode | `SPWps_LapRangkumanJlhLabelInput` |
| `kapasitas-racip-kayu-bulat-hidup` | periode | 4 procedure (lihat di bawah) |

Detail yang tidak terlihat dari nama kolom saja:

- **Bahan Terpakai** — sub-laporan (Ton) tampil **duluan**, lalu laporan utama (m3). Kolom m3 di sub-laporan tidak ada di SP: itu `Ton x 1.416` (`$tonToM3Factor`).
- **Bahan Yang Dihasilkan** — urutan proses tetap `S4S, FJ, MLD, LMT, CCAKHIR, SND, PCK` (bukan alfabetis), ditutup tabel **Rangkuman** + Grand Total.
- **Label Nyangkut** — dikelompokkan per kolom `Ket`; **satuan kolom Total ditentukan per kelompok** (`ST` → Ton, lainnya → m3). Subtitle memakai tanggal *generate*, bukan periode, karena SP-nya tanpa parameter.
- **Rangkuman Jumlah Label Input** — menambah kolom **Rendemen** = `KubikOut / KubikIN x 100` (tidak ada di SP), tanpa baris total. Baris dengan semua kolom NULL tetap dihitung agar penomoran tidak bergeser.
- **Rangkuman Bongkar Susun** — kategori `S4S, FJ, MLD, LMT, CCA, SND, BJ` + tabel Rangkuman.
- **Kapasitas Racip** — dua konstanta dari reference: `TOTAL_TON_CAPACITY = 323.7837` (ton/hari kapasitas sawmill, **tidak ada di SP mana pun**) dan rendemen **85%** non-Rambung / **20%** Rambung. Laporan ini menghitung *hari kerja yang dibutuhkan*, bukan sekadar `Ton / HK`.

Kalau kapasitas atau rendemen plants berubah, ubah konstanta di `src/reports/wps/kapasitas-racip-kayu-bulat-hidup.ts`.

### Laporan Sawn Timber

Ketiganya **diport dari `D:\Projects\open-api-report`**, lalu diverifikasi ke database dengan `sys.parameters` + eksekusi langsung.

| type | Params body | Stored procedure |
|---|---|---|
| `mutasi-sawn-timber-ton` | periode | `SP_Mutasi_ST` |
| `mutasi-kd` | periode | `SP_LapMutasiKD` |
| `dashboard-sawn-timber` | periode | `SPWps_LapDashboardSawnTimber` |

Tiga hal yang tidak terlihat dari nama kolom:

- **Mutasi Sawn Timber (Ton)** — empat header diganti seperti di reference: `AdjustmentPlus` → Adjust (+), `AdjustmentMinus` → Adjust (-), `BongkarSusunPlus` → B.Susun (+), `BongkarSusunMinus` → B.Susun (-). Semua kolom numerik dijumlahkan di baris Total. Sub-report opsional di reference **tidak** ikut, karena nama sub-procedure-nya kosong secara default (`MUTASI_ST_SUB_REPORT_PROCEDURE`).
- **Mutasi KD** — satu tabel per ruang KD, urut angka (bukan string, supaya KD 10 tidak mendahului KD 2), isi tabel urut `TglMasuk`. **`Jumlah Hari` bersifat bertanda** (`TglKeluar - TglMasuk`) dan 0 kalau salah satu tanggal kosong — reference memang meminta diff non-absolut, jadi lot yang belum keluar atau keluar sebelum masuk tidak direkayasa jadi angka. **SP ini memakai `@StartDate`/`@EndDate`, bukan `@TglAwal`/`@TglAkhir` seperti periode laporan lain.**
- **Dashboard Sawn Timber** — kolom yang dipakai **bukan** yang mengira. SP mengembalikan 17 kolom dan reference memilihnya dengan exact match sambil berjalan di urutan key, sehingga hasilnya: `DATE`, `Jenis`, **`Masuk`** (bukan `MasukALL`), **`Keluar`** (bukan `KeluarALL`), **`Akhir`** (bukan `Akhir2`), `CTR`. Dipilihnya keliru mengubah angkanya: untuk Agustus 2026 `Masuk` per jenis berjumlah 5,8728 t sedangkan `MasukALL` 5,9279 t. Kolom `CTR` ada, jadi pembagi 75 hanyacadangan. `NamaGrade` sengaja **tidak ada** di SP ini, makanya kolom dashboard dikunci `Jenis` saja.

Contoh:

```sh
curl.exe -X POST http://localhost:5003/reports -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d "{\"type\":\"mutasi-kayu-bulat\",\"params\":{\"tglAwal\":\"2025-01-01\",\"tglAkhir\":\"2025-01-31\"}}"
```

## Menambah laporan baru

**Penempatan file:** laporan yang menyentuh database WPS diletakkan di `src/reports/wps/` (mis. `src/reports/wps/mutasi-kayu-bulat.ts`); laporan umum/tanpa DB tetap di `src/reports/`. Tipe interface ada di `src/reports/types.ts` (`ReportDefinition`).

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

Bentuk `params` pada `POST /reports` dipetakan otomatis dari registry, jadi spesifikasinya tidak mungkin melenceng dari kode. Satu request body dipetakan lewat `anyOf` per **bentuk** parameter, bukan per laporan: 141 laporan hanya jadi 16 cabang, dan tiap cabang mencantumkan laporan mana yang memakainya. Bentuk `params` yang ada:

| Bentuk | Jumlah laporan | Isi `params` |
|---|---|---|
| `PeriodParams` | 88 | `tglAwal` + `tglAkhir` (wajib) |
| `NoParams` | 12 | kosong / `{}` |
| `AsOfDateParams` | 8 | `tglAkhir` saja |
| `ParamsUmurLaminatingDetail` | 8 | `umur1`..`umur4` (ada default) |
| `ParamsProduksiFjPerNomorProduksi` | 7 | `noProduksi` |
| sisanya | 1–4 per bentuk | khusus — lihat komponen di `/docs/openapi.json` |


- Nama kolom `NoS4S`/`Kubik` pada laporan hidup S4S & Sanding, urutan kolom `dashboard-sanding`, dan kolom `Period1-5` pada laporan umur masih **asumsi** — belum diverifikasi terhadap SP asli di SQL Server. (Column mapping 4 SP consolidated/per-jenis sudah diverifikasi dan dikoreksi; `mutasi-sanding` juga sudah, lewat `rekap-mutasi.ts`.)
- Kapasitas Racip memakai konstanta kapasitas sawmill `323.7837` ton/hari dan rendemen 85% / 20% yang diambil dari `open-api-report`, bukan dari SP. Kalau angka plants berubah, kedua konstanta itu perlu ditinjau.
- Nama field username di payload JWT WPS (`JWT_USERNAME_CLAIM`) dan algoritma JWT (`JWT_ALG`) masih default dan **belum dikonfirmasi** terhadap token WPS asli.
- Kredensial SQL Server production belum diisi; semua pengujian memakai laporan `example`.
