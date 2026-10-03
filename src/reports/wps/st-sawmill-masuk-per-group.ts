import sql from "mssql";
import { periodParamsSchema, type PeriodParams } from "../period-params";
import {
  escapeHtml,
  formatNumber,
  formatPrintedAt,
  formatTanggalId,
} from "../../templates/html";
import { EMPTY_DATA_MESSAGE, renderWpsReportPage } from "./template";
import type { ReportDefinition } from "../types";
import { WPS_REFERENCE_CSS } from "./reference-css";

/**
 * SP_LapSTSawmillMasukPerGroup — "Laporan ST (Sawmill) Masuk Per-Group".
 * Ported from open-api-report's StSawmillMasukPerGroupMejaReportService +
 * st-sawmill-masuk-per-group-meja-pdf.blade.php.
 *
 * One row per Group/Jenis/Tebal/NoMeja. The sheet is a cross-tab: columns are
 * Group Jenis, Jenis Kayu, Tebal, then one column per meja number, with a
 * Totals row that sums every meja. Period params bind to the SP's own
 * @StartDate/@EndDate.
 */

const toFloat = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const natural = (left: string, right: string): number =>
  left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });

export const stSawmillMasukPerGroupReport: ReportDefinition<
  PeriodParams,
  Array<Record<string, unknown>>
