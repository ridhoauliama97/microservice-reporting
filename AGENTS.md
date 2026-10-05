# AGENTS.md — report-service

Microservice pembuat laporan **PDF asynchronous** untuk WPS (Bun + Hono + BullMQ/Redis + Gotenberg).
`README.md` adalah dokumen layanan (daftar endpoint + katalog per-laporan); **file ini hanya soal cara bekerja di repo ini.**

Bagian yang sudah usang (fase pembangunan, "struktur folder target", isi `package.json`/`tsconfig`/docker-compose sebagai target) sudah dihapus — semuanya sudah jadi dan sekarang bisa dibaca langsung dari filenya.

---

## 0. Aturan dasar

- **Bahasa**: balas user **Bahasa Indonesia**, singkat. Kode, nama variabel/file, log: **English**. Field `message` di response API: **Bahasa Indonesia**.
- **Branch**: kerja harian di `development` (`git status -sb` dulu). `main` hanya rilis — **jangan pernah** push ke sana tanpa diminta user, dan jangan `push --force`. Jangan membuat branch lain. Jangan commit/push kalau tidak diminta.
- **Jangan menebak nama tabel, stored procedure, atau kolom DB.** Lihat §5.
- **Jangan menambah package npm** di luar yang sudah ada di `package.json` — tanya dulu.
- **Jangan pernah** menulis secret ke file yang masuk Git. `.env` sudah di-ignore; hanya `.env.example` yang masuk repo.
- **Jangan menjalankan perintah destruktif**: `rm -rf`, `docker compose down -v`, `docker system prune`, `git reset --hard`.
- **Kalau verifikasi gagal, perbaiki akar masalahnya.** Jangan pakai `@ts-ignore` atau hapus test supaya hijau.
- **Tutup pekerjaan dengan laporan singkat**: apa yang berubah, perintah verifikasi + hasilnya, dan apa yang masih perlu dikonfirmasi user.

---

## 1. Arsitektur (fakta yang tidak terlihat dari nama file)

Entry point:

- `src/index.ts` **wajib** `export default { port, fetch, websocket }`. `export default app` mematikan WebSocket tanpa error yang jelas.
- `src/worker.ts` adalah **proses terpisah** (BullMQ Worker). Satu image Docker dipakai API dan worker; hanya `command` yang beda.
- `createBunWebSocket()` dipanggil **tepat sekali**, di `src/lib/ws.ts`.

`src/app.ts` — urutan middleware jangan diubah seenak mata: **logger path-only → CORS → bodyLimit 1MB → route → onError/notFound**. `strict: false` itu disengaja supaya `POST /reports/` tidak jadi 404 (Postman suka menambah slash).

Dokumentasi OpenAPI:

- `/docs/openapi.json` **dirakit manual**, bukan `app.doc()`, karena `components.schemas` harus disuntik dari registry.
- `/docs` = Swagger UI dari CDN lewat HTML statis di `app.ts`. Tidak menambah dependency npm.

Registry laporan:

- `src/reports/registry.ts` adalah **satu-satunya daftar** (sekarang 181 `type`). Mendaftarkan `type` sudah cukup: body OpenAPI `POST /reports` diturunkan dari registry (`src/reports/openapi-params.ts`, `oneOf` per **bentuk** params, bukan per laporan), jadi dokumentasi tidak bisa melenceng dari validasi. **Angka jumlah laporan di README/komentar bisa basi — registry yang benar.**
- `ctx.pool` di `fetchData` adalah **promise lazy** (`Promise<ConnectionPool>`), bukan pool. Laporan tanpa DB (mis. `example`) tidak pernah membuka koneksi.

Queue & PDF:

- BullMQ diberi **objek opsi koneksi**, bukan instance IORedis. `QueueEvents` hanya ada di proses API (dipakai WebSocket).
- Gotenberg: file utama **wajib** `index.html`; jangan set header `Content-Type` manual (boundary). Margin halaman didefinisikan **hanya** di `src/config/pdf-page.ts` dan dipakai bersama footer.
- `process.env` hanya boleh dibaca di `src/config/env.ts`.

