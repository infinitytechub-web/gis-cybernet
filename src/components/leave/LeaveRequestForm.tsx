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
import { Send } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { SecureAttachmentField } from "@/components/shared/SecureAttachmentField";
import { DateInput } from "@/components/ui/date-input";

type LeaveType = Database["public"]["Enums"]["leave_type"];

export function LeaveRequestForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState<LeaveType>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profile not found");
      if (!startDate || !endDate) throw new Error("Please select dates");
      if (new Date(endDate) < new Date(startDate)) throw new Error("End date must be after start date");

      const { error } = await supabase.from("leave_requests").insert({
        profile_id: profile.id,
        type,
        start_date: startDate,
        end_date: endDate,
        reason: reason || null,
        attachment_path: attachmentPath,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
      setStartDate("");
      setEndDate("");
      setReason("");
      setAttachmentPath(null);
      toast.success("Leave request submitted successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-secondary">
          <Send className="h-5 w-5 text-primary" />
          Submit Leave / Pass Request
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="annual">Annual Leave</SelectItem>
              <SelectItem value="sick">Sick Leave</SelectItem>
              <SelectItem value="compassionate">Compassionate Leave</SelectItem>
              <SelectItem value="pass">Pass</SelectItem>
              <SelectItem value="study">Study Leave</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start Date</Label>
            <DateInput  value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>End Date</Label>
            <DateInput  value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} />
          </div>
        </div>
        <div>
          <Label>Reason</Label>
          <Textarea
            placeholder="Briefly describe the reason..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <SecureAttachmentField value={attachmentPath} onChange={setAttachmentPath} />
        
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !startDate || !endDate}
          className="w-full gap-2"
        >
          <Send className="h-4 w-4" />
          {mutation.isPending ? "Submitting..." : "Submit Request"}
        </Button>
      </CardContent>
    </Card>
  );
}
