# AGENTS.md — report-service

Microservice pembuat laporan **PDF asynchronous** untuk WPS (Bun + Hono + BullMQ/Redis + Gotenberg).
`README.md` adalah dokumen layanan (daftar endpoint + katalog per-laporan); **file ini hanya soal cara bekerja di repo ini.**

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
- `/docs` = situs Mintlify hasil `mint export`, dibangun ke dalam image oleh tahap `docs` di Dockerfile. `/swagger` = Swagger UI dari CDN lewat HTML statis di `app.ts` (tanpa dependency npm). Kalau `docs-site/` tidak ada (checkout biasa tanpa `docker compose build`), `/docs` **jatuh ke Swagger UI** — itu disengaja, bukan bug.

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

`typecheck` + `bun test` sudah cukup untuk perubahan logika/styling. Redis dan Gotenberg hanya perlu untuk alur end-to-end.

### Satu cara menjalankan saja

Hanya ada **satu** compose file: `docker-compose.yml`. Empat container — `report-api`, `report-worker`, `report-redis`, `report-gotenberg`. Tidak ada compose kedua yang harus dihentikan atau dicocokkan.

```sh
docker compose up -d
curl.exe http://localhost:5006/health/ready
```

`api` dan `worker` satu image, hanya `command` yang beda. Redis dan Gotenberg dipublish ke `127.0.0.1` saja (`6379` dan `3100`) supaya **`bun run dev` di host memakai Redis yang sama** dengan container — bukan antrean kedua yang terpisah. Kalau ada proses lokal yang memakai port itu, compose gagal start; itu memang penanda bentrok, bukan kegagalan acak.

```sh
bun run dev          # API di :5006
bun run dev:worker   # worker, proses terpisah
bun run dev:token budi [jam]     # token testing (default user "tester", 1 jam)
bun run scripts/ws-test.ts <jobId> <token>
```

**Menjalankan seluruh laporan sekaligus** (butuh API + worker + infra hidup):

```sh
bun run e2e -- --from=2026-09-01 --to=2026-09-30 --base=http://localhost:5006
```

Param setiap laporan **diturunkan dari skema Zod-nya sendiri**, bukan dari daftar nama tipe — jadi laporan baru ikut teruji tanpa didaftarkan di script. Laporan yang berparam lookup (nomor produksi/SPK/kayu bulat/dll) nilainya di-harvest dari tabel yang dibaca stored procedure-nya, karena kunci tebakan hanya menghasilkan PDF kosong. Keluarannya: jumlah PDF per tipe, ukuran, dan daftar yang gagal; PDF tersimpan di `storage/e2e/` (bisa diganti dengan `--out=`).

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