---

## 2. Menambah / mengubah laporan (pekerjaan paling sering)

**Sumber kebenaran = proyek Laravel lama `D:\Projects\open-api-report`**: service `app/Services/*ReportService.php` + blade `resources/views/reports/**-pdf.blade.php`. **Port logikanya, jangan mengarang.** Kalau service dan blade berbeda, **blade yang menang** — itulah yang benar-benar tercetak.

Pilih bentuk paling pendek yang cocok:

| Bentuk | Cara |
| --- | --- |
| 1 SP, 1 tabel tunggal | Factory dari `src/reports/wps/template.ts`: `createSingleTableReport`. Tanpa parameter → `createSnapshotTableReport`; satu tanggal acuan → `createSingleDateTableReport`; satu Nomor Kayu Bulat → `createNoKayuBulatLookupReport` |
| 2 SP / multi-tabel / header bergrup / chart / form | Tulis `fetchData` + `render` sendiri, tapi pakai blok `renderWpsReportPage` / `buildReportTable` / `buildEmptyTable`, dan pilih preset layout yang sudah ada di `src/reports/wps/styles.ts` |

Aturan yang sering dilanggar:

- **File laporan tidak boleh membawa CSS.** Isinya hanya deklarasi: `type`, `title`, `spName`, `columns`, `totals`, `landscape`, `style`. Shell dan tabel ada di `template.ts`; variasi layout di `styles.ts`.
- **Nama parameter SP tidak seragam.** Default `TglAwal`/`TglAkhir`, tapi sebagian memakai `@StartDate`/`@EndDate` → isi `inputNames` / `inputName`. Salah nama = error "expects parameter '@StartDate'".
- **Urutan dan kuasanya diambil dari blade, bukan dari intuisi.** Contoh yang sudah jadi keputusan: tabel Input/Output ditumpuk bukan bersampingan, baris yang "masih" dipaksa paling akhir, kolom rasio dihitung ulang dari total. Jangan "menyederhanakan" ini.
- **Logika data ditulis sebagai fungsi murni terekspor** `build<Something>Data(...)`. Itu sambungan unit test — jangan membangun data di dalam `render`.
- Setelah menambah, **daftarkan di `registry.ts`** (kalau tidak → `UNKNOWN_REPORT_TYPE`).

---

## 3. Styling

- Laporan yang diport dari blade memakai stylesheet blade-nya sendiri: `extraCss: WPS_REFERENCE_CSS["<type>"]` (key = `type` registry).
- **`reference-css.ts` itu generated** oleh `scripts/generate-reference-css.ts` — **jangan diedit manual**, jalan berikutnya menimpanya. Ubah blade di `open-api-report`, lalu `bun run generate:css`. `bun run generate:css -- --check` gagal kalau file hasil generate sudah basi.
- Koreksi per-laporan **tidak** ada di generator (itu keputusan, bukan turunan blade): di `src/reports/wps/reference-css-fixups.ts`.
- **Peta `type` → blade di generator saling tertukar** dan itu disengaja: `st-masuk-per-group` memakai blade `st-sawmill-masuk-per-group`, `st-sawmill-masuk-per-group` memakai yang `-meja`. Jangan "menyederhanakan" peta itu jadi berbasis nama file.
- Kalau blade-nya tidak ada, pakai preset `WpsReportStyle` yang sudah ada. Menulis CSS sendiri hanya untuk kasus luar biasa, dan ditaruh di `styles.ts`.
- Chromium (Gotenberg) ≠ wkhtmltopdf. Sheet legacy cuma mendeklarasikan `border-left`, dan Chromium membuang garis kanan, jadi tiap sheet sudah dibungkus blok "grid closure". **Jangan dihapus.**
- Gotenberg jalan dengan JS nonaktif → template tidak boleh bergantung pada JS; gambar lewat `data:` URI.
- Semua nilai dari DB/user wajib lewat `escapeHtml`.
- Laporan lebar (puluhan kolom): default template `table-layout: fixed`, jadi sering perlu `table-layout: auto` atau font 7–9px. Kalau tidak, angka menabrak kolom sebelah.

