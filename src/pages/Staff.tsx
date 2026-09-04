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

import { Search, Plus, Pencil, Trash2, Camera, Loader2, Eye, Upload, ArrowUpDown, Lock, Building2, Printer } from "lucide-react";
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
import { CommandPicker } from "@/components/org/CommandPicker";
import { validatePhotoFile, uploadPhoto as uploadGuardedPhoto } from "@/lib/image-upload";
import { descendantIds, flattenOrgTree } from "@/lib/org-hierarchy";
import UnitStaffPickerDialog from "@/components/command/UnitStaffPickerDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BioDataProvider, BioDataSections, BioDataCustomBlock, useBioData, type PersistFn,
} from "@/components/staff/biodata/BioDataExtras";
import { OptionCombobox } from "@/components/staff/biodata/OptionCombobox";
import {
  BIODATA_SECTIONS, optionsFor, useBioDataOptionSets,
} from "@/components/staff/biodata/useBioDataConfig";
import { BioDataImportDialog } from "@/components/staff/biodata/BioDataImportDialog";
import type { BioDataPrefillRow } from "@/lib/biodata-import";
import { exportBioDataPdf } from "@/lib/biodata-pdf";

/**
 * Toolbar inside the Bio-Data dialog: prefill the form from a roster
 * spreadsheet, and print the completed record as a PDF.
 */
