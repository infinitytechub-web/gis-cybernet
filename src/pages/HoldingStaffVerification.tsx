import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, ShieldCheck, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePagedList } from "@/hooks/usePagedList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ListPagination } from "@/components/ui/list-pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { uploadPhoto } from "@/lib/image-upload";
import { formatDateTime } from "@/lib/date-format";
import { canReviewVerification, validateVerificationSubmission, type VerificationDecision } from "@/lib/holding-verification";
import type { Tables } from "@/integrations/supabase/types";

type Request = Tables<"holding_staff_verifications">;
const BUCKET = "holding-staff-verification";

export default function HoldingStaffVerification() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [review, setReview] = useState<Request | null>(null);
  const [reason, setReason] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const requests = useQuery({
    queryKey: ["holding-verifications", user?.id], enabled: !!user, refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.from("holding_staff_verifications").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    setPhotoUrl(null); setPhotoError(""); setPhotoLoaded(false);
    if (!review) return;
    let active = true;
    supabase.storage.from(BUCKET).createSignedUrl(review.photo_path, 60).then(({ data, error }) => {
      if (!active) return;
      if (error) setPhotoError("Could not load the submitted photo. Approval is blocked.");
      else setPhotoUrl(data?.signedUrl ?? null);
    });
    return () => { active = false; };
  }, [review]);
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["holding-verifications"] }), qc.invalidateQueries({ queryKey: ["rbac", "holding-verification"] })]);
  };
  const submit = useMutation({
    mutationFn: async () => {
      const problem = validateVerificationSubmission(staffId, !!photo);
      if (problem) throw new Error(problem);
      if (!user || !photo) throw new Error("Sign in and select a photo.");
      const path = await uploadPhoto({ file: photo, bucket: BUCKET, pathBase: `${user.id}/${crypto.randomUUID()}`, upsert: false });
      const { error } = await supabase.rpc("submit_holding_staff_verification", { _staff_id: staffId.trim(), _photo_path: path });
      if (error) { await supabase.storage.from(BUCKET).remove([path]); throw error; }
    },
    onSuccess: async () => { setPhoto(null); setStaffId(""); await refresh(); toast({ title: "Verification submitted" }); },
    onError: (error: Error) => toast({ title: "Submission failed", description: error.message, variant: "destructive" }),
  });
  const decide = useMutation({
    mutationFn: async (decision: VerificationDecision) => {
      if (!review || !user || !canReviewVerification(role, user.id, review.user_id, review.status, decision)) throw new Error("Review is not permitted.");
      if (!reason.trim()) throw new Error("Enter a review reason.");
      if (decision === "approved" && !photoLoaded) throw new Error("The submitted photo must load before approval.");
      const { error } = await supabase.rpc("review_holding_staff_verification", { _id: review.id, _decision: decision, _reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: async () => { setReview(null); setReason(""); await refresh(); toast({ title: "Verification decision saved" }); },
    onError: (error: Error) => toast({ title: "Review failed", description: error.message, variant: "destructive" }),
  });
  const mine = requests.data?.find((r) => r.user_id === user?.id && ["pending", "approved"].includes(r.status));
  const filtered = (requests.data ?? []).filter((r) => `${r.submitted_staff_id} ${r.status}`.toLowerCase().includes(search.toLowerCase()));
  const pages = usePagedList(filtered, { resetKey: search });
  return <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
    <header className="flex items-center gap-3"><ShieldCheck className="h-7 w-7 text-primary" aria-hidden="true" /><h1 className="text-2xl font-bold">Holding Center staff verification</h1></header>
    {requests.isLoading && <p role="status">Loading verification requests…</p>}
    {requests.error && <div role="alert" className="text-destructive">Could not load verification requests. <Button variant="outline" onClick={() => requests.refetch()}>Retry</Button></div>}
    {mine ? <section className="space-y-3 border-b pb-5"><Badge variant={mine.status === "approved" ? "default" : "secondary"}>{mine.status === "approved" ? "Approved · Command read access" : "Pending administrator review"}</Badge><p className="text-sm text-muted-foreground">Submitted {formatDateTime(mine.created_at)}</p>{mine.status === "approved" && <Button asChild><Link to="/command-operations?tab=holding">Open Holding Center</Link></Button>}</section> : <form className="grid max-w-xl gap-4 border-b pb-6" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
      <h2 className="text-lg font-semibold">Submit verification</h2>
      <div className="space-y-2"><Label htmlFor="verification-staff-id">Registered Staff ID</Label><Input id="verification-staff-id" value={staffId} onChange={(e) => setStaffId(e.target.value)} required autoComplete="off" maxLength={100} /></div>
      <div className="space-y-2"><Label htmlFor="verification-photo">Staff photo</Label><Input id="verification-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} required className="h-auto" /><p className="text-xs text-muted-foreground">JPG, PNG or WEBP · under 3 MB</p></div>
      {preview && <img src={preview} alt="Selected staff photo" className="h-40 w-32 rounded-md border object-contain" />}
      <Button type="submit" disabled={submit.isPending || requests.isLoading || !!requests.error}><Upload className="mr-2 h-4 w-4" />{submit.isPending ? "Submitting…" : "Submit for verification"}</Button>
    </form>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">{role === "admin" ? "Verification review" : "My verification history"}</h2><Input aria-label="Search verification requests" placeholder="Search Staff ID or status…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      {!requests.isLoading && !requests.error && !filtered.length && <p className="text-muted-foreground">No verification requests.</p>}
      <ul className="divide-y">{pages.pageItems.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words font-medium">{r.submitted_staff_id}</p><p className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}{r.reviewed_at ? ` · Reviewed ${formatDateTime(r.reviewed_at)}` : ""}</p>{r.review_reason && <p className="mt-1 break-words text-sm">{r.review_reason}</p>}</div><div className="flex items-center gap-2"><Badge variant={r.status === "approved" ? "default" : "secondary"}>{r.status}</Badge>{role === "admin" && r.user_id !== user?.id && ["pending", "approved"].includes(r.status) && <Button variant="outline" onClick={() => { setReview(r); setReason(""); }}>Review</Button>}</div></li>)}</ul><ListPagination {...pages} label="verification requests" />
    </section>
    <Dialog open={!!review} onOpenChange={(open) => { if (!open && !decide.isPending) setReview(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Review staff identity</DialogTitle></DialogHeader>{review && <div className="space-y-4"><p className="break-words font-semibold">Staff ID: {review.submitted_staff_id}</p>{photoError ? <p role="alert" className="text-destructive">{photoError}</p> : photoUrl ? <img src={photoUrl} alt="Submitted staff verification photo" className="h-64 w-full rounded-md border object-contain" onLoad={() => setPhotoLoaded(true)} onError={() => { setPhotoLoaded(false); setPhotoUrl(null); setPhotoError("Photo could not be displayed. Approval is blocked."); }} /> : <p role="status">Loading private photo…</p>}<Label htmlFor="verification-reason">Review reason</Label><Textarea id="verification-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} /><div className="flex flex-wrap gap-2">{review.status === "pending" ? <><Button disabled={decide.isPending || !reason.trim() || !photoLoaded} onClick={() => decide.mutate("approved")}><Check className="mr-2 h-4 w-4" />Approve Command read access</Button><Button variant="destructive" disabled={decide.isPending || !reason.trim()} onClick={() => decide.mutate("rejected")}><X className="mr-2 h-4 w-4" />Reject</Button></> : <Button variant="destructive" disabled={decide.isPending || !reason.trim()} onClick={() => decide.mutate("revoked")}>Revoke access</Button>}</div></div>}</DialogContent></Dialog>
  </div>;
}