- **Cuma ada satu compose file**, `docker-compose.yml` - 4 container: `report-api`, `report-worker`, `report-redis`, `report-gotenberg`. File `docker-compose.dev.yml` sudah dihapus; kalau suatu saat muncul compose kedua, itu kembali ke dual-stack yang lama dan harus dimatikan.
- Redis (`6379`) dan Gotenberg (`3100`) dipublish ke `127.0.0.1`, bukan `0.0.0.0` — jadi `bun run dev` di host kena Redis yang sama dengan container. Kalau muncul 2 antrean atau job menggantung, periksa jangan sampai ada proses yang jalankan Redis sendiri di port itu.
- `docker compose up -d` gagal start dengan "port is already allocated" = ada proses lokal sudah memakai 6379/3100. Matikan proses itu, jangan ganti port diam-diam — `.env.example` sudah menunjuk 6379/3100.
- Dockerfile dipin ke `oven/bun:1.3.14`; lockfile berupa teks `bun.lock`. Kalau mengubah image, salin keduanya.
- **Ada tahap `docs` di Dockerfile** yang menjalankan `mint export` (butuh Node, image `oven/bun` tidak punya). Jadi `docker compose build` **butuh internet**. Hasilnya disajikan service di `/docs`; lihat §11.
- **Batas resource sudah ditetapkan** (`deploy.resources.limits`): gotenberg 2 CPU / 2 GB, worker 1.5 CPU / 1 GB, api dan redis 1 CPU / 512 MB. Acuan host 8 core / 7.7 GB, total terpakai ~5.5 core / 4 GB. Gotenberg dapat jatah terbesar karena Chromium. Kalau batasnya terlalu ketat, container dibunuh OOM di tengah render dan gejalanya muncul sebagai **job gagal tanpa pesan jelas**, bukan error yang mudah ditelusuri.
- **PDF kedaluwarsa disapu berkala oleh worker**, bukan hanya saat start. `FILE_RETENTION_DAYS` (default 7) adalah umur file, `FILE_CLEANUP_INTERVAL_HOURS` (default 24) adalah frekuensi sapuan. Intervalnya sengaja lebih pendek dari retensi: kalau sama, file bisa hidup hampir dua kali lipat dari yang dimaksud. Penjadwalnya ada di `src/lib/repeat.ts` supaya bisa diuji tanpa menunggu berjam-jam.
- **SQL Server tidak ada di compose.** Dari dalam container `DB_SERVER=localhost` pasti gagal — pakai `host.docker.internal`, dan pastikan SQL Server mengaktifkan TCP/IP dan port `1433` terbuka.
- `api` dan `worker` **wajib** berbagi named volume `report-storage` (worker menulis PDF, API menyajikannya). Bind mount bermasalah izin tulis.
- Matikan dengan `docker compose down` — **tanpa `-v`**. Volume `redis-data` dan `report-storage` menyimpan antrean dan PDF yang belum diunduh; `-v` menghapus keduanya.
- Di disk, file PDF selalu `storage/report-<jobId>.pdf` (nama generik, anti path-traversal). Nama unduhan di `Content-Disposition` boleh `<type>-<jobId>.pdf`. **Ini bukan bug** — jangan disamakan.
- `GET /health/ready` hanya melaporkan boolean per komponen (DB, Redis, Gotenberg) tanpa detail error. DB `false` karena kredensial contoh itu wajar, jangan dianggap gagal.

---

## 8. Di luar lingkup (jangan dikerjakan kecuali diminta)

Export Excel, rate limiting, S3/MinIO, multi-tenant, streaming query untuk laporan >50.000 baris, Dockerizing SQL Server, mengganti queue atau storage. Laporan yang tidak ada di `open-api-report` juga perlu diminta dulu — jangan menebak kolom SP-nya.

---

## 9. Yang sudah dipastikan, dan yang masih terbuka

**Sudah dipastikan** — jangan lagi dicantumkan sebagai asumsi:

- Nama field username di payload JWT WPS adalah `username`, algoritmanya `HS256`. Sudah dicek langsung ke token WPS asli, jadi nilai default di `config/env.ts` (`JWT_USERNAME_CLAIM`, `JWT_ALG`) sudah benar dan bukan lagi tebakan.

**Masih terbuka**:

- Batas lebar `qc-sawmill-summary` untuk periode panjang (satu kolom per tanggal QC) belum diputuskan.
- Sebagian besar laporan **belum punya regression test**; yang ada hanya beberapa `tests/wps-*.test.ts`. Laporan yang sudah dipakai tanpa test = bug senyap belum tertutup.

---

## 10. Definition of Done

- [ ] `bun run typecheck` dan `bun test` lulus.
- [ ] Laporan baru: terdaftar di `registry.ts`, punya unit test, CSS di `styles.ts`/reference sheet (bukan di file laporan), empty state lewat template.
- [ ] Tidak ada nama kolom/pembagi yang ditebak; asumsi yang belum terverifikasi tertulis di file + README.
- [ ] Laporkan ke user: ringkasan, hasil verifikasi, sisa item terbuka.

---

## 11. Branch `docs` — dokumentasi API (situs Mintlify)

### Apa yang sudah ada

`docs/` berisi situs dokumentasi Mintlify. **Semua isinya di-generate atau ditulis tangan; tidak ada file lain di repo yang ikut berubah.**

| Isi | File | Cara dibuat |
|---|---|---|
| Halaman API | `introduction`, `authentication`, `errors`, `endpoints/*` (6) | Tulis tangan |
| Katalog 180 laporan WPS | `reports/overview` + 16 halaman kategori | `bun run docs/scripts/generate-catalog.ts` |
| Navigasi | `docs/docs.json` | Generator yang sama |

Isi katalog: `type`, judul, bentuk `params`, nama stored procedure, nama parameter SP (kalau berbeda dari field `params`), orientasi, dan satu contoh Request Body per bentuk params.

### Aturan alur kerja