function BioDataFormToolbar({
  profileId,
  onProfileValues,
}: {
  profileId: string | null;
  onProfileValues: (values: Record<string, string>) => void;
}) {
  const { applyPrefill } = useBioData();
  const [importOpen, setImportOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  const handleApply = (row: BioDataPrefillRow) => {
    onProfileValues(row.values);
    const v = row.values;
    applyPrefill({
      education: row.education,
      employment: row.employment,
      emergency: row.emergency,
      family: {
        spouse_name: v.spouse_name, spouse_phone: v.spouse_phone, spouse_address: v.spouse_address,
        nok_name: v.nok_name, nok_relationship: v.nok_relationship,
        nok_phone: v.nok_phone, nok_address: v.nok_address,
        father_name: v.father_name, father_phone: v.father_phone,
        mother_name: v.mother_name, mother_phone: v.mother_phone,
      },
      bank: { bank_name: v.bank_name, branch: v.bank_branch, account_number: v.bank_account },
    });
    toast.success("Details filled in — check each section, then save");
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
        <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
        Prefill from spreadsheet
      </Button>
      {profileId && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={printing}
          onClick={async () => {
            setPrinting(true);
            try {
              await exportBioDataPdf(profileId);
              toast.success("Bio-data record downloaded");
            } catch (e: any) {
              toast.error(e?.message || "Could not build the PDF");
            } finally {
              setPrinting(false);
            }
          }}
        >
          {printing
            ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            : <Printer className="mr-1 h-4 w-4" aria-hidden="true" />}
          Print record (PDF)
        </Button>
      )}
      <BioDataImportDialog open={importOpen} onOpenChange={setImportOpen} onApply={handleApply} />
    </div>
  );
}


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
  /** Hierarchy filter: a command node means "this command and everything below it". */
  const [unitFilter, setUnitFilter] = useState<string | null>(null);
  const unitScopeIds = useMemo(
    () => (unitFilter ? new Set(descendantIds(orgUnits, unitFilter)) : null),
    [unitFilter, orgUnits],
  );
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

  /**
   * Fills sections A–D from one spreadsheet row. Rank and department arrive as
   * text, so they are matched against the existing lists; anything unmatched is
   * left for the user to pick.
   */
  const applyPrefillValues = (v: Record<string, string>) => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const setIf = (setter: (val: string) => void, val?: string) => {
      if (val && val.trim()) setter(val.trim());
    };

    setIf(setStaffId, v.staffId);
    setIf(setIsNumber, v.isNumber);
    setIf(setLastName, v.lastName);
    setIf(setFirstName, v.firstName);
    setIf(setOtherNames, v.otherNames);
    if (v.gender) setGender(/^f/i.test(v.gender) ? "Female" : "Male");
    setIf(setDateOfBirth, v.dateOfBirth);
    setIf(setPlaceOfBirth, v.placeOfBirth);
    setIf(setHometown, v.hometown);
    setIf(setRegionOfOrigin, v.regionOfOrigin);
    setIf(setGhanaCardNumber, v.ghanaCardNumber);
    setIf(setDateOfAppointment, v.dateOfAppointment);
    setIf(setDateJoinedService, v.dateJoinedService);
    setIf(setCadetIntake, v.cadetIntake);
    setIf(setRecruitIntake, v.recruitIntake);
    setIf(setIntake, v.intake);
    setIf(setServiceOrganization, v.serviceOrganization);
    setIf(setSectorCommand, v.sectorCommand);
    setIf(setStationUnit, v.stationUnit);
    setIf(setUnit, v.unit);
    setIf(setShiftGroup, v.shiftGroup?.toUpperCase());
    setIf(setCurrentPlaceOfStay, v.currentPlaceOfStay);
    setIf(setResidentialAddress, v.residentialAddress);
    setIf(setDigitalAddress, v.digitalAddress);
    setIf(setPostalAddress, v.postalAddress);
    setIf(setResidentialPhone, v.residentialPhone);
    setIf(setPhone, v.phone);
    setIf(setEmail, v.email);
    setIf(setHeightCm, v.heightCm);
    setIf(setBloodGroup, v.bloodGroup?.toUpperCase());
    setIf(setUniformSize, v.uniformSize?.toUpperCase());
    setIf(setShoeSize, v.shoeSize);
    setIf(setReligion, v.religion);
    setIf(setNumberOfChildren, v.numberOfChildren);
    setIf(setPreviousLastPosition, v.previousLastPosition);
    setIf(setPreviousReasonForLeaving, v.previousReasonForLeaving);
    if (v.maritalStatus) {
      const m = ["Single", "Married", "Divorced", "Widowed"].find((x) => norm(x) === norm(v.maritalStatus));
      if (m) setMaritalStatus(m);
    }
    if (v.hobby1) setHobbies([v.hobby1, "", ""]);
    if (v.specialSkill1) setSpecialSkills([v.specialSkill1, "", ""]);
    if (v.phone2) {
      setContacts((prev) =>
        prev.some((c) => c.value === v.phone2)
          ? prev
          : [...prev, { contact_type: "mobile", label: "Mobile no. 2", value: v.phone2, is_primary: false }],
      );
    }
    if (v.rankName) {
      const match = (ranks as any[]).find(
        (r) => norm(r.name) === norm(v.rankName) || norm(r.abbreviation ?? "") === norm(v.rankName),
      );
      if (match) setRankId(match.id);
    }
    if (v.departmentName) {
      const match = (departments as any[]).find((d) => norm(d.name) === norm(v.departmentName));
      if (match) setDeptId(match.id);
    }
  };


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
    setBioTab("A");
    setFormCompletedOn(format(new Date(), "yyyy-MM-dd"));
    setServiceOrganization("");
    setSectorCommand("");
    setStationUnit("");
    setIsNumber("");
    setOtherNames("");
    setPlaceOfBirth("");
    setHometown("");
    setRegionOfOrigin("");
    setDateOfAppointment("");
    setCadetIntake("");
    setRecruitIntake("");
    setCurrentPlaceOfStay("");
    setResidentialAddress("");
    setDigitalAddress("");
    setPostalAddress("");
    setResidentialPhone("");
    setHeightCm("");
    setUniformSize("");
    setShoeSize("");
    setReligion("");
    setHobbies(["", "", ""]);
    setSpecialSkills(["", "", ""]);
    setNumberOfChildren("");
    setPreviousLastPosition("");
    setPreviousReasonForLeaving("");

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
    setBioTab("A");
    setFormCompletedOn((s as any).form_completed_on || "");
    setServiceOrganization((s as any).service_organization || "");
    setSectorCommand((s as any).sector_command || "");
    setStationUnit((s as any).station_unit || "");
    setIsNumber((s as any).is_number || "");
    setOtherNames((s as any).other_names || "");
    setPlaceOfBirth((s as any).place_of_birth || "");
    setHometown((s as any).hometown || "");
    setRegionOfOrigin((s as any).region_of_origin || "");
    setDateOfAppointment((s as any).date_of_appointment || "");
    setCadetIntake((s as any).cadet_intake || "");
    setRecruitIntake((s as any).recruit_intake || "");
    setCurrentPlaceOfStay((s as any).current_place_of_stay || "");
    setResidentialAddress((s as any).residential_address || "");
    setDigitalAddress((s as any).digital_address || "");
    setPostalAddress((s as any).postal_address || "");
    setResidentialPhone((s as any).residential_phone || "");
    setHeightCm((s as any).height_cm != null ? String((s as any).height_cm) : "");
    setUniformSize((s as any).uniform_size || "");
    setShoeSize((s as any).shoe_size || "");
    setReligion((s as any).religion || "");
    setHobbies([...(((s as any).hobbies ?? []) as string[]), "", "", ""].slice(0, 3));
    setSpecialSkills([...(((s as any).special_skills ?? []) as string[]), "", "", ""].slice(0, 3));
    setNumberOfChildren((s as any).number_of_children != null ? String((s as any).number_of_children) : "");
    setPreviousLastPosition((s as any).previous_last_position || "");
    setPreviousReasonForLeaving((s as any).previous_reason_for_leaving || "");

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

  /**
   * Photos are capped under 3MB, must really be a JPG/PNG/WEBP (magic bytes,
   * not just the extension) and are virus/threat scanned before we accept them.
   */
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const check = await validatePhotoFile(file);
    if (!check.ok) {
      toast.error(check.reason);
      setPhotoFile(null);
      return;
    }
    setPhotoFile(check.file);
    setPhotoPreview(URL.createObjectURL(check.file));
  };

  const uploadPhoto = async (profileId: string): Promise<string | null> => {
    if (!photoFile) return null;
    return uploadGuardedPhoto({
      file: photoFile,
      bucket: "staff-photos",
      pathBase: profileId,
      upsert: true,
    });
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
        // Bio-Data & Service Record — sections A to D, G and H
        form_completed_on: formCompletedOn || null,
        service_organization: serviceOrganization || null,
        sector_command: sectorCommand || null,
        station_unit: stationUnit || null,
        is_number: isNumber || null,
        other_names: otherNames || null,
        place_of_birth: placeOfBirth || null,
        hometown: hometown || null,
        region_of_origin: regionOfOrigin || null,
        date_of_appointment: dateOfAppointment || null,
        cadet_intake: cadetIntake || null,
        recruit_intake: recruitIntake || null,
        current_place_of_stay: currentPlaceOfStay || null,
        residential_address: residentialAddress || null,
        digital_address: digitalAddress || null,
        postal_address: postalAddress || null,
        residential_phone: residentialPhone || null,
        height_cm: heightCm ? Number(heightCm) : null,
        uniform_size: uniformSize || null,
        shoe_size: shoeSize || null,
        religion: religion || null,
        hobbies: hobbies.map((h) => h.trim()).filter(Boolean),
        special_skills: specialSkills.map((s) => s.trim()).filter(Boolean),
        number_of_children: numberOfChildren ? Number(numberOfChildren) : null,
        previous_last_position: previousLastPosition || null,
        previous_reason_for_leaving: previousReasonForLeaving || null,

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
        await biodataPersistRef.current?.(editing.id);
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
          await biodataPersistRef.current?.(data.id);
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
      const matchesUnit =
        !unitScopeIds || (!!s.org_unit_id && unitScopeIds.has(s.org_unit_id));
      return matchesSearch && matchesRank && matchesDept && matchesStatus && matchesMarital && matchesUnit;
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
  }, [staff, search, rankFilter, deptFilter, statusFilter, maritalFilter, unitScopeIds, sortField, sortDir]);

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
        <div className="w-full sm:w-[220px]">
          <CommandPicker
            units={orgUnits}
            value={unitFilter}
            onChange={setUnitFilter}
            placeholder="All commands"
          />
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

      {/*
        PERSONNEL BIO-DATA & SERVICE RECORD FORM
        Sections A–L in the official order. A–D hold the fields stored on the
        staff record itself; E–L come from BioDataSections and are saved right
        after the record through the shared persist function.
      */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Staff" : "Add Staff"}</DialogTitle>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Personnel Bio-Data &amp; Service Record — confidential, for official use only
            </p>
          </DialogHeader>
          <BioDataProvider
            profileId={editing?.id ?? null}
            open={dialogOpen}
            persistRef={biodataPersistRef}
          >
          <div className="space-y-4">
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

            <BioDataFormToolbar
              profileId={editing?.id ?? null}
              onProfileValues={applyPrefillValues}
            />

            <Tabs value={bioTab} onValueChange={setBioTab} className="w-full">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                {BIODATA_SECTIONS.map((s) => (
                  <TabsTrigger key={s.key} value={s.key} className="text-xs">
                    <span className="font-semibold">{s.key}</span>
                    <span className="ml-1 hidden sm:inline">{s.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>


              {/* ── A. Form administration ──────────────────────────────── */}
              <TabsContent value="A" className="space-y-4">
                <h3 className="text-base font-semibold tracking-tight">A. Form administration</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="bio-completed">Date of completion ({DATE_FORMAT_HINT})</Label>
                    <DateInput id="bio-completed" value={formCompletedOn} onChange={(e) => setFormCompletedOn(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-service-org">Service / organization</Label>
                    <Input id="bio-service-org" value={serviceOrganization} onChange={(e) => setServiceOrganization(e.target.value)} placeholder="e.g. Ghana Immigration Service" />
                  </div>
                  <div>
                    <Label htmlFor="bio-sector">Sector / command</Label>
                    <Input id="bio-sector" value={sectorCommand} onChange={(e) => setSectorCommand(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-station">Station / unit</Label>
                    <OptionCombobox
                      id="bio-station"
                      value={stationUnit}
                      onChange={setStationUnit}
                      options={optionsFor(bioOptionSets, "station").map((o) => ({ value: o.value, label: o.label }))}
                      placeholder="Search station / command…"
                      allowCustom
                    />
                  </div>
                  <div>
                    <Label htmlFor="bio-staff-id">Staff ID</Label>
                    <Input id="bio-staff-id" value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="GIS-XXXXX" />
                  </div>
                  <div>
                    <Label htmlFor="bio-is-no">IS / No.</Label>
                    <Input id="bio-is-no" value={isNumber} onChange={(e) => setIsNumber(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-status">Status</Label>
                    <Select value={status} onValueChange={(v) => setStatus(v as StaffStatus)}>
                      <SelectTrigger id="bio-status"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="study_leave">Study Leave</SelectItem>
                        <SelectItem value="transferred">Transferred</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="bio-department">Department</Label>
                    <Select value={deptId} onValueChange={setDeptId}>
                      <SelectTrigger id="bio-department"><SelectValue placeholder="Select dept" /></SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="bio-unit">Unit</Label>
                    <Input id="bio-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. Operations" />
                  </div>
                  <div>
                    <Label htmlFor="bio-office">Office</Label>
                    <Input id="bio-office" value={office} onChange={(e) => setOffice(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-shift-group">Shift group</Label>
                    <Select value={shiftGroup} onValueChange={setShiftGroup}>
                      <SelectTrigger id="bio-shift-group"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">Shift A</SelectItem>
                        <SelectItem value="B">Shift B</SelectItem>
                        <SelectItem value="C">Shift C</SelectItem>
                        <SelectItem value="D">Shift D</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="bio-command-posting">Command posting</Label>
                    <Select value={orgUnitId || "none"} onValueChange={(v) => setOrgUnitId(v === "none" ? "" : v)}>
                      <SelectTrigger id="bio-command-posting"><SelectValue placeholder="Select command" /></SelectTrigger>
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
                <BioDataCustomBlock section="A" />
              </TabsContent>

              {/* ── B. Personal identification ──────────────────────────── */}
              <TabsContent value="B" className="space-y-4">
                <h3 className="text-base font-semibold tracking-tight">B. Personal identification data</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="bio-surname">Surname</Label>
                    <Input id="bio-surname" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-firstname">First name</Label>
                    <Input id="bio-firstname" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-othernames">Other name(s)</Label>
                    <Input id="bio-othernames" value={otherNames} onChange={(e) => setOtherNames(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-gender">Gender</Label>
                    <Select value={gender} onValueChange={setGender}>
                      <SelectTrigger id="bio-gender"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Label htmlFor="bio-dob">Date of birth ({DATE_FORMAT_HINT})</Label>
                      <AgeDisplay dob={dateOfBirth} />
                    </div>
                    <DateInput
                      id="bio-dob"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      max={format(new Date(), "yyyy-MM-dd")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bio-pob">Place of birth</Label>
                    <Input id="bio-pob" value={placeOfBirth} onChange={(e) => setPlaceOfBirth(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-hometown">Hometown</Label>
                    <Input id="bio-hometown" value={hometown} onChange={(e) => setHometown(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-region">Region of origin</Label>
                    <OptionCombobox
                      id="bio-region"
                      value={regionOfOrigin}
                      onChange={setRegionOfOrigin}
                      options={optionsFor(bioOptionSets, "region_of_origin").map((o) => ({ value: o.value, label: o.label }))}
                      placeholder="Search region…"
                    />
                  </div>
                  <div>
                    <Label>Ghana Card no.</Label>
                    <GhanaCardInput value={ghanaCardNumber} onChange={setGhanaCardNumber} />
                  </div>
                  <div>
                    <Label htmlFor="bio-rank">Rank</Label>
                    <Select value={rankId} onValueChange={setRankId}>
                      <SelectTrigger id="bio-rank"><SelectValue placeholder="Select rank" /></SelectTrigger>
                      <SelectContent>
                        {ranks.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.abbreviation} — {r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="bio-appointment-date">Date of appointment ({DATE_FORMAT_HINT})</Label>
                    <DateInput
                      id="bio-appointment-date"
                      value={dateOfAppointment}
                      onChange={(e) => setDateOfAppointment(e.target.value)}
                      max={format(new Date(), "yyyy-MM-dd")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bio-cadet-intake">Cadet intake</Label>
                    <Input id="bio-cadet-intake" value={cadetIntake} onChange={(e) => setCadetIntake(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-recruit-intake">Recruit intake</Label>
                    <Input id="bio-recruit-intake" value={recruitIntake} onChange={(e) => setRecruitIntake(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-category">Category</Label>
                    <Select value={staffCategory} onValueChange={setStaffCategory}>
                      <SelectTrigger id="bio-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cadet">Cadet</SelectItem>
                        <SelectItem value="Recruit">Recruit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="bio-intake">Intake (1–100)</Label>
                    <Select value={intake} onValueChange={setIntake}>
                      <SelectTrigger id="bio-intake"><SelectValue placeholder="Select intake" /></SelectTrigger>
                      <SelectContent className="max-h-[260px]">
                        {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>Intake {n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="bio-joined">Date joined service ({DATE_FORMAT_HINT})</Label>
                    <DateInput
                      id="bio-joined"
                      value={dateJoinedService}
                      onChange={(e) => setDateJoinedService(e.target.value)}
                      max={format(new Date(), "yyyy-MM-dd")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bio-weapon">Weapon training</Label>
                    <Select value={weaponTrained} onValueChange={(v) => { setWeaponTrained(v); if (v !== "yes") setWeaponTrainingDate(""); }}>
                      <SelectTrigger id="bio-weapon"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="bio-weapon-date">Weapon training date</Label>
                    <DateInput
                      id="bio-weapon-date"
                      value={weaponTrainingDate}
                      onChange={(e) => setWeaponTrainingDate(e.target.value)}
                      disabled={weaponTrained !== "yes"}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bio-training-designation">Training designation</Label>
                    <Select value={trainingDesignation} onValueChange={setTrainingDesignation}>
                      <SelectTrigger id="bio-training-designation"><SelectValue placeholder="Select designation" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HUHUNYA">HUHUNYA</SelectItem>
                        <SelectItem value="ITTRAS">ITTRAS</SelectItem>
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
                <BioDataCustomBlock section="B" />
              </TabsContent>

              {/* ── C. Residential & contact ────────────────────────────── */}
              <TabsContent value="C" className="space-y-4">
                <h3 className="text-base font-semibold tracking-tight">C. Residential &amp; contact information</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="bio-stay">Current place of stay</Label>
                    <Input id="bio-stay" value={currentPlaceOfStay} onChange={(e) => setCurrentPlaceOfStay(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-res-address">Residential address</Label>
                    <Input id="bio-res-address" value={residentialAddress} onChange={(e) => setResidentialAddress(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-digital-address">Digital address</Label>
                    <Input id="bio-digital-address" value={digitalAddress} onChange={(e) => setDigitalAddress(e.target.value)} placeholder="e.g. GA-123-4567" />
                  </div>
                  <div>
                    <Label htmlFor="bio-postal">Postal address</Label>
                    <Input id="bio-postal" value={postalAddress} onChange={(e) => setPostalAddress(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-res-phone">Residential telephone</Label>
                    <GhanaPhoneInput id="bio-res-phone" value={residentialPhone} onChange={setResidentialPhone} compact />
                  </div>
                  <div>
                    <Label htmlFor="bio-mobile-1">Mobile no. 1 (primary)</Label>
                    <GhanaPhoneInput id="bio-mobile-1" value={phone} onChange={setPhone} compact />
                    <p className="text-[10px] text-muted-foreground mt-1">Auto-set from the primary contact below if added. MTN, Telecel or AirtelTigo, 10 digits.</p>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Mobile no. 2 and other contacts</Label>
                    <p className="text-xs text-muted-foreground mb-2">Add more numbers. Star one to mark it primary.</p>
                    <MultiContactInput value={contacts} onChange={setContacts} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="bio-email">Email address</Label>
                    <Input id="bio-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
                  </div>
                </div>
                <BioDataCustomBlock section="C" />
              </TabsContent>

              {/* ── D. Physical & personal profile ──────────────────────── */}
              <TabsContent value="D" className="space-y-4">
                <h3 className="text-base font-semibold tracking-tight">D. Physical &amp; personal profile</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="bio-height">Height (cm)</Label>
                    <Input id="bio-height" type="number" min={100} max={250} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="bio-blood">Blood group</Label>
                    <OptionCombobox
                      id="bio-blood"
                      value={bloodGroup}
                      onChange={setBloodGroup}
                      options={
                        optionsFor(bioOptionSets, "blood_group").length
                          ? optionsFor(bioOptionSets, "blood_group").map((o) => ({ value: o.value, label: o.label }))
                          : ["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((bg) => ({ value: bg, label: bg }))
                      }
                      placeholder="Select blood group"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bio-uniform">Uniform size</Label>
                    <OptionCombobox
                      id="bio-uniform"
                      value={uniformSize}
                      onChange={setUniformSize}
                      options={
                        optionsFor(bioOptionSets, "uniform_size").length
                          ? optionsFor(bioOptionSets, "uniform_size").map((o) => ({ value: o.value, label: o.label }))
                          : ["S", "M", "L", "XL", "XXL"].map((s) => ({ value: s, label: s }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="bio-shoe">Shoe size</Label>
                    <Input id="bio-shoe" value={shoeSize} onChange={(e) => setShoeSize(e.target.value)} placeholder="e.g. 42" />
                  </div>
                  <div>
                    <Label htmlFor="bio-religion">Religion</Label>
                    <OptionCombobox
                      id="bio-religion"
                      value={religion}
                      onChange={setReligion}
                      options={optionsFor(bioOptionSets, "religion").map((o) => ({ value: o.value, label: o.label }))}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Hobbies / interests</Label>
                    {hobbies.map((h, i) => (
                      <Input
                        key={i}
                        aria-label={`Hobby ${i + 1}`}
                        value={h}
                        onChange={(e) => setHobbies(hobbies.map((v, j) => (j === i ? e.target.value : v)))}
                      />
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label>Special skill(s)</Label>
                    {specialSkills.map((sk, i) => (
                      <Input
                        key={i}
                        aria-label={`Special skill ${i + 1}`}
                        value={sk}
                        onChange={(e) => setSpecialSkills(specialSkills.map((v, j) => (j === i ? e.target.value : v)))}
                      />
                    ))}
                  </div>
                </div>
                <BioDataCustomBlock section="D" />
              </TabsContent>

              {/* ── E to L ──────────────────────────────────────────────── */}
              <BioDataSections
                staffName={[lastName, firstName, otherNames].filter(Boolean).join(" ")}
                staffIdText={staffId}
                isNumber={isNumber}
                previousLastPosition={previousLastPosition}
                onPreviousLastPositionChange={setPreviousLastPosition}
                previousReasonForLeaving={previousReasonForLeaving}
                onPreviousReasonChange={setPreviousReasonForLeaving}
                maritalStatus={maritalStatus}
                onMaritalStatusChange={setMaritalStatus}
                numberOfChildren={numberOfChildren}
                onNumberOfChildrenChange={setNumberOfChildren}
              />
            </Tabs>

            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !staffId.trim() || !firstName.trim() || !lastName.trim()} className="w-full">
              {saveMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploadingPhoto ? "Uploading photo..." : "Saving..."}
                </span>
              ) : editing ? "Update Staff" : "Create Staff"}
            </Button>
          </div>
          </BioDataProvider>
        </DialogContent>
      </Dialog>

      <BulkImportDialog open={bulkImportOpen} onOpenChange={setBulkImportOpen} />
    </div>
  );
}
