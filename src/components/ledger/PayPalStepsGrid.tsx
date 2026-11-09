"use client";

// "Every PayPal step": one row per payments row, so a judge can match each money move to the PayPal call behind it,
// the ID PayPal returned and the PayPal-Request-Id stored before the call (hard rule 4). AG Grid Community only.

import { AllCommunityModule, type ColDef, type ICellRendererParams, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import type { StepRow } from "@/lib/ledger";
import styles from "./PayPalStepsGrid.module.css";

ModuleRegistry.registerModules([AllCommunityModule]);

// The Ohio Quilt: a plum header like the frame, the app's font, paper rows on the pale ground, roomy rows.
const quiltTheme = themeQuartz.withParams({
  browserColorScheme: "light",
  fontFamily: "var(--font-sans), system-ui, sans-serif",
  fontSize: 15,
  dataFontSize: 15,
  headerFontSize: 15,
  headerFontWeight: 800,
  foregroundColor: "#1a1720",
  backgroundColor: "#ffffff",
  oddRowBackgroundColor: "#f4f6f8",
  headerBackgroundColor: "#3b1f3a",
  headerTextColor: "#ede6ee",
  headerCellHoverBackgroundColor: "#4a2a48",
  headerColumnBorder: { color: "rgb(237 230 238 / 0.18)" },
  borderColor: "rgb(26 23 32 / 0.14)",
  accentColor: "#5c3a59",
  rowHoverColor: "rgb(92 58 89 / 0.07)",
  rowHeight: 62,
  headerHeight: 50,
  wrapperBorderRadius: 12,
  cellHorizontalPadding: 16,
});

function What({ data }: ICellRendererParams<StepRow>) {
  if (!data) return null;
  return (
    <span className={styles.what}>
      <span className={styles.whatMain}>{data.what}</span>
      <span className={styles.whatCall}>{data.call}</span>
    </span>
  );
}

function Who({ data }: ICellRendererParams<StepRow>) {
  if (!data) return null;
  return (
    <span className={styles.who}>
      <span className={styles.swatch} data-fabric={data.fabric} aria-hidden="true" />
      {data.who}
    </span>
  );
}

const byField =
  <K extends keyof StepRow>(key: K) =>
  (_a: unknown, _b: unknown, nodeA: { data?: StepRow }, nodeB: { data?: StepRow }) => {
    const a = nodeA.data?.[key];
    const b = nodeB.data?.[key];
    if (a === b) return 0;
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    return a < b ? -1 : 1;
  };

const COLUMNS: ColDef<StepRow>[] = [
  { headerName: "When", field: "when", comparator: byField("at"), width: 156, minWidth: 150 },
  { headerName: "Who", field: "who", cellRenderer: Who, width: 132, minWidth: 128 },
  {
    headerName: "What · PayPal call",
    field: "what",
    cellRenderer: What,
    cellClass: styles.whatCell,
    flex: 1,
    minWidth: 240,
    tooltipValueGetter: (p) => (p.data ? `${p.data.what} · ${p.data.call}` : ""),
  },
  { headerName: "Amount", field: "amount", comparator: byField("amountCents"), type: "rightAligned", width: 116, minWidth: 112 },
  { headerName: "Status", field: "status", width: 124, minWidth: 120, cellClass: styles.status },
  { headerName: "PayPal ID", field: "paypalId", width: 232, minWidth: 200, cellClass: styles.code, tooltipField: "paypalId" },
  { headerName: "PayPal-Request-Id", field: "requestId", width: 318, minWidth: 220, cellClass: styles.code, tooltipField: "requestId" },
];

const DEFAULT_COLUMN: ColDef<StepRow> = { sortable: true, resizable: true, suppressMovable: true };

export function PayPalStepsGrid({ rows }: { rows: StepRow[] }) {
  if (rows.length === 0) {
    return <p className={styles.empty}>No PayPal calls yet. The first bill Margaret pays shows up here, step by step.</p>;
  }
  return (
    <div className={styles.grid}>
      <AgGridReact<StepRow>
        theme={quiltTheme}
        rowData={rows}
        columnDefs={COLUMNS}
        defaultColDef={DEFAULT_COLUMN}
        getRowId={(params) => params.data.id}
        domLayout="autoHeight"
        enableCellTextSelection
        ensureDomOrder
        suppressDragLeaveHidesColumns
        tooltipShowDelay={300}
      />
    </div>
  );
}