---

## 4. Verifikasi (wajib sebelum menyatakan selesai)

```sh
bun run typecheck                              # tsc --noEmit
bun test                                       # seluruh suite
bun test tests/wps-sawmill-reports.test.ts     # satu file
```

`typecheck` + `bun test` sudah cukup untuk perubahan logika/styling. Redis dan Gotenberg hanya perlu untuk alur end-to-end:

```sh
docker compose -f docker-compose.dev.yml up -d
bun run dev          # API di :5003
bun run dev:worker   # worker, proses terpisah
bun run dev:token budi [jam]     # token testing (default user "tester", 1 jam)
bun run scripts/ws-test.ts <jobId> <token>
```

**Menjalankan seluruh laporan sekaligus** (butuh API + worker + infra hidup):

```sh
bun run e2e -- --from=2026-09-01 --to=2026-09-30 --base=http://localhost:5103
```

Param setiap laporan **diturunkan dari skema Zod-nya sendiri**, bukan dari daftar nama tipe — jadi laporan baru ikut teruji tanpa didaftarkan di script. Laporan yang berparam lookup (nomor produksi/SPK/kayu bulat/dll) nilainya di-harvest dari tabel yang dibaca stored procedure-nya, karena kunci tebakan hanya menghasilkan PDF kosong. Keluarannya: jumlah PDF per tipe, ukuran, dan daftar yang gagal.

- Hasil "gagal" yang sebenarnya **`param-error`** hampir selalu bug harness, bukan bug aplikasi — cek dulu apakah parameternya bisa dibangun.
- Laporan yang selesai tapi **kecil** (< 20 KB) kemungkinan merender empty state. Itu belum tentu bug: periode bisa memang kosong. Buktikan dengan menjalankan periodenya lebih luas, atau cek apakah HTML-nya berisi `Tidak ada data`.
- Di PowerShell pakai **`curl.exe`**, bukan `curl` (itu alias `Invoke-WebRequest`).
- Ada **contract test yang memindai file**: `tests/empty-state-contract.test.ts` melarang file laporan memuat wording legacy (`Tidak ada data.`, `Data tidak tersedia`, `emptyMessage:`). Pakai `buildEmptyTableRow` / `buildEmptyTable` / `EMPTY_DATA_MESSAGE`.
- `tests/wps-report-headers.test.ts` mengunci judul + subtitle laporan terhadap blade. Kalau header memang harus berubah, ubah di kedua tempat.

---

## 5. Memverifikasi angka ke database (risiko tertinggi)

Kegagalan diam-dikan yang paling sering di repo ini: **kolom salah atau pembagi salah → laporan tetap tercetak, angkanya cuma salah.** Karena itu:

- Nama kolom diambil dari `sys.dm_exec_describe_first_result_set_for_object` (dapat hasilnya walau SP mengembalikan 0 baris); nama parameter dari `sys.parameters`; lalu dicek dengan eksekusi langsung.
- Faktor konversi **diwarisi dari blade apa adanya**, walau kelihatan salah. Contoh: quantity `Penerimaan ST Hasil Sawmill` dibagi 3 (`QUANTITY_DIVISOR`). Kalau ini "diperbaiki", totalnya jadi tiga kali lipat dan tetap terlihat masuk akal.
- Kalau benar-benar tidak bisa diverifikasi, **tulis eksplisit**: komentar di file laporan + tabel asumsi di README. Jangan menebak diam-diam.

---

## 6. Jebakan

