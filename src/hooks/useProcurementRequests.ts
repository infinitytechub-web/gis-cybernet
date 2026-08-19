/**
 * COMMAND CONSOLE PROCUREMENT data services.
 *
 * Lifecycle: draft → submitted → approved | rejected → partial → received.
 * Every transition goes through a security-definer RPC so the status change and
 * its audit entry are written together and the storekeeper-tier check happens
 * on the server. Photos live in the private `procurement-photos` bucket and are
 * only ever read through short-lived signed URLs.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const PROCUREMENT_PHOTO_BUCKET = "procurement-photos";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Roles allowed to approve and receive — mirrors `can_manage_procurement()`. */
export const STOREKEEPER_TIER = [
  "admin",
  "oic",
  "2ic",
  "procurement_officer",
  "storekeeper",
] as const;

export const PROCUREMENT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export type ProcurementStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "partial"
  | "received"
  | "cancelled";

export interface ProcurementItem {
  id: string;
  requisition_id: string;
  item_name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  estimated_unit_cost: number | null;
  received_qty: number;
  /** Optional link to a stock item — receipts then top up its quantity on hand. */
  inventory_item_id: string | null;
}

export interface ProcurementRequest {
  id: string;
  pr_number: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  estimated_cost: number | null;
  needed_by: string | null;
  notes: string | null;
  rejection_reason: string | null;
  receive_notes: string | null;
  requested_by: string;
  approved_by: string | null;
  approved_at: string | null;
  received_by: string | null;
  received_at: string | null;
  submitted_at: string | null;
  created_at: string;
  items: ProcurementItem[];
}

export interface ProcurementEvent {
  id: string;
  requisition_id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface ProcurementPhoto {
  id: string;
  requisition_id: string;
  storage_path: string;
  caption: string | null;
  kind: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
  signedUrl: string | null;
}

const REQ_COLS =
  "id, pr_number, title, description, priority, status, estimated_cost, needed_by, notes, rejection_reason, receive_notes, requested_by, approved_by, approved_at, received_by, received_at, submitted_at, created_at";

export function isProcurementOpen(status: string) {
  return !["received", "rejected", "cancelled"].includes((status ?? "").toLowerCase());
}

export function useIsStorekeeperTier() {
  const { role } = useAuth();
  return STOREKEEPER_TIER.includes(role as (typeof STOREKEEPER_TIER)[number]);
}

/** Requests visible to the signed-in user (RLS decides: own, or tier-wide). */
export function useProcurementRequests(days = 180, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["procurement-requests", days],
    enabled: enabled && !!user,
    staleTime: 20_000,
    queryFn: async (): Promise<ProcurementRequest[]> => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("purchase_requisitions")
        .select(REQ_COLS)
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const reqs = (data ?? []) as Omit<ProcurementRequest, "items">[];
      if (reqs.length === 0) return [];

      const { data: items, error: itemsErr } = await supabase
        .from("purchase_requisition_items")
        .select("id, requisition_id, item_name, description, quantity, unit, estimated_unit_cost, received_qty")
        .in("requisition_id", reqs.map((r) => r.id));
      if (itemsErr) throw itemsErr;

      const byReq = new Map<string, ProcurementItem[]>();
      for (const it of (items ?? []) as ProcurementItem[]) {
        const list = byReq.get(it.requisition_id) ?? [];
        list.push(it);
        byReq.set(it.requisition_id, list);
      }
      return reqs.map((r) => ({ ...r, items: byReq.get(r.id) ?? [] }));
    },
  });
}

