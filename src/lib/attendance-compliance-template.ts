import * as XLSX from "xlsx";
import { format } from "date-fns";

/**
 * Columns shipped in the Monthly Attendance Compliance template. Keep in sync
 * with the export columns in `AttendanceComplianceReport.tsx` so that
 * exported reports can be re-imported without column-mapping work.
 */
export const ATTENDANCE_COMPLIANCE_TEMPLATE_HEADERS = [
  "Staff ID",
  "Name",
  "Department",
  "Office",
  "Shift",
  "Working Days",
  "Present",
  "Absent",
  "Late",
  "Leave",
  "Missing Logs",
  "Compliance %",
  "Log Completeness %",
] as const;

const SHIFT_OPTIONS = ["A", "B", "C", "D", "Day", "Night", "Off"];
const OFFICE_OPTIONS = [
  "Headquarters",
  "Front Desk",
  "Processing",
  "Operations",
  "Holding Centre",
  "Night Guard",
];

const SAMPLE_ROWS: string[][] = [
  ["GIS-0001", "Mensah, Kofi", "Operations", "Headquarters", "A", "22", "20", "1", "1", "1", "0", "90.9%", "100.0%"],
  ["GIS-0002", "Owusu, Ama", "Front Desk", "Front Desk", "B", "22", "18", "2", "2", "2", "1", "81.8%", "95.5%"],
  ["GIS-0003", "Boateng, Kwesi", "Night Guard", "Night Guard", "Night", "22", "21", "0", "1", "1", "0", "95.5%", "100.0%"],
];

interface TemplateOptions {
  /** Override the months listed on the Instructions sheet. Defaults to the next 6 months. */
  monthsAhead?: number;
  /** Optional list of department names to include in the validation/reference sheet. */
  departments?: string[];
  /** Optional list of distinct office values pulled from existing staff profiles. */
  offices?: string[];
  /** Optional list of distinct shift values; falls back to A/B/C/D + day/night/off. */
  shifts?: string[];
}

function nextMonths(count: number) {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(format(d, "MMMM yyyy"));
  }
  return out;
}

/**
 * Build and trigger download of an .xlsx workbook containing:
 *   - Instructions: how to fill / re-import the report.
 *   - Compliance Data: header row that mirrors the live export, plus 3 sample rows.
 *   - Reference Lists: allowed shifts, offices, departments — used as a manual
 *     guide for data-entry staff.
 */
export function downloadAttendanceComplianceTemplate(opts: TemplateOptions = {}) {
  const months = nextMonths(opts.monthsAhead ?? 6);
  const offices = opts.offices && opts.offices.length > 0 ? opts.offices : OFFICE_OPTIONS;
  const shifts = opts.shifts && opts.shifts.length > 0 ? opts.shifts : SHIFT_OPTIONS;
  const departments = opts.departments ?? [];

  const wb = XLSX.utils.book_new();

  // ---- Sheet 1: Instructions
  const instructions: string[][] = [
    ["Cybernet HRM System — Monthly Attendance Compliance Template"],
    [`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`],
    [],
    ["Purpose"],
    ["Use this workbook to import or back-fill monthly attendance compliance figures."],
    ["Columns mirror the live report export, so a downloaded report can be re-imported without remapping."],
    [],
    ["How to use"],
    ["1. Open the 'Compliance Data' sheet."],
    ["2. Replace the sample rows with one row per staff member for the target month."],
    ["3. Use the Staff ID exactly as it appears in the Cybernet directory (e.g. GIS-0001)."],
    ["4. Office and Shift values must match one of the entries on the 'Reference Lists' sheet."],
    ["5. Compliance % and Log Completeness % accept either '90.9%' or '90.9' formatting."],
    ["6. Save the file and upload it from Reports → Attendance Compliance → Import."],
    [],
    ["Suggested target periods"],
    ...months.map((m) => [m]),
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr["!cols"] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, "Instructions");

  // ---- Sheet 2: Compliance Data (matches export columns exactly)
  const dataAoa: (string | number)[][] = [
    [...ATTENDANCE_COMPLIANCE_TEMPLATE_HEADERS],
    ...SAMPLE_ROWS,
  ];
  const wsData = XLSX.utils.aoa_to_sheet(dataAoa);
  wsData["!cols"] = ATTENDANCE_COMPLIANCE_TEMPLATE_HEADERS.map((h) => ({
    wch: Math.max(14, h.length + 4),
  }));
  XLSX.utils.book_append_sheet(wb, wsData, "Compliance Data");

  // ---- Sheet 3: Reference Lists
  const refRows: string[][] = [
    ["Shift values", "Office values", "Department values"],
  ];
  const maxLen = Math.max(shifts.length, offices.length, departments.length);
  for (let i = 0; i < maxLen; i++) {
    refRows.push([shifts[i] ?? "", offices[i] ?? "", departments[i] ?? ""]);
  }
  const wsRef = XLSX.utils.aoa_to_sheet(refRows);
  wsRef["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, wsRef, "Reference Lists");

  const filename = `attendance_compliance_template_${format(new Date(), "yyyyMMdd")}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}
