import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const LEAVE_TYPES = ["annual", "sick", "compassionate", "pass", "study"] as const;

interface Props {
  request: any | null;
  onClose: () => void;
}

/**
 * Edit a leave / pass request. Only offered to authorised command-tier users;
 * the database additionally rejects detail changes once a request is no longer
 * pending (non-admins), and every saved change is written to the approval
 * audit trail by trigger.
 */
export function LeaveEditDialog({ request, onClose }: Props) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [comments, setComments] = useState("");

  useEffect(() => {
    if (!request) return;
    setType(request.type ?? "annual");
    setStartDate(request.start_date ?? "");
    setEndDate(request.end_date ?? "");
    setReason(request.reason ?? "");
    setComments(request.comments ?? "");
  }, [request]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!request) return;
      if (!startDate || !endDate) throw new Error("Start and end dates are required.");
      if (new Date(endDate) < new Date(startDate)) throw new Error("End date cannot be before the start date.");
      const { error } = await supabase
        .from("leave_requests")
        .update({
          type: type as any,
          start_date: startDate,
          end_date: endDate,
          reason: reason || null,
          comments: comments || null,
        })
        .eq("id", request.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-admin-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["approval-audit"] });
      toast.success("Leave request updated");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  return (
    <Dialog open={!!request} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Leave / Pass Request</DialogTitle>
          <DialogDescription>
            The request stays pending after an edit. All changes are recorded in the audit trail.
          </DialogDescription>
        </DialogHeader>
        {request && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {request.profiles?.last_name}, {request.profiles?.first_name} · {request.profiles?.staff_id}
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="leave-edit-start">Start date</Label>
                <Input id="leave-edit-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="leave-edit-end">End date</Label>
                <Input id="leave-edit-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="leave-edit-reason">Reason</Label>
              <Textarea id="leave-edit-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="leave-edit-comments">Officer comments</Label>
              <Textarea id="leave-edit-comments" rows={2} value={comments} onChange={(e) => setComments(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
