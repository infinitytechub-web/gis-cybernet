import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, User, CalendarCheck, CalendarOff, ArrowRightLeft, Shield, Phone, Building2, Award, FolderLock, MapPin, Pencil, Check, X } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import type { ProfileWithRelations } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { StaffDocumentVault } from "@/components/staff/StaffDocumentVault";
import { useState } from "react";
import { toast } from "sonner";
import { logAdminAudit } from "@/lib/admin-audit";

import { getSignedPhotoUrl } from "@/lib/photo-utils";

async function getPhotoUrl(path: string | null) {
  return getSignedPhotoUrl(path);
}

const statusColor = (s: string) => {
  switch (s) {
    case "active": case "present": case "approved": return "bg-emerald-100 text-emerald-800";
    case "inactive": case "absent": case "rejected": return "bg-red-100 text-red-800";
    case "late": case "pending": case "study_leave": return "bg-amber-100 text-amber-800";
    default: return "bg-muted text-muted-foreground";
  }
};

export default function StaffProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "attendance";
  const { user, role, isAdminOrSupervisor } = useAuth();
  const queryClient = useQueryClient();
  const canEditOffice = isAdminOrSupervisor;

  const [editingOffice, setEditingOffice] = useState(false);
  const [officeDraft, setOfficeDraft] = useState("");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["staff-profile", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, ranks(*), departments(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      const p = data as any;
      p._photoUrl = await getPhotoUrl(p.photo_url);
      return p as ProfileWithRelations;
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["staff-attendance", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendances")
        .select("*")
        .eq("profile_id", id!)
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["staff-leave", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("profile_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: postings = [] } = useQuery({
    queryKey: ["staff-postings", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("postings_transfers")
        .select("*, from_dept:departments!postings_transfers_from_department_id_fkey(name), to_dept:departments!postings_transfers_to_department_id_fkey(name)")
        .eq("profile_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-muted-foreground">Staff member not found</p>
        <Button variant="outline" onClick={() => navigate("/staff")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Staff
        </Button>
      </div>
    );
  }

  const initials = `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase();

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/staff")} className="gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to Staff
      </Button>

      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <Avatar className="h-24 w-24 border-2 border-border">
              <AvatarImage src={(profile as any)._photoUrl ?? undefined} />
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-3">
              <div>
                <h1 className="text-2xl font-bold text-secondary">
                  {profile.ranks?.abbreviation ? `${profile.ranks.abbreviation} ` : ""}{profile.last_name}, {profile.first_name}
                </h1>
                <p className="text-sm text-muted-foreground font-mono">{profile.staff_id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className={statusColor(profile.status)}>{profile.status}</Badge>
                {profile.shift_group && <Badge variant="outline">Shift {profile.shift_group}</Badge>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Award className="h-4 w-4 text-primary" />
                  <span>{profile.ranks?.name ?? "No rank"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span>{profile.departments?.name ?? "No department"}</span>
                </div>
                {profile.unit && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Shield className="h-4 w-4 text-primary" />
                    <span>{profile.unit}</span>
                  </div>
                )}
                {(profile as any).office && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span>{(profile as any).office}</span>
                  </div>
                )}
                {profile.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 text-primary" />
                    <span>{profile.phone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue={initialTab}>
        <TabsList className="w-full justify-start flex-wrap h-auto">
          <TabsTrigger value="attendance" className="gap-1"><CalendarCheck className="h-4 w-4" /> Attendance</TabsTrigger>
          <TabsTrigger value="leave" className="gap-1"><CalendarOff className="h-4 w-4" /> Leave</TabsTrigger>
          <TabsTrigger value="postings" className="gap-1"><ArrowRightLeft className="h-4 w-4" /> Postings</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1"><FolderLock className="h-4 w-4" /> Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Attendance Records (Last 50)</CardTitle>
            </CardHeader>
            <CardContent>
              {attendance.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">No attendance records</p>
              ) : (
                <div className="rounded-lg border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Check In</TableHead>
                        <TableHead>Check Out</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden md:table-cell">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendance.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>{format(new Date(a.date), "dd MMM yyyy")}</TableCell>
                          <TableCell>{a.check_in ? format(new Date(a.check_in), "HH:mm") : "—"}</TableCell>
                          <TableCell>{a.check_out ? format(new Date(a.check_out), "HH:mm") : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={statusColor(a.status)}>{a.status}</Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{a.notes || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Leave / Pass Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {leaveRequests.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">No leave requests</p>
              ) : (
                <div className="rounded-lg border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden md:table-cell">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaveRequests.map((r) => {
                        const days = differenceInDays(new Date(r.end_date), new Date(r.start_date)) + 1;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="capitalize">{r.type}</TableCell>
                            <TableCell className="text-xs">
                              {format(new Date(r.start_date), "dd MMM")} – {format(new Date(r.end_date), "dd MMM yy")}
                            </TableCell>
                            <TableCell>{days}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={statusColor(r.status)}>{r.status}</Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{r.reason || "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="postings">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Postings, Transfers & Reassignment</CardTitle>
            </CardHeader>
            <CardContent>
              {postings.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">No posting history</p>
              ) : (
                <div className="rounded-lg border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>From → To</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {postings.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="capitalize">{p.type}</TableCell>
                          <TableCell className="text-xs">
                            {p.from_dept?.name ?? "—"} → {p.to_dept?.name ?? "—"}
                          </TableCell>
                          <TableCell>{format(new Date(p.effective_date), "dd MMM yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={statusColor(p.status)}>{p.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <StaffDocumentVault
            profileId={profile.id}
            canManage={role === "admin" || profile.user_id === user?.id}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
