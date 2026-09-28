import { describe, expect, test } from "bun:test";
import { buildKoordinatTanahData } from "../src/reports/wps/koordinat-tanah";
import { buildPenjualanBarangJadiData } from "../src/reports/wps/penjualan-barang-jadi-m3";
import { buildSuratJalanData } from "../src/reports/wps/surat-jalan";

/**
 * The three document-keyed reports (by No SPK or No Jual). Two behaviours are
 * easy to get wrong and are invisible in a screenshot:
 *
 * - The Koordinat Tanah SP cross-joins products against lands, so it repeats
 *   both on every row; the de-duplication has to drop a row whose columns are
 *   ALL blank rather than just trimming it.
 * - Surat Jalan prints the date once per run of the same date, and the first row
 *   is the one that has to show it.
 */

describe("Koordinat Tanah", () => {
  const base = {
    Buyer: "DHB",
    Tujuan: "ANTWERP, BELGIUM",
    NamaPemilik: "MAZLAN",
    DesaKelurahan: "TELUK BANO I",
    KabupatenKota: "ROKAN HILIR",
    Provinsi: "RIAU",
    NoSuratTanah: "05.10.10.04.1.00019",
    Luas: 1792,
    Koordinat: "1.816928, 100.805020",
    Periode: "2023-02-01",
  };

  test("drops a row whose product columns are all blank", () => {
    // The 2023 export SPKs have no product lines: every product column is NULL,
    // which must read as an empty table, not as one row of zeros.
    const data = buildKoordinatTanahData(
      [
        {
          ...base,
          NoSPK: "06-DDW LOT 2",
          Jenis: null,
          NamaBarangJadi: null,
          Tebal: null,
        },
      ],
      [],
      "06-DDW LOT 2",
    );
    expect(data.products).toEqual([]);
  });

  test("keeps a product row with only one populated column", () => {
    const data = buildKoordinatTanahData(
      [
        {
          ...base,
          Jenis: "RAMBUNG",
          NamaBarangJadi: "FJLB A/B",
          Tebal: 10,
          Lebar: 1220,
          Panjang: 2440,
          Bundle: null,
          PcsPerBundle: null,
          Keterangan: "",
        },
      ],
      [],
      "X",
    );
    expect(data.products).toHaveLength(1);
    expect(data.products[0]!.jenis).toBe("RAMBUNG");
  });

  test("de-duplicates the cross join and counts distinct source periods", () => {
    const rows = [
      { ...base, NamaTanah: "MAZLAN-1", Periode: "2023-02-01" },
      { ...base, NamaTanah: "MAZLAN-1", Periode: "2023-02-01" },
      { ...base, NamaTanah: "ARMAN-1", Periode: "2023-03-01" },
    ];
    const data = buildKoordinatTanahData(rows, [], "X");
    expect(data.lands).toHaveLength(2);
    // Sorted by period first, so March comes second despite MAZLAN sorting first.
    expect(data.lands.map((l) => l.namaTanah)).toEqual(["MAZLAN-1", "ARMAN-1"]);
    expect(data.periodCount).toBe(2);
  });

  test("falls back to the requested No SPK when the SP returns none", () => {
    const data = buildKoordinatTanahData([], [], "06-DDW LOT 3");
    expect(data.header.noSpk).toBe("06-DDW LOT 3");
    expect(data.products).toEqual([]);
    expect(data.lands).toEqual([]);
    expect(data.gpsTotal).toBe(0);
  });

  test("rounds the GPS totals to the precision the legacy service used", () => {
    const data = buildKoordinatTanahData(
      [],
      [
        {
          Jenis: "A",
          Total: 1.234567,
          Persen: 33.3333,
          Koordinat: "x",
          NamaPemilik: "P",
          Tahun: 2023,
        },
        {
          Jenis: "B",
          Total: 2.000012,
          Persen: 66.6666,
          Koordinat: "y",
          NamaPemilik: "P",
          Tahun: 2023,
        },
      ],
      "X",
    );
    expect(data.gpsPercentages[0]!.total).toBe(1.2346);
    expect(data.gpsPercentages[0]!.persen).toBe(33.33);
    expect(data.gpsTotal).toBeCloseTo(3.2346, 4);
  });
});

