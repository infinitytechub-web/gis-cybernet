import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { LogIn, LogOut, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export function CheckInOut() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const today = new Date().toISOString().split("T")[0];

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, staff_id, shift_group")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: todayRecord, isLoading } = useQuery({
    queryKey: ["my-attendance", today, profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendances")
        .select("*")
        .eq("profile_id", profile!.id)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const { error } = await supabase.from("attendances").insert({
        profile_id: profile!.id,
        date: today,
        check_in: now,
        status: "present",
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setNotes("");
      toast.success("Checked in successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("attendances")
        .update({ check_out: now, notes: notes || todayRecord?.notes || null })
        .eq("id", todayRecord!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setNotes("");
      toast.success("Checked out successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const hasCheckedIn = !!todayRecord?.check_in;
  const hasCheckedOut = !!todayRecord?.check_out;

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>;
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-secondary">
          <Clock className="h-5 w-5 text-primary" />
          My Attendance — {format(new Date(), "PPP")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status display */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-sm text-muted-foreground">
            Staff: <span className="font-medium text-foreground">{profile?.first_name} {profile?.last_name}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Shift: <Badge variant="outline">{profile?.shift_group ?? "—"}</Badge>
          </div>
          {todayRecord && (
            <Badge variant="secondary" className={
              todayRecord.status === "present" ? "bg-emerald-100 text-emerald-800" :
              todayRecord.status === "late" ? "bg-amber-100 text-amber-800" :
              "bg-muted text-muted-foreground"
            }>
              {todayRecord.status}
            </Badge>
          )}
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-muted p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Check In</div>
            <div className="text-lg font-semibold text-foreground">
              {todayRecord?.check_in ? format(new Date(todayRecord.check_in), "HH:mm:ss") : "—"}
            </div>
          </div>
          <div className="rounded-lg bg-muted p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Check Out</div>
            <div className="text-lg font-semibold text-foreground">
              {todayRecord?.check_out ? format(new Date(todayRecord.check_out), "HH:mm:ss") : "—"}
            </div>
          </div>
        </div>

        {/* Notes */}
        {!hasCheckedOut && (
          <Textarea
            placeholder="Add notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="resize-none"
            rows={2}
          />
        )}

        {/* Action buttons */}
        {!hasCheckedIn ? (
          <Button
            onClick={() => checkInMutation.mutate()}
            disabled={checkInMutation.isPending}
            className="w-full gap-2"
            size="lg"
          >
            <LogIn className="h-5 w-5" />
            {checkInMutation.isPending ? "Checking in..." : "Check In"}
          </Button>
        ) : !hasCheckedOut ? (
          <Button
            onClick={() => checkOutMutation.mutate()}
            disabled={checkOutMutation.isPending}
            variant="destructive"
            className="w-full gap-2"
            size="lg"
          >
            <LogOut className="h-5 w-5" />
            {checkOutMutation.isPending ? "Checking out..." : "Check Out"}
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-emerald-600 py-2">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Attendance completed for today</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
