import jsPDF from "jspdf";
import { format } from "date-fns";

/**
 * Branded one-page PDF letters for GIS Cybernet:
 *  - Leave approvals/rejections
 *  - Posting/Transfer letters
 *  - Appraisal summaries
 */

const BRAND_GREEN: [number, number, number] = [0, 77, 41]; // deep green
const BRAND_NIGHT: [number, number, number] = [15, 30, 82]; // deep blue
const MARGIN = 18;

function header(doc: jsPDF, subtitle: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, 0, w, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("GHANA IMMIGRATION SERVICE", MARGIN, 10);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Amasaman Sector Command — Cybernet", MARGIN, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(subtitle.toUpperCase(), w - MARGIN, 14, { align: "right" });
  doc.setTextColor(20, 20, 20);
}

function footer(doc: jsPDF) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...BRAND_NIGHT);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, h - 18, w - MARGIN, h - 18);
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text("CONFIDENTIAL — For Official Use Only", MARGIN, h - 12);
  doc.text(`Generated: ${format(new Date(), "PPpp")}`, w - MARGIN, h - 12, { align: "right" });
}

function refLine(doc: jsPDF, ref: string, y: number) {
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Ref: ${ref}`, MARGIN, y);
  doc.text(`Date: ${format(new Date(), "PPP")}`, doc.internal.pageSize.getWidth() - MARGIN, y, { align: "right" });
  doc.setTextColor(20, 20, 20);
}

function field(doc: jsPDF, label: string, value: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`${label}:`, MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.text(value || "—", MARGIN + 45, y);
}

function paragraph(doc: jsPDF, text: string, y: number): number {
  const w = doc.internal.pageSize.getWidth() - MARGIN * 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(text, w);
  doc.text(lines, MARGIN, y);
  return y + lines.length * 5;
}

export interface LeaveLetterData {
  staffName: string;
  staffId: string;
  rank?: string;
  department?: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  status: "approved" | "rejected" | "pending";
  reason?: string;
  comments?: string;
  approverName?: string;
  reference?: string;
}

export function generateLeaveLetter(d: LeaveLetterData): jsPDF {
  const doc = new jsPDF();
  const subtitle =
    d.status === "approved" ? "Leave Approval Letter" :
    d.status === "rejected" ? "Leave Decision Letter" :
    "Leave Acknowledgement";
  header(doc, subtitle);
  refLine(doc, d.reference ?? `LV-${Date.now().toString().slice(-8)}`, 32);

  let y = 44;
  field(doc, "Officer", `${d.rank ? d.rank + " " : ""}${d.staffName}`, y); y += 7;
  field(doc, "Staff ID", d.staffId, y); y += 7;
  if (d.department) { field(doc, "Department", d.department, y); y += 7; }
  field(doc, "Leave Type", d.type, y); y += 7;
  field(doc, "From", format(new Date(d.startDate), "PPP"), y); y += 7;
  field(doc, "To", format(new Date(d.endDate), "PPP"), y); y += 7;
  field(doc, "Duration", `${d.days} day(s)`, y); y += 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Decision", MARGIN, y); y += 6;
  const verdict =
    d.status === "approved"
      ? `This is to formally notify you that your application for ${d.type} leave from ${format(new Date(d.startDate), "PPP")} to ${format(new Date(d.endDate), "PPP")} has been APPROVED. You are expected to resume duty on the working day immediately following the end date.`
      : d.status === "rejected"
      ? `This is to inform you that your application for ${d.type} leave from ${format(new Date(d.startDate), "PPP")} to ${format(new Date(d.endDate), "PPP")} has NOT been approved at this time.`
      : `Your leave application has been received and is currently under review.`;
  y = paragraph(doc, verdict, y) + 4;

  if (d.reason) {
    doc.setFont("helvetica", "bold"); doc.text("Reason Stated", MARGIN, y); y += 5;
    y = paragraph(doc, d.reason, y) + 4;
  }
  if (d.comments) {
    doc.setFont("helvetica", "bold"); doc.text("Approver Remarks", MARGIN, y); y += 5;
    y = paragraph(doc, d.comments, y) + 4;
  }

  y = Math.max(y, 220);
  doc.setDrawColor(0); doc.line(MARGIN, y, MARGIN + 70, y);
  doc.setFontSize(9); doc.text(d.approverName ?? "Approving Officer", MARGIN, y + 5);
  doc.text("Command Tier — GIS Amasaman", MARGIN, y + 10);

  footer(doc);
  return doc;
}

export interface PostingLetterData {
  staffName: string;
  staffId: string;
  rank?: string;
  fromDepartment?: string;
  toDepartment?: string;
  effectiveDate?: string;
  reason?: string;
  status: "approved" | "rejected" | "pending";
  comments?: string;
  approverName?: string;
  reference?: string;
}

export function generatePostingLetter(d: PostingLetterData): jsPDF {
  const doc = new jsPDF();
  header(doc, "Posting / Transfer Letter");
  refLine(doc, d.reference ?? `PT-${Date.now().toString().slice(-8)}`, 32);

  let y = 44;
  field(doc, "Officer", `${d.rank ? d.rank + " " : ""}${d.staffName}`, y); y += 7;
  field(doc, "Staff ID", d.staffId, y); y += 7;
  field(doc, "From", d.fromDepartment ?? "—", y); y += 7;
  field(doc, "To", d.toDepartment ?? "—", y); y += 7;
  if (d.effectiveDate) { field(doc, "Effective", format(new Date(d.effectiveDate), "PPP"), y); y += 7; }
  field(doc, "Status", d.status.toUpperCase(), y); y += 12;

  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("Directive", MARGIN, y); y += 6;
  const body =
    d.status === "approved"
      ? `By the authority of the Sector Command, you are hereby posted/transferred from ${d.fromDepartment ?? "your current department"} to ${d.toDepartment ?? "the receiving department"}${d.effectiveDate ? ", effective " + format(new Date(d.effectiveDate), "PPP") : ""}. You are to report to the receiving officer and ensure proper handing-over.`
      : d.status === "rejected"
      ? `Your request for posting/transfer has not been approved at this time. You are to continue your current duties pending further notice.`
      : `Your posting/transfer request is currently under review by the Command.`;
  y = paragraph(doc, body, y) + 4;

  if (d.reason) {
    doc.setFont("helvetica", "bold"); doc.text("Reason / Justification", MARGIN, y); y += 5;
    y = paragraph(doc, d.reason, y) + 4;
  }
  if (d.comments) {
    doc.setFont("helvetica", "bold"); doc.text("Command Remarks", MARGIN, y); y += 5;
    y = paragraph(doc, d.comments, y) + 4;
  }

  y = Math.max(y, 220);
  doc.line(MARGIN, y, MARGIN + 70, y);
  doc.setFontSize(9); doc.text(d.approverName ?? "Approving Officer", MARGIN, y + 5);
  doc.text("Command Tier — GIS Amasaman", MARGIN, y + 10);

  footer(doc);
  return doc;
}

export interface AppraisalLetterData {
  staffName: string;
  staffId: string;
  rank?: string;
  department?: string;
  period?: string;
  overallRating?: string | number;
  strengths?: string;
  improvements?: string;
  appraiserName?: string;
  reference?: string;
}

export function generateAppraisalSummary(d: AppraisalLetterData): jsPDF {
  const doc = new jsPDF();
  header(doc, "Appraisal Summary");
  refLine(doc, d.reference ?? `AP-${Date.now().toString().slice(-8)}`, 32);

  let y = 44;
  field(doc, "Officer", `${d.rank ? d.rank + " " : ""}${d.staffName}`, y); y += 7;
  field(doc, "Staff ID", d.staffId, y); y += 7;
  if (d.department) { field(doc, "Department", d.department, y); y += 7; }
  if (d.period) { field(doc, "Period", d.period, y); y += 7; }
  if (d.overallRating != null) { field(doc, "Overall Rating", String(d.overallRating), y); y += 7; }
  y += 6;

  if (d.strengths) {
    doc.setFont("helvetica", "bold"); doc.text("Strengths", MARGIN, y); y += 5;
    y = paragraph(doc, d.strengths, y) + 4;
  }
  if (d.improvements) {
    doc.setFont("helvetica", "bold"); doc.text("Areas for Improvement", MARGIN, y); y += 5;
    y = paragraph(doc, d.improvements, y) + 4;
  }

  y = Math.max(y, 220);
  doc.line(MARGIN, y, MARGIN + 70, y);
  doc.setFontSize(9); doc.text(d.appraiserName ?? "Appraising Officer", MARGIN, y + 5);
  doc.text("Command Tier — GIS Amasaman", MARGIN, y + 10);

  footer(doc);
  return doc;
}

export function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}