> = {
  type: "st-sawmill-masuk-per-group",
  title: "Laporan ST (Sawmill) Masuk Per-Group",
  paramsSchema: periodParamsSchema,

  async fetchData(params, { pool }) {
    const conn = await pool;
    const request = conn.request();
    request.input("StartDate", sql.Date, params.tglAwal);
    request.input("EndDate", sql.Date, params.tglAkhir);
    const result = await request.execute("SP_LapSTSawmillMasukPerGroup");
    return (result.recordset ?? []) as Array<Record<string, unknown>>;
  },

  render(rows, meta) {
    // Structure: Group -> Jenis -> Tebal -> { meja -> ton }
    type TebalMap = Map<number, Map<number, number>>;
    const byGroup = new Map<string, Map<string, TebalMap>>();
    const mejaSet = new Set<number>();

    for (const row of rows) {
      const group = String(row.Group ?? "").trim() || "Tanpa Group";
      const jenis = String(row.Jenis ?? "").trim() || "Tanpa Jenis";
      const tebal = toFloat(row.Tebal);
      const meja = Math.round(toFloat(row.NoMeja));
      const ton = toFloat(row.MasukTon);
      if (meja > 0) mejaSet.add(meja);

      let jenisMap = byGroup.get(group);
      if (!jenisMap) {
        jenisMap = new Map();
        byGroup.set(group, jenisMap);
      }
      let tebalMap = jenisMap.get(jenis);
      if (!tebalMap) {
        tebalMap = new Map();
        jenisMap.set(jenis, tebalMap);
      }
      let byMeja = tebalMap.get(tebal);
      if (!byMeja) {
        byMeja = new Map();
        tebalMap.set(tebal, byMeja);
      }
      byMeja.set(meja, (byMeja.get(meja) ?? 0) + ton);
    }

    const mejaList = [...mejaSet].sort((a, b) => a - b);
    const grandByMeja = new Map<number, number>();
    for (const m of mejaList) grandByMeja.set(m, 0);

    const groups = [...byGroup.entries()].sort(([a], [b]) => natural(a, b));

    type JenisEntry = {
      name: string;
      tebalList: Array<{ tebal: number; values: Map<number, number> }>;
      byMeja: Map<number, number>;
    };
    const structured: Array<{
      name: string;
      jenisList: JenisEntry[];
      byMeja: Map<number, number>;
    }> = [];

    for (const [groupName, jenisMap] of groups) {
      const jenisList: JenisEntry[] = [];
      const groupByMeja = new Map<number, number>();
      for (const m of mejaList) groupByMeja.set(m, 0);

      for (const [jenisName, tebalMap] of [...jenisMap.entries()].sort(
        ([a], [b]) => natural(a, b),
      )) {
        const byMejaJ = new Map<number, number>();
        for (const m of mejaList) byMejaJ.set(m, 0);
        const tebalList = [...tebalMap.entries()]
          .sort(([a], [b]) => a - b)
          .map(([tebal, values]) => {
            for (const m of mejaList)
              byMejaJ.set(m, (byMejaJ.get(m) ?? 0) + (values.get(m) ?? 0));
            return { tebal, values };
          });
        for (const m of mejaList)
          groupByMeja.set(m, (groupByMeja.get(m) ?? 0) + (byMejaJ.get(m) ?? 0));
        jenisList.push({ name: jenisName, tebalList, byMeja: byMejaJ });
      }
      for (const m of mejaList)
        grandByMeja.set(m, (grandByMeja.get(m) ?? 0) + (groupByMeja.get(m) ?? 0));
      structured.push({ name: groupName, jenisList, byMeja: groupByMeja });
    }

    let rowIndex = 0;
    const tops: string[] = [];

    for (const group of structured) {
      let groupRowspan = 1;
      for (const j of group.jenisList) groupRowspan += j.tebalList.length + 1;
      let firstGroupRow = true;

      for (const j of group.jenisList) {
        const jenisRowspan = j.tebalList.length + 1;
        let firstJenisRow = true;

        for (const t of j.tebalList) {
          rowIndex++;
          const isOdd = rowIndex % 2 === 1;
          let rowTotal = 0;
          const cells = mejaList
            .map((m) => {
              const v = t.values.get(m) ?? 0;
              rowTotal += v;
              return `<td class="number">${formatNumber(v, 4)}</td>`;
            })
            .join("");
          const groupCell = firstGroupRow
            ? `<td rowspan="${groupRowspan}" class="center"><strong>${escapeHtml(group.name)}</strong></td>`
            : "";
          const jenisCell = firstJenisRow
            ? `<td rowspan="${jenisRowspan}" class="center"><strong>${escapeHtml(j.name)}</strong></td>`
            : "";
          firstGroupRow = false;
          firstJenisRow = false;
          tops.push(
            `<tr class="${isOdd ? "row-odd" : "row-even"}">${groupCell}${jenisCell}<td class="center">${formatNumber(t.tebal, 2)}</td>${cells}<td class="number">${formatNumber(rowTotal, 4)}</td></tr>`,
          );
        }

        rowIndex++;
        const jenisCells = mejaList
          .map(
            (m) =>
              `<td class="number"><strong>${formatNumber(j.byMeja.get(m) ?? 0, 4)}</strong></td>`,
          )
          .join("");
        const jenisTotal = mejaList.reduce(
          (s, m) => s + (j.byMeja.get(m) ?? 0),
          0,
        );
        tops.push(
          `<tr class="totals-row"><td class="center"><strong>Jumlah</strong></td>${jenisCells}<td class="number"><strong>${formatNumber(jenisTotal, 4)}</strong></td></tr>`,
        );
      }

      rowIndex++;
      const groupCells = mejaList
        .map(
          (m) =>
            `<td class="number"><strong>${formatNumber(group.byMeja.get(m) ?? 0, 4)}</strong></td>`,
        )
        .join("");
      const groupTotal = mejaList.reduce(
        (s, m) => s + (group.byMeja.get(m) ?? 0),
        0,
      );
      tops.push(
        `<tr class="totals-row"><td class="center"><strong>Jumlah</strong></td><td class="center">&nbsp;</td>${groupCells}<td class="number"><strong>${formatNumber(groupTotal, 4)}</strong></td></tr>`,
      );
    }

    const mejaHeaderRow = mejaList.length
      ? mejaList.map((m) => `<th style="width:62px;">${escapeHtml(String(m))}</th>`).join("")
      : `<th style="width:62px;">-</th>`;
    const mejaHeadColspan = Math.max(1, mejaList.length);
    const grandCells = mejaList
      .map(
        (m) =>
          `<td class="number"><strong>${formatNumber(grandByMeja.get(m) ?? 0, 4)}</strong></td>`,
      )
      .join("");
    const grandTotal = mejaList.reduce(
      (s, m) => s + (grandByMeja.get(m) ?? 0),
      0,
    );

    const bodyHtml = groups.length
      ? `<table >
  <thead>
    <tr>
      <th rowspan="2" style="width:110px;">Group Jenis</th>
      <th rowspan="2" style="width:120px;">Jenis Kayu</th>
      <th rowspan="2" style="width:60px;">Tebal</th>
      <th colspan="${mejaHeadColspan}">Meja ke :</th>
      <th rowspan="2" style="width:72px;">Total</th>
    </tr>
    <tr>
      ${mejaHeaderRow}
    </tr>
  </thead>
  <tbody>
    ${tops.join("\n")}
    <tr class="totals-row">
      <td colspan="3" class="center"><strong>Total</strong></td>
      ${grandCells}
      <td class="number"><strong>${formatNumber(grandTotal, 4)}</strong></td>
    </tr>
  </tbody>
</table>`
      : `<table ><tbody><tr><td colspan="${4 + mejaHeadColspan}" class="center">${EMPTY_DATA_MESSAGE}</td></tr></tbody></table>`;

    return renderWpsReportPage({
      title: "Laporan ST (Sawmill) Masuk Per-Group",
      subtitle: `Periode ${formatTanggalId(meta.params.tglAwal)} s/d ${formatTanggalId(meta.params.tglAkhir)}`,
      bodyHtml,
      extraCss: WPS_REFERENCE_CSS["st-sawmill-masuk-per-group"],
      landscape: false,
      printedBy: meta.requestedBy,
      printedAt: formatPrintedAt(meta.generatedAt),
    });
  },
};
