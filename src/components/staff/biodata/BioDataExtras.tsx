/**
 * Sections E to L of the Personnel Bio-Data & Service Record form, plus any
 * extra fields and extra tables an administrator has added to any section.
 *
 * State lives in a provider so the parent dialog can save everything in one
 * action: the provider publishes a `persist(profileId)` function through the
 * `persistRef` it is given. Restricted sections (medical & welfare, bank /
 * salary) are only rendered for authorised viewers; the database enforces the
 * same rule independently.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import type { MutableRefObject, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { DateInput } from "@/components/ui/date-input";
import { GhanaPhoneInput } from "@/components/ui/ghana-phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, ShieldAlert, ArrowRightLeft, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { OptionCombobox } from "./OptionCombobox";
import { RepeatingRows, type RowValue } from "./RepeatingRows";
import {
  useBioDataCustomFields, useBioDataCustomTables, useBioDataOptionSets,
  optionsFor, optionsForSetId, type BioCustomField, type BioCustomTable,
} from "./useBioDataConfig";

type FamilyDetails = {
  spouse_name: string; spouse_phone: string; spouse_address: string;
  nok_name: string; nok_relationship: string; nok_phone: string; nok_address: string;
  father_name: string; father_phone: string; mother_name: string; mother_phone: string;
};
type BankDetails = { bank_name: string; branch: string; account_number: string };
type MedicalDetails = { medical_conditions: string; welfare_notes: string };
type Verification = { name: string; rank_position: string; signature: string; signed_on: string };

const EMPTY_FAMILY: FamilyDetails = {
  spouse_name: "", spouse_phone: "", spouse_address: "",
  nok_name: "", nok_relationship: "", nok_phone: "", nok_address: "",
  father_name: "", father_phone: "", mother_name: "", mother_phone: "",
};
const EMPTY_VERIFICATION: Verification = { name: "", rank_position: "", signature: "", signed_on: "" };
const VERIFICATION_KINDS = ["declaration", "checked", "verified", "approved"] as const;
type VerificationKind = (typeof VERIFICATION_KINDS)[number];

type BioDataState = {
  education: RowValue[];
  employment: RowValue[];
  family: FamilyDetails;
  emergency: RowValue[];
  bank: BankDetails;
  medical: MedicalDetails;
  verifications: Record<VerificationKind, Verification>;
  customValues: Record<string, string>;
  customRows: Record<string, RowValue[]>;
};

type Ctx = BioDataState & {
  set: <K extends keyof BioDataState>(key: K, value: BioDataState[K]) => void;
  setCustomValue: (fieldId: string, value: string) => void;
  setCustomRows: (tableId: string, rows: RowValue[]) => void;
  setVerification: (kind: VerificationKind, patch: Partial<Verification>) => void;
  canSeeMedical: boolean;
  canSeeBank: boolean;
  fields: BioCustomField[];
  tables: BioCustomTable[];
  optionSets: ReturnType<typeof useBioDataOptionSets>["data"];
  profileId: string | null;
};

const BioDataCtx = createContext<Ctx | null>(null);

export function useBioData(): Ctx {
  const ctx = useContext(BioDataCtx);
  if (!ctx) throw new Error("useBioData must be used inside BioDataProvider");
  return ctx;
}

const EMPTY_STATE: BioDataState = {
  education: [], employment: [], emergency: [],
  family: EMPTY_FAMILY,
  bank: { bank_name: "", branch: "", account_number: "" },
  medical: { medical_conditions: "", welfare_notes: "" },
  verifications: {
    declaration: { ...EMPTY_VERIFICATION },
    checked: { ...EMPTY_VERIFICATION },
    verified: { ...EMPTY_VERIFICATION },
    approved: { ...EMPTY_VERIFICATION },
  },
  customValues: {}, customRows: {},
};

export type PersistFn = (profileId: string) => Promise<void>;

export function BioDataProvider({
  profileId,
  open,
  persistRef,
  children,
}: {
  profileId: string | null;
  open: boolean;
  persistRef: MutableRefObject<PersistFn | null>;
  children: ReactNode;
}) {
  const { user, isAdmin, role } = useAuth();
  const [state, setState] = useState<BioDataState>(EMPTY_STATE);
  const { data: optionSets } = useBioDataOptionSets();
  const { data: fields = [] } = useBioDataCustomFields();
  const { data: tables = [] } = useBioDataCustomTables();

  // Restricted-section visibility. Mirrors the database rule: administrators,
  // holders of the delegated staff-administration grant, the record owner, and
  // medical officers (medical section only).
  const { data: hasStaffAdminGrant = false } = useQuery({
    queryKey: ["biodata-staff-admin-grant", user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_command_capability", {
        _user_id: user!.id,
        _capability: "staff_admin",
      });
      if (error) return false;
      return data === true;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: isOwner = false } = useQuery({
    queryKey: ["biodata-is-owner", profileId, user?.id],
    enabled: !!profileId && !!user?.id && open,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id").eq("id", profileId!).maybeSingle();
      return data?.user_id === user!.id;
    },
  });

  const canSeeBank = isAdmin || hasStaffAdminGrant || isOwner;
  const canSeeMedical = canSeeBank || role === "medical_officer";

  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { loadedFor.current = null; return; }
    if (!profileId) { setState(EMPTY_STATE); loadedFor.current = null; return; }
    if (loadedFor.current === profileId) return;
    loadedFor.current = profileId;
    let cancelled = false;

    (async () => {
      const [edu, emp, fam, emg, bank, med, ver, cv, cr] = await Promise.all([
        supabase.from("staff_education").select("*").eq("profile_id", profileId).order("sort_order"),
        supabase.from("staff_employment_history").select("*").eq("profile_id", profileId).order("sort_order"),
        supabase.from("staff_family_details").select("*").eq("profile_id", profileId).maybeSingle(),
        supabase.from("staff_emergency_contacts").select("*").eq("profile_id", profileId).order("sort_order"),
        supabase.from("staff_bank_details").select("*").eq("profile_id", profileId).maybeSingle(),
        supabase.from("staff_medical_welfare").select("*").eq("profile_id", profileId).maybeSingle(),
        supabase.from("staff_biodata_verifications").select("*").eq("profile_id", profileId),
        supabase.from("biodata_custom_values").select("*").eq("profile_id", profileId),
        supabase.from("biodata_custom_rows").select("*").eq("profile_id", profileId).order("sort_order"),
      ]);
      if (cancelled) return;

      const verifications = { ...EMPTY_STATE.verifications } as Record<VerificationKind, Verification>;
      for (const row of (ver.data ?? []) as any[]) {
        if (VERIFICATION_KINDS.includes(row.kind)) {
          verifications[row.kind as VerificationKind] = {
            name: row.name ?? "", rank_position: row.rank_position ?? "",
            signature: row.signature ?? "", signed_on: row.signed_on ?? "",
          };
        }
      }
      const customRows: Record<string, RowValue[]> = {};
      for (const row of (cr.data ?? []) as any[]) {
        const list = customRows[row.table_id] ?? [];
        list.push((row.values ?? {}) as RowValue);
        customRows[row.table_id] = list;
      }

      setState({
        education: (edu.data ?? []).map((r: any) => ({
          institution: r.institution ?? "", from_date: r.from_date ?? "",
          to_date: r.to_date ?? "", qualification: r.qualification ?? "",
        })),
        employment: (emp.data ?? []).map((r: any) => ({
          employer: r.employer ?? "", position_held: r.position_held ?? "",
          from_date: r.from_date ?? "", to_date: r.to_date ?? "",
          reason_for_leaving: r.reason_for_leaving ?? "",
        })),
        family: fam.data
          ? {
              spouse_name: fam.data.spouse_name ?? "", spouse_phone: fam.data.spouse_phone ?? "",
              spouse_address: fam.data.spouse_address ?? "", nok_name: fam.data.nok_name ?? "",
              nok_relationship: fam.data.nok_relationship ?? "", nok_phone: fam.data.nok_phone ?? "",
              nok_address: fam.data.nok_address ?? "", father_name: fam.data.father_name ?? "",
              father_phone: fam.data.father_phone ?? "", mother_name: fam.data.mother_name ?? "",
              mother_phone: fam.data.mother_phone ?? "",
            }
          : EMPTY_FAMILY,
        emergency: (emg.data ?? []).map((r: any) => ({
          name: r.name ?? "", relationship: r.relationship ?? "",
          phone: r.phone ?? "", address: r.address ?? "",
        })),
        bank: {
          bank_name: bank.data?.bank_name ?? "", branch: bank.data?.branch ?? "",
          account_number: bank.data?.account_number ?? "",
        },
        medical: {
          medical_conditions: med.data?.medical_conditions ?? "",
          welfare_notes: med.data?.welfare_notes ?? "",
        },
        verifications,
        customValues: Object.fromEntries(((cv.data ?? []) as any[]).map((r) => [r.field_id, r.value ?? ""])),
        customRows,
      });
    })();

    return () => { cancelled = true; };
  }, [open, profileId]);

  const stateRef = useRef(state);
  stateRef.current = state;

  const persist = useCallback<PersistFn>(async (targetProfileId: string) => {
    const s = stateRef.current;

    const replaceRows = async (table: string, rows: any[]) => {
      const { error: delError } = await supabase.from(table as any).delete().eq("profile_id", targetProfileId);
      if (delError) throw delError;
      if (rows.length === 0) return;
      const { error } = await supabase.from(table as any).insert(rows);
      if (error) throw error;
    };

    await replaceRows(
      "staff_education",
      s.education
        .filter((r) => (r.institution ?? "").trim())
        .map((r, i) => ({
          profile_id: targetProfileId, sort_order: i + 1,
          institution: r.institution.trim(), from_date: r.from_date || null,
          to_date: r.to_date || null, qualification: r.qualification || null,
        })),
    );

    await replaceRows(
      "staff_employment_history",
      s.employment
        .filter((r) => (r.employer ?? "").trim())
        .map((r, i) => ({
          profile_id: targetProfileId, sort_order: i + 1,
          employer: r.employer.trim(), position_held: r.position_held || null,
          from_date: r.from_date || null, to_date: r.to_date || null,
          reason_for_leaving: r.reason_for_leaving || null,
        })),
    );

    await replaceRows(
      "staff_emergency_contacts",
      s.emergency
        .filter((r) => (r.name ?? "").trim())
        .map((r, i) => ({
          profile_id: targetProfileId, sort_order: i + 1,
          name: r.name.trim(), relationship: r.relationship || null,
          phone: r.phone || null, address: r.address || null,
        })),
    );

    const familyHasData = Object.values(s.family).some((v) => (v ?? "").trim());
    if (familyHasData) {
      const { error } = await supabase
        .from("staff_family_details")
        .upsert({ profile_id: targetProfileId, ...s.family }, { onConflict: "profile_id" });
      if (error) throw error;
    }

    if (canSeeMedical && (s.medical.medical_conditions.trim() || s.medical.welfare_notes.trim())) {
      const { error } = await supabase
        .from("staff_medical_welfare")
        .upsert({ profile_id: targetProfileId, ...s.medical }, { onConflict: "profile_id" });
      if (error) throw error;
    }

    if (canSeeBank && Object.values(s.bank).some((v) => (v ?? "").trim())) {
      const { error } = await supabase
        .from("staff_bank_details")
        .upsert({ profile_id: targetProfileId, ...s.bank }, { onConflict: "profile_id" });
      if (error) throw error;
    }

    for (const kind of VERIFICATION_KINDS) {
      const v = s.verifications[kind];
      if (!Object.values(v).some((x) => (x ?? "").trim())) continue;
      const { error } = await supabase.from("staff_biodata_verifications").upsert(
        {
          profile_id: targetProfileId, kind,
          name: v.name || null, rank_position: v.rank_position || null,
          signature: v.signature || null, signed_on: v.signed_on || null,
          acted_by: user?.id ?? null,
        },
        { onConflict: "profile_id,kind" },
      );
      if (error) throw error;
    }

    const customValueRows = Object.entries(s.customValues)
      .filter(([, v]) => (v ?? "").trim())
      .map(([field_id, value]) => ({ profile_id: targetProfileId, field_id, value }));
    if (customValueRows.length) {
      const { error } = await supabase
        .from("biodata_custom_values")
        .upsert(customValueRows, { onConflict: "profile_id,field_id" });
      if (error) throw error;
    }

    const { error: delRows } = await supabase
      .from("biodata_custom_rows").delete().eq("profile_id", targetProfileId);
    if (delRows) throw delRows;
    const rowsToInsert = Object.entries(s.customRows).flatMap(([table_id, rows]) =>
      rows
        .filter((r) => Object.values(r).some((v) => (v ?? "").trim()))
        .map((values, i) => ({ profile_id: targetProfileId, table_id, sort_order: i + 1, values })),
    );
    if (rowsToInsert.length) {
      const { error } = await supabase.from("biodata_custom_rows").insert(rowsToInsert);
      if (error) throw error;
    }
  }, [canSeeBank, canSeeMedical, user?.id]);

  useEffect(() => {
    persistRef.current = persist;
    return () => { persistRef.current = null; };
  }, [persist, persistRef]);

  const value = useMemo<Ctx>(() => ({
    ...state,
    set: (key, v) => setState((prev) => ({ ...prev, [key]: v })),
    setCustomValue: (fieldId, v) =>
      setState((prev) => ({ ...prev, customValues: { ...prev.customValues, [fieldId]: v } })),
    setCustomRows: (tableId, rows) =>
      setState((prev) => ({ ...prev, customRows: { ...prev.customRows, [tableId]: rows } })),
    setVerification: (kind, patch) =>
      setState((prev) => ({
        ...prev,
        verifications: { ...prev.verifications, [kind]: { ...prev.verifications[kind], ...patch } },
      })),
    canSeeMedical, canSeeBank, fields, tables, optionSets, profileId,
  }), [state, canSeeMedical, canSeeBank, fields, tables, optionSets, profileId]);

  return <BioDataCtx.Provider value={value}>{children}</BioDataCtx.Provider>;
}

/** Admin-added fields and tables for one lettered section. */
export function BioDataCustomBlock({ section }: { section: string }) {
  const { fields, tables, optionSets, customValues, setCustomValue, customRows, setCustomRows } = useBioData();
  const sectionFields = fields.filter((f) => f.section === section && f.active);
  const sectionTables = tables.filter((t) => t.section === section && t.active);
  if (sectionFields.length === 0 && sectionTables.length === 0) return null;

  return (
    <div className="space-y-4">
      {sectionFields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {sectionFields.map((f) => {
            const id = `custom-field-${f.id}`;
            const value = customValues[f.id] ?? "";
            return (
              <div key={f.id} className={f.field_type === "textarea" ? "sm:col-span-2" : undefined}>
                <Label htmlFor={id}>
                  {f.label}{f.required && <span className="text-destructive"> *</span>}
                </Label>
                {f.field_type === "select" ? (
                  <OptionCombobox
                    id={id}
                    value={value}
                    onChange={(v) => setCustomValue(f.id, v)}
                    options={optionsForSetId(optionSets, f.option_set_id).map((o) => ({ value: o.value, label: o.label }))}
                  />
                ) : f.field_type === "textarea" ? (
                  <Textarea id={id} value={value} onChange={(e) => setCustomValue(f.id, e.target.value)} rows={3} />
                ) : f.field_type === "date" ? (
                  <DateInput id={id} value={value} onChange={(e) => setCustomValue(f.id, e.target.value)} />
                ) : f.field_type === "boolean" ? (
                  <Select value={value} onValueChange={(v) => setCustomValue(f.id, v)}>
                    <SelectTrigger id={id}><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={id}
                    type={f.field_type === "number" ? "number" : "text"}
                    value={value}
                    onChange={(e) => setCustomValue(f.id, e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {sectionTables.map((t) => (
        <div key={t.id} className="space-y-2">
          <h4 className="text-sm font-semibold">{t.label}</h4>
          <RepeatingRows
            idPrefix={`custom-table-${t.id}`}
            columns={t.columns.map((c) => ({
              key: c.id,
              label: c.label,
              type: c.column_type,
              options: optionsForSetId(optionSets, c.option_set_id).map((o) => ({ value: o.value, label: o.label })),
            }))}
            rows={customRows[t.id] ?? []}
            onChange={(rows) => setCustomRows(t.id, rows)}
            addLabel={`Add ${t.label.toLowerCase()} row`}
          />
        </div>
      ))}
    </div>
  );
}

function SectionHeading({ letter, title, note }: { letter: string; title: string; note?: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-base font-semibold tracking-tight">{letter}. {title}</h3>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Sections E to L, rendered as tab panels of the parent form. */
export function BioDataSections({
  staffName,
  staffIdText,
  isNumber,
}: {
  staffName: string;
  staffIdText: string;
  isNumber: string;
}) {
  const {
    education, employment, family, emergency, bank, medical, verifications,
    set, setVerification, canSeeBank, canSeeMedical, optionSets, profileId,
  } = useBioData();

  const relationshipOptions = optionsFor(optionSets, "relationship").map((o) => ({ value: o.value, label: o.label }));
  const qualificationOptions = optionsFor(optionSets, "qualification").map((o) => ({ value: o.value, label: o.label }));
  const reasonOptions = optionsFor(optionSets, "reason_for_leaving").map((o) => ({ value: o.value, label: o.label }));
  const bankOptions = optionsFor(optionSets, "bank").map((o) => ({ value: o.value, label: o.label }));

  const { data: postings = [] } = useQuery({
    queryKey: ["biodata-postings", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("postings_transfers")
        .select("id, type, status, effective_date, remarks, from_department:from_department_id(name), to_department:to_department_id(name)")
        .eq("profile_id", profileId!)
        .order("effective_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const newRecordNote = profileId ? undefined : "Saved with the record — you can fill this in now.";

  return (
    <>
      {/* ── E. Medical & welfare (restricted) ───────────────────────────── */}
      <TabsContent value="E" className="space-y-4">
        <SectionHeading letter="E" title="Medical & welfare information" note="Restricted access — authorised personnel only." />
        {canSeeMedical ? (
          <>
            <div>
              <Label htmlFor="bio-medical">Medical condition(s) / allergy(ies)</Label>
              <Textarea
                id="bio-medical"
                rows={3}
                value={medical.medical_conditions}
                onChange={(e) => set("medical", { ...medical, medical_conditions: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="bio-welfare">Additional medical / welfare notes</Label>
              <Textarea
                id="bio-welfare"
                rows={3}
                value={medical.welfare_notes}
                onChange={(e) => set("medical", { ...medical, welfare_notes: e.target.value })}
              />
            </div>
          </>
        ) : (
          <Alert>
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Restricted section</AlertTitle>
            <AlertDescription>
              Medical and welfare information is only available to authorised personnel.
            </AlertDescription>
          </Alert>
        )}
        <BioDataCustomBlock section="E" />
      </TabsContent>

      {/* ── F. Education ───────────────────────────────────────────────── */}
      <TabsContent value="F" className="space-y-4">
        <SectionHeading letter="F" title="Educational qualifications" note={newRecordNote ?? "Schools / institutions attended."} />
        <RepeatingRows
          idPrefix="bio-education"
          columns={[
            { key: "institution", label: "Name & location of school / institution" },
            { key: "from_date", label: "From", placeholder: "e.g. 2010" },
            { key: "to_date", label: "To", placeholder: "e.g. 2014" },
            { key: "qualification", label: "Qualification", type: "select", options: qualificationOptions },
          ]}
          rows={education}
          onChange={(rows) => set("education", rows)}
          addLabel="Add institution"
        />
        <BioDataCustomBlock section="F" />
      </TabsContent>

      {/* ── G. Previous employment ─────────────────────────────────────── */}
      <TabsContent value="G" className="space-y-4">
        <SectionHeading letter="G" title="Previous employment / work experience" />
        <RepeatingRows
          idPrefix="bio-employment"
          columns={[
            { key: "employer", label: "Organization / employer" },
            { key: "position_held", label: "Position held" },
            { key: "from_date", label: "From", placeholder: "e.g. 2015" },
            { key: "to_date", label: "To", placeholder: "e.g. 2019" },
            { key: "reason_for_leaving", label: "Reason for leaving", type: "select", options: reasonOptions },
          ]}
          rows={employment}
          onChange={(rows) => set("employment", rows)}
          addLabel="Add employer"
        />
        <BioDataCustomBlock section="G" />
      </TabsContent>

      {/* ── H. Family & dependants ─────────────────────────────────────── */}
      <TabsContent value="H" className="space-y-5">
        <SectionHeading letter="H" title="Family & dependant information" note="Marital status and number of children are in the personal sections." />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Spouse information</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="bio-spouse-name">Name of spouse</Label>
              <Input id="bio-spouse-name" value={family.spouse_name} onChange={(e) => set("family", { ...family, spouse_name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="bio-spouse-phone">Telephone</Label>
              <GhanaPhoneInput id="bio-spouse-phone" value={family.spouse_phone} onChange={(v) => set("family", { ...family, spouse_phone: v })} compact />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="bio-spouse-address">Residential address</Label>
              <Input id="bio-spouse-address" value={family.spouse_address} onChange={(e) => set("family", { ...family, spouse_address: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Next of kin</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="bio-nok-name">Name of next of kin</Label>
              <Input id="bio-nok-name" value={family.nok_name} onChange={(e) => set("family", { ...family, nok_name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="bio-nok-rel">Relationship</Label>
              <OptionCombobox
                id="bio-nok-rel"
                value={family.nok_relationship}
                onChange={(v) => set("family", { ...family, nok_relationship: v })}
                options={relationshipOptions}
              />
            </div>
            <div>
              <Label htmlFor="bio-nok-phone">Telephone</Label>
              <GhanaPhoneInput id="bio-nok-phone" value={family.nok_phone} onChange={(v) => set("family", { ...family, nok_phone: v })} compact />
            </div>
            <div>
              <Label htmlFor="bio-nok-address">Address</Label>
              <Input id="bio-nok-address" value={family.nok_address} onChange={(e) => set("family", { ...family, nok_address: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Parents' information</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="bio-father">Father — name</Label>
              <Input id="bio-father" value={family.father_name} onChange={(e) => set("family", { ...family, father_name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="bio-father-phone">Father — telephone</Label>
              <GhanaPhoneInput id="bio-father-phone" value={family.father_phone} onChange={(v) => set("family", { ...family, father_phone: v })} compact />
            </div>
            <div>
              <Label htmlFor="bio-mother">Mother — name</Label>
              <Input id="bio-mother" value={family.mother_name} onChange={(e) => set("family", { ...family, mother_name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="bio-mother-phone">Mother — telephone</Label>
              <GhanaPhoneInput id="bio-mother-phone" value={family.mother_phone} onChange={(v) => set("family", { ...family, mother_phone: v })} compact />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Emergency contacts</h4>
          <RepeatingRows
            idPrefix="bio-emergency"
            columns={[
              { key: "name", label: "Name" },
              { key: "relationship", label: "Relationship", type: "select", options: relationshipOptions },
              { key: "phone", label: "Telephone" },
              { key: "address", label: "Address" },
            ]}
            rows={emergency}
            onChange={(rows) => set("emergency", rows)}
            addLabel="Add emergency contact"
          />
        </div>
        <BioDataCustomBlock section="H" />
      </TabsContent>

      {/* ── I. Bank / salary (restricted) ───────────────────────────────── */}
      <TabsContent value="I" className="space-y-4">
        <SectionHeading letter="I" title="Bank / salary information" note="Restricted access — Finance / HR authorised personnel only." />
        {canSeeBank ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="bio-bank">Bank name</Label>
              <OptionCombobox
                id="bio-bank"
                value={bank.bank_name}
                onChange={(v) => set("bank", { ...bank, bank_name: v })}
                options={bankOptions}
              />
            </div>
            <div>
              <Label htmlFor="bio-branch">Branch</Label>
              <Input id="bio-branch" value={bank.branch} onChange={(e) => set("bank", { ...bank, branch: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="bio-account">Account number</Label>
              <Input
                id="bio-account"
                inputMode="numeric"
                value={bank.account_number}
                onChange={(e) => set("bank", { ...bank, account_number: e.target.value.replace(/[^\d\s-]/g, "") })}
              />
            </div>
          </div>
        ) : (
          <Alert>
            <Lock className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Restricted section</AlertTitle>
            <AlertDescription>
              Bank and salary details are only available to Finance / HR authorised personnel.
            </AlertDescription>
          </Alert>
        )}
        <BioDataCustomBlock section="I" />
      </TabsContent>

      {/* ── J. Service / transfer history (read-only) ───────────────────── */}
      <TabsContent value="J" className="space-y-4">
        <SectionHeading
          letter="J"
          title="Service / transfer history"
          note="Maintained on the Postings & Transfers screen so it is never entered twice."
        />
        {!profileId ? (
          <p className="text-sm text-muted-foreground">Available once the record is saved.</p>
        ) : postings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posting or transfer recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm" style={{ minWidth: 700 }}>
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">No.</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">From station / command</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">To station / command</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Type</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Effective date</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(postings as any[]).map((p, i) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2">{p.from_department?.name ?? "—"}</td>
                    <td className="px-3 py-2">{p.to_department?.name ?? "—"}</td>
                    <td className="px-3 py-2 capitalize">{p.type}</td>
                    <td className="px-3 py-2">{p.effective_date ? format(new Date(p.effective_date), "dd/MM/yyyy") : "—"}</td>
                    <td className="px-3 py-2"><Badge variant="secondary" className="capitalize">{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link to="/postings">
            <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> Open postings & transfers
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        </Button>
        <BioDataCustomBlock section="J" />
      </TabsContent>

      {/* ── K. Staff declaration ───────────────────────────────────────── */}
      <TabsContent value="K" className="space-y-4">
        <SectionHeading letter="K" title="Official verification — declaration by staff member" />
        <p className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
          I certify that the information provided in this Bio-Data and Service Record Form is true,
          complete and accurate to the best of my knowledge. I understand that any material false
          statement or omission may be subject to administrative action in accordance with applicable
          Service regulations.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="bio-decl-name">Staff name</Label>
            <Input
              id="bio-decl-name"
              value={verifications.declaration.name || staffName}
              onChange={(e) => setVerification("declaration", { name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="bio-decl-id">Staff ID / IS No.</Label>
            <Input
              id="bio-decl-id"
              value={verifications.declaration.rank_position || [staffIdText, isNumber].filter(Boolean).join(" / ")}
              onChange={(e) => setVerification("declaration", { rank_position: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="bio-decl-sign">Signature (type full name to sign)</Label>
            <Input
              id="bio-decl-sign"
              value={verifications.declaration.signature}
              onChange={(e) => setVerification("declaration", { signature: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="bio-decl-date">Date</Label>
            <DateInput
              id="bio-decl-date"
              value={verifications.declaration.signed_on}
              onChange={(e) => setVerification("declaration", { signed_on: e.target.value })}
            />
          </div>
        </div>
        <BioDataCustomBlock section="K" />
      </TabsContent>

      {/* ── L. Command / HR verification ────────────────────────────────── */}
      <TabsContent value="L" className="space-y-4">
        <SectionHeading letter="L" title="Command / HR verification" note="Each sign-off is stamped with the signed-in user." />
        <div className="space-y-4">
          {(["checked", "verified", "approved"] as const).map((kind) => (
            <div key={kind} className="rounded-lg border p-3 space-y-3">
              <h4 className="text-sm font-semibold capitalize">{kind} by</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`bio-${kind}-name`}>Name</Label>
                  <Input
                    id={`bio-${kind}-name`}
                    value={verifications[kind].name}
                    onChange={(e) => setVerification(kind, { name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`bio-${kind}-rank`}>Rank / position</Label>
                  <Input
                    id={`bio-${kind}-rank`}
                    value={verifications[kind].rank_position}
                    onChange={(e) => setVerification(kind, { rank_position: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`bio-${kind}-sign`}>Signature</Label>
                  <Input
                    id={`bio-${kind}-sign`}
                    value={verifications[kind].signature}
                    onChange={(e) => setVerification(kind, { signature: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`bio-${kind}-date`}>Date</Label>
                  <DateInput
                    id={`bio-${kind}-date`}
                    value={verifications[kind].signed_on}
                    onChange={(e) => setVerification(kind, { signed_on: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <BioDataCustomBlock section="L" />
      </TabsContent>
    </>
  );
}
