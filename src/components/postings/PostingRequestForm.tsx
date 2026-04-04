import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type TransferType = Database["public"]["Enums"]["transfer_type"];

export function PostingRequestForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState<TransferType>("posting");
  const [toDeptId, setToDeptId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [remarks, setRemarks] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, department_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profile not found");
      if (!toDeptId || !effectiveDate) throw new Error("Fill required fields");
      const { error } = await supabase.from("postings_transfers").insert({
        profile_id: profile.id,
        type,
        from_department_id: profile.department_id,
        to_department_id: toDeptId,
        effective_date: effectiveDate,
        remarks: remarks || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["postings-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["my-postings"] });
      setToDeptId("");
      setEffectiveDate("");
      setRemarks("");
      toast.success("Request submitted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-secondary">
          <ArrowRightLeft className="h-5 w-5 text-primary" />
          Request Posting / Transfer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as TransferType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="posting">Posting</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>To Department</Label>
          <Select value={toDeptId} onValueChange={setToDeptId}>
            <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Effective Date</Label>
          <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        </div>
        <div>
          <Label>Remarks</Label>
          <Textarea placeholder="Additional remarks..." value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !toDeptId || !effectiveDate} className="w-full">
          {mutation.isPending ? "Submitting..." : "Submit Request"}
        </Button>
      </CardContent>
    </Card>
  );
}