describe("Penjualan Barang Jadi (m3)", () => {
  const row = (namaBarangJadi: string, m3: number, jenis = "RAMBUNG") => ({
    NamaBarangJadi: namaBarangJadi,
    M3: m3,
    Jenis: jenis,
    Tebal: 10,
    Lebar: 1220,
    Panjang: 2440,
    JmlhBatang: 10,
  });

  test("groups by Jenis Kayu and totals per product name", () => {
    const data = buildPenjualanBarangJadiData(
      [
        row("FJLB A/B", 1.5),
        row("FJLB C/C", 2.5),
        row("FJLB A/B", 0.5, "JABON"),
      ],
      "J.001260",
    );
    expect(data.groups.map((g) => g.jenis)).toEqual(["RAMBUNG", "JABON"]);
    expect(data.groups[0]!.productTotals).toEqual([
      { name: "FJLB A/B", total: 1.5 },
      { name: "FJLB C/C", total: 2.5 },
    ]);
    expect(data.groups[0]!.totalM3).toBeCloseTo(4, 4);
    expect(data.grandTotalM3).toBeCloseTo(4.5, 4);
  });

  test("blank Jenis and Nama Barang Jadi get readable placeholders", () => {
    const data = buildPenjualanBarangJadiData(
      [{ NamaBarangJadi: "", M3: 1, Jenis: "" }],
      "X",
    );
    expect(data.groups[0]!.jenis).toBe("Tanpa Jenis");
    expect(data.groups[0]!.rows[0]!.namaBarangJadi).toBe("Tanpa Nama");
  });

  test("no rows yields no groups, so the report can show the empty state", () => {
    const data = buildPenjualanBarangJadiData([], "J.999999");
    expect(data.groups).toEqual([]);
    expect(data.grandTotalM3).toBe(0);
    expect(data.header.noSpk).toBe("-");
  });
});

describe("Surat Jalan", () => {
  const log = (dateCreate: string, noSt: string, m3: number, ton: number) => ({
    DateCreate: dateCreate,
    NoST: noSt,
    Jenis: "RAMBUNG - MC 1",
    Tebal: 16,
    Lebar: 42,
    UOMTblLebar: "mm",
    Panjang: 3.5,
    UOMPanjang: "feet",
    JmlhBatang: 24,
    M3: m3,
    Ton: ton,
    TglJual: "2026-08-31",
    NoSJ: "INV.2608-058",
    NoPlat: "",
    Buyer: "RU",
    JenisKendaraan: "PICKUP - MITSUBISHI L300",
  });

  test("prints the date on the first row of each run of the same date", () => {
    const data = buildSuratJalanData(
      [
        log("2026-08-06", "E.1", 1, 0.5),
        log("2026-08-06", "E.1", 2, 1),
        log("2026-08-20", "E.2", 3, 2),
        log("2026-08-20", "E.2", 4, 3),
      ],
      "G.002597",
    );
    expect(data.rows.map((r) => r.displayTanggal)).toEqual([
      "06-Agt-2026",
      "",
      "20-Agt-2026",
      "",
    ]);
    // The rule above a row marks the same positions.
    expect(data.rows.map((r) => r.newDate)).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });

  test("the first row always shows its date, and a single-date run shows it once", () => {
    const data = buildSuratJalanData([log("2026-08-06", "E.1", 1, 1)], "X");
    expect(data.rows[0]!.displayTanggal).toBe("06-Agt-2026");
    expect(data.rows[0]!.newDate).toBe(false);
  });

  test("totals sum the volumes to four decimals", () => {
    const data = buildSuratJalanData(
      [
        log("2026-08-06", "E.1", 0.1685, 0.119),
        log("2026-08-06", "E.2", 0.2908, 0.2054),
      ],
      "X",
    );
    expect(data.totalM3).toBeCloseTo(0.4593, 4);
    expect(data.totalTon).toBeCloseTo(0.3244, 4);
    expect(data.totalPcs).toBe(48);
  });

  test("the header falls back to the requested No Jual and dashes for blanks", () => {
    const data = buildSuratJalanData([log("2026-08-06", "E.1", 1, 1)], "G.1");
    expect(data.header.noSuratJalan).toBe("INV.2608-058");
    expect(data.header.noPlat).toBe("-");

    const noSj = buildSuratJalanData(
      [{ ...log("2026-08-06", "E.1", 1, 1), NoSJ: "", TglJual: null as never }],
      "G.9",
    );
    expect(noSj.header.noSuratJalan).toBe("G.9");
    // Falls back to the log date when the sale date is missing.
    expect(noSj.header.tanggal).toBe("06-Agt-2026");
  });

  test("no rows yields an empty document rather than a failed job", () => {
    const data = buildSuratJalanData([], "G.999999");
    expect(data.rows).toEqual([]);
    expect(data.totalM3).toBe(0);
    expect(data.header.buyer).toBe("-");
  });
});