export function useProcurementTrail(requisitionId: string | null) {
  return useQuery({
    queryKey: ["procurement-trail", requisitionId],
    enabled: !!requisitionId,
    queryFn: async (): Promise<ProcurementEvent[]> => {
      const { data, error } = await supabase
        .from("procurement_request_events")
        .select("id, requisition_id, action, from_status, to_status, note, actor_id, actor_name, created_at")
        .eq("requisition_id", requisitionId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProcurementEvent[];
    },
  });
}

export function useProcurementPhotos(requisitionId: string | null) {
  return useQuery({
    queryKey: ["procurement-photos", requisitionId],
    enabled: !!requisitionId,
    queryFn: async (): Promise<ProcurementPhoto[]> => {
      const { data, error } = await supabase
        .from("procurement_request_photos")
        .select("id, requisition_id, storage_path, caption, kind, content_type, size_bytes, uploaded_by, created_at")
        .eq("requisition_id", requisitionId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Omit<ProcurementPhoto, "signedUrl">[];
      if (rows.length === 0) return [];
      const { data: signed } = await supabase.storage
        .from(PROCUREMENT_PHOTO_BUCKET)
        .createSignedUrls(rows.map((r) => r.storage_path), 600);
      return rows.map((r, i) => ({ ...r, signedUrl: signed?.[i]?.signedUrl ?? null }));
    },
  });
}

export function validateProcurementPhoto(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `${file.name}: only JPEG, PNG or WebP photos are accepted`;
  }
  if (file.size > MAX_PHOTO_BYTES) return `${file.name}: larger than the 10 MB limit`;
  return null;
}

export interface NewRequestInput {
  title: string;
  description?: string;
  priority: string;
  needed_by?: string | null;
  notes?: string;
  items: { item_name: string; quantity: number; unit: string; estimated_unit_cost: number }[];
  photos?: File[];
  submit?: boolean;
}

export function useCreateProcurementRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: NewRequestInput) => {
      if (!user) throw new Error("Not authenticated");
      const estimated = input.items.reduce(
        (s, i) => s + (Number(i.quantity) || 0) * (Number(i.estimated_unit_cost) || 0),
        0,
      );
      const { data: req, error } = await supabase
        .from("purchase_requisitions")
        .insert({
          pr_number: `PR-${Date.now().toString().slice(-8)}`,
          title: input.title,
          description: input.description || null,
          priority: input.priority,
          needed_by: input.needed_by || null,
          notes: input.notes || null,
          estimated_cost: estimated,
          requested_by: user.id,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;

      if (input.items.length > 0) {
        const { error: itemsErr } = await supabase.from("purchase_requisition_items").insert(
          input.items.map((i) => ({
            requisition_id: req.id,
            item_name: i.item_name,
            quantity: i.quantity,
            unit: i.unit || "pcs",
            estimated_unit_cost: i.estimated_unit_cost || 0,
          })),
        );
        if (itemsErr) throw itemsErr;
      }

      if (input.photos?.length) {
        await uploadProcurementPhotos(req.id, input.photos, "request", user.id);
      }

      if (input.submit) {
        const { error: subErr } = await supabase.rpc("procurement_request_submit", {
          _requisition_id: req.id,
          _note: "Request raised from the Command Console",
        });
        if (subErr) throw subErr;
      }
      return req.id as string;
    },
    onSuccess: () => invalidate(qc),
  });
}

async function uploadProcurementPhotos(
  requisitionId: string,
  files: File[],
  kind: string,
  uploaderId: string,
) {
  for (const file of files) {
    const problem = validateProcurementPhoto(file);
    if (problem) throw new Error(problem);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${requisitionId}/${kind}-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(PROCUREMENT_PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;
    const { error: rowErr } = await supabase.from("procurement_request_photos").insert({
      requisition_id: requisitionId,
      storage_path: path,
      kind,
      content_type: file.type,
      size_bytes: file.size,
      uploaded_by: uploaderId,
    });
    if (rowErr) throw rowErr;
  }
}

export function useUploadProcurementPhotos() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      requisitionId,
      files,
      kind = "request",
    }: { requisitionId: string; files: File[]; kind?: string }) => {
      if (!user) throw new Error("Not authenticated");
      await uploadProcurementPhotos(requisitionId, files, kind, user.id);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["procurement-photos", v.requisitionId] });
    },
  });
}

export function useDeleteProcurementPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photo: ProcurementPhoto) => {
      const { error } = await supabase.from("procurement_request_photos").delete().eq("id", photo.id);
      if (error) throw error;
      await supabase.storage.from(PROCUREMENT_PHOTO_BUCKET).remove([photo.storage_path]);
    },
    onSuccess: (_d, photo) => {
      qc.invalidateQueries({ queryKey: ["procurement-photos", photo.requisition_id] });
    },
  });
}

export function useSubmitProcurementRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const { error } = await supabase.rpc("procurement_request_submit", {
        _requisition_id: id,
        _note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidate(qc, v.id),
  });
}

export function useDecideProcurementRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approve, note }: { id: string; approve: boolean; note?: string }) => {
      const { error } = await supabase.rpc("procurement_request_decide", {
        _requisition_id: id,
        _approve: approve,
        _note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidate(qc, v.id),
  });
}

export function useReceiveProcurementRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      items,
      note,
      photos,
    }: {
      id: string;
      items: { id: string; received_qty: number }[];
      note?: string;
      photos?: File[];
    }) => {
      if (photos?.length && user) await uploadProcurementPhotos(id, photos, "receipt", user.id);
      const { data, error } = await supabase.rpc("procurement_request_receive", {
        _requisition_id: id,
        _items: items,
        _note: note || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_d, v) => invalidate(qc, v.id),
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: ["procurement-requests"] });
  qc.invalidateQueries({ queryKey: ["command-console"] });
  if (id) {
    qc.invalidateQueries({ queryKey: ["procurement-trail", id] });
    qc.invalidateQueries({ queryKey: ["procurement-photos", id] });
  }
}