| Jebakan | Yang benar |
| --- | --- |
| `z.coerce.boolean()` untuk env | String `"false"` jadi `true`. Pakai pola `boolFromString` di `config/env.ts` |
| `export default app` di Bun | WebSocket mati. Export `{ port, fetch, websocket }` |
| `bun run --hot` | Worker/QueueEvents lama tetap hidup, koneksi Redis menumpuk, job bisa dobel. Pakai `--watch` |
| `localhost` di dalam container | Menunjuk ke container itu sendiri. Pakai nama service (`redis`, `gotenberg`) atau `host.docker.internal` |
| Meneruskan instance IORedis ke BullMQ | Beri objek opsi koneksi, biarkan BullMQ yang mengelola |
| Hanya decode JWT | Tidak cek tanda tangan. Selalu `verify` |
| Set `Content-Type` manual pada FormData | Merusak boundary multipart. Biarkan `fetch` yang mengisi |
| File HTML untuk Gotenberg bernama lain | Harus `index.html` |
| `await` koneksi DB di top-level import | App gagal start kalau DB mati. Tetap lazy |
| Log URL lengkap route WebSocket | Token ada di query string. Log `c.req.path` saja |
| Menyambung string SQL dengan input user | Selalu `.input('nama', sql.Tipe, nilai)` |
| ID job auto-increment | Mudah ditebak. Pakai `crypto.randomUUID()` + cek kepemilikan (user lain dapat **404**, bukan 403) |
| Pakai `any` di file lain | Satu-satunya pengecualian adalah `registry.ts` (`ReportDefinition<any, any>`), dan wajib ada komentar alasannya |
| Bind mount `storage` di Docker | Masalah izin tulis. Pakai named volume |
| Menambah `dotenv` | Tidak perlu, Bun membaca `.env` sendiri |

---

## 7. Docker & environment

- Dockerfile dipin ke `oven/bun:1.3.14`; lockfile berupa teks `bun.lock`. Kalau mengubah image, salin keduanya.
- **SQL Server tidak ada di compose.** Dari dalam container `DB_SERVER=localhost` pasti gagal — pakai `host.docker.internal`, dan pastikan SQL Server mengaktifkan TCP/IP dan port `1433` terbuka.
- `api` dan `worker` **wajib** berbagi named volume `report-storage` (worker menulis PDF, API menyajikannya). Bind mount bermasalah izin tulis.
- Matikan dengan `docker compose down` — **tanpa `-v`**.
- Di disk, file PDF selalu `storage/report-<jobId>.pdf` (nama generik, anti path-traversal). Nama unduhan di `Content-Disposition` boleh `<type>-<jobId>.pdf`. **Ini bukan bug** — jangan disamakan.
- `GET /health/ready` hanya melaporkan boolean per komponen (DB, Redis, Gotenberg) tanpa detail error. DB `false` karena kredensial contoh itu wajar, jangan dianggap gagal.

---

## 8. Di luar lingkup (jangan dikerjakan kecuali diminta)

Export Excel, rate limiting, S3/MinIO, multi-tenant, streaming query untuk laporan >50.000 baris, Dockerizing SQL Server, mengganti queue atau storage. Laporan yang tidak ada di `open-api-report` juga perlu diminta dulu — jangan menebak kolom SP-nya.

---

## 9. Yang masih terbuka (jangan dianggap final)

- `JWT_USERNAME_CLAIM` dan `JWT_ALG` masih nilai default (`username` / `HS256`), **belum dikonfirmasi** ke token WPS asli.
- Batas lebar `qc-sawmill-summary` untuk periode panjang (satu kolom per tanggal QC) belum diputuskan.
- Sebagian besar laporan **belum punya regression test**; yang ada hanya beberapa `tests/wps-*.test.ts`. Laporan yang sudah dipakai tanpa test = bug senyap belum tertutup.

---

## 10. Definition of Done

- [ ] `bun run typecheck` dan `bun test` lulus.
- [ ] Laporan baru: terdaftar di `registry.ts`, punya unit test, CSS di `styles.ts`/reference sheet (bukan di file laporan), empty state lewat template.
- [ ] Tidak ada nama kolom/pembagi yang ditebak; asumsi yang belum terverifikasi tertulis di file + README.
- [ ] Laporkan ke user: ringkasan, hasil verifikasi, sisa item terbuka.