- **Semua perubahan dokumentasi masuk branch `docs`.** Jangan menyentuh `src/`, `tests/`, atau `package.json` dari branch itu. Kalau katalog perlu data baru dari kode (mis. laporan baru), buat commit di `development` lebih dulu, lalu merge ke `docs`.
- **`docs/reports/` dan `docs/docs.json` jangan diedit manual** — generator menimpanya. Yang boleh diedit manual hanya 9 halaman API dan `docs/scripts/`.
- `docs/AGENT-PROMPT.md` adalah catatan kerja agen yang **di-ignore Git** dan memuat path absolut mesin ini. Jangan diandalkan di checkout baru; aturan durable-nya ada di §11 ini.

### Siklus perubahan katalog (dua arah)

Katalog di `docs/` boleh berubah **hanya** lewat commit yang terlihat, tidak pernah diam-diam. Dua arah merge, keduanya wajib:

```
laporan baru ──▶ development (kode + registry + test)
                     │
                     ├─ merge development → docs
                     │
                     ▼
              docs: bun run docs/scripts/generate-catalog.ts
                     │  edit manual 9 halaman API bila perlu
                     ▼
              docs: commit EKSPLISIT  ── push docs
                     │
                     └─ merge docs → development   (biar development tidak tertinggal)
```

Aturan yang sering dilanggar:

- **Jalankan generator hanya di branch `docs`, setelah `development` sudah ter-merge ke dalamnya.** Generator membaca `src/` dari branch tempat ia dijalankan. Dijalankan di `docs` yang `src/`-nya belum ter-merge, katalognya justru tertinggal dari registry.
- **Hasil generator harus di-commit eksplisit** dengan pesan yang menyebut laporan apa yang masuk. Kalau `git status` bersih setelah generator dijalankan, itu artinya katalog memang sudah sinkron — bukan berarti melompati commit.
- **Merge balik `docs` → `development` setelah setiap siklus.** Tanpa itu, `development` menyimpan `docs/` versi lama dan `--check` di sana akan langsung bilang basi.
- `--check` wajib dijalankan sebelum push. Kalau gagal, jalankan generator **lalu commit**, jangan `--check` diabaikan dan jangan dipaksa.

### Perintah

```sh
cd docs && npx mint dev                            # pratinjau lokal
bun run docs/scripts/generate-catalog.ts           # regenerasi katalog
bun run docs/scripts/generate-catalog.ts --check   # gagal kalau katalog basi
cd docs && npx mint broken-links                   # validasi link
```

### Situsnya lokal saja, tidak ada publikasi

Dokumentasi ini **situs Mintlify asli**, bukan renderer buatan sendiri. **Tidak ada deployment.** Repo ini tidak punya folder `.github/` sama sekali, jadi tidak ada workflow yang menerbitkan apa pun saat push. Cara memastikan: `ls .github` tidak mengembalikan apa-apa.

Membacanya:

```sh
cd docs && npx mint dev
```

Atau lewat service, yang menyajikan file statis hasil `mint export`:

```sh
docker compose build     # menjalankan mint export di dalam build
docker compose up -d     # buka http://localhost:5006/docs
```

Swagger UI pindah ke `/swagger`; spec mentahnya tetap di `/docs/openapi.json`.

**Cara situs itu disiapkan ada di `docs/scripts/rewrite-static-paths.mjs`**, dan ada dua langkah yang keduanya wajib — kalau salah satu dilewat, gejalanya berbeda:

1. **Path di atribut HTML ditulis ulang** (`href`, `id`, `content`, `data-current-path`). Item sidebar menyimpan route sebagai `id`, jadi menulis ulang `href` saja tidak cukup.
2. **Skrip klik disuntikkan.** Router Mintlify menavigasi dari data internalnya sendiri, bukan dari `href`. Jadi klik pada `href="/docs/authentication"` yang sudah benar tetap mendarat di `/authentication` — prefix hilang dan user dapat 404. Skrip itu memaksa navigasi ke `href` milik link tersebut.

**Data JSON internal di payload sengaja TIDAK ditulis ulang.** Data itulah yang dipakai router untuk menentukan menu mana yang aktif; begitu di-prefix, perbandingannya gagal dan sidebar tampil kosong. Ini sudah pernah dicoba — jangan diulang.

Yang perlu diingat:

