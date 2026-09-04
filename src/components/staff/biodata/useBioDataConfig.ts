/**
 * Configuration behind the Personnel Bio-Data & Service Record form.
 *
 * Everything here is data-driven so an administrator can change the dropdown
 * option lists, add extra fields and add extra repeating tables without a code
 * change. Reads are open to signed-in users; only administrators can write
 * (enforced by row level security on the biodata_* tables).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BioOption = { id: string; value: string; label: string; sort_order: number; active: boolean };
export type BioOptionSet = { id: string; key: string; label: string; description: string | null; options: BioOption[] };

export type BioCustomField = {
  id: string;
  section: string;
  label: string;
  field_type: "text" | "number" | "date" | "select" | "boolean" | "textarea";
  option_set_id: string | null;
  required: boolean;
  sort_order: number;
  active: boolean;
};

export type BioCustomColumn = {
  id: string;
  table_id: string;
  label: string;
  column_type: "text" | "number" | "date" | "select" | "boolean";
  option_set_id: string | null;
  required: boolean;
  sort_order: number;
};

export type BioCustomTable = {
  id: string;
  section: string;
  label: string;
  sort_order: number;
  active: boolean;
  columns: BioCustomColumn[];
};

/** All admin-managed dropdown lists, keyed by their stable key. */
export function useBioDataOptionSets() {
  return useQuery({
    queryKey: ["biodata-option-sets"],
    queryFn: async (): Promise<BioOptionSet[]> => {
      const [{ data: sets, error: e1 }, { data: options, error: e2 }] = await Promise.all([
        supabase.from("biodata_option_sets").select("*").order("label"),
        supabase.from("biodata_options").select("*").order("sort_order"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return (sets ?? []).map((s) => ({
        ...s,
        options: (options ?? []).filter((o) => o.set_id === s.id) as BioOption[],
      })) as BioOptionSet[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Options for one list, active entries only. */
export function optionsFor(sets: BioOptionSet[] | undefined, key: string): BioOption[] {
  return (sets ?? []).find((s) => s.key === key)?.options.filter((o) => o.active) ?? [];
}

export function optionsForSetId(sets: BioOptionSet[] | undefined, setId: string | null): BioOption[] {
  if (!setId) return [];
  return (sets ?? []).find((s) => s.id === setId)?.options.filter((o) => o.active) ?? [];
}

/** Admin-defined extra fields, grouped per form section (A…L). */
export function useBioDataCustomFields() {
  return useQuery({
    queryKey: ["biodata-custom-fields"],
    queryFn: async (): Promise<BioCustomField[]> => {
      const { data, error } = await supabase
        .from("biodata_custom_fields")
        .select("*")
        .order("section")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as BioCustomField[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Admin-defined extra repeating tables with their columns. */
export function useBioDataCustomTables() {
  return useQuery({
    queryKey: ["biodata-custom-tables"],
    queryFn: async (): Promise<BioCustomTable[]> => {
      const [{ data: tables, error: e1 }, { data: cols, error: e2 }] = await Promise.all([
        supabase.from("biodata_custom_tables").select("*").order("section").order("sort_order"),
        supabase.from("biodata_custom_columns").select("*").order("sort_order"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return (tables ?? []).map((t) => ({
        ...t,
        columns: (cols ?? []).filter((c) => c.table_id === t.id) as BioCustomColumn[],
      })) as BioCustomTable[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** The lettered sections of the form, in the official order. */
export const BIODATA_SECTIONS = [
  { key: "A", label: "Form administration" },
  { key: "B", label: "Personal identification" },
  { key: "C", label: "Residential & contact" },
  { key: "D", label: "Physical & personal" },
  { key: "E", label: "Medical & welfare" },
  { key: "F", label: "Education" },
  { key: "G", label: "Previous employment" },
  { key: "H", label: "Family & dependants" },
  { key: "I", label: "Bank / salary" },
  { key: "J", label: "Service / transfer history" },
  { key: "K", label: "Staff declaration" },
  { key: "L", label: "Command / HR verification" },
] as const;
