/**
 * PRINTABLE BIO-DATA & SERVICE RECORD (sections A–L)
 *
 * Builds an A4 PDF of one personnel record for offline submission. Restricted
 * sections (medical & welfare, bank / salary) are only included when the caller
 * is authorised — the database refuses those reads otherwise, so an unauthorised
 * user simply gets a "restricted" note in their copy. Every included restricted
 * section is recorded in the access log.
 */
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const dmy = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : format(d, "dd/MM/yyyy");
};
const txt = (v: unknown) => {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.filter(Boolean).join(", ") || "—";
  return String(v);
};

type Pair = [string, unknown];

export async function exportBioDataPdf(profileId: string): Promise<void> {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as any).default ?? autoTableMod;

  const [
    profileRes, eduRes, empRes, famRes, emgRes, bankRes, medRes, verRes, postRes,
    cvRes, crRes, fieldsRes, tablesRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*, ranks(name, abbreviation), departments(name)").eq("id", profileId).maybeSingle(),
    supabase.from("staff_education").select("*").eq("profile_id", profileId).order("sort_order"),
    supabase.from("staff_employment_history").select("*").eq("profile_id", profileId).order("sort_order"),
    supabase.from("staff_family_details").select("*").eq("profile_id", profileId).maybeSingle(),
    supabase.from("staff_emergency_contacts").select("*").eq("profile_id", profileId).order("sort_order"),
    supabase.from("staff_bank_details").select("*").eq("profile_id", profileId).maybeSingle(),
    supabase.from("staff_medical_welfare").select("*").eq("profile_id", profileId).maybeSingle(),
    supabase.from("staff_biodata_verifications").select("*").eq("profile_id", profileId),
    supabase
      .from("postings_transfers")
      .select("type, status, effective_date, from_department:from_department_id(name), to_department:to_department_id(name)")
      .eq("profile_id", profileId)
      .order("effective_date", { ascending: false }),
    supabase.from("biodata_custom_values").select("field_id, value").eq("profile_id", profileId),
    supabase.from("biodata_custom_rows").select("table_id, values, sort_order").eq("profile_id", profileId).order("sort_order"),
    supabase.from("biodata_custom_fields").select("id, section, label").eq("active", true),
    supabase.from("biodata_custom_tables").select("id, section, label").eq("active", true),
  ]);

  const p: any = profileRes.data;
  if (!p) throw new Error("That record could not be read");

  const fullName = [p.last_name, p.first_name, p.other_names].filter(Boolean).join(" ");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 46;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("PERSONNEL BIO-DATA & SERVICE RECORD", pageWidth / 2, y, { align: "center" });
  y += 16;
  doc.setFontSize(9);
  doc.setTextColor(150, 30, 30);
  doc.text("CONFIDENTIAL — FOR OFFICIAL USE ONLY", pageWidth / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${fullName || "Unnamed"}   ·   Staff ID: ${txt(p.staff_id)}   ·   Printed ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth / 2, y, { align: "center" });
  y += 12;

  const customFields = (fieldsRes.data ?? []) as any[];
  const customValues = new Map(((cvRes.data ?? []) as any[]).map((r) => [r.field_id, r.value]));
  const customTables = (tablesRes.data ?? []) as any[];
  const customRows = (crRes.data ?? []) as any[];

  const extrasFor = (section: string): Pair[] =>
    customFields
      .filter((f) => f.section === section)
      .map((f) => [f.label, customValues.get(f.id) ?? ""] as Pair);

  const pairSection = (letter: string, title: string, pairs: Pair[], note?: string) => {
    const needed = 40 + Math.min(pairs.length || 1, 3) * 16;
    if (y + needed > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      y = 40;
    }
    autoTable(doc, {
      startY: y + 10,
      head: [[`${letter}. ${title}${note ? ` — ${note}` : ""}`, ""]],
      body: pairs.map(([k, v]) => [k, txt(v)]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [23, 64, 45], textColor: 255, fontSize: 9 },
      columnStyles: { 0: { cellWidth: 180, fontStyle: "bold" }, 1: { cellWidth: "auto" } },
      margin: { left: 36, right: 36 },
    });
    y = (doc as any).lastAutoTable.finalY;
  };

  const tableSection = (letter: string, title: string, head: string[], body: (string | number)[][], note?: string) => {
    // Keep a section's title, header and first rows together on one page.
    const needed = 40 + Math.min(body.length || 1, 3) * 16;
    if (y + needed > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      y = 40;
    }
    autoTable(doc, {
      startY: y + 10,
      head: [[{ content: `${letter}. ${title}${note ? ` — ${note}` : ""}`, colSpan: head.length, styles: { halign: "left" } }], head],
      body: body.length ? body : [head.map(() => "—")],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [23, 64, 45], textColor: 255, fontSize: 9 },
      margin: { left: 36, right: 36 },
    });
    y = (doc as any).lastAutoTable.finalY;
  };

  const extraTablesFor = (section: string) => {
    for (const t of customTables.filter((x) => x.section === section)) {
      const rows = customRows.filter((r) => r.table_id === t.id);
      if (!rows.length) continue;
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r.values ?? {})))];
      tableSection(section, t.label, keys, rows.map((r) => keys.map((k) => txt((r.values ?? {})[k]))));
    }
  };

  // A
  pairSection("A", "Form administration", [
    ["Date of completion", dmy(p.form_completed_on)],
    ["Service / organization", p.service_organization],
    ["Sector / command", p.sector_command],
    ["Station / unit", p.station_unit],
    ["Staff ID", p.staff_id],
    ["IS / No.", p.is_number],
    ["Department", p.departments?.name],
    ["Unit", p.unit],
    ["Office", p.office],
    ["Status", p.status],
    ...extrasFor("A"),
  ]);
  extraTablesFor("A");

  // B
  pairSection("B", "Personal identification data", [
    ["Surname", p.last_name],
    ["First name", p.first_name],
    ["Other name(s)", p.other_names],
    ["Gender", p.gender],
    ["Date of birth", dmy(p.date_of_birth)],
    ["Place of birth", p.place_of_birth],
    ["Hometown", p.hometown],
    ["Region of origin", p.region_of_origin],
    ["Ghana Card no.", p.ghana_card_number],
    ["Rank", p.ranks?.name],
    ["Date of appointment", dmy(p.date_of_appointment)],
    ["Cadet intake", p.cadet_intake],
    ["Recruit intake", p.recruit_intake],
    ["Date joined service", dmy(p.date_joined_service)],
    ...extrasFor("B"),
  ]);
  extraTablesFor("B");

  // C
  pairSection("C", "Residential & contact information", [
    ["Current place of stay", p.current_place_of_stay],
    ["Residential address", p.residential_address],
    ["Digital address", p.digital_address],
    ["Postal address", p.postal_address],
    ["Residential telephone", p.residential_phone],
    ["Mobile no. 1", p.phone],
    ["Email address", p.email],
    ...extrasFor("C"),
  ]);
  extraTablesFor("C");

  // D
  pairSection("D", "Physical & personal profile", [
    ["Height (cm)", p.height_cm],
    ["Blood group", p.blood_group],
    ["Uniform size", p.uniform_size],
    ["Shoe size", p.shoe_size],
    ["Religion", p.religion],
    ["Hobbies / interests", p.hobbies],
    ["Special skill(s)", p.special_skills],
    ...extrasFor("D"),
  ]);
  extraTablesFor("D");

  // E — restricted
  const med = medRes.data as any;
  pairSection("E", "Medical & welfare information", med
    ? [
        ["Medical condition(s) / allergy(ies)", med.medical_conditions],
        ["Additional medical / welfare notes", med.welfare_notes],
        ...extrasFor("E"),
      ]
    : [["Access", medRes.error
        ? "Restricted — not included in this copy"
        : "No medical or welfare details recorded"]],
    "restricted access");
  if (med) {
    void supabase.rpc("log_biodata_restricted_access", {
      _profile_id: profileId, _section: "medical", _action: "view",
      _changed_fields: ["pdf_export"], _user_agent: navigator.userAgent,
    });
  }
  extraTablesFor("E");

  // F
  tableSection("F", "Educational qualifications",
    ["Name & location of school / institution", "From", "To", "Qualification"],
    ((eduRes.data ?? []) as any[]).map((r) => [txt(r.institution), txt(r.from_date), txt(r.to_date), txt(r.qualification)]));
  extraTablesFor("F");

  // G
  tableSection("G", "Previous employment / work experience",
    ["Organization / employer", "Position held", "From", "To", "Reason for leaving"],
    ((empRes.data ?? []) as any[]).map((r) => [txt(r.employer), txt(r.position_held), txt(r.from_date), txt(r.to_date), txt(r.reason_for_leaving)]));
  pairSection("G", "Previous employment (summary)", [
    ["Last position held at previous place of work", p.previous_last_position],
    ["Reason for leaving previous place of work", p.previous_reason_for_leaving],
    ...extrasFor("G"),
  ]);
  extraTablesFor("G");

  // H
  const fam = (famRes.data ?? {}) as any;
  pairSection("H", "Family & dependant information", [
    ["Marital status", p.marital_status],
    ["Number of children", p.number_of_children],
    ["Spouse — name", fam.spouse_name],
    ["Spouse — telephone", fam.spouse_phone],
    ["Spouse — residential address", fam.spouse_address],
    ["Next of kin — name", fam.nok_name],
    ["Next of kin — relationship", fam.nok_relationship],
    ["Next of kin — telephone", fam.nok_phone],
    ["Next of kin — address", fam.nok_address],
    ["Father — name / telephone", [fam.father_name, fam.father_phone].filter(Boolean).join(" · ")],
    ["Mother — name / telephone", [fam.mother_name, fam.mother_phone].filter(Boolean).join(" · ")],
    ...extrasFor("H"),
  ]);
  tableSection("H", "Emergency contacts",
    ["Name", "Relationship", "Telephone", "Address"],
    ((emgRes.data ?? []) as any[]).map((r) => [txt(r.name), txt(r.relationship), txt(r.phone), txt(r.address)]));
  extraTablesFor("H");

  // I — restricted
  const bank = bankRes.data as any;
  pairSection("I", "Bank / salary information", bank
    ? [
        ["Bank name", bank.bank_name],
        ["Branch", bank.branch],
        ["Account number", bank.account_number],
        ...extrasFor("I"),
      ]
    : [["Access", bankRes.error
        ? "Restricted — not included in this copy"
        : "No bank / salary details recorded"]],
    "restricted access");
  if (bank) {
    void supabase.rpc("log_biodata_restricted_access", {
      _profile_id: profileId, _section: "bank", _action: "view",
      _changed_fields: ["pdf_export"], _user_agent: navigator.userAgent,
    });
  }
  extraTablesFor("I");

  // J
  tableSection("J", "Service / transfer history",
    ["From station / command", "To station / command", "Type", "Effective date", "Status"],
    ((postRes.data ?? []) as any[]).map((r) => [
      txt(r.from_department?.name), txt(r.to_department?.name), txt(r.type), dmy(r.effective_date), txt(r.status),
    ]));
  extraTablesFor("J");

  // K & L
  const vers = new Map(((verRes.data ?? []) as any[]).map((r) => [r.kind, r]));
  const decl = vers.get("declaration") ?? {};
  pairSection("K", "Official verification — declaration by staff member", [
    ["Declaration", "I certify that the information provided in this form is true, complete and accurate to the best of my knowledge."],
    ["Staff name", decl.name || fullName],
    ["Staff ID / IS No.", decl.rank_position || [p.staff_id, p.is_number].filter(Boolean).join(" / ")],
    ["Signature", decl.signature],
    ["Date", dmy(decl.signed_on)],
    ...extrasFor("K"),
  ]);
  tableSection("L", "Command / HR verification",
    ["Stage", "Name", "Rank / position", "Signature", "Date"],
    (["checked", "verified", "approved"] as const).map((kind) => {
      const v: any = vers.get(kind) ?? {};
      return [kind.replace(/^./, (c) => c.toUpperCase()) + " by", txt(v.name), txt(v.rank_position), txt(v.signature), dmy(v.signed_on)];
    }));
  extraTablesFor("L");

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `CONFIDENTIAL — FOR OFFICIAL USE ONLY   ·   ${fullName} (${txt(p.staff_id)})   ·   Page ${i} of ${pages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 18,
      { align: "center" },
    );
  }

  const safe = (fullName || "bio-data").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`bio-data-${safe}-${format(new Date(), "yyyyMMdd")}.pdf`);
}