- **Tidak ada `bun test` atau `tsc` yang menyentuh `docs/`.** Verifikasi satu-satunya adalah `mint dev` / `mint broken-links` dan diff di `git status`.
- **`npx mint` butuh Node + jaringan.** Tidak ada di image `oven/bun`, dan memang tidak perlu ada. Karena itu `docker compose build` butuh internet.
- **Verifikasi navigasi harus dengan benar-benar mengklik**, bukan membaca markup. Masalah aslinya justru tidak terlihat di markup: `href`-nya sudah benar, yang salah perilaku router saat diklik.
- Kalau suatu saat publikasi diinginkan, itu keputusan terpisah: butuh file workflow, yang letaknya di luar `docs/`.

### Yang sudah diverifikasi

| Pemeriksaan | Hasil |
|---|---|
| Katalog vs registry | 180 laporan WPS = 180, cocok 1:1 |
| `example` | Tidak masuk katalog (bukan laporan WPS) |
| Navigasi `docs.json` | 26 halaman = 26 file |
| Spot-check tipe params | 5 tipe cocok dengan skema Zod |
| Istilah yang tidak ada di kode | Nol (tidak ada Rate Limiting / Pagination / Versioning / Webhook) |
| `mint dev` / `mint broken-links` | Boot / sukses |

### Fakta sumber categorize yang tidak obvious

- **Kategori proses diambil dari menu WPS `open-api-report`**, dibaca dari `resources/views/welcome.blade.php` — **bukan** dari struktur folder `resources/views/reports/`. Folder itu tidak mencerminkan proses dan sudah tidak relevan. Route di menu itu 1:1 dengan tipe registry, jadi bisa dipetakan.
- Konsekuensinya: **tidak ada kategori "Mutasi" atau "Dashboard"**. Laporan `mutasi-s4s` dan `dashboard-sanding` masuk kategori produknya, mengikuti menu.
- `Kayu Bulat` dan `Kayu Bulat (Rambung)` proses terpisah; yang Rambung berisi laporan KG.
- **Kartu SPK di menu itu di-comment-out**, jadi bukan kategori aktif: `spk-sawmill` ada di Sawn Timber.
- Nama route di menu tidak selalu sama dengan `type` registry. Peta rename-nya ada di `OVERRIDES` pada generator, **dikunci per route penuh** (bukan per segment terakhir) karena `reports.mutasi.sanding` dan `dashboard.sanding` sama-sama berakhiran `sanding` padahal berbeda laporan.

### Jebakan di area dokumentasi

- **`mint broken-links` bisa lulus sementara `mint dev` gagal.** `docs.json` pernah salah bentuk (`tabs` di level atas, bukan di dalam `navigation.tabs`) dan lolos link check, tapi prebuild menolaknya. Selalu coba `mint dev` kalau suspect ada perubahan struktural di `docs.json`.
- **Generator gagal dengan sengaja kalau ada ketidakcocokan** (kategori tak terdaftar di `CATEGORY_ORDER`, atau tipe WPS tanpa kategori). Itu bukan bug — itu cara mencegah laporan baru lolos tanpa kategori. Jangan bypass.
- Empat laporan tidak punya nama stored procedure di kode (`penjualan-lokal`, `total-bagus-kulit-rambung`, `penerimaan-kayu-bulat-per-supplier`, dan `rekap-mutasi` yang memang docblock-nya menyatakan sengaja tidak memanggil SP). Halamannya menulis "Belum terdokumentasi di kode" — itu memang belum dikerjakan, di `development`.
- Nama kategori `Kayu Bulat (Rambung)` mudah salah ketik. Kalau order navigasi terasa acak, cek dulu ejaan kategori di `CATEGORY_ORDER`.
- **`--check` pernah bohong di Windows.** Karena `core.autocrlf=true`, `docs/` ter-checkout dengan CRLF sementara generator selalu menulis LF, jadi semua 18 file generated dilaporkan basi padahal isinya identik (`git diff --numstat` kosong). Sudah diperbaiki `.gitattributes` (`docs/** text eol=lf`) — kalau `--check` tiba-tiba gagal lagi, cek EOL dulu sebelum mengira katalognya benar-benar basi.
- **`npx mint` tidak bisa jalan di dalam container.** CLI Mintlify butuh Node dan jaringan, sedangkan image `oven/bun` tidak punya Node. Jalankan di komputer, bukan lewat `docker exec`.
