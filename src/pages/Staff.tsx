import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Plus, Pencil, Trash2, Camera, Loader2, Eye, Upload } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import type { ProfileWithRelations } from "@/lib/types";
import { BulkImportDialog } from "@/components/staff/BulkImportDialog";
import type { Database } from "@/integrations/supabase/types";

type StaffStatus = Database["public"]["Enums"]["staff_status"];

import { getSignedPhotoUrl } from "@/lib/photo-utils";

async function getPhotoUrl(path: string | null) {
  return getSignedPhotoUrl(path);
}

export default function Staff() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Form fields
  const [staffId, setStaffId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [unit, setUnit] = useState("");
  const [shiftGroup, setShiftGroup] = useState("");
  const [rankId, setRankId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [status, setStatus] = useState<StaffStatus>("active");

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, ranks(*), departments(*)")
        .order("last_name");
      if (error) throw error;
      return data as ProfileWithRelations[];
    },
  });

  const { data: ranks = [] } = useQuery({
    queryKey: ["ranks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ranks").select("*").order("level", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const openCreate = () => {
    setEditing(null);
    setStaffId("");
    setFirstName("");
    setLastName("");
    setGender("");
    setPhone("");
    setUnit("");
    setShiftGroup("");
    setRankId("");
    setDeptId("");
    setStatus("active");
    setPhotoFile(null);
    setPhotoPreview(null);
    setDialogOpen(true);
  };

  const openEdit = (s: any) => {
    setEditing(s);
    setStaffId(s.staff_id);
    setFirstName(s.first_name);
    setLastName(s.last_name);
    setGender(s.gender || "");
    setPhone(s.phone || "");
    setUnit(s.unit || "");
    setShiftGroup(s.shift_group || "");
    setRankId(s.rank_id || "");
    setDeptId(s.department_id || "");
    setStatus(s.status);
    setPhotoFile(null);
    setPhotoPreview(getPhotoUrl(s.photo_url));
    setDialogOpen(true);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo must be under 5MB");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const uploadPhoto = async (profileId: string): Promise<string | null> => {
    if (!photoFile) return null;
    const ext = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${profileId}.${ext}`;
    const { error } = await supabase.storage
      .from("staff-photos")
      .upload(path, photoFile, { upsert: true });
    if (error) throw error;
    return path;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!staffId.trim() || !firstName.trim() || !lastName.trim()) throw new Error("Staff ID, first name, and last name are required");
      setUploadingPhoto(!!photoFile);

      const payload: any = {
        staff_id: staffId.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        gender: gender || null,
        phone: phone || null,
        unit: unit || null,
        shift_group: shiftGroup || null,
        rank_id: rankId || null,
        department_id: deptId || null,
        status,
      };

      if (editing) {
        if (photoFile) {
          const photoPath = await uploadPhoto(editing.id);
          if (photoPath) payload.photo_url = photoPath;
        }
        const { error } = await supabase.from("profiles").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("profiles").insert(payload).select("id").single();
        if (error) throw error;
        if (photoFile && data) {
          const photoPath = await uploadPhoto(data.id);
          if (photoPath) {
            await supabase.from("profiles").update({ photo_url: photoPath }).eq("id", data.id);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      setDialogOpen(false);
      setUploadingPhoto(false);
      toast.success(editing ? "Staff updated" : "Staff created");
    },
    onError: (e: any) => {
      setUploadingPhoto(false);
      toast.error(e.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success("Staff deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = staff.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.first_name.toLowerCase().includes(q) ||
      s.last_name.toLowerCase().includes(q) ||
      s.staff_id.toLowerCase().includes(q) ||
      (s.unit?.toLowerCase().includes(q) ?? false)
    );
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "active": return "bg-emerald-100 text-emerald-800";
      case "inactive": return "bg-red-100 text-red-800";
      case "study_leave": return "bg-amber-100 text-amber-800";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getInitials = (first: string, last: string) =>
    `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-secondary">Staff / Employees</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulkImportOpen(true)} className="gap-1">
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button onClick={openCreate} className="gap-1">
              <Plus className="h-4 w-4" /> Add Staff
            </Button>
          </div>
        )}
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, ID, or unit..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading staff...</div>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Photo</TableHead>
                <TableHead>Staff ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Rank</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead className="hidden lg:table-cell">Shift</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-muted-foreground py-8">No staff found</TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={getPhotoUrl(s.photo_url) ?? undefined} alt={`${s.first_name} ${s.last_name}`} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(s.first_name, s.last_name)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.staff_id}</TableCell>
                    <TableCell>
                      <button onClick={() => navigate(`/staff/${s.id}`)} className="font-medium text-primary hover:underline text-left">
                        {s.last_name}, {s.first_name}
                      </button>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{s.ranks?.abbreviation ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{s.departments?.name ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{s.shift_group ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColor(s.status)}>{s.status}</Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {s.last_name}, {s.first_name}?</AlertDialogTitle>
                                <AlertDialogDescription>This will permanently remove this staff member and all associated records.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(s.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{filtered.length} of {staff.length} staff shown</p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Staff" : "Add Staff"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Photo upload */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <Avatar className="h-20 w-20 border-2 border-border">
                  <AvatarImage src={photoPreview ?? undefined} />
                  <AvatarFallback className="text-lg bg-primary/10 text-primary">
                    {firstName && lastName ? getInitials(firstName, lastName) : <Camera className="h-6 w-6" />}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-5 w-5 text-white" />
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoSelect}
              />
              <p className="text-xs text-muted-foreground">Click to upload photo (max 5MB)</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Staff ID</Label>
                <Input value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="GIS-XXXXX" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as StaffStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="study_leave">Study Leave</SelectItem>
                    <SelectItem value="transferred">Transferred</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0XX XXX XXXX" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Rank</Label>
                <Select value={rankId} onValueChange={setRankId}>
                  <SelectTrigger><SelectValue placeholder="Select rank" /></SelectTrigger>
                  <SelectContent>
                    {ranks.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.abbreviation} — {r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Department</Label>
                <Select value={deptId} onValueChange={setDeptId}>
                  <SelectTrigger><SelectValue placeholder="Select dept" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Unit</Label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. Operations" />
              </div>
              <div>
                <Label>Shift Group</Label>
                <Select value={shiftGroup} onValueChange={setShiftGroup}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Shift A</SelectItem>
                    <SelectItem value="B">Shift B</SelectItem>
                    <SelectItem value="C">Shift C</SelectItem>
                    <SelectItem value="D">Shift D</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !staffId.trim() || !firstName.trim() || !lastName.trim()} className="w-full">
              {saveMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploadingPhoto ? "Uploading photo..." : "Saving..."}
                </span>
              ) : editing ? "Update Staff" : "Create Staff"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <BulkImportDialog open={bulkImportOpen} onOpenChange={setBulkImportOpen} />
    </div>
  );
}
