import { useState, useRef, useMemo } from "react";
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

import { Search, Plus, Pencil, Trash2, Camera, Loader2, Eye, Upload, ArrowUpDown, Lock, Building2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { ExportMenu } from "@/components/ui/export-menu";
import { yearsOfService } from "@/lib/postings-analytics";
import { formatService } from "@/hooks/useStaffRoster";
import type { ProfileWithRelations } from "@/lib/types";
import { BulkImportDialog } from "@/components/staff/BulkImportDialog";
import { GhanaCardInput, isValidGhanaCard } from "@/components/shared/GhanaCardInput";
import { GhanaPhoneInput } from "@/components/ui/ghana-phone-input";
import { validateGhanaPhone } from "@/lib/ghana-phone";
import { logAdminAudit } from "@/lib/admin-audit";
import { AdminAccountActions } from "@/components/staff/AdminAccountActions";
import { MultiContactInput, type ContactEntry } from "@/components/ui/multi-contact-input";
import type { Database } from "@/integrations/supabase/types";
import { Checkbox } from "@/components/ui/checkbox";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { AppointmentAndPortfolios } from "@/components/staff/AppointmentAndPortfolios";

type StaffStatus = Database["public"]["Enums"]["staff_status"];

import { getSignedPhotoUrl } from "@/lib/photo-utils";
import { AgeDisplay } from "@/components/ui/age-display";
import { DATE_FORMAT_HINT } from "@/lib/date-format";
import { DateInput } from "@/components/ui/date-input";
import { useOrgScope } from "@/hooks/useOrgScope";
import { flattenOrgTree } from "@/lib/org-hierarchy";
import UnitStaffPickerDialog from "@/components/command/UnitStaffPickerDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  BioDataProvider, BioDataSections, BioDataCustomBlock, type PersistFn,
} from "@/components/staff/biodata/BioDataExtras";
import { OptionCombobox } from "@/components/staff/biodata/OptionCombobox";
import {
  BIODATA_SECTIONS, optionsFor, useBioDataOptionSets,
} from "@/components/staff/biodata/useBioDataConfig";


async function getPhotoUrl(path: string | null) {
  return getSignedPhotoUrl(path);
}

