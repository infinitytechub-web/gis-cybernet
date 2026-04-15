import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { Settings, LogOut, Shield, ChevronDown, User } from "lucide-react";
import { getSignedPhotoUrl } from "@/lib/photo-utils";

export function HeaderProfileDropdown() {
  const { user, role, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{
    id: string;
    first_name: string;
    last_name: string;
    photo_url: string | null;
    staff_id: string;
    department_name: string | null;
    rank_abbreviation: string | null;
  } | null>(null);
  const [signedPhotoUrl, setSignedPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("id, first_name, last_name, photo_url, staff_id, departments(name), ranks(abbreviation)")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile({
            id: data.id,
            first_name: data.first_name,
            last_name: data.last_name,
            photo_url: data.photo_url,
            staff_id: data.staff_id,
            department_name: (data.departments as any)?.name ?? null,
            rank_abbreviation: (data.ranks as any)?.abbreviation ?? null,
          });
        }
      });
  }, [user]);

  useEffect(() => {
    if (profile?.photo_url) {
      getSignedPhotoUrl(profile.photo_url).then(setSignedPhotoUrl);
    }
  }, [profile?.photo_url]);

  const initials = profile
    ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? "U";

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`
    : user?.email ?? "User";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full px-1.5 py-1 hover:bg-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="relative">
          <Avatar className="h-7 w-7">
            {signedPhotoUrl && <AvatarImage src={signedPhotoUrl} alt={displayName} />}
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          {/* Online status indicator */}
          <span className="absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-card" />
        </div>
        <span className="hidden md:inline text-sm font-medium truncate max-w-[120px]">{displayName}</span>
        <ChevronDown className="hidden md:inline h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">{displayName}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Shield className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground capitalize">{role ?? "staff"}</span>
              {profile?.rank_abbreviation && (
                <span className="text-xs text-muted-foreground">· {profile.rank_abbreviation}</span>
              )}
            </div>
            {profile?.department_name && (
              <p className="text-xs text-muted-foreground">{profile.department_name}</p>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {profile && (
          <DropdownMenuItem onClick={() => navigate(`/staff/${profile.id}`)} className="cursor-pointer">
            <User className="h-4 w-4 mr-2" />
            My Profile
          </DropdownMenuItem>
        )}

        {isAdmin && (
          <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
            <Settings className="h-4 w-4 mr-2" />
            Account Settings
          </DropdownMenuItem>
        )}

        {/* Change Password — rendered as a nested dialog trigger */}
        <ChangePasswordDialogItem />

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Wraps the ChangePasswordDialog so it can live inside the dropdown */
function ChangePasswordDialogItem() {
  return (
    <div className="relative">
      <ChangePasswordDialog variant="dropdown" />
    </div>
  );
}
