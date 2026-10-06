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

## Menjalankan dengan Docker

Satu-satunya cara menjalankan. Prasyarat: [Bun](https://bun.sh) 1.2+, Docker.

```sh
bun install                        # install dependency
cp .env.example .env               # lalu isi kredensial DB
docker compose up -d
docker compose ps                  # api (healthy), worker, redis (healthy), gotenberg
curl.exe http://localhost:5006/health/ready
```

Token testing (JWT dari username, bukan token WPS asli):

```sh
bun run dev:token budi             # default user "tester", berlaku 1 jam
```

Untuk ngoding dengan hot reload, jalankan API dan worker di host — Redis dan Gotenberg tetap yang di container, karena port `6379` dan `3100` dipublish ke `127.0.0.1`:

```sh
bun run dev          # API di :5006
bun run dev:worker   # worker, proses terpisah
```

Jangan menjalankan Redis atau Gotenberg sendiri di luar Docker: nanti ada dua antrean terpisah, job tidak saling lihat, dan download membalas `409 REPORT_NOT_READY`.

Dokumentasi interaktif API: buka `http://localhost:5006/docs` (spec mentah di `/docs/openapi.json`).

Catatan penting:

- Di dalam container, `localhost` berarti container itu sendiri. Redis dan Gotenberg sudah di-override ke nama service-nya. **SQL Server** diambil dari `.env` — kalau DB ada di mesin host (Docker Desktop Windows), set `DB_SERVER=host.docker.internal`.
- `api` dan `worker` berbagi named volume `report-storage` (worker menulis PDF, API menyajikannya).
- Matikan stack dengan `docker compose down` — **jangan** pakai `-v` kecuali sengaja menghapus data (volume itu menyimpan antrean dan PDF yang belum diunduh).

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

### Laporan Sawn Timber (batch kedua: KD, kitten, dan Sawmill)

Sembilan lagi dari keluarga ST, semuanya **diport dari `open-api-report`** lalu diverifikasi ke database. Nama kolom diambil dari `sys.dm_exec_describe_first_result_set_for_object` (bukan eksekusi), jadi tetap dapat untuk SP yang mengembalikan 0 baris.

| type | Params body | Stored procedure |
|---|---|---|
| `kd-keluar-masuk` | periode + `{ noRuangKd? }` | `SP_LapKDKeluarMasuk` |
| `kd-upah-per-customer` | tanpa params | `SP_LapKDUpahPerCutomer` |
| `kd-upah-per-no-proc-kd-detail` | `{ noProcKd }` | `SP_LapKDUpahPerNoProcKDPerCustomerDetail` |
| `ketahanan-barang-st` | periode | `SP_LapKetahananBarangST` |
| `label-st-hidup-detail` | tanpa params | `SP_LapLabelSTHidupDetail` |
| `lembar-perhitungan-upah-borongan-sawmill` | `{ noProduksi }` | `SPWps_LapUpahSawmill` |
| `pemakaian-obat-vacuum` | periode | `SP_LapPemakaianObatVacuum` |
| `pembelian-st-per-supplier-ton` | periode | `SP_LapPembelianSTPerSupplier` |
| `pembelian-st-timeline-ton` | periode | `SP_LapPembelianSTTimeline` |
| `penerimaan-st-sawmill-kg` | periode | `SPWps_LapRekapPenerimaanSawmilRp` |

Yang tidak kelihatan dari nama kolom atau dari nama parameternya:

- **Nama parameter SP tidak seragam.** `SP_LapKDKeluarMasuk`, `SP_LapKetahananBarangST`, `SP_LapPembelianSTPerSupplier`, dan `SP_LapPembelianSTTimeline` memakai `@StartDate`/`@EndDate`, bukan `@TglAwal`/`@TglAkhir`. Yang lain pakai `@TglAwal`/`@TglAkhir`. Salah nama parameter → error "expects parameter '@StartDate'".
- **`Avg Penjualan` bukan penjualan dibagi hari.** `SP_LapKetahananBarangST` tidak punya kolom rata-rata, jadi reference memakai nilai `Penjualan` itu sendiri (ada komentar eksplisit di sana). Membagi dengan jumlah hari akan membaca nama kolom dengan benar dan menghasilkan angka yang salah.
- **`KD (Keluar - Masuk)` membuang Group di luar daftar enam kolom.** Tonnage-nya tidak masuk kolom manapun **dan tidak masuk Total baris**. Effectif, Total baris bisa lebih kecil dari `Ton` milik SP. Group juga dinormalisasi dulu: `JABON TGI`/`JABON TANGGUNG` → `JABON TG`, `RAMBUNG MC 1` → `RAMBUNG MC1`.
- **Baris "masih" (belum keluar) selalu diurutkan terakhir**, apa pun tanggalnya, lalu diurutkan `TglKeluar`/`TglMasuk`. Mengurutkan murni tanggal akan mencampur dua seksi dan totalnya tidak akan cocok.
- **`Pemakaian Obat Vacuum` footer bukan penjumlahan kolom.** Tiap rasio dihitung ulang dari angka yang sudah dijumlahkan (`sumBorax / sumSTTon`), satu-satunya cara benar menjumlahkan rasio. Menjumlahkan persentase harian menghasilkan angka yang tidak bermakna.
- **`Upah Sawmill` mengulang hitungan berat, dan itu menentukan.** `Berat` dari SP bernilai **0** untuk baris yang dimensi penuhnya ada - barcode `D.040749` contohnya. Yang dicetak adalah berat hasil hitung ulang dari `Tebal x Lebar x Panjang x JmlhBatang`, dengan pembagi yang ditentukan `IdUOMTblLebar`/`IdUOMPanjang`; cabang inch/ft membagi 1.416 (faktor m3 ke ton). Pakai `Berat` apa adanya = lembar upah semua nol.
- **`Penerimaan ST` harus mengisi ulang nama supplier.** Baris `InOut=0` (OUTPUT) tidak punya `NmSupplier` — namanya ada di `NmSupplier3`. Jadi baris `InOut=1` jadi sumber supplier kanonik untuk satu nomor penerimaan. Tanpa itu semua baris OUTPUT akan tercatat "Tanpa Supplier".
- **Grade input dan output tidak bisa dipasangkan baris per baris.** `RAMBUNG - AFKIR-100` masuk, `AFKIR` keluar. Jadi masing-masing sisi dijumlahkan sendiri dan dibandingkan lewat `RENDEMEN` = ST total / KB total.

### ⚠️ Dua hal yang perlu kamu tahu

**1. PDF reference untuk `Penerimaan ST Dari Sawmill` itu rusak.** Blade-nya membaca `$inputRows`, `$outputRows`, `$totalInputKb`, `$totalOutputSt`, dan `$rendemen`, tapi `PenerimaanStSawmillKgController` cuma mengirim `rows`, `groupedRows`, `summary`, dan dua nama kolom. Kelima variabel itu tidak pernah dikirim, jadi blade selalu masuk cabang "tidak ada data" dan PDF reference **cuma berisi "Tidak ada data."** apa pun isi prosedurnya. Tidak ada output reference yang functioning untuk dicocokkan, jadi tabel di laporan ini mengikuti kemauan blade-nya (blok INPUT/OUTPUT, KB vs ST, persentase, RENDEMEN) dengan semua angka dari kolom yang sudah diverifikasi. Kalau ada versi reference yang sudah jalan, kirimkan — bandingkan.

**2. `@Supplier` di `SPWps_LapRekapPenerimaanSawmilRp` tidak di-expose.** Reference tidak pernah mengirimnya (`parameter_count` = 2, cuma dua tanggal yang lewat) dan default prosedurenya mengembalikan semua supplier. Dicoba mengikat nama — `ABI`, `AHONG`, wildcard `%` — semuanya **0 baris**, sementara default tanpa ikatan mengembalikan **23.857 baris**. Jadi parameter itu sengaja tidak dipakai.

### ⚠️ Tiga asumsi yang belum diverifikasi

| Yang | Status |
|---|---|
| Pemboran pembagi `7200.8` di `Upah Sawmill` (pasangan cm/ft) | Angka reference. **Bukan** tonase yang masuk akal secara fisik, dan pasangan itu tidak pernah muncul di data — satu-satunya pasangan yang terjadi adalah `1/4` (inch/ft), yang hasilnya 0.0097 t dan masuk akal. Dibawa apa adanya, tidak "diperbaiki". |
| `PREFERRED_JENIS` di `pembelian-st-per-supplier-ton` | Reference menulis `RAMBUNG STD` (tanpa strip), SP mengembalikan `RAMBUNG - STD` (dengan strip). Jadi kolom itu tidak pernah kena slot preferensi dan jatuh di ekor alfabetis. Dibawa apa adanya; ubah satu baris di `pembelian-st-per-supplier.ts` kalau urutan yang dimaksud memang punya Rambung STD di depan. |
| Lebar kolom razor di dua cross-tab Pembelian ST | Reference pad ke 16 karakter monospace, yang assumes kolom cukup lebar. Di setting 9px project ini angkanya meluber ke sel sebelah dan saling tabrakan, jadi penyelarasan persen pakai flexbox. Tampilan sama, tidak bergantung lebar. |

### Laporan Sawmill (QC, per-meja, dan penerimaan)

Sepuluh laporan Sawmill lagi. Semuanya diport dari `open-api-report`, kolom diverifikasi ke DB.

| type | Params body | Stored procedure |
|---|---|---|
| `penerimaan-st-hasil-sawmill` | `{ noPenST }` | `SP_LapPenerimaanSTSawmill` + `_Sub` |
| `qc-sawmill` | periode | `SP_LapQCSawmill` |
| `qc-sawmill-discrepancy` | periode | `SP_LapQCSawmillDescr` |
| `qc-sawmill-summary` | periode | `SP_LapQCSawmillSummary` |
| `rekap-hasil-sawmill-per-meja` | periode | `SPWps_LapRekapHasilSawmillPerMeja` |
| `rekap-hasil-sawmill-per-meja-semua-meja` | periode | `SPWps_LapRekapHasilSawmillPerMejaUpahBoronganV2` + `_Sub` |
| `rekap-hasil-sawmill-per-meja-upah-borongan` | periode | `SPWps_LapRekapHasilSawmillPerMejaUpahBorongan` + `_Sub` |
| `rekap-kamar-kd` | periode | `SP_LapRekapKamarKD` + `_Sub1` + `_Sub2` |
| `rekap-penerimaan-st-non-rambung` | periode | `SPWps_LapRekapPenSTDariSawmill` |
| `rekap-produktivitas-sawmill` | periode | `SPWps_LapRekapProduktivitasSawmill` |

Yang tidak kelihatan dari nama kolom atau parameternya:

- **`Penerimaan ST Hasil Sawmill` membagi quantity dengan 3.** `JmlhBatang` dan `Hasil` dari SP dihitung dalam satuan tiga kali yang dicetak, jadi piece count = `round(JmlhBatang / 3)` dan tonase = `Hasil / 3`. Tanpa pembagi ini laporan tetap *terlihat benar* — hanya angkanya tiga kali lipat. Ini `QUANTITY_DIVISOR` di file laporan.
- **`QC Sawmill` dan `QC Sawmill - Discrepancy` kolomnya IDENTIK** (8 kolom, parameter sama). Bedanya cuma baris mana yang dicetak: Discrepancy hanya baris yang **gagal**, tapi ringkasannya tetap menghitung **semua** baris. Itu yang bikin "3 dari 40 papan gagal" terbaca di tabel yang hanya berisi 3 baris.
- **Toleransi QC:** tidak akurat kalau deviasi < −0,00001 **atau** ≥ 2. Masing-masing dimensi ditebak sendiri — tebal 3mm lebih tipis tetap gagal meski lebarnya sempurna.
- **`#6` dan `#7` datanya identik.** `...UpahBoronganV2` dan `...UpahBorongan` mengembalikan 12 kolom yang sama persis, begitu juga `_Sub`-nya. Satu implementasi, dua nama SP. Output-nya 131.557 vs 131.658 byte — selisihnya cuma panjang judul.
- **`Rekap Kamar KD` punya DUA persentase kapasitas yang sengaja tidak sama.** `Jumlah (% Capacity)` = jumlah per-tipe **setelah** dibulatkan 2 desimal (meniru legacy printout, jadi itulah angka yang ada di lembar). `Ave Capacity KD` = total m3 ÷ 80 sekaligus. Volume tiap lot juga **estimasi**: m3 hanya ada per-tebal di `_Sub1`, jadi faktornya (m3/ton) diturunkan dan diterapkan ke tiap lot.
- **`Rekap Produktivitas Sawmill` punya lima kolom yang tidak ada di SP.** `GroupKayu` dilipat ke lima produk dengan `contains` berurutan (JABON dulu, baru varian Rambung) — urutan itu penting dan bukan alfabetik. Group yang tak dikenai **dibuang**, jadi Total harian = jumlah lima kolom, bukan jumlah prosedurnya.
- **`Rekap Penerimaan ST Non Rambung` menurunkan tiga kolom yang tidak ada di SP:** `Rend ST-KB` = STTon/KBTon, `Ave Dia` = √(Area / PcsKB), `Ave Tbl` = TotalTblST / PcsST.

### ⚠️ Batas lebar (sama seperti cross-tab)

`qc-sawmill-summary` punya satu kolom per tanggal QC. Periode ¼ tahun = **82 kolom**, dan angka-angkanya bertabrakan. Batasnya inherent, bukan salah implementasi — perlu keputusan: pecah per blok, atau batasi periode. Yang.statusnya masih terbuka.

### ⚠️ Yang sengaja tidak diport

- **Jalur `flat` di `Penerimaan ST Hasil Sawmill`.** Reference cuma memakainya kalau SP mengembalikan nol baris lalu jatuh ke query manual PHP. Jalur yang SP hasilkan selalu `grade` — itu yang diimplementasikan.
- **Bucket "RB STD (Tbl 14/16/18/23)"** di blade reference. Itu daftar angka ajaib di blade, bukan kolom SP. Menghilang kalau daftarnya berubah, jadi tidak dikembangbiakkan.
- **`No. Plat` di `Penerimaan ST Hasil Sawmill`** dicetak `-`. Reference mengambilnya dari tabel header kayu bulat; `SP_LapPenerimaanSTSawmill` tidak punya kolom itu.

### ⚠️ Yang belum ditutup test

Hanya `qc-sawmill*` punya regression test (`tests/wps-qc-sawmill.test.ts`). Sembilan laporan lain diverifikasi manual — dirender ke Gotenberg, PDF-nya dibaca, dan angkanya dicek satu per satu (mis. `1,0583 / 1,1841 = 89,38%`, deviasi `2,00` → `No`). Tapi tidak ada test yang menjaganya kalau nanti ada perubahan.

Contoh:

```sh
curl.exe -X POST http://localhost:5006/reports -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d "{\"type\":\"mutasi-kayu-bulat\",\"params\":{\"tglAwal\":\"2025-01-01\",\"tglAkhir\":\"2025-01-31\"}}"
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

**Kasus khusus** (2 SP / tabel ganda / header bergrup seperti `mutasi-barang-jadi`, atau parameter non-periode): tulis `fetchData` + `render` sendiri di file laporan — pakai blok bangunan template (`renderWpsReportPage`, `buildReportTable`, `formatNumber4`, `formatTanggalId`) supaya tampilan tetap konsisten, jangan menulis CSS sendiri. Tanpa DB, tiru `src/reports/example.ts`.

`fetchData` menerima `ctx.pool` berupa **promise lazy** — koneksi SQL Server baru dibuka saat promise itu di-await, jadi laporan yang tidak butuh DB tidak pernah membuka koneksi.

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

### Stylesheet blade legacy (20 laporan)

Dua puluh laporan memakai stylesheet blade-nya sendiri, bukan layout bersama, supaya tampilannya sama dengan cetakan legacy. File itu **generated**:

```sh
bun run generate:css              # tulis ulang src/reports/wps/reference-css.ts
bun run generate:css -- --check   # gagal kalau file hasil generate sudah basi
```

- Sumbernya `open-api-report`'s `resources/views/**-pdf.blade.php` (bisa diubah lewat `OPEN_API_REPORT_VIEWS`).
- **Jangan edit `reference-css.ts` manual** — jalan berikutnya menimpanya. Ubah blade-nya, lalu jalankan ulang.
- Koreksi per-laporan tidak ada di generator (itu keputusan, bukan turunan): ada di `src/reports/wps/reference-css-fixups.ts`.
- Generator gagal dengan pesan jelas kalau nama variabel Blade tidak punya nilai - ini bug "nilai fontsize hilang" yang pernah membuat dua sheet tampil dengan ukuran font bawaan Chromium.
- Peta `type` → blade ada eksplisit di `scripts/generate-reference-css.ts` dan **namanya saling tertukar**: `st-masuk-per-group` memakai blade `st-sawmill-masuk-per-group`, dan sebaliknya memakai yang `-meja`.

## Testing

```sh
bun run typecheck   # tsc --noEmit
bun test            # unit test (env, html, registry, + regression per kelompok laporan)
bun run scripts/ws-test.ts <jobId> <token>   # klien WebSocket manual
```

### Menjalankan seluruh laporan end-to-end

Butuh infra + API + worker hidup, lalu:

```sh
bun run e2e -- --from=2026-09-01 --to=2026-09-30
```

Script ini menjalankan **seluruh** jenis laporan: `POST /reports` → tunggu job → unduh PDF → cek magic `%PDF` → simpan ke `storage/e2e/`, plus `e2e-report.json` berisi ringkasan per tipe.

- Parameter setiap laporan **dibangun dari skema Zod laporan itu sendiri**, jadi laporan baru otomatis ikut diuji.
- Laporan berparam lookup (nomor produksi, SPK, kayu bulat, no. jual, no. proses KD, no. penerimaan ST) memakai **nilai nyata yang diambil dari tabel yang dibaca stored procedure-nya** — kunci tebakan hanya menghasilkan lembar kosong.
- Opsi: `--concurrency=`, `--only=type1,type2`, `--skip=`, `--out=`, `--small-pdf=`, `--timeout=`.
- Laporan yang selesai tapi kecil (< 20 KB) dicatat terpisah: itu suspiciously mungkin "Tidak ada data". Periksa dengan periode yang lebih luas sebelum menganggapnya bug.

## Troubleshooting

- **`/health/ready`: DB `false`** — SQL Server tidak terjangkau atau kredensial salah. Dari Docker, `DB_SERVER=localhost` pasti gagal; pakai `host.docker.internal`. Pastikan TCP/IP aktif dan port `1433` terbuka.
- **`/health/ready`: Redis `false`** — stack belum jalan: `docker compose up -d`.
- **Gotenberg gagal start** — cek `docker compose logs gotenberg` (biasanya flag tidak dikenali oleh versi image).
- **WebSocket ditolak (`Expected 101`)** — token salah/kedaluwarsa, atau job bukan milik Anda. Token dari `bun run dev:token <username>`.
- **`409 REPORT_NOT_READY` saat download** — job belum `completed`; pantau lewat `GET /reports/:id` atau WebSocket.
- **`410 FILE_EXPIRED`** — file sudah dihapus retensi (`FILE_RETENTION_DAYS`, default 7 hari).
- **Worker tidak memproses job** — pastikan `bun run dev:worker` (atau container `worker`) hidup dan Redis terjangkau.
- **`bun run typecheck` gagal soal import `hono/jwt`** — pastikan `tsconfig.json` memakai `moduleResolution: "bundler"`.

## Lingkup & batas saat ini

Bentuk `params` pada `POST /reports` dipetakan otomatis dari registry, jadi spesifikasinya tidak mungkin melenceng dari kode. Satu request body dipetakan lewat `anyOf` per **bentuk** parameter, bukan per laporan: 181 laporan hanya jadi 26 cabang, dan tiap cabang mencantumkan laporan mana yang memakainya. Bentuk `params` yang ada:

| Bentuk | Jumlah laporan | Isi `params` |
|---|---|---|
| `PeriodParams` | 108 | `tglAwal` + `tglAkhir` (wajib) |
| `NoParams` | 19 | kosong / `{}` |
| `AsOfDateParams` | 8 | `tglAkhir` saja |
| `ParamsUmurLaminatingDetail` | 8 | `umur1`..`umur4` (ada default) |
| `ParamsProduksiFjPerNomorProduksi` | 7 | `noProduksi` |
| sisanya | 1–4 per bentuk | khusus — lihat komponen di `/docs/openapi.json` |

- Nama kolom `NoS4S`/`Kubik` pada laporan hidup S4S & Sanding, urutan kolom `dashboard-sanding`, dan kolom `Period1-5` pada laporan umur masih **asumsi** — belum diverifikasi terhadap SP asli di SQL Server. (Column mapping 4 SP consolidated/per-jenis sudah diverifikasi dan dikoreksi; `mutasi-sanding` juga sudah, lewat `rekap-mutasi.ts`.)
- Kapasitas Racip memakai konstanta kapasitas sawmill `323.7837` ton/hari dan rendemen 85% / 20% yang diambil dari `open-api-report`, bukan dari SP. Kalau angka plants berubah, kedua konstanta itu perlu ditinjau.
- Nama field username di payload JWT WPS adalah `username` (`JWT_USERNAME_CLAIM`) dan algoritmanya `HS256` (`JWT_ALG`) — **sudah dicek langsung ke token WPS asli**, jadi nilai default di `config/env.ts` bukan lagi asumsi.