export default function Staff() {
  const { isAdmin, isAdminOrSupervisor } = useAuth();
  const canManage = isAdminOrSupervisor; // Admin, OIC, 2IC, Staff Officer, Supervisor
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Hierarchical RBAC — command postings the signed-in user may assign.
  const { units: orgUnits, tree: orgTree, scope: orgScope } = useOrgScope();
  const orgRows = useMemo(() => flattenOrgTree(orgTree), [orgTree]);
  /** Units this user may post staff to — admins/command tier see the whole tree. */
  const assignableUnits = useMemo(
    () => (isAdminOrSupervisor ? orgUnits : orgUnits.filter((u) => orgScope.scopeIds.has(u.id))),
    [orgUnits, orgScope, isAdminOrSupervisor],
  );
  const [assignUnitOpen, setAssignUnitOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [rankFilter, setRankFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [maritalFilter, setMaritalFilter] = useState("all");
  const [sortField, setSortField] = useState<"name" | "rank" | "department" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
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
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [unit, setUnit] = useState("");
  const [shiftGroup, setShiftGroup] = useState("");
  const [rankId, setRankId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [status, setStatus] = useState<StaffStatus>("active");
  const [ghanaCardNumber, setGhanaCardNumber] = useState("");
  const [email, setEmail] = useState("");
  const [intake, setIntake] = useState<string>("");
  const [weaponTrained, setWeaponTrained] = useState<string>("");
  const [weaponTrainingDate, setWeaponTrainingDate] = useState<string>("");
  const [bloodGroup, setBloodGroup] = useState<string>("");
  const [trainingDesignation, setTrainingDesignation] = useState<string>("");
  const [staffCategory, setStaffCategory] = useState<string>("");
  const [office, setOffice] = useState<string>("");
  const [dateOfBirth, setDateOfBirth] = useState<string>("");
  const [dateJoinedService, setDateJoinedService] = useState<string>("");
  const [maritalStatus, setMaritalStatus] = useState<string>("");
  const [currentAppointment, setCurrentAppointment] = useState<string>("");
  const [portfolioIds, setPortfolioIds] = useState<string[]>([]);
  const [initialPortfolioIds, setInitialPortfolioIds] = useState<string[]>([]);

  // ── Bio-Data & Service Record fields (sections A–D, G, H) ───────────────
  const [formCompletedOn, setFormCompletedOn] = useState("");
  const [serviceOrganization, setServiceOrganization] = useState("");
  const [sectorCommand, setSectorCommand] = useState("");
  const [stationUnit, setStationUnit] = useState("");
  const [isNumber, setIsNumber] = useState("");
  const [otherNames, setOtherNames] = useState("");
  const [placeOfBirth, setPlaceOfBirth] = useState("");
  const [hometown, setHometown] = useState("");
  const [regionOfOrigin, setRegionOfOrigin] = useState("");
  const [dateOfAppointment, setDateOfAppointment] = useState("");
  const [cadetIntake, setCadetIntake] = useState("");
  const [recruitIntake, setRecruitIntake] = useState("");
  const [currentPlaceOfStay, setCurrentPlaceOfStay] = useState("");
  const [residentialAddress, setResidentialAddress] = useState("");
  const [digitalAddress, setDigitalAddress] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [residentialPhone, setResidentialPhone] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [uniformSize, setUniformSize] = useState("");
  const [shoeSize, setShoeSize] = useState("");
  const [religion, setReligion] = useState("");
  const [hobbies, setHobbies] = useState<string[]>(["", "", ""]);
  const [specialSkills, setSpecialSkills] = useState<string[]>(["", "", ""]);
  const [numberOfChildren, setNumberOfChildren] = useState("");
  const [previousLastPosition, setPreviousLastPosition] = useState("");
  const [previousReasonForLeaving, setPreviousReasonForLeaving] = useState("");
  const [bioTab, setBioTab] = useState("A");
  const biodataPersistRef = useRef<PersistFn | null>(null);
  const { data: bioOptionSets } = useBioDataOptionSets();


  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, ranks(*), departments(*)")
        .order("last_name");
      if (error) throw error;
      const profiles = data as ProfileWithRelations[];
      // Resolve signed URLs for private bucket
      await Promise.all(profiles.map(async (p: any) => {
        p._photoUrl = await getPhotoUrl(p.photo_url);
      }));
      return profiles;
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
    setContacts([]);
    setUnit("");
    setShiftGroup("");
    setRankId("");
    setDeptId("");
    setStatus("active");
    setGhanaCardNumber("");
    setEmail("");
    setIntake("");
    setWeaponTrained("");
    setWeaponTrainingDate("");
    setBloodGroup("");
    setTrainingDesignation("");
    setStaffCategory("");
    setDateOfBirth("");
    setDateJoinedService("");
    setMaritalStatus("");
    setCurrentAppointment("");
    setPortfolioIds([]);
    setInitialPortfolioIds([]);
    setOrgUnitId("");
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
    // Load contacts for this profile
    supabase
      .from("profile_contacts")
      .select("*")
      .eq("profile_id", s.id)
      .order("is_primary", { ascending: false })
      .then(({ data }) => {
        if (data) {
          setContacts(
            data.map((c: any) => ({
              id: c.id,
              contact_type: c.contact_type,
              label: c.label,
              value: c.value,
              is_primary: c.is_primary,
            }))
          );
        } else {
          setContacts([]);
        }
      });
    setUnit(s.unit || "");
    setShiftGroup(s.shift_group || "");
    setRankId(s.rank_id || "");
    setDeptId(s.department_id || "");
    setOrgUnitId(s.org_unit_id || "");
    setStatus(s.status);
    setGhanaCardNumber(s.ghana_card_number || "");
    setEmail(s.email || "");
    setIntake(s.intake != null ? String(s.intake) : "");
    setWeaponTrained(s.weapon_trained === true ? "yes" : s.weapon_trained === false ? "no" : "");
    setWeaponTrainingDate(s.weapon_training_date || "");
    setBloodGroup(s.blood_group || "");
    setTrainingDesignation(s.training_designation || "");
    setStaffCategory(s.staff_category || "");
    setOffice(s.office || "");
    setDateOfBirth(s.date_of_birth || "");
    setDateJoinedService((s as any).date_joined_service || "");
    setMaritalStatus(s.marital_status || "");
    setCurrentAppointment((s as any).current_appointment || "");
    // Load assigned portfolios for this profile
    supabase
      .from("profile_portfolios")
      .select("portfolio_id")
      .eq("profile_id", s.id)
      .then(({ data }) => {
        const ids = (data ?? []).map((r: any) => r.portfolio_id);
        setPortfolioIds(ids);
        setInitialPortfolioIds(ids);
      });
    setPhotoFile(null);
    setPhotoPreview((s as any)._photoUrl ?? null);
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

  const syncContacts = async (profileId: string, list: ContactEntry[]) => {
    await supabase.from("profile_contacts").delete().eq("profile_id", profileId);
    if (list.length === 0) return;
    const rows = list.map((c) => ({
      profile_id: profileId,
      contact_type: c.contact_type,
      label: c.label || null,
      value: c.value.trim(),
      is_primary: c.is_primary,
    }));
    const { error } = await supabase.from("profile_contacts").insert(rows);
    if (error) throw error;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!staffId.trim() || !firstName.trim() || !lastName.trim()) throw new Error("Staff ID, first name, and last name are required");
      if (ghanaCardNumber && !isValidGhanaCard(ghanaCardNumber)) {
        await logAdminAudit("ghana_card_verification", "mismatch", {
          staff_id: staffId.trim() || null,
          attempted_value: ghanaCardNumber,
          context: editing ? "edit_staff" : "create_staff",
          reason: "format_invalid",
        }, editing?.id ?? null);
        throw new Error("Ghana Card must be in the format GHA-XXXXXXXXX-X (9 digits, dash, 1 digit)");
      }
      setUploadingPhoto(!!photoFile);

      // Derive primary phone from contacts list (fallback to legacy field)
      const validContacts = contacts.filter((c) => c.value.trim());
      const primary = validContacts.find((c) => c.is_primary) ?? validContacts[0];
      const primaryPhoneRaw = primary?.value.trim() || phone || "";

      // Ghana telephone validation — every stored staff contact must be a
      // valid MTN / Telecel / AirtelTigo 10-digit number.
      for (const c of validContacts.concat(phone.trim() ? [{ contact_type: "mobile", value: phone, is_primary: false }] : [])) {
        const res = validateGhanaPhone(c.value);
        if (!res.valid) throw new Error(`Invalid phone "${c.value}" — ${res.error}`);
      }
      const primaryPhone = primaryPhoneRaw
        ? validateGhanaPhone(primaryPhoneRaw).local || primaryPhoneRaw
        : null;

      const payload: any = {
        staff_id: staffId.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        gender: gender || null,
        phone: primaryPhone,
        unit: unit || null,
        shift_group: shiftGroup || null,
        rank_id: rankId || null,
        department_id: deptId || null,
        org_unit_id: orgUnitId || null,
        status,
        ghana_card_number: ghanaCardNumber || null,
        email: email || null,
        intake: intake ? parseInt(intake, 10) : null,
        weapon_trained: weaponTrained === "yes" ? true : weaponTrained === "no" ? false : null,
        weapon_training_date: weaponTrained === "yes" && weaponTrainingDate ? weaponTrainingDate : null,
        blood_group: bloodGroup || null,
        training_designation: trainingDesignation || null,
        staff_category: staffCategory || null,
        office: office || null,
        date_of_birth: dateOfBirth || null,
        date_joined_service: dateJoinedService || null,
        marital_status: maritalStatus || null,
        current_appointment: currentAppointment || null,
      };

      const syncPortfolios = async (profileId: string) => {
        const toAdd = portfolioIds.filter((id) => !initialPortfolioIds.includes(id));
        const toRemove = initialPortfolioIds.filter((id) => !portfolioIds.includes(id));
        if (toRemove.length) {
          const { error } = await supabase
            .from("profile_portfolios").delete()
            .eq("profile_id", profileId).in("portfolio_id", toRemove);
          if (error) throw error;
        }
        if (toAdd.length) {
          const { error } = await supabase
            .from("profile_portfolios")
            .insert(toAdd.map((portfolio_id) => ({ profile_id: profileId, portfolio_id })));
          if (error) throw error;
        }
      };

      if (editing) {
        if (photoFile) {
          const photoPath = await uploadPhoto(editing.id);
          if (photoPath) payload.photo_url = photoPath;
        }
        const { error } = await supabase.from("profiles").update(payload).eq("id", editing.id);
        if (error) throw error;
        await syncContacts(editing.id, validContacts);
        await syncPortfolios(editing.id);
      } else {
        const { data, error } = await supabase.from("profiles").insert(payload).select("id").single();
        if (error) throw error;
        if (photoFile && data) {
          const photoPath = await uploadPhoto(data.id);
          if (photoPath) {
            await supabase.from("profiles").update({ photo_url: photoPath }).eq("id", data.id);
          }
        }
        if (data) {
          await syncContacts(data.id, validContacts);
          await syncPortfolios(data.id);
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("profiles").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      toast.success(`${n} staff record${n === 1 ? "" : "s"} deleted`);
      bulk.clear();
    },
    onError: (e: any) => toast.error(e.message || "Bulk delete failed"),
  });

  const toggleSort = (field: "name" | "rank" | "department" | "status") => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    const list = staff.filter((s) => {
      const q = search.toLowerCase();
      const matchesSearch =
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        s.staff_id.toLowerCase().includes(q) ||
        (s.unit?.toLowerCase().includes(q) ?? false) ||
        (s.marital_status?.toLowerCase().includes(q) ?? false);
      const matchesRank = rankFilter === "all" || s.rank_id === rankFilter;
      const matchesDept = deptFilter === "all" || s.department_id === deptFilter;
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      const matchesMarital = maritalFilter === "all" || (s.marital_status ?? "") === maritalFilter;
      return matchesSearch && matchesRank && matchesDept && matchesStatus && matchesMarital;
    });

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name": cmp = `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`); break;
        case "rank": cmp = (a.ranks?.abbreviation ?? "").localeCompare(b.ranks?.abbreviation ?? ""); break;
        case "department": cmp = (a.departments?.name ?? "").localeCompare(b.departments?.name ?? ""); break;
        case "status": cmp = a.status.localeCompare(b.status); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [staff, search, rankFilter, deptFilter, statusFilter, maritalFilter, sortField, sortDir]);

  const bulk = useBulkSelection(filtered);

  const buildStaffExportRows = () =>
    filtered.map((s) => {
      const joined = (s as any).date_joined_service as string | null;
      const tenure = yearsOfService(joined ?? null);
      return [
        s.staff_id, s.last_name, s.first_name, s.ranks?.abbreviation ?? "—",
        s.departments?.name ?? "—", s.unit ?? "—", s.shift_group ?? "—",
        s.gender ?? "—", s.status, s.phone ?? "—",
        joined ? format(new Date(joined), "dd/MM/yyyy") : "—",
        joined ? formatService(tenure.years, tenure.months) : "—",
      ];
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-2xl font-bold text-secondary">Staff / Employees</h1>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <ExportMenu
              getData={() => ({
                title: "Staff / Employee Report",
                filename: `staff_export_${format(new Date(), "yyyy-MM-dd")}`,
                headers: ["Staff ID", "Last Name", "First Name", "Rank", "Department", "Unit", "Shift", "Gender", "Status", "Phone", "Date Joined Service", "Years of Service"],
                rows: buildStaffExportRows(),
                subtitle: `Generated: ${format(new Date(), "dd/MM/yyyy, HH:mm")} | Records: ${filtered.length}`,
              })}
            />
            <Button variant="outline" size="sm" onClick={() => setAssignUnitOpen(true)} className="gap-1">
              <Building2 className="h-4 w-4" /> Assign to unit
            </Button>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setBulkImportOpen(true)} className="gap-1">
                <Upload className="h-4 w-4" /> Import
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" onClick={openCreate} className="gap-1">
                <Plus className="h-4 w-4" /> Add Staff
              </Button>
            )}
          </div>
        )}
      </div>

      <UnitStaffPickerDialog
        open={assignUnitOpen}
        onOpenChange={setAssignUnitOpen}
        units={orgUnits}
        selectableUnits={assignableUnits}
        defaultOrgUnitId={null}
        canManage={canManage}
        onAssigned={(unitId) => {
          setAssignUnitOpen(false);
          navigate(`/unit-dashboard?unit=${unitId}`);
        }}
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, ID, unit, or marital status..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={rankFilter} onValueChange={setRankFilter}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Rank" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ranks</SelectItem>
            {ranks.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.abbreviation}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Depts</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="study_leave">Study Leave</SelectItem>
            <SelectItem value="transferred">Transferred</SelectItem>
          </SelectContent>
        </Select>
        <Select value={maritalFilter} onValueChange={setMaritalFilter}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Marital" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Marital</SelectItem>
            {["Single","Married","Divorced","Widowed","Separated"].map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isAdmin && (
        <BulkActionBar
          count={bulk.count}
          itemLabel="staff record"
          onClear={bulk.clear}
          onConfirmDelete={() => bulkDeleteMutation.mutate(bulk.selectedIds)}
          deleting={bulkDeleteMutation.isPending}
          description={`This will permanently delete ${bulk.count} staff record${bulk.count === 1 ? "" : "s"} and all associated data.`}
        />
      )}

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading staff...</div>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && (
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={bulk.allVisibleSelected ? true : bulk.someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={bulk.toggleAllVisible}
                      aria-label="Select all visible staff"
                    />
                  </TableHead>
                )}
                <TableHead className="w-[50px]">Photo</TableHead>
                <TableHead>Staff ID</TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="gap-1 -ml-3 h-8" onClick={() => toggleSort("name")}>
                    Name <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <Button variant="ghost" size="sm" className="gap-1 -ml-3 h-8" onClick={() => toggleSort("rank")}>
                    Rank <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <Button variant="ghost" size="sm" className="gap-1 -ml-3 h-8" onClick={() => toggleSort("department")}>
                    Department <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">Shift</TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="gap-1 -ml-3 h-8" onClick={() => toggleSort("status")}>
                    Status <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                {isAdmin && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 9 : 7} className="text-center text-muted-foreground py-8">No staff found</TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow key={s.id} data-state={bulk.isSelected(s.id) ? "selected" : undefined}>
                    {isAdmin && (
                      <TableCell>
                        <Checkbox
                          checked={bulk.isSelected(s.id)}
                          onCheckedChange={() => bulk.toggle(s.id)}
                          aria-label={`Select ${s.first_name} ${s.last_name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={(s as any)._photoUrl ?? undefined} alt={`${s.first_name} ${s.last_name}`} />
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
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className={statusColor(s.status)}>{s.status}</Badge>
                        {s.account_locked && (
                          <span title="Account locked" className="inline-flex items-center text-destructive">
                            <Lock className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AdminAccountActions
                            profileId={s.id}
                            staffId={s.staff_id}
                            fullName={`${s.first_name} ${s.last_name}`}
                            accountLocked={s.account_locked}
                            hasUserId={!!s.user_id}
                          />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete">
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
                <Label htmlFor="staff-phone">Primary Phone</Label>
                <GhanaPhoneInput id="staff-phone" value={phone} onChange={setPhone} compact />
                <p className="text-[10px] text-muted-foreground mt-1">Auto-set from primary contact below if added. MTN, Telecel or AirtelTigo, 10 digits.</p>
              </div>
            </div>
            <div>
              <Label>Additional Contacts</Label>
              <p className="text-xs text-muted-foreground mb-2">Add multiple phone numbers. Star one to mark it primary.</p>
              <MultiContactInput value={contacts} onChange={setContacts} />
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
              <div className="col-span-2">
                <Label>Command posting</Label>
                <Select value={orgUnitId || "none"} onValueChange={(v) => setOrgUnitId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select command" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {orgRows.map((o) => (
                      <SelectItem key={o.id} value={o.id} disabled={!orgScope.canManage(o.id)}>
                        {"— ".repeat(o.depth)}{o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Determines which commands can view and edit this record (this command and everything above it in the chain).
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ghana Card Number</Label>
                <GhanaCardInput value={ghanaCardNumber} onChange={setGhanaCardNumber} />
              </div>
              <div>
                <Label>Email Address</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={staffCategory} onValueChange={setStaffCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cadet">Cadet</SelectItem>
                    <SelectItem value="Recruit">Recruit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Intake (1–100)</Label>
                <Select value={intake} onValueChange={setIntake}>
                  <SelectTrigger><SelectValue placeholder="Select intake" /></SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>Intake {n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Blood Group</Label>
                <Select value={bloodGroup} onValueChange={setBloodGroup}>
                  <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
                  <SelectContent>
                    {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((bg) => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Weapon Training</Label>
                <Select value={weaponTrained} onValueChange={(v) => { setWeaponTrained(v); if (v !== "yes") setWeaponTrainingDate(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Training Date</Label>
                <DateInput
                  value={weaponTrainingDate}
                  onChange={(e) => setWeaponTrainingDate(e.target.value)}
                  disabled={weaponTrained !== "yes"}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Training Designation</Label>
                <Select value={trainingDesignation} onValueChange={setTrainingDesignation}>
                  <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HUHUNYA">HUHUNYA</SelectItem>
                    <SelectItem value="ITTRAS">ITTRAS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Label>Date of Birth ({DATE_FORMAT_HINT})</Label>
                  <AgeDisplay dob={dateOfBirth} />
                </div>
                <DateInput
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  max={format(new Date(), "yyyy-MM-dd")}
                />
              </div>

            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Marital Status</Label>
                <Select value={maritalStatus} onValueChange={setMaritalStatus}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {["Single","Married","Divorced","Widowed","Separated"].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date Joined Service</Label>
                <DateInput
                  value={dateJoinedService}
                  onChange={(e) => setDateJoinedService(e.target.value)}
                  max={format(new Date(), "yyyy-MM-dd")}
                />
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
            <AppointmentAndPortfolios
              appointment={currentAppointment}
              onAppointmentChange={setCurrentAppointment}
              portfolioIds={portfolioIds}
              onPortfolioIdsChange={setPortfolioIds}
            />
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
