export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_lockout_events: {
        Row: {
          attempts: number
          created_at: string
          full_name: string | null
          id: string
          ip_address: string | null
          locked_at: string
          profile_id: string | null
          staff_id: string
          threshold: number
          window_minutes: number
        }
        Insert: {
          attempts?: number
          created_at?: string
          full_name?: string | null
          id?: string
          ip_address?: string | null
          locked_at?: string
          profile_id?: string | null
          staff_id: string
          threshold?: number
          window_minutes?: number
        }
        Update: {
          attempts?: number
          created_at?: string
          full_name?: string | null
          id?: string
          ip_address?: string | null
          locked_at?: string
          profile_id?: string | null
          staff_id?: string
          threshold?: number
          window_minutes?: number
        }
        Relationships: []
      }
      account_unlock_audit: {
        Row: {
          created_at: string
          id: string
          previous_state: Json
          reason: string
          target_full_name: string | null
          target_profile_id: string
          target_staff_id: string | null
          unlocked_by: string | null
          unlocked_by_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          previous_state?: Json
          reason: string
          target_full_name?: string | null
          target_profile_id: string
          target_staff_id?: string | null
          unlocked_by?: string | null
          unlocked_by_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          previous_state?: Json
          reason?: string
          target_full_name?: string | null
          target_profile_id?: string
          target_staff_id?: string | null
          unlocked_by?: string | null
          unlocked_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_unlock_audit_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_unlock_audit_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_file_audit: {
        Row: {
          action: Database["public"]["Enums"]["announcement_file_audit_action"]
          actor_user_id: string | null
          created_at: string
          department_id: string | null
          department_name: string | null
          file_id: string | null
          id: string
          ip_address: string | null
          metadata: Json
          staff_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["announcement_file_audit_action"]
          actor_user_id?: string | null
          created_at?: string
          department_id?: string | null
          department_name?: string | null
          file_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          staff_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["announcement_file_audit_action"]
          actor_user_id?: string | null
          created_at?: string
          department_id?: string | null
          department_name?: string | null
          file_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          staff_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_file_audit_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "announcement_files"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_file_cleanup_runs: {
        Row: {
          error_message: string | null
          files_deactivated: number
          files_scanned: number
          files_soft_deleted: number
          files_with_default_applied: number
          finished_at: string | null
          id: string
          started_at: string
          status: string
          trigger_kind: string
          triggered_by: string | null
        }
        Insert: {
          error_message?: string | null
          files_deactivated?: number
          files_scanned?: number
          files_soft_deleted?: number
          files_with_default_applied?: number
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          trigger_kind?: string
          triggered_by?: string | null
        }
        Update: {
          error_message?: string | null
          files_deactivated?: number
          files_scanned?: number
          files_soft_deleted?: number
          files_with_default_applied?: number
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          trigger_kind?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      announcement_files: {
        Row: {
          created_at: string
          department_id: string | null
          description: string | null
          download_count: number
          expired_at: string | null
          expires_at: string | null
          filename: string
          id: string
          is_active: boolean
          mime_type: string | null
          retention_days: number | null
          scan_action: string | null
          sha256: string | null
          size_bytes: number
          storage_path: string
          target_user_id: string | null
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          description?: string | null
          download_count?: number
          expired_at?: string | null
          expires_at?: string | null
          filename: string
          id?: string
          is_active?: boolean
          mime_type?: string | null
          retention_days?: number | null
          scan_action?: string | null
          sha256?: string | null
          size_bytes: number
          storage_path: string
          target_user_id?: string | null
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          description?: string | null
          download_count?: number
          expired_at?: string | null
          expires_at?: string | null
          filename?: string
          id?: string
          is_active?: boolean
          mime_type?: string | null
          retention_days?: number | null
          scan_action?: string | null
          sha256?: string | null
          size_bytes?: number
          storage_path?: string
          target_user_id?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_files_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string
          department_id: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          priority: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          department_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          department_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          priority?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      app_build_releases: {
        Row: {
          app_version: string | null
          build_date: string
          build_time: string
          created_at: string
          fingerprint: string
          first_seen_at: string
          id: string
          registered_by: string | null
          seq: number
          updated_at: string
          version_id: string
        }
        Insert: {
          app_version?: string | null
          build_date: string
          build_time: string
          created_at?: string
          fingerprint: string
          first_seen_at?: string
          id?: string
          registered_by?: string | null
          seq: number
          updated_at?: string
          version_id: string
        }
        Update: {
          app_version?: string | null
          build_date?: string
          build_time?: string
          created_at?: string
          fingerprint?: string
          first_seen_at?: string
          id?: string
          registered_by?: string | null
          seq?: number
          updated_at?: string
          version_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          accent_color: string
          allow_self_registration: boolean
          announcement_file_cleanup_last_run_at: string | null
          announcement_file_cleanup_mode: string
          announcement_file_retention_days_department: number
          announcement_file_retention_days_global: number
          announcement_file_retention_enabled: boolean
          auto_logout_minutes: number
          auto_logout_warning_seconds: number
          biometric_enrollment_enforced_at: string | null
          biometric_enrollment_grace_days: number
          biometric_enrollment_required: boolean
          biometric_login_enabled: boolean
          biometric_required_roles: Database["public"]["Enums"]["app_role"][]
          biometric_stepup_required: boolean
          company_name: string
          contact_address: string | null
          contact_email: string | null
          contact_phone: string | null
          contact_website: string | null
          created_at: string
          dashboard_logo_url: string | null
          email_footer_text: string | null
          email_from_name: string | null
          email_header_color: string | null
          email_logo_url: string | null
          email_reply_to: string | null
          email_signature: string | null
          enable_system_health_widget: boolean
          enforce_password_change: boolean
          favicon_url: string | null
          footer_text: string
          header_text: string | null
          id: string
          lockout_auto_unlock_minutes: number | null
          lockout_threshold: number
          lockout_window_minutes: number
          login_background_url: string | null
          login_logo_url: string | null
          login_tagline: string | null
          logo_url: string | null
          max_concurrent_sessions: number
          mfa_grace_days: number
          mfa_required_roles: string[]
          min_password_length: number
          org_name: string
          password_min_strength: number
          password_require_lower: boolean
          password_require_number: boolean
          password_require_symbol: boolean
          password_require_upper: boolean
          primary_color: string
          recaptcha_enabled: boolean
          recaptcha_min_score: number
          recaptcha_site_key: string | null
          secondary_color: string
          security_scan_enabled: boolean
          security_scan_frequency: string
          security_scan_last_run_at: string | null
          session_absolute_hours: number
          staff_id_mask_rules: Json
          system_description: string | null
          system_label: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          allow_self_registration?: boolean
          announcement_file_cleanup_last_run_at?: string | null
          announcement_file_cleanup_mode?: string
          announcement_file_retention_days_department?: number
          announcement_file_retention_days_global?: number
          announcement_file_retention_enabled?: boolean
          auto_logout_minutes?: number
          auto_logout_warning_seconds?: number
          biometric_enrollment_enforced_at?: string | null
          biometric_enrollment_grace_days?: number
          biometric_enrollment_required?: boolean
          biometric_login_enabled?: boolean
          biometric_required_roles?: Database["public"]["Enums"]["app_role"][]
          biometric_stepup_required?: boolean
          company_name?: string
          contact_address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_website?: string | null
          created_at?: string
          dashboard_logo_url?: string | null
          email_footer_text?: string | null
          email_from_name?: string | null
          email_header_color?: string | null
          email_logo_url?: string | null
          email_reply_to?: string | null
          email_signature?: string | null
          enable_system_health_widget?: boolean
          enforce_password_change?: boolean
          favicon_url?: string | null
          footer_text?: string
          header_text?: string | null
          id?: string
          lockout_auto_unlock_minutes?: number | null
          lockout_threshold?: number
          lockout_window_minutes?: number
          login_background_url?: string | null
          login_logo_url?: string | null
          login_tagline?: string | null
          logo_url?: string | null
          max_concurrent_sessions?: number
          mfa_grace_days?: number
          mfa_required_roles?: string[]
          min_password_length?: number
          org_name?: string
          password_min_strength?: number
          password_require_lower?: boolean
          password_require_number?: boolean
          password_require_symbol?: boolean
          password_require_upper?: boolean
          primary_color?: string
          recaptcha_enabled?: boolean
          recaptcha_min_score?: number
          recaptcha_site_key?: string | null
          secondary_color?: string
          security_scan_enabled?: boolean
          security_scan_frequency?: string
          security_scan_last_run_at?: string | null
          session_absolute_hours?: number
          staff_id_mask_rules?: Json
          system_description?: string | null
          system_label?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          allow_self_registration?: boolean
          announcement_file_cleanup_last_run_at?: string | null
          announcement_file_cleanup_mode?: string
          announcement_file_retention_days_department?: number
          announcement_file_retention_days_global?: number
          announcement_file_retention_enabled?: boolean
          auto_logout_minutes?: number
          auto_logout_warning_seconds?: number
          biometric_enrollment_enforced_at?: string | null
          biometric_enrollment_grace_days?: number
          biometric_enrollment_required?: boolean
          biometric_login_enabled?: boolean
          biometric_required_roles?: Database["public"]["Enums"]["app_role"][]
          biometric_stepup_required?: boolean
          company_name?: string
          contact_address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_website?: string | null
          created_at?: string
          dashboard_logo_url?: string | null
          email_footer_text?: string | null
          email_from_name?: string | null
          email_header_color?: string | null
          email_logo_url?: string | null
          email_reply_to?: string | null
          email_signature?: string | null
          enable_system_health_widget?: boolean
          enforce_password_change?: boolean
          favicon_url?: string | null
          footer_text?: string
          header_text?: string | null
          id?: string
          lockout_auto_unlock_minutes?: number | null
          lockout_threshold?: number
          lockout_window_minutes?: number
          login_background_url?: string | null
          login_logo_url?: string | null
          login_tagline?: string | null
          logo_url?: string | null
          max_concurrent_sessions?: number
          mfa_grace_days?: number
          mfa_required_roles?: string[]
          min_password_length?: number
          org_name?: string
          password_min_strength?: number
          password_require_lower?: boolean
          password_require_number?: boolean
          password_require_symbol?: boolean
          password_require_upper?: boolean
          primary_color?: string
          recaptcha_enabled?: boolean
          recaptcha_min_score?: number
          recaptcha_site_key?: string | null
          secondary_color?: string
          security_scan_enabled?: boolean
          security_scan_frequency?: string
          security_scan_last_run_at?: string | null
          session_absolute_hours?: number
          staff_id_mask_rules?: Json
          system_description?: string | null
          system_label?: string
          updated_at?: string
        }
        Relationships: []
      }
      application_documents: {
        Row: {
          filename: string
          id: string
          mime_type: string | null
          record_id: string
          record_type: string
          scan_action: string | null
          sha256: string | null
          size_bytes: number | null
          slot: string
          slot_label: string | null
          sniffed_mime: string | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          filename: string
          id?: string
          mime_type?: string | null
          record_id: string
          record_type: string
          scan_action?: string | null
          sha256?: string | null
          size_bytes?: number | null
          slot: string
          slot_label?: string | null
          sniffed_mime?: string | null
          storage_path: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          filename?: string
          id?: string
          mime_type?: string | null
          record_id?: string
          record_type?: string
          scan_action?: string | null
          sha256?: string | null
          size_bytes?: number | null
          slot?: string
          slot_label?: string | null
          sniffed_mime?: string | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      appraisal_reminders_sent: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          period_month: number | null
          period_year: number
          recipients_count: number
          skipped_count: number
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          period_month?: number | null
          period_year: number
          recipients_count?: number
          skipped_count?: number
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          period_month?: number | null
          period_year?: number
          recipients_count?: number
          skipped_count?: number
        }
        Relationships: []
      }
      asset_tag_counters: {
        Row: {
          next_value: number
          updated_at: string
          year: number
        }
        Insert: {
          next_value?: number
          updated_at?: string
          year: number
        }
        Update: {
          next_value?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      attendance_compliance_snapshots: {
        Row: {
          absent: number
          compliance_pct: number
          created_at: string
          department_snapshot: string | null
          filters: Json | null
          id: string
          imported_at: string
          imported_by: string | null
          late: number
          leave_days: number
          log_completeness_pct: number
          missing_logs: number
          name_snapshot: string | null
          notes: string | null
          office_snapshot: string | null
          period_end: string
          period_start: string
          period_type: string
          present: number
          profile_id: string
          shift_snapshot: string | null
          source: string
          staff_id_snapshot: string | null
          updated_at: string
          working_days: number
        }
        Insert: {
          absent?: number
          compliance_pct?: number
          created_at?: string
          department_snapshot?: string | null
          filters?: Json | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          late?: number
          leave_days?: number
          log_completeness_pct?: number
          missing_logs?: number
          name_snapshot?: string | null
          notes?: string | null
          office_snapshot?: string | null
          period_end: string
          period_start: string
          period_type?: string
          present?: number
          profile_id: string
          shift_snapshot?: string | null
          source?: string
          staff_id_snapshot?: string | null
          updated_at?: string
          working_days?: number
        }
        Update: {
          absent?: number
          compliance_pct?: number
          created_at?: string
          department_snapshot?: string | null
          filters?: Json | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          late?: number
          leave_days?: number
          log_completeness_pct?: number
          missing_logs?: number
          name_snapshot?: string | null
          notes?: string | null
          office_snapshot?: string | null
          period_end?: string
          period_start?: string
          period_type?: string
          present?: number
          profile_id?: string
          shift_snapshot?: string | null
          source?: string
          staff_id_snapshot?: string | null
          updated_at?: string
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_compliance_snapshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_compliance_snapshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_edit_requests: {
        Row: {
          affected_date: string
          attendance_id: string | null
          created_at: string
          current_check_in: string | null
          current_check_out: string | null
          field: string
          id: string
          profile_id: string
          proposed_check_in: string | null
          proposed_check_out: string | null
          reason: string
          requested_by: string
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          affected_date: string
          attendance_id?: string | null
          created_at?: string
          current_check_in?: string | null
          current_check_out?: string | null
          field: string
          id?: string
          profile_id: string
          proposed_check_in?: string | null
          proposed_check_out?: string | null
          reason: string
          requested_by: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          affected_date?: string
          attendance_id?: string | null
          created_at?: string
          current_check_in?: string | null
          current_check_out?: string | null
          field?: string
          id?: string
          profile_id?: string
          proposed_check_in?: string | null
          proposed_check_out?: string | null
          reason?: string
          requested_by?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_edit_requests_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_edit_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_edit_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_report_recipients: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          period: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          period: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          period?: string
        }
        Relationships: []
      }
      attendance_window_settings: {
        Row: {
          created_at: string
          early_checkin_minutes: number
          enforce_window: boolean
          grace_minutes: number
          id: string
          late_checkout_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          early_checkin_minutes?: number
          enforce_window?: boolean
          grace_minutes?: number
          id?: string
          late_checkout_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          early_checkin_minutes?: number
          enforce_window?: boolean
          grace_minutes?: number
          id?: string
          late_checkout_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      attendances: {
        Row: {
          check_in: string | null
          check_in_address: string | null
          check_in_ip: unknown
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_photo_path: string | null
          check_in_reason: string | null
          check_out: string | null
          check_out_address: string | null
          check_out_ip: unknown
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_photo_path: string | null
          check_out_reason: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          profile_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
        }
        Insert: {
          check_in?: string | null
          check_in_address?: string | null
          check_in_ip?: unknown
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_photo_path?: string | null
          check_in_reason?: string | null
          check_out?: string | null
          check_out_address?: string | null
          check_out_ip?: unknown
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_photo_path?: string | null
          check_out_reason?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          profile_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Update: {
          check_in?: string | null
          check_in_address?: string | null
          check_in_ip?: unknown
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_photo_path?: string | null
          check_in_reason?: string | null
          check_out?: string | null
          check_out_address?: string | null
          check_out_ip?: unknown
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_photo_path?: string | null
          check_out_reason?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          profile_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_retention_settings: {
        Row: {
          account_unlock_days: number
          firewall_event_days: number
          id: string
          security_audit_days: number
          updated_at: string
        }
        Insert: {
          account_unlock_days?: number
          firewall_event_days?: number
          id?: string
          security_audit_days?: number
          updated_at?: string
        }
        Update: {
          account_unlock_days?: number
          firewall_event_days?: number
          id?: string
          security_audit_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      biometric_reminder_log: {
        Row: {
          channel: string
          created_at: string
          days_left: number | null
          deadline: string | null
          detail: string | null
          id: string
          kind: string
          status: string
          subject: string | null
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          days_left?: number | null
          deadline?: string | null
          detail?: string | null
          id?: string
          kind: string
          status?: string
          subject?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          days_left?: number | null
          deadline?: string | null
          detail?: string | null
          id?: string
          kind?: string
          status?: string
          subject?: string | null
          user_id?: string
        }
        Relationships: []
      }
      biometric_reminder_settings: {
        Row: {
          batch_size: number
          created_at: string
          enabled: boolean
          grace_body: string
          grace_interval_days: number
          grace_lead_days: number
          grace_subject: string
          id: string
          last_run_at: string | null
          last_run_summary: Json | null
          lease_until: string | null
          notify_email: boolean
          notify_in_app: boolean
          overdue_body: string
          overdue_interval_days: number
          overdue_subject: string
          paused_reason: string | null
          send_hour_utc: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          batch_size?: number
          created_at?: string
          enabled?: boolean
          grace_body?: string
          grace_interval_days?: number
          grace_lead_days?: number
          grace_subject?: string
          id?: string
          last_run_at?: string | null
          last_run_summary?: Json | null
          lease_until?: string | null
          notify_email?: boolean
          notify_in_app?: boolean
          overdue_body?: string
          overdue_interval_days?: number
          overdue_subject?: string
          paused_reason?: string | null
          send_hour_utc?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          batch_size?: number
          created_at?: string
          enabled?: boolean
          grace_body?: string
          grace_interval_days?: number
          grace_lead_days?: number
          grace_subject?: string
          id?: string
          last_run_at?: string | null
          last_run_summary?: Json | null
          lease_until?: string | null
          notify_email?: boolean
          notify_in_app?: boolean
          overdue_body?: string
          overdue_interval_days?: number
          overdue_subject?: string
          paused_reason?: string | null
          send_hour_utc?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      certifications: {
        Row: {
          certificate_number: string | null
          certification_name: string
          created_at: string
          date_obtained: string | null
          expiry_date: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          issuing_body: string | null
          notes: string | null
          profile_id: string
          status: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          certificate_number?: string | null
          certification_name: string
          created_at?: string
          date_obtained?: string | null
          expiry_date?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          issuing_body?: string | null
          notes?: string | null
          profile_id: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          certificate_number?: string | null
          certification_name?: string
          created_at?: string
          date_obtained?: string | null
          expiry_date?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          issuing_body?: string | null
          notes?: string | null
          profile_id?: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      command_alert_events: {
        Row: {
          action: string
          actor_id: string | null
          alert_id: string
          assigned_to: string | null
          created_at: string
          from_status:
            | Database["public"]["Enums"]["command_alert_status"]
            | null
          id: string
          note: string | null
          to_status: Database["public"]["Enums"]["command_alert_status"] | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          alert_id: string
          assigned_to?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["command_alert_status"]
            | null
          id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["command_alert_status"] | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          alert_id?: string
          assigned_to?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["command_alert_status"]
            | null
          id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["command_alert_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "command_alert_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "command_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      command_alert_photos: {
        Row: {
          alert_id: string
          caption: string | null
          content_type: string | null
          created_at: string
          id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          alert_id: string
          caption?: string | null
          content_type?: string | null
          created_at?: string
          id?: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string
        }
        Update: {
          alert_id?: string
          caption?: string | null
          content_type?: string | null
          created_at?: string
          id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "command_alert_photos_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "command_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      command_alerts: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          category: string
          closed_at: string | null
          closed_by: string | null
          closing_notes: string | null
          created_at: string
          created_by: string
          detail: string | null
          due_at: string | null
          id: string
          location: string | null
          org_unit_id: string | null
          reference: string
          severity: Database["public"]["Enums"]["command_alert_severity"]
          source_ref: string | null
          status: Database["public"]["Enums"]["command_alert_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          created_at?: string
          created_by?: string
          detail?: string | null
          due_at?: string | null
          id?: string
          location?: string | null
          org_unit_id?: string | null
          reference: string
          severity?: Database["public"]["Enums"]["command_alert_severity"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["command_alert_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          created_at?: string
          created_by?: string
          detail?: string | null
          due_at?: string | null
          id?: string
          location?: string | null
          org_unit_id?: string | null
          reference?: string
          severity?: Database["public"]["Enums"]["command_alert_severity"]
          source_ref?: string | null
          status?: Database["public"]["Enums"]["command_alert_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "command_alerts_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      command_role_audit: {
        Row: {
          action: string
          batch_id: string | null
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          from_role: Database["public"]["Enums"]["app_role"] | null
          id: string
          notes: string | null
          target_name: string | null
          target_staff_id: string | null
          target_user_id: string
          to_role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          action: string
          batch_id?: string | null
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          from_role?: Database["public"]["Enums"]["app_role"] | null
          id?: string
          notes?: string | null
          target_name?: string | null
          target_staff_id?: string | null
          target_user_id: string
          to_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          action?: string
          batch_id?: string | null
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          from_role?: Database["public"]["Enums"]["app_role"] | null
          id?: string
          notes?: string | null
          target_name?: string | null
          target_staff_id?: string | null
          target_user_id?: string
          to_role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: []
      }
      command_tier_grants: {
        Row: {
          capability: string
          created_at: string
          expires_at: string | null
          granted_by: string
          granted_by_name: string | null
          id: string
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          expires_at?: string | null
          granted_by: string
          granted_by_name?: string | null
          id?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string
          granted_by_name?: string | null
          id?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      command_vault_files: {
        Row: {
          category: string
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          related_profile_id: string | null
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          related_profile_id?: string | null
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          related_profile_id?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "command_vault_files_related_profile_id_fkey"
            columns: ["related_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "command_vault_files_related_profile_id_fkey"
            columns: ["related_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_upload_audit: {
        Row: {
          batch_id: string
          created_at: string
          error_message: string | null
          file_name: string
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          kind: string
          outcome: string
          performed_by: string
          record_id: string | null
          target_profile_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          error_message?: string | null
          file_name: string
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          kind: string
          outcome: string
          performed_by: string
          record_id?: string | null
          target_profile_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          kind?: string
          outcome?: string
          performed_by?: string
          record_id?: string | null
          target_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_upload_audit_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_upload_audit_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      confidentiality_commands: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          pinned: boolean
          slug: string
          sort_hint: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          pinned?: boolean
          slug: string
          sort_hint?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          pinned?: boolean
          slug?: string
          sort_hint?: number
          updated_at?: string
        }
        Relationships: []
      }
      cyber_incidents: {
        Row: {
          affected_systems: string | null
          assigned_to: string | null
          created_at: string
          description: string | null
          detected_at: string | null
          id: string
          impact_assessment: string | null
          impact_level: string
          incident_number: string
          incident_type: string
          org_unit_id: string | null
          reported_at: string
          reported_by: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source: string | null
          status: string
          threat_source: string | null
          title: string
          updated_at: string
        }
        Insert: {
          affected_systems?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          detected_at?: string | null
          id?: string
          impact_assessment?: string | null
          impact_level?: string
          incident_number?: string
          incident_type?: string
          org_unit_id?: string | null
          reported_at?: string
          reported_by: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string | null
          status?: string
          threat_source?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          affected_systems?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          detected_at?: string | null
          id?: string
          impact_assessment?: string | null
          impact_level?: string
          incident_number?: string
          incident_type?: string
          org_unit_id?: string | null
          reported_at?: string
          reported_by?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source?: string | null
          status?: string
          threat_source?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cyber_incidents_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      cyber_investigations: {
        Row: {
          case_number: string
          case_type: string
          closed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          evidence_summary: string | null
          id: string
          lead_investigator: string | null
          opened_at: string
          outcome: string | null
          priority: string
          referred_at: string | null
          referred_to_agency: string | null
          related_incident_id: string | null
          status: string
          suspects: string | null
          title: string
          updated_at: string
        }
        Insert: {
          case_number: string
          case_type?: string
          closed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          evidence_summary?: string | null
          id?: string
          lead_investigator?: string | null
          opened_at?: string
          outcome?: string | null
          priority?: string
          referred_at?: string | null
          referred_to_agency?: string | null
          related_incident_id?: string | null
          status?: string
          suspects?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          case_number?: string
          case_type?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          evidence_summary?: string | null
          id?: string
          lead_investigator?: string | null
          opened_at?: string
          outcome?: string | null
          priority?: string
          referred_at?: string | null
          referred_to_agency?: string | null
          related_incident_id?: string | null
          status?: string
          suspects?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cyber_investigations_related_incident_id_fkey"
            columns: ["related_incident_id"]
            isOneToOne: false
            referencedRelation: "cyber_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      cyber_threat_intel: {
        Row: {
          added_by: string
          category: string | null
          created_at: string
          description: string | null
          first_seen: string
          id: string
          indicator_type: string
          indicator_value: string
          is_active: boolean
          last_seen: string | null
          source: string | null
          threat_level: string
          updated_at: string
        }
        Insert: {
          added_by: string
          category?: string | null
          created_at?: string
          description?: string | null
          first_seen?: string
          id?: string
          indicator_type?: string
          indicator_value: string
          is_active?: boolean
          last_seen?: string | null
          source?: string | null
          threat_level?: string
          updated_at?: string
        }
        Update: {
          added_by?: string
          category?: string | null
          created_at?: string
          description?: string | null
          first_seen?: string
          id?: string
          indicator_type?: string
          indicator_value?: string
          is_active?: boolean
          last_seen?: string | null
          source?: string | null
          threat_level?: string
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          parent_department_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          parent_department_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          parent_department_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      detention_bail_print_documents: {
        Row: {
          authorization_status: string
          bail_record_id: string
          data_snapshot: Json
          id: string
          printed_at: string
          printed_by: string | null
          record_updated_at: string | null
          rendered_html: string
          template_id: string | null
          template_version: number
        }
        Insert: {
          authorization_status: string
          bail_record_id: string
          data_snapshot: Json
          id?: string
          printed_at?: string
          printed_by?: string | null
          record_updated_at?: string | null
          rendered_html: string
          template_id?: string | null
          template_version: number
        }
        Update: {
          authorization_status?: string
          bail_record_id?: string
          data_snapshot?: Json
          id?: string
          printed_at?: string
          printed_by?: string | null
          record_updated_at?: string | null
          rendered_html?: string
          template_id?: string | null
          template_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "detention_bail_print_documents_bail_record_id_fkey"
            columns: ["bail_record_id"]
            isOneToOne: false
            referencedRelation: "detention_bail_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_bail_print_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "detention_bail_print_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      detention_bail_print_templates: {
        Row: {
          authorization_status: string
          created_at: string
          created_by: string | null
          html: string
          id: string
          is_active: boolean
          label: string
          notes: string | null
          updated_at: string
          version: number
        }
        Insert: {
          authorization_status: string
          created_at?: string
          created_by?: string | null
          html: string
          id?: string
          is_active?: boolean
          label: string
          notes?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          authorization_status?: string
          created_at?: string
          created_by?: string | null
          html?: string
          id?: string
          is_active?: boolean
          label?: string
          notes?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      detention_bail_records: {
        Row: {
          authorization_remarks: string | null
          authorization_status: string
          authorized_at: string | null
          authorized_by: string | null
          authorized_by_name: string | null
          authorized_by_rank: string | null
          authorized_signature_name: string | null
          authorized_signature_url: string | null
          bail_amount: number | null
          bail_type: string
          bailee_address: string | null
          bailee_first_name: string
          bailee_gender: string | null
          bailee_id_number: string | null
          bailee_id_type: string | null
          bailee_last_name: string
          bailee_nationality: string | null
          bailee_phone: string | null
          conditions: string | null
          created_at: string
          created_by: string
          currency: string
          detention_id: string | null
          granted_at: string
          id: string
          notes: string | null
          offence: string
          reference: string | null
          report_back_at: string | null
          report_station: string | null
          surety_address: string | null
          surety_id_number: string | null
          surety_id_type: string | null
          surety_name: string | null
          surety_occupation: string | null
          surety_phone: string | null
          surety_relationship: string | null
          surety_relationship_other: string | null
          updated_at: string
        }
        Insert: {
          authorization_remarks?: string | null
          authorization_status?: string
          authorized_at?: string | null
          authorized_by?: string | null
          authorized_by_name?: string | null
          authorized_by_rank?: string | null
          authorized_signature_name?: string | null
          authorized_signature_url?: string | null
          bail_amount?: number | null
          bail_type?: string
          bailee_address?: string | null
          bailee_first_name: string
          bailee_gender?: string | null
          bailee_id_number?: string | null
          bailee_id_type?: string | null
          bailee_last_name: string
          bailee_nationality?: string | null
          bailee_phone?: string | null
          conditions?: string | null
          created_at?: string
          created_by: string
          currency?: string
          detention_id?: string | null
          granted_at?: string
          id?: string
          notes?: string | null
          offence: string
          reference?: string | null
          report_back_at?: string | null
          report_station?: string | null
          surety_address?: string | null
          surety_id_number?: string | null
          surety_id_type?: string | null
          surety_name?: string | null
          surety_occupation?: string | null
          surety_phone?: string | null
          surety_relationship?: string | null
          surety_relationship_other?: string | null
          updated_at?: string
        }
        Update: {
          authorization_remarks?: string | null
          authorization_status?: string
          authorized_at?: string | null
          authorized_by?: string | null
          authorized_by_name?: string | null
          authorized_by_rank?: string | null
          authorized_signature_name?: string | null
          authorized_signature_url?: string | null
          bail_amount?: number | null
          bail_type?: string
          bailee_address?: string | null
          bailee_first_name?: string
          bailee_gender?: string | null
          bailee_id_number?: string | null
          bailee_id_type?: string | null
          bailee_last_name?: string
          bailee_nationality?: string | null
          bailee_phone?: string | null
          conditions?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          detention_id?: string | null
          granted_at?: string
          id?: string
          notes?: string | null
          offence?: string
          reference?: string | null
          report_back_at?: string | null
          report_station?: string | null
          surety_address?: string | null
          surety_id_number?: string | null
          surety_id_type?: string | null
          surety_name?: string | null
          surety_occupation?: string | null
          surety_phone?: string | null
          surety_relationship?: string | null
          surety_relationship_other?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "detention_bail_records_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_bail_records_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_bail_records_detention_id_fkey"
            columns: ["detention_id"]
            isOneToOne: false
            referencedRelation: "detention_records"
            referencedColumns: ["id"]
          },
        ]
      }
      detention_medical_log: {
        Row: {
          attended_at: string
          attended_by: string | null
          complaint: string
          detention_id: string
          id: string
          logged_by: string
          notes: string | null
          treatment: string | null
        }
        Insert: {
          attended_at?: string
          attended_by?: string | null
          complaint: string
          detention_id: string
          id?: string
          logged_by: string
          notes?: string | null
          treatment?: string | null
        }
        Update: {
          attended_at?: string
          attended_by?: string | null
          complaint?: string
          detention_id?: string
          id?: string
          logged_by?: string
          notes?: string | null
          treatment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "detention_medical_log_detention_id_fkey"
            columns: ["detention_id"]
            isOneToOne: false
            referencedRelation: "detention_records"
            referencedColumns: ["id"]
          },
        ]
      }
      detention_property_log: {
        Row: {
          condition: string | null
          detention_id: string
          id: string
          item_description: string
          logged_at: string
          logged_by: string
          notes: string | null
          quantity: number | null
          returned_at: string | null
          returned_to: string | null
        }
        Insert: {
          condition?: string | null
          detention_id: string
          id?: string
          item_description: string
          logged_at?: string
          logged_by: string
          notes?: string | null
          quantity?: number | null
          returned_at?: string | null
          returned_to?: string | null
        }
        Update: {
          condition?: string | null
          detention_id?: string
          id?: string
          item_description?: string
          logged_at?: string
          logged_by?: string
          notes?: string | null
          quantity?: number | null
          returned_at?: string | null
          returned_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "detention_property_log_detention_id_fkey"
            columns: ["detention_id"]
            isOneToOne: false
            referencedRelation: "detention_records"
            referencedColumns: ["id"]
          },
        ]
      }
      detention_records: {
        Row: {
          alias: string | null
          archive_review_reason: string | null
          archive_review_status: string
          archive_reviewed_at: string | null
          archive_reviewed_by: string | null
          archive_reviewed_by_name: string | null
          arrest_date: string
          arresting_officer_id: string | null
          arresting_officer_name: string | null
          cell_number: string | null
          charge_description: string | null
          country_of_origin: string | null
          created_at: string
          created_by: string
          crime_type: string
          date_of_birth: string | null
          emergency_contact: string | null
          expected_release_at: string | null
          first_name: string
          gender: string | null
          home_address: string | null
          id: string
          id_number: string | null
          id_type: string | null
          intake_at: string
          last_name: string
          location_of_arrest: string | null
          marital_status: string | null
          medical_alerts: string | null
          nationality: string | null
          next_of_kin: string | null
          next_of_kin_phone: string | null
          notes: string | null
          officer_in_charge_id: string | null
          phone: string | null
          photo_url: string | null
          referred_from: string | null
          referred_from_other: string | null
          referred_to: string | null
          referred_to_other: string | null
          release_reason: string | null
          released_at: string | null
          released_by: string | null
          risk_level: string
          statement_approved_at: string | null
          statement_approved_by: string | null
          statement_approved_by_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          alias?: string | null
          archive_review_reason?: string | null
          archive_review_status?: string
          archive_reviewed_at?: string | null
          archive_reviewed_by?: string | null
          archive_reviewed_by_name?: string | null
          arrest_date?: string
          arresting_officer_id?: string | null
          arresting_officer_name?: string | null
          cell_number?: string | null
          charge_description?: string | null
          country_of_origin?: string | null
          created_at?: string
          created_by: string
          crime_type: string
          date_of_birth?: string | null
          emergency_contact?: string | null
          expected_release_at?: string | null
          first_name: string
          gender?: string | null
          home_address?: string | null
          id?: string
          id_number?: string | null
          id_type?: string | null
          intake_at?: string
          last_name: string
          location_of_arrest?: string | null
          marital_status?: string | null
          medical_alerts?: string | null
          nationality?: string | null
          next_of_kin?: string | null
          next_of_kin_phone?: string | null
          notes?: string | null
          officer_in_charge_id?: string | null
          phone?: string | null
          photo_url?: string | null
          referred_from?: string | null
          referred_from_other?: string | null
          referred_to?: string | null
          referred_to_other?: string | null
          release_reason?: string | null
          released_at?: string | null
          released_by?: string | null
          risk_level?: string
          statement_approved_at?: string | null
          statement_approved_by?: string | null
          statement_approved_by_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          alias?: string | null
          archive_review_reason?: string | null
          archive_review_status?: string
          archive_reviewed_at?: string | null
          archive_reviewed_by?: string | null
          archive_reviewed_by_name?: string | null
          arrest_date?: string
          arresting_officer_id?: string | null
          arresting_officer_name?: string | null
          cell_number?: string | null
          charge_description?: string | null
          country_of_origin?: string | null
          created_at?: string
          created_by?: string
          crime_type?: string
          date_of_birth?: string | null
          emergency_contact?: string | null
          expected_release_at?: string | null
          first_name?: string
          gender?: string | null
          home_address?: string | null
          id?: string
          id_number?: string | null
          id_type?: string | null
          intake_at?: string
          last_name?: string
          location_of_arrest?: string | null
          marital_status?: string | null
          medical_alerts?: string | null
          nationality?: string | null
          next_of_kin?: string | null
          next_of_kin_phone?: string | null
          notes?: string | null
          officer_in_charge_id?: string | null
          phone?: string | null
          photo_url?: string | null
          referred_from?: string | null
          referred_from_other?: string | null
          referred_to?: string | null
          referred_to_other?: string | null
          release_reason?: string | null
          released_at?: string | null
          released_by?: string | null
          risk_level?: string
          statement_approved_at?: string | null
          statement_approved_by?: string | null
          statement_approved_by_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "detention_records_arresting_officer_id_fkey"
            columns: ["arresting_officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_records_arresting_officer_id_fkey"
            columns: ["arresting_officer_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_records_officer_in_charge_id_fkey"
            columns: ["officer_in_charge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_records_officer_in_charge_id_fkey"
            columns: ["officer_in_charge_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_records_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_records_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_records_statement_approved_by_fkey"
            columns: ["statement_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_records_statement_approved_by_fkey"
            columns: ["statement_approved_by"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      detention_transfers: {
        Row: {
          detention_id: string
          escorted_by: string | null
          from_location: string | null
          id: string
          performed_by: string
          reason: string | null
          to_location: string
          transferred_at: string
        }
        Insert: {
          detention_id: string
          escorted_by?: string | null
          from_location?: string | null
          id?: string
          performed_by: string
          reason?: string | null
          to_location: string
          transferred_at?: string
        }
        Update: {
          detention_id?: string
          escorted_by?: string | null
          from_location?: string | null
          id?: string
          performed_by?: string
          reason?: string | null
          to_location?: string
          transferred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "detention_transfers_detention_id_fkey"
            columns: ["detention_id"]
            isOneToOne: false
            referencedRelation: "detention_records"
            referencedColumns: ["id"]
          },
        ]
      }
      detention_visitor_log: {
        Row: {
          approved_by: string
          detention_id: string
          id: string
          id_number: string | null
          notes: string | null
          phone: string | null
          relationship: string | null
          visit_end: string | null
          visit_start: string
          visitor_name: string
        }
        Insert: {
          approved_by: string
          detention_id: string
          id?: string
          id_number?: string | null
          notes?: string | null
          phone?: string | null
          relationship?: string | null
          visit_end?: string | null
          visit_start?: string
          visitor_name: string
        }
        Update: {
          approved_by?: string
          detention_id?: string
          id?: string
          id_number?: string | null
          notes?: string | null
          phone?: string | null
          relationship?: string | null
          visit_end?: string | null
          visit_start?: string
          visitor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "detention_visitor_log_detention_id_fkey"
            columns: ["detention_id"]
            isOneToOne: false
            referencedRelation: "detention_records"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_roster_entries: {
        Row: {
          created_at: string
          gender: string | null
          id: string
          import_id: string
          name: string
          rank: string
          serial_no: number
          shift: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          gender?: string | null
          id?: string
          import_id: string
          name: string
          rank: string
          serial_no: number
          shift: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          gender?: string | null
          id?: string
          import_id?: string
          name?: string
          rank?: string
          serial_no?: number
          shift?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duty_roster_entries_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "duty_roster_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_roster_imports: {
        Row: {
          committed_at: string | null
          created_at: string
          effective_date: string
          effective_end_date: string | null
          id: string
          notes: string | null
          row_count: number
          source_filename: string
          status: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          effective_date: string
          effective_end_date?: string | null
          id?: string
          notes?: string | null
          row_count?: number
          source_filename: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          effective_date?: string
          effective_end_date?: string | null
          id?: string
          notes?: string | null
          row_count?: number
          source_filename?: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      email_domain_status: {
        Row: {
          became_active_at: string | null
          created_at: string
          domain: string
          last_checked_at: string
          last_error: string | null
          notified_active: boolean
          status: string
          updated_at: string
        }
        Insert: {
          became_active_at?: string | null
          created_at?: string
          domain: string
          last_checked_at?: string
          last_error?: string | null
          notified_active?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          became_active_at?: string | null
          created_at?: string
          domain?: string
          last_checked_at?: string
          last_error?: string | null
          notified_active?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      enforcement_field_audit: {
        Row: {
          action: string
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      enforcement_operations: {
        Row: {
          action_taken: string | null
          arrests_count: number
          authorized_by: string | null
          casualties_count: number
          contact_details: string | null
          created_at: string
          department_id: string | null
          description: string | null
          follow_up_notes: string | null
          follow_up_required: boolean
          gps_coordinates: string | null
          hq_reference_number: string | null
          id: string
          items_seized: string | null
          location: string | null
          log_reference: string | null
          mugshot_path: string | null
          notes: string | null
          officer_in_charge: string | null
          operation_date: string
          operation_time: string | null
          operation_type: string
          outcome: string | null
          reported_by: string
          severity: string
          status: string
          supervisor_remarks: string | null
          suspects_count: number
          updated_at: string
          vehicles_involved: string | null
          weapons_used: string | null
          witnesses: string | null
        }
        Insert: {
          action_taken?: string | null
          arrests_count?: number
          authorized_by?: string | null
          casualties_count?: number
          contact_details?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean
          gps_coordinates?: string | null
          hq_reference_number?: string | null
          id?: string
          items_seized?: string | null
          location?: string | null
          log_reference?: string | null
          mugshot_path?: string | null
          notes?: string | null
          officer_in_charge?: string | null
          operation_date?: string
          operation_time?: string | null
          operation_type?: string
          outcome?: string | null
          reported_by: string
          severity?: string
          status?: string
          supervisor_remarks?: string | null
          suspects_count?: number
          updated_at?: string
          vehicles_involved?: string | null
          weapons_used?: string | null
          witnesses?: string | null
        }
        Update: {
          action_taken?: string | null
          arrests_count?: number
          authorized_by?: string | null
          casualties_count?: number
          contact_details?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean
          gps_coordinates?: string | null
          hq_reference_number?: string | null
          id?: string
          items_seized?: string | null
          location?: string | null
          log_reference?: string | null
          mugshot_path?: string | null
          notes?: string | null
          officer_in_charge?: string | null
          operation_date?: string
          operation_time?: string | null
          operation_type?: string
          outcome?: string | null
          reported_by?: string
          severity?: string
          status?: string
          supervisor_remarks?: string | null
          suspects_count?: number
          updated_at?: string
          vehicles_involved?: string | null
          weapons_used?: string | null
          witnesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enforcement_operations_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enforcement_operations_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enforcement_operations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_applications: {
        Row: {
          applicant_name: string
          created_at: string
          date_of_birth: string | null
          emergency_contact: string | null
          enquiry_type: string
          foreign_address: string | null
          gender: string | null
          home_address: string | null
          id: string
          marital_status: string | null
          nationality: string
          nearest_landmark: string | null
          next_of_kin: string | null
          notes: string | null
          passport_number: string | null
          phone: string | null
          processed_by: string | null
          purpose: string | null
          responded_at: string | null
          response: string | null
          status: string
          street_name: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          applicant_name: string
          created_at?: string
          date_of_birth?: string | null
          emergency_contact?: string | null
          enquiry_type?: string
          foreign_address?: string | null
          gender?: string | null
          home_address?: string | null
          id?: string
          marital_status?: string | null
          nationality: string
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          passport_number?: string | null
          phone?: string | null
          processed_by?: string | null
          purpose?: string | null
          responded_at?: string | null
          response?: string | null
          status?: string
          street_name?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          applicant_name?: string
          created_at?: string
          date_of_birth?: string | null
          emergency_contact?: string | null
          enquiry_type?: string
          foreign_address?: string | null
          gender?: string | null
          home_address?: string | null
          id?: string
          marital_status?: string | null
          nationality?: string
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          passport_number?: string | null
          phone?: string | null
          processed_by?: string | null
          purpose?: string | null
          responded_at?: string | null
          response?: string | null
          status?: string
          street_name?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      equipment_issuance: {
        Row: {
          condition: string
          created_at: string
          equipment_name: string
          id: string
          issued_date: string
          notes: string | null
          profile_id: string
          returned_date: string | null
          serial_number: string | null
          updated_at: string
        }
        Insert: {
          condition?: string
          created_at?: string
          equipment_name: string
          id?: string
          issued_date?: string
          notes?: string | null
          profile_id: string
          returned_date?: string | null
          serial_number?: string | null
          updated_at?: string
        }
        Update: {
          condition?: string
          created_at?: string
          equipment_name?: string
          id?: string
          issued_date?: string
          notes?: string | null
          profile_id?: string
          returned_date?: string | null
          serial_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_issuance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_issuance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      excuse_duty_forms: {
        Row: {
          attachment_path: string | null
          created_at: string
          diagnosis: string | null
          doctor_name: string | null
          end_date: string
          facility: string | null
          id: string
          reason: string
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_profile_id: string
          start_date: string
          status: string
          submitted_by: string
          updated_at: string
        }
        Insert: {
          attachment_path?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_name?: string | null
          end_date: string
          facility?: string | null
          id?: string
          reason: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_profile_id: string
          start_date: string
          status?: string
          submitted_by: string
          updated_at?: string
        }
        Update: {
          attachment_path?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_name?: string | null
          end_date?: string
          facility?: string | null
          id?: string
          reason?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_profile_id?: string
          start_date?: string
          status?: string
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "excuse_duty_forms_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excuse_duty_forms_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_login_attempts: {
        Row: {
          attempted_at: string
          created_at: string
          id: string
          ip_address: string | null
          staff_id: string
        }
        Insert: {
          attempted_at?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          staff_id: string
        }
        Update: {
          attempted_at?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          staff_id?: string
        }
        Relationships: []
      }
      firewall_alert_settings: {
        Row: {
          alert_on_block: boolean
          alert_on_quarantine: boolean
          email_alerts: boolean
          id: string
          repeat_offender_threshold: number
          repeat_offender_window_minutes: number
          updated_at: string
        }
        Insert: {
          alert_on_block?: boolean
          alert_on_quarantine?: boolean
          email_alerts?: boolean
          id?: string
          repeat_offender_threshold?: number
          repeat_offender_window_minutes?: number
          updated_at?: string
        }
        Update: {
          alert_on_block?: boolean
          alert_on_quarantine?: boolean
          email_alerts?: boolean
          id?: string
          repeat_offender_threshold?: number
          repeat_offender_window_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      firewall_events: {
        Row: {
          action: Database["public"]["Enums"]["firewall_action"]
          created_at: string
          details: Json
          id: string
          ip_address: string | null
          layer: Database["public"]["Enums"]["firewall_event_layer"]
          matched_rule_id: string | null
          matched_threat_id: string | null
          subject: string
          user_agent: string | null
          user_id: string | null
          user_label: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["firewall_action"]
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          layer: Database["public"]["Enums"]["firewall_event_layer"]
          matched_rule_id?: string | null
          matched_threat_id?: string | null
          subject: string
          user_agent?: string | null
          user_id?: string | null
          user_label?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["firewall_action"]
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          layer?: Database["public"]["Enums"]["firewall_event_layer"]
          matched_rule_id?: string | null
          matched_threat_id?: string | null
          subject?: string
          user_agent?: string | null
          user_id?: string | null
          user_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firewall_events_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "firewall_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firewall_events_matched_threat_id_fkey"
            columns: ["matched_threat_id"]
            isOneToOne: false
            referencedRelation: "firewall_threat_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      firewall_quarantine: {
        Row: {
          created_at: string
          id: string
          layer: Database["public"]["Enums"]["firewall_event_layer"]
          payload: Json
          reason: string
          reported_by: string | null
          reported_label: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_label: string | null
          status: Database["public"]["Enums"]["firewall_quarantine_status"]
          subject: string
        }
        Insert: {
          created_at?: string
          id?: string
          layer: Database["public"]["Enums"]["firewall_event_layer"]
          payload?: Json
          reason: string
          reported_by?: string | null
          reported_label?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_label?: string | null
          status?: Database["public"]["Enums"]["firewall_quarantine_status"]
          subject: string
        }
        Update: {
          created_at?: string
          id?: string
          layer?: Database["public"]["Enums"]["firewall_event_layer"]
          payload?: Json
          reason?: string
          reported_by?: string | null
          reported_label?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_label?: string | null
          status?: Database["public"]["Enums"]["firewall_quarantine_status"]
          subject?: string
        }
        Relationships: []
      }
      firewall_quarantine_review_requests: {
        Row: {
          created_at: string
          evidence_note: string
          id: string
          quarantine_id: string
          requested_by: string
          requested_label: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_label: string | null
          status: string
        }
        Insert: {
          created_at?: string
          evidence_note: string
          id?: string
          quarantine_id: string
          requested_by: string
          requested_label?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_label?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          evidence_note?: string
          id?: string
          quarantine_id?: string
          requested_by?: string
          requested_label?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_label?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "firewall_quarantine_review_requests_quarantine_id_fkey"
            columns: ["quarantine_id"]
            isOneToOne: false
            referencedRelation: "firewall_quarantine"
            referencedColumns: ["id"]
          },
        ]
      }
      firewall_rules: {
        Row: {
          action: Database["public"]["Enums"]["firewall_action"]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_enabled: boolean
          kind: Database["public"]["Enums"]["firewall_rule_kind"]
          pattern: string
          updated_at: string
        }
        Insert: {
          action?: Database["public"]["Enums"]["firewall_action"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          kind: Database["public"]["Enums"]["firewall_rule_kind"]
          pattern: string
          updated_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["firewall_action"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          kind?: Database["public"]["Enums"]["firewall_rule_kind"]
          pattern?: string
          updated_at?: string
        }
        Relationships: []
      }
      firewall_settings: {
        Row: {
          created_at: string
          default_action: Database["public"]["Enums"]["firewall_action"]
          feed_refresh_enabled: boolean
          id: string
          is_enabled: boolean
          link_warn_external: boolean
          max_upload_mb: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_action?: Database["public"]["Enums"]["firewall_action"]
          feed_refresh_enabled?: boolean
          id?: string
          is_enabled?: boolean
          link_warn_external?: boolean
          max_upload_mb?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_action?: Database["public"]["Enums"]["firewall_action"]
          feed_refresh_enabled?: boolean
          id?: string
          is_enabled?: boolean
          link_warn_external?: boolean
          max_upload_mb?: number
          updated_at?: string
        }
        Relationships: []
      }
      firewall_threat_entries: {
        Row: {
          created_at: string
          feed_id: string
          id: string
          kind: Database["public"]["Enums"]["firewall_rule_kind"]
          metadata: Json
          severity: string
          value: string
        }
        Insert: {
          created_at?: string
          feed_id: string
          id?: string
          kind: Database["public"]["Enums"]["firewall_rule_kind"]
          metadata?: Json
          severity?: string
          value: string
        }
        Update: {
          created_at?: string
          feed_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["firewall_rule_kind"]
          metadata?: Json
          severity?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "firewall_threat_entries_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "firewall_threat_feeds"
            referencedColumns: ["id"]
          },
        ]
      }
      firewall_threat_feeds: {
        Row: {
          cadence: string
          created_at: string
          display_name: string
          id: string
          is_enabled: boolean
          last_entry_count: number
          last_refreshed_at: string | null
          last_status: string | null
          slug: string
          source_url: string
          updated_at: string
        }
        Insert: {
          cadence?: string
          created_at?: string
          display_name: string
          id?: string
          is_enabled?: boolean
          last_entry_count?: number
          last_refreshed_at?: string | null
          last_status?: string | null
          slug: string
          source_url: string
          updated_at?: string
        }
        Update: {
          cadence?: string
          created_at?: string
          display_name?: string
          id?: string
          is_enabled?: boolean
          last_entry_count?: number
          last_refreshed_at?: string | null
          last_status?: string | null
          slug?: string
          source_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      fleet_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: Database["public"]["Enums"]["fleet_alert_type"]
          created_at: string
          fuel_level_pct: number | null
          geofence_id: string | null
          id: string
          lat: number | null
          lng: number | null
          message: string
          metadata: Json
          occurred_at: string
          raised_by: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["fleet_alert_severity"]
          speed_kph: number | null
          status: Database["public"]["Enums"]["fleet_alert_status"]
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: Database["public"]["Enums"]["fleet_alert_type"]
          created_at?: string
          fuel_level_pct?: number | null
          geofence_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          message: string
          metadata?: Json
          occurred_at?: string
          raised_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["fleet_alert_severity"]
          speed_kph?: number | null
          status?: Database["public"]["Enums"]["fleet_alert_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: Database["public"]["Enums"]["fleet_alert_type"]
          created_at?: string
          fuel_level_pct?: number | null
          geofence_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          message?: string
          metadata?: Json
          occurred_at?: string
          raised_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["fleet_alert_severity"]
          speed_kph?: number | null
          status?: Database["public"]["Enums"]["fleet_alert_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_alerts_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "fleet_geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_alerts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_fuel_readings: {
        Row: {
          cost_ghs: number | null
          created_at: string
          delta_litres: number | null
          event_type: Database["public"]["Enums"]["fleet_fuel_event"]
          id: string
          lat: number | null
          level_pct: number | null
          litres: number | null
          lng: number | null
          notes: string | null
          odometer_km: number | null
          recorded_at: string
          recorded_by: string | null
          vehicle_id: string
        }
        Insert: {
          cost_ghs?: number | null
          created_at?: string
          delta_litres?: number | null
          event_type?: Database["public"]["Enums"]["fleet_fuel_event"]
          id?: string
          lat?: number | null
          level_pct?: number | null
          litres?: number | null
          lng?: number | null
          notes?: string | null
          odometer_km?: number | null
          recorded_at?: string
          recorded_by?: string | null
          vehicle_id: string
        }
        Update: {
          cost_ghs?: number | null
          created_at?: string
          delta_litres?: number | null
          event_type?: Database["public"]["Enums"]["fleet_fuel_event"]
          id?: string
          lat?: number | null
          level_pct?: number | null
          litres?: number | null
          lng?: number | null
          notes?: string | null
          odometer_km?: number | null
          recorded_at?: string
          recorded_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_fuel_readings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_geofence_events: {
        Row: {
          alert_id: string | null
          created_at: string
          event_type: string
          geofence_id: string
          id: string
          lat: number | null
          lng: number | null
          occurred_at: string
          vehicle_id: string
        }
        Insert: {
          alert_id?: string | null
          created_at?: string
          event_type: string
          geofence_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          occurred_at?: string
          vehicle_id: string
        }
        Update: {
          alert_id?: string | null
          created_at?: string
          event_type?: string
          geofence_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          occurred_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_geofence_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "fleet_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_geofence_events_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "fleet_geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_geofence_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_geofences: {
        Row: {
          active: boolean
          center_lat: number | null
          center_lng: number | null
          created_at: string
          created_by: string | null
          description: string | null
          district_id: string | null
          id: string
          kind: Database["public"]["Enums"]["fleet_geofence_kind"]
          max_lat: number | null
          max_lng: number | null
          min_lat: number | null
          min_lng: number | null
          name: string
          org_unit_id: string | null
          polygon: Json | null
          radius_m: number | null
          severity: Database["public"]["Enums"]["fleet_alert_severity"]
          trigger_on: Database["public"]["Enums"]["fleet_geofence_trigger"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          district_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["fleet_geofence_kind"]
          max_lat?: number | null
          max_lng?: number | null
          min_lat?: number | null
          min_lng?: number | null
          name: string
          org_unit_id?: string | null
          polygon?: Json | null
          radius_m?: number | null
          severity?: Database["public"]["Enums"]["fleet_alert_severity"]
          trigger_on?: Database["public"]["Enums"]["fleet_geofence_trigger"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          district_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["fleet_geofence_kind"]
          max_lat?: number | null
          max_lng?: number | null
          min_lat?: number | null
          min_lng?: number | null
          name?: string
          org_unit_id?: string | null
          polygon?: Json | null
          radius_m?: number | null
          severity?: Database["public"]["Enums"]["fleet_alert_severity"]
          trigger_on?: Database["public"]["Enums"]["fleet_geofence_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_geofences_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_geofences_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_immobilizer_commands: {
        Row: {
          command: string
          confirmed_at: string | null
          created_at: string
          id: string
          issued_by: string | null
          issued_by_label: string | null
          lat: number | null
          lng: number | null
          reason: string
          result_note: string | null
          speed_kph: number | null
          status: string
          vehicle_id: string
        }
        Insert: {
          command: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          issued_by?: string | null
          issued_by_label?: string | null
          lat?: number | null
          lng?: number | null
          reason: string
          result_note?: string | null
          speed_kph?: number | null
          status?: string
          vehicle_id: string
        }
        Update: {
          command?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          issued_by?: string | null
          issued_by_label?: string | null
          lat?: number | null
          lng?: number | null
          reason?: string
          result_note?: string | null
          speed_kph?: number | null
          status?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_immobilizer_commands_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_ingest_keys: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          label: string
          last_used_at: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          label: string
          last_used_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          label?: string
          last_used_at?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_ingest_keys_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_maintenance_records: {
        Row: {
          cost: number | null
          created_at: string
          created_by: string | null
          downtime_days: number | null
          id: string
          notes: string | null
          odometer_km: number | null
          parts_replaced: string | null
          schedule_id: string | null
          service_date: string
          service_type: string
          status: string
          updated_at: string
          vehicle_id: string
          workshop: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          downtime_days?: number | null
          id?: string
          notes?: string | null
          odometer_km?: number | null
          parts_replaced?: string | null
          schedule_id?: string | null
          service_date?: string
          service_type: string
          status?: string
          updated_at?: string
          vehicle_id: string
          workshop?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          downtime_days?: number | null
          id?: string
          notes?: string | null
          odometer_km?: number | null
          parts_replaced?: string | null
          schedule_id?: string | null
          service_date?: string
          service_type?: string
          status?: string
          updated_at?: string
          vehicle_id?: string
          workshop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_maintenance_records_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "fleet_maintenance_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_maintenance_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_maintenance_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          interval_days: number | null
          interval_km: number | null
          is_active: boolean
          last_service_date: string | null
          last_service_odometer_km: number | null
          notes: string | null
          service_type: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          interval_days?: number | null
          interval_km?: number | null
          is_active?: boolean
          last_service_date?: string | null
          last_service_odometer_km?: number | null
          notes?: string | null
          service_type: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          interval_days?: number | null
          interval_km?: number | null
          is_active?: boolean
          last_service_date?: string | null
          last_service_odometer_km?: number | null
          notes?: string | null
          service_type?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_maintenance_schedules_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_messages: {
        Row: {
          acknowledged_at: string | null
          body: string
          created_at: string
          direction: string
          id: string
          lat: number | null
          lng: number | null
          priority: string
          read_at: string | null
          read_by: string | null
          sender_id: string | null
          sender_label: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          body: string
          created_at?: string
          direction: string
          id?: string
          lat?: number | null
          lng?: number | null
          priority?: string
          read_at?: string | null
          read_by?: string | null
          sender_id?: string | null
          sender_label?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          acknowledged_at?: string | null
          body?: string
          created_at?: string
          direction?: string
          id?: string
          lat?: number | null
          lng?: number | null
          priority?: string
          read_at?: string | null
          read_by?: string | null
          sender_id?: string | null
          sender_label?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_messages_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_positions: {
        Row: {
          altitude_m: number | null
          boot_open: boolean | null
          created_at: string
          door_open: boolean | null
          fuel_level_pct: number | null
          heading: number | null
          id: string
          ignition: boolean | null
          lat: number
          lng: number
          odometer_km: number | null
          recorded_at: string
          satellites: number | null
          source: string
          speed_kph: number | null
          vehicle_id: string
        }
        Insert: {
          altitude_m?: number | null
          boot_open?: boolean | null
          created_at?: string
          door_open?: boolean | null
          fuel_level_pct?: number | null
          heading?: number | null
          id?: string
          ignition?: boolean | null
          lat: number
          lng: number
          odometer_km?: number | null
          recorded_at?: string
          satellites?: number | null
          source?: string
          speed_kph?: number | null
          vehicle_id: string
        }
        Update: {
          altitude_m?: number | null
          boot_open?: boolean | null
          created_at?: string
          door_open?: boolean | null
          fuel_level_pct?: number | null
          heading?: number | null
          id?: string
          ignition?: boolean | null
          lat?: number
          lng?: number
          odometer_km?: number | null
          recorded_at?: string
          satellites?: number | null
          source?: string
          speed_kph?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_positions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_vehicles: {
        Row: {
          assigned_driver_id: string | null
          call_sign: string | null
          created_at: string
          created_by: string | null
          demo_step: number
          department_id: string | null
          device_id: string | null
          fuel_capacity_litres: number | null
          fuel_drop_threshold_pct: number
          id: string
          immobilized: boolean
          immobilized_at: string | null
          immobilized_by: string | null
          immobilizer_reason: string | null
          immobilizer_state: string
          is_demo: boolean
          last_boot_open: boolean | null
          last_door_open: boolean | null
          last_fuel_level_pct: number | null
          last_heading: number | null
          last_ignition: boolean | null
          last_lat: number | null
          last_lng: number | null
          last_seen_at: string | null
          last_speed_kph: number | null
          low_fuel_threshold_pct: number
          make: string | null
          model: string | null
          model_year: number | null
          notes: string | null
          odometer_km: number
          org_unit_id: string | null
          registration_number: string
          speed_limit_kph: number
          status: Database["public"]["Enums"]["fleet_vehicle_status"]
          updated_at: string
          vehicle_type: string
        }
        Insert: {
          assigned_driver_id?: string | null
          call_sign?: string | null
          created_at?: string
          created_by?: string | null
          demo_step?: number
          department_id?: string | null
          device_id?: string | null
          fuel_capacity_litres?: number | null
          fuel_drop_threshold_pct?: number
          id?: string
          immobilized?: boolean
          immobilized_at?: string | null
          immobilized_by?: string | null
          immobilizer_reason?: string | null
          immobilizer_state?: string
          is_demo?: boolean
          last_boot_open?: boolean | null
          last_door_open?: boolean | null
          last_fuel_level_pct?: number | null
          last_heading?: number | null
          last_ignition?: boolean | null
          last_lat?: number | null
          last_lng?: number | null
          last_seen_at?: string | null
          last_speed_kph?: number | null
          low_fuel_threshold_pct?: number
          make?: string | null
          model?: string | null
          model_year?: number | null
          notes?: string | null
          odometer_km?: number
          org_unit_id?: string | null
          registration_number: string
          speed_limit_kph?: number
          status?: Database["public"]["Enums"]["fleet_vehicle_status"]
          updated_at?: string
          vehicle_type?: string
        }
        Update: {
          assigned_driver_id?: string | null
          call_sign?: string | null
          created_at?: string
          created_by?: string | null
          demo_step?: number
          department_id?: string | null
          device_id?: string | null
          fuel_capacity_litres?: number | null
          fuel_drop_threshold_pct?: number
          id?: string
          immobilized?: boolean
          immobilized_at?: string | null
          immobilized_by?: string | null
          immobilizer_reason?: string | null
          immobilizer_state?: string
          is_demo?: boolean
          last_boot_open?: boolean | null
          last_door_open?: boolean | null
          last_fuel_level_pct?: number | null
          last_heading?: number | null
          last_ignition?: boolean | null
          last_lat?: number | null
          last_lng?: number | null
          last_seen_at?: string | null
          last_speed_kph?: number | null
          low_fuel_threshold_pct?: number
          make?: string | null
          model?: string | null
          model_year?: number | null
          notes?: string | null
          odometer_km?: number
          org_unit_id?: string | null
          registration_number?: string
          speed_limit_kph?: number
          status?: Database["public"]["Enums"]["fleet_vehicle_status"]
          updated_at?: string
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_vehicles_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_vehicles_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      forced_signouts: {
        Row: {
          block_id: string | null
          created_at: string
          device_fingerprint: string | null
          expires_at: string
          id: string
          ip_address: string | null
          reason: string | null
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          device_fingerprint?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          reason?: string | null
        }
        Update: {
          block_id?: string | null
          created_at?: string
          device_fingerprint?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forced_signouts_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "ip_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      front_desk_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string
          entity_type: string
          id: string
          performed_by: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          performed_by: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          performed_by?: string
        }
        Relationships: []
      }
      fuel_request_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          request_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          request_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          request_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "fuel_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_requests: {
        Row: {
          branch: string | null
          created_at: string
          estimated_cost_ghs: number | null
          fuel_type: string
          id: string
          issued_at: string | null
          issued_by: string | null
          litres_issued: number | null
          litres_requested: number
          odometer_km: number | null
          org_unit_id: string | null
          purpose: string
          request_number: string
          requested_by: string | null
          requested_by_name: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          status: string
          updated_at: string
          urgency: string
          vehicle_id: string | null
        }
        Insert: {
          branch?: string | null
          created_at?: string
          estimated_cost_ghs?: number | null
          fuel_type?: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          litres_issued?: number | null
          litres_requested: number
          odometer_km?: number | null
          org_unit_id?: string | null
          purpose: string
          request_number: string
          requested_by?: string | null
          requested_by_name?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: string
          updated_at?: string
          urgency?: string
          vehicle_id?: string | null
        }
        Update: {
          branch?: string | null
          created_at?: string
          estimated_cost_ghs?: number | null
          fuel_type?: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          litres_issued?: number | null
          litres_requested?: number
          odometer_km?: number | null
          org_unit_id?: string | null
          purpose?: string
          request_number?: string
          requested_by?: string | null
          requested_by_name?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: string
          updated_at?: string
          urgency?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_requests_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      ghana_districts: {
        Row: {
          category: string
          centroid_lat: number
          centroid_lng: number
          code: string
          created_at: string
          id: string
          max_lat: number
          max_lng: number
          min_lat: number
          min_lng: number
          name: string
          polygon: Json
          region: string
          source: string
          updated_at: string
        }
        Insert: {
          category?: string
          centroid_lat: number
          centroid_lng: number
          code: string
          created_at?: string
          id?: string
          max_lat: number
          max_lng: number
          min_lat: number
          min_lng: number
          name: string
          polygon: Json
          region: string
          source?: string
          updated_at?: string
        }
        Update: {
          category?: string
          centroid_lat?: number
          centroid_lng?: number
          code?: string
          created_at?: string
          id?: string
          max_lat?: number
          max_lng?: number
          min_lat?: number
          min_lng?: number
          name?: string
          polygon?: Json
          region?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      ghana_regional_capitals: {
        Row: {
          capital: string
          created_at: string
          district_code: string | null
          district_id: string | null
          id: string
          lat: number
          lng: number
          region: string
          updated_at: string
        }
        Insert: {
          capital: string
          created_at?: string
          district_code?: string | null
          district_id?: string | null
          id?: string
          lat: number
          lng: number
          region: string
          updated_at?: string
        }
        Update: {
          capital?: string
          created_at?: string
          district_code?: string | null
          district_id?: string | null
          id?: string
          lat?: number
          lng?: number
          region?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghana_regional_capitals_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
        ]
      }
      guard_schedule_assignments: {
        Row: {
          created_at: string
          duty_date: string
          id: string
          name_text: string
          notes: string | null
          position_label: string | null
          profile_id: string | null
          rank_text: string | null
          schedule_id: string
          serial_no: number | null
          shift: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          duty_date: string
          id?: string
          name_text: string
          notes?: string | null
          position_label?: string | null
          profile_id?: string | null
          rank_text?: string | null
          schedule_id: string
          serial_no?: number | null
          shift: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          duty_date?: string
          id?: string
          name_text?: string
          notes?: string | null
          position_label?: string | null
          profile_id?: string | null
          rank_text?: string | null
          schedule_id?: string
          serial_no?: number | null
          shift?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guard_schedule_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guard_schedule_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guard_schedule_assignments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "guard_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      guard_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          name: string
          notes: string | null
          published_at: string | null
          source_import_id: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          name: string
          notes?: string | null
          published_at?: string | null
          source_import_id?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          name?: string
          notes?: string | null
          published_at?: string | null
          source_import_id?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guard_schedules_source_import_id_fkey"
            columns: ["source_import_id"]
            isOneToOne: false
            referencedRelation: "duty_roster_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      health_reports: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          report_date: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          report_date?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          report_date?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      healthcare_services: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          description: string | null
          fee: number | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          fee?: number | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          fee?: number | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          name: string
          recurring: boolean
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name: string
          recurring?: boolean
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string
          recurring?: boolean
        }
        Relationships: []
      }
      hrm_export_audit: {
        Row: {
          created_at: string
          details: Json
          export_kind: string
          exported_by: string
          exported_label: string | null
          format: string
          id: string
          row_count: number
          subject: string | null
          watermarked: boolean
        }
        Insert: {
          created_at?: string
          details?: Json
          export_kind: string
          exported_by: string
          exported_label?: string | null
          format: string
          id?: string
          row_count?: number
          subject?: string | null
          watermarked?: boolean
        }
        Update: {
          created_at?: string
          details?: Json
          export_kind?: string
          exported_by?: string
          exported_label?: string | null
          format?: string
          id?: string
          row_count?: number
          subject?: string | null
          watermarked?: boolean
        }
        Relationships: []
      }
      hrm_export_settings: {
        Row: {
          block_non_command: boolean
          classification_label: string
          id: string
          updated_at: string
          watermark_csv: boolean
          watermark_pdf: boolean
        }
        Insert: {
          block_non_command?: boolean
          classification_label?: string
          id?: string
          updated_at?: string
          watermark_csv?: boolean
          watermark_pdf?: boolean
        }
        Update: {
          block_non_command?: boolean
          classification_label?: string
          id?: string
          updated_at?: string
          watermark_csv?: boolean
          watermark_pdf?: boolean
        }
        Relationships: []
      }
      interlink_approval_actions: {
        Row: {
          action: string
          comment: string | null
          created_at: string
          dispatch_id: string
          entry_hash: string | null
          from_state: string | null
          id: string
          performed_by: string
          performer_role: string | null
          prev_hash: string | null
          to_state: string | null
        }
        Insert: {
          action: string
          comment?: string | null
          created_at?: string
          dispatch_id: string
          entry_hash?: string | null
          from_state?: string | null
          id?: string
          performed_by: string
          performer_role?: string | null
          prev_hash?: string | null
          to_state?: string | null
        }
        Update: {
          action?: string
          comment?: string | null
          created_at?: string
          dispatch_id?: string
          entry_hash?: string | null
          from_state?: string | null
          id?: string
          performed_by?: string
          performer_role?: string | null
          prev_hash?: string | null
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interlink_approval_actions_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "interlink_dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      interlink_attachment_rules: {
        Row: {
          allowed_file_types: string[]
          cover_page_body: string | null
          cover_page_enabled: boolean
          cover_page_title: string | null
          created_at: string
          created_by: string
          description: string | null
          exclude_categories: string[]
          filename_template: string
          id: string
          include_categories: string[]
          is_active: boolean
          max_files: number
          max_total_mb: number
          name: string
          updated_at: string
        }
        Insert: {
          allowed_file_types?: string[]
          cover_page_body?: string | null
          cover_page_enabled?: boolean
          cover_page_title?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          exclude_categories?: string[]
          filename_template?: string
          id?: string
          include_categories?: string[]
          is_active?: boolean
          max_files?: number
          max_total_mb?: number
          name: string
          updated_at?: string
        }
        Update: {
          allowed_file_types?: string[]
          cover_page_body?: string | null
          cover_page_enabled?: boolean
          cover_page_title?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          exclude_categories?: string[]
          filename_template?: string
          id?: string
          include_categories?: string[]
          is_active?: boolean
          max_files?: number
          max_total_mb?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      interlink_branding: {
        Row: {
          id: boolean
          tagline: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          tagline?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          tagline?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      interlink_contacts: {
        Row: {
          command_or_unit: string | null
          created_at: string
          created_by: string
          display_name: string
          email: string
          id: string
          notes: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          command_or_unit?: string | null
          created_at?: string
          created_by: string
          display_name: string
          email: string
          id?: string
          notes?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          command_or_unit?: string | null
          created_at?: string
          created_by?: string
          display_name?: string
          email?: string
          id?: string
          notes?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      interlink_dispatches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approver_id: string | null
          attachment_count: number
          attachment_names: string[]
          attachment_rule_id: string | null
          created_at: string
          error_message: string | null
          failed_count: number
          id: string
          message: string | null
          performed_by: string
          recipient_count: number
          recipient_emails: string[]
          rejected_reason: string | null
          report_kind: string | null
          results: Json
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_id: string | null
          schedule_id: string | null
          scope: string
          sent_count: number
          source: string
          status: string
          subject: string
          total_attachment_bytes: number
          workflow_state: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approver_id?: string | null
          attachment_count?: number
          attachment_names?: string[]
          attachment_rule_id?: string | null
          created_at?: string
          error_message?: string | null
          failed_count?: number
          id?: string
          message?: string | null
          performed_by: string
          recipient_count?: number
          recipient_emails?: string[]
          rejected_reason?: string | null
          report_kind?: string | null
          results?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_id?: string | null
          schedule_id?: string | null
          scope: string
          sent_count?: number
          source?: string
          status?: string
          subject: string
          total_attachment_bytes?: number
          workflow_state?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approver_id?: string | null
          attachment_count?: number
          attachment_names?: string[]
          attachment_rule_id?: string | null
          created_at?: string
          error_message?: string | null
          failed_count?: number
          id?: string
          message?: string | null
          performed_by?: string
          recipient_count?: number
          recipient_emails?: string[]
          rejected_reason?: string | null
          report_kind?: string | null
          results?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_id?: string | null
          schedule_id?: string | null
          scope?: string
          sent_count?: number
          source?: string
          status?: string
          subject?: string
          total_attachment_bytes?: number
          workflow_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "interlink_dispatches_attachment_rule_id_fkey"
            columns: ["attachment_rule_id"]
            isOneToOne: false
            referencedRelation: "interlink_attachment_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interlink_dispatches_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "interlink_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      interlink_lists: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          member_emails: string[]
          name: string
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          member_emails?: string[]
          name: string
          scope?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          member_emails?: string[]
          name?: string
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      interlink_lists_audit: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          after_row: Json | null
          before_row: Json | null
          created_at: string
          diff: Json
          id: string
          list_id: string
          list_name: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          after_row?: Json | null
          before_row?: Json | null
          created_at?: string
          diff?: Json
          id?: string
          list_id: string
          list_name?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          after_row?: Json | null
          before_row?: Json | null
          created_at?: string
          diff?: Json
          id?: string
          list_id?: string
          list_name?: string | null
        }
        Relationships: []
      }
      interlink_notification_log: {
        Row: {
          attempt_count: number
          channel: string
          created_at: string
          dispatch_id: string
          error_message: string | null
          event: string
          id: string
          last_attempt_at: string
          metadata: Json
          resent_at: string | null
          resent_by: string | null
          status: string
          target_email: string | null
          target_user_id: string | null
          workflow_state: string | null
        }
        Insert: {
          attempt_count?: number
          channel: string
          created_at?: string
          dispatch_id: string
          error_message?: string | null
          event: string
          id?: string
          last_attempt_at?: string
          metadata?: Json
          resent_at?: string | null
          resent_by?: string | null
          status?: string
          target_email?: string | null
          target_user_id?: string | null
          workflow_state?: string | null
        }
        Update: {
          attempt_count?: number
          channel?: string
          created_at?: string
          dispatch_id?: string
          error_message?: string | null
          event?: string
          id?: string
          last_attempt_at?: string
          metadata?: Json
          resent_at?: string | null
          resent_by?: string | null
          status?: string
          target_email?: string | null
          target_user_id?: string | null
          workflow_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interlink_notification_log_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "interlink_dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      interlink_schedules: {
        Row: {
          approver_id: string | null
          attachment_rule_id: string | null
          created_at: string
          created_by: string
          day_of_month: number | null
          day_of_week: number | null
          description: string | null
          frequency: string
          id: string
          is_active: boolean
          last_run_at: string | null
          message_template: string | null
          name: string
          next_run_at: string | null
          recipient_adhoc_emails: string[]
          recipient_contact_ids: string[]
          recipient_dept_ids: string[]
          recipient_list_ids: string[]
          report_kind: string
          requires_per_run_approval: boolean
          reviewer_id: string | null
          run_time: string
          scope: string
          subject_template: string
          updated_at: string
        }
        Insert: {
          approver_id?: string | null
          attachment_rule_id?: string | null
          created_at?: string
          created_by: string
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          message_template?: string | null
          name: string
          next_run_at?: string | null
          recipient_adhoc_emails?: string[]
          recipient_contact_ids?: string[]
          recipient_dept_ids?: string[]
          recipient_list_ids?: string[]
          report_kind: string
          requires_per_run_approval?: boolean
          reviewer_id?: string | null
          run_time?: string
          scope: string
          subject_template: string
          updated_at?: string
        }
        Update: {
          approver_id?: string | null
          attachment_rule_id?: string | null
          created_at?: string
          created_by?: string
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          message_template?: string | null
          name?: string
          next_run_at?: string | null
          recipient_adhoc_emails?: string[]
          recipient_contact_ids?: string[]
          recipient_dept_ids?: string[]
          recipient_list_ids?: string[]
          report_kind?: string
          requires_per_run_approval?: boolean
          reviewer_id?: string | null
          run_time?: string
          scope?: string
          subject_template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interlink_schedules_attachment_rule_id_fkey"
            columns: ["attachment_rule_id"]
            isOneToOne: false
            referencedRelation: "interlink_attachment_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_alert_overrides: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          scope_type: string
          scope_value: string
          updated_at: string
          variance_qty_threshold: number
          variance_value_threshold: number
          webhook_enabled: boolean
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          scope_type: string
          scope_value: string
          updated_at?: string
          variance_qty_threshold?: number
          variance_value_threshold?: number
          webhook_enabled?: boolean
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          scope_type?: string
          scope_value?: string
          updated_at?: string
          variance_qty_threshold?: number
          variance_value_threshold?: number
          webhook_enabled?: boolean
          webhook_url?: string | null
        }
        Relationships: []
      }
      inventory_alert_overrides_audit: {
        Row: {
          action: string
          changed_fields: string[] | null
          created_at: string
          entry_hash: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          override_id: string | null
          performed_by: string | null
          performed_by_name: string | null
          prev_hash: string | null
          scope_type: string | null
          scope_value: string | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          created_at?: string
          entry_hash?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          override_id?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          prev_hash?: string | null
          scope_type?: string | null
          scope_value?: string | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          created_at?: string
          entry_hash?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          override_id?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          prev_hash?: string | null
          scope_type?: string | null
          scope_value?: string | null
        }
        Relationships: []
      }
      inventory_alert_settings: {
        Row: {
          alert_email_enabled: boolean
          alert_webhook_enabled: boolean
          created_at: string
          email_recipients: string[]
          id: string
          low_stock_enabled: boolean
          updated_at: string
          updated_by: string | null
          variance_enabled: boolean
          variance_qty_threshold: number
          variance_value_threshold: number
          webhook_url: string | null
        }
        Insert: {
          alert_email_enabled?: boolean
          alert_webhook_enabled?: boolean
          created_at?: string
          email_recipients?: string[]
          id?: string
          low_stock_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          variance_enabled?: boolean
          variance_qty_threshold?: number
          variance_value_threshold?: number
          webhook_url?: string | null
        }
        Update: {
          alert_email_enabled?: boolean
          alert_webhook_enabled?: boolean
          created_at?: string
          email_recipients?: string[]
          id?: string
          low_stock_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          variance_enabled?: boolean
          variance_qty_threshold?: number
          variance_value_threshold?: number
          webhook_url?: string | null
        }
        Relationships: []
      }
      inventory_audit_counts: {
        Row: {
          counted_at: string
          counted_by: string | null
          created_at: string
          id: string
          item_id: string
          notes: string | null
          physical_count: number
          system_qty: number
          variance: number | null
        }
        Insert: {
          counted_at?: string
          counted_by?: string | null
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          physical_count?: number
          system_qty?: number
          variance?: number | null
        }
        Update: {
          counted_at?: string
          counted_by?: string | null
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          physical_count?: number
          system_qty?: number
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_audit_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_audit_runs: {
        Row: {
          created_at: string
          delivery_status: Json
          id: string
          mismatched_count: number
          net_variance_value: number
          report_csv_path: string | null
          report_pdf_path: string | null
          schedule_id: string | null
          summary_json: Json
          triggered_by: string | null
          triggered_kind: string
        }
        Insert: {
          created_at?: string
          delivery_status?: Json
          id?: string
          mismatched_count?: number
          net_variance_value?: number
          report_csv_path?: string | null
          report_pdf_path?: string | null
          schedule_id?: string | null
          summary_json?: Json
          triggered_by?: string | null
          triggered_kind?: string
        }
        Update: {
          created_at?: string
          delivery_status?: Json
          id?: string
          mismatched_count?: number
          net_variance_value?: number
          report_csv_path?: string | null
          report_pdf_path?: string | null
          schedule_id?: string | null
          summary_json?: Json
          triggered_by?: string | null
          triggered_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_audit_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "inventory_audit_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_audit_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          frequency: string
          id: string
          last_report_path: string | null
          last_report_pdf_path: string | null
          last_run_at: string | null
          next_run_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          frequency: string
          id?: string
          last_report_path?: string | null
          last_report_pdf_path?: string | null
          last_run_at?: string | null
          next_run_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          frequency?: string
          id?: string
          last_report_path?: string | null
          last_report_pdf_path?: string | null
          last_run_at?: string | null
          next_run_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_issuance: {
        Row: {
          condition_on_return: string | null
          created_at: string
          id: string
          issued_at: string
          issued_by: string
          item_id: string
          notes: string | null
          profile_id: string
          quantity: number
          returned_at: string | null
          updated_at: string
        }
        Insert: {
          condition_on_return?: string | null
          created_at?: string
          id?: string
          issued_at?: string
          issued_by: string
          item_id: string
          notes?: string | null
          profile_id: string
          quantity: number
          returned_at?: string | null
          updated_at?: string
        }
        Update: {
          condition_on_return?: string | null
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string
          item_id?: string
          notes?: string | null
          profile_id?: string
          quantity?: number
          returned_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_issuance_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_issuance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_issuance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          asset_tag: string | null
          category_id: string | null
          condition: string | null
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          manufacturer: string | null
          min_stock: number
          model: string | null
          name: string
          notes: string | null
          photo_url: string | null
          purchase_date: string | null
          qty_on_hand: number
          serial_number: string | null
          sku: string | null
          unit: string
          unit_cost: number | null
          updated_at: string
          warranty_expires: string | null
        }
        Insert: {
          asset_tag?: string | null
          category_id?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          manufacturer?: string | null
          min_stock?: number
          model?: string | null
          name: string
          notes?: string | null
          photo_url?: string | null
          purchase_date?: string | null
          qty_on_hand?: number
          serial_number?: string | null
          sku?: string | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string
          warranty_expires?: string | null
        }
        Update: {
          asset_tag?: string | null
          category_id?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          manufacturer?: string | null
          min_stock?: number
          model?: string | null
          name?: string
          notes?: string | null
          photo_url?: string | null
          purchase_date?: string | null
          qty_on_hand?: number
          serial_number?: string | null
          sku?: string | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string
          warranty_expires?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          from_location: string | null
          id: string
          issued_to_profile_id: string | null
          item_id: string
          movement_date: string
          movement_type: string
          notes: string | null
          performed_by: string
          quantity: number
          reference: string | null
          supplier_id: string | null
          to_location: string | null
        }
        Insert: {
          created_at?: string
          from_location?: string | null
          id?: string
          issued_to_profile_id?: string | null
          item_id: string
          movement_date?: string
          movement_type: string
          notes?: string | null
          performed_by: string
          quantity: number
          reference?: string | null
          supplier_id?: string | null
          to_location?: string | null
        }
        Update: {
          created_at?: string
          from_location?: string | null
          id?: string
          issued_to_profile_id?: string | null
          item_id?: string
          movement_date?: string
          movement_type?: string
          notes?: string | null
          performed_by?: string
          quantity?: number
          reference?: string | null
          supplier_id?: string | null
          to_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_issued_to_profile_id_fkey"
            columns: ["issued_to_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_issued_to_profile_id_fkey"
            columns: ["issued_to_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "inventory_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ip_block_audit: {
        Row: {
          action: string
          block_id: string | null
          blocked_until: string | null
          created_at: string
          device_fingerprint: string | null
          duration_minutes: number | null
          id: string
          ip_address: string | null
          mac_address: string | null
          notes: string | null
          performed_by: string | null
          performed_by_name: string | null
          reason: string | null
        }
        Insert: {
          action: string
          block_id?: string | null
          blocked_until?: string | null
          created_at?: string
          device_fingerprint?: string | null
          duration_minutes?: number | null
          id?: string
          ip_address?: string | null
          mac_address?: string | null
          notes?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          block_id?: string | null
          blocked_until?: string | null
          created_at?: string
          device_fingerprint?: string | null
          duration_minutes?: number | null
          id?: string
          ip_address?: string | null
          mac_address?: string | null
          notes?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ip_block_audit_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "ip_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_blocks: {
        Row: {
          active: boolean
          blocked_at: string
          blocked_by: string | null
          blocked_until: string | null
          created_at: string
          device_fingerprint: string | null
          id: string
          ip_address: string
          mac_address: string | null
          notes: string | null
          reason: string
          unblocked_at: string | null
          unblocked_by: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          blocked_at?: string
          blocked_by?: string | null
          blocked_until?: string | null
          created_at?: string
          device_fingerprint?: string | null
          id?: string
          ip_address: string
          mac_address?: string | null
          notes?: string | null
          reason?: string
          unblocked_at?: string | null
          unblocked_by?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          blocked_at?: string
          blocked_by?: string | null
          blocked_until?: string | null
          created_at?: string
          device_fingerprint?: string | null
          id?: string
          ip_address?: string
          mac_address?: string | null
          notes?: string | null
          reason?: string
          unblocked_at?: string | null
          unblocked_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ipse_sanctions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          label: string
          recommended_action: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          label: string
          recommended_action?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          recommended_action?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          approved_by: string | null
          attachment_path: string | null
          comments: string | null
          created_at: string
          decided_at: string | null
          department_id: string | null
          end_date: string
          id: string
          profile_id: string
          reason: string | null
          shift_group: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          type: Database["public"]["Enums"]["leave_type"]
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          attachment_path?: string | null
          comments?: string | null
          created_at?: string
          decided_at?: string | null
          department_id?: string | null
          end_date: string
          id?: string
          profile_id: string
          reason?: string | null
          shift_group?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          type: Database["public"]["Enums"]["leave_type"]
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          attachment_path?: string | null
          comments?: string | null
          created_at?: string
          decided_at?: string | null
          department_id?: string | null
          end_date?: string
          id?: string
          profile_id?: string
          reason?: string | null
          shift_group?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          type?: Database["public"]["Enums"]["leave_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_applications: {
        Row: {
          amount: number
          applicant_name: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          phone: string
          purpose: string | null
          repayment_months: number
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          applicant_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          phone: string
          purpose?: string | null
          repayment_months?: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          applicant_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          phone?: string
          purpose?: string | null
          repayment_months?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      map_access_audit: {
        Row: {
          id: string
          occurred_at: string
          surface: string
          user_id: string
          view_mode: string | null
        }
        Insert: {
          id?: string
          occurred_at?: string
          surface: string
          user_id: string
          view_mode?: string | null
        }
        Update: {
          id?: string
          occurred_at?: string
          surface?: string
          user_id?: string
          view_mode?: string | null
        }
        Relationships: []
      }
      me_activities: {
        Row: {
          actual_cost: number | null
          actual_end: string | null
          actual_start: string | null
          archived_at: string | null
          classification: string
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          district_id: string | null
          id: string
          is_demo: boolean
          name: string
          org_unit_id: string | null
          owner_profile_id: string | null
          parent_id: string | null
          percent_complete: number
          planned_cost: number | null
          planned_end: string | null
          planned_start: string | null
          priority: string
          project_id: string
          ref_code: string | null
          region: string | null
          status: string
          updated_at: string
          workstream_id: string | null
        }
        Insert: {
          actual_cost?: number | null
          actual_end?: string | null
          actual_start?: string | null
          archived_at?: string | null
          classification?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          district_id?: string | null
          id?: string
          is_demo?: boolean
          name: string
          org_unit_id?: string | null
          owner_profile_id?: string | null
          parent_id?: string | null
          percent_complete?: number
          planned_cost?: number | null
          planned_end?: string | null
          planned_start?: string | null
          priority?: string
          project_id: string
          ref_code?: string | null
          region?: string | null
          status?: string
          updated_at?: string
          workstream_id?: string | null
        }
        Update: {
          actual_cost?: number | null
          actual_end?: string | null
          actual_start?: string | null
          archived_at?: string | null
          classification?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          district_id?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          org_unit_id?: string | null
          owner_profile_id?: string | null
          parent_id?: string | null
          percent_complete?: number
          planned_cost?: number | null
          planned_end?: string | null
          planned_start?: string | null
          priority?: string
          project_id?: string
          ref_code?: string | null
          region?: string | null
          status?: string
          updated_at?: string
          workstream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "me_activities_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_activities_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_activities_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_activities_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_activities_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_activities_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "me_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_activities_workstream_id_fkey"
            columns: ["workstream_id"]
            isOneToOne: false
            referencedRelation: "me_workstreams"
            referencedColumns: ["id"]
          },
        ]
      }
      me_approval_steps: {
        Row: {
          acted_at: string | null
          action: string | null
          approval_id: string
          approver_user_id: string | null
          comment: string | null
          created_at: string
          delegated_to: string | null
          id: string
          step_order: number
          step_role: string | null
        }
        Insert: {
          acted_at?: string | null
          action?: string | null
          approval_id: string
          approver_user_id?: string | null
          comment?: string | null
          created_at?: string
          delegated_to?: string | null
          id?: string
          step_order: number
          step_role?: string | null
        }
        Update: {
          acted_at?: string | null
          action?: string | null
          approval_id?: string
          approver_user_id?: string | null
          comment?: string | null
          created_at?: string
          delegated_to?: string | null
          id?: string
          step_order?: number
          step_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "me_approval_steps_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "me_approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      me_approvals: {
        Row: {
          classification: string
          completed_at: string | null
          created_at: string
          current_step: number
          due_date: string | null
          id: string
          is_demo: boolean
          org_unit_id: string | null
          record_id: string
          record_type: string
          requested_by: string | null
          status: string
          updated_at: string
          workflow_key: string
        }
        Insert: {
          classification?: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          due_date?: string | null
          id?: string
          is_demo?: boolean
          org_unit_id?: string | null
          record_id: string
          record_type: string
          requested_by?: string | null
          status?: string
          updated_at?: string
          workflow_key?: string
        }
        Update: {
          classification?: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          due_date?: string | null
          id?: string
          is_demo?: boolean
          org_unit_id?: string | null
          record_id?: string
          record_type?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
          workflow_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "me_approvals_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      me_budget_lines: {
        Row: {
          approved_amount: number
          budget_id: string
          category: string | null
          committed_amount: number
          created_at: string
          description: string
          id: string
          is_demo: boolean
          line_code: string | null
          revised_amount: number | null
          updated_at: string
        }
        Insert: {
          approved_amount?: number
          budget_id: string
          category?: string | null
          committed_amount?: number
          created_at?: string
          description: string
          id?: string
          is_demo?: boolean
          line_code?: string | null
          revised_amount?: number | null
          updated_at?: string
        }
        Update: {
          approved_amount?: number
          budget_id?: string
          category?: string | null
          committed_amount?: number
          created_at?: string
          description?: string
          id?: string
          is_demo?: boolean
          line_code?: string | null
          revised_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "me_budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "me_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      me_budgets: {
        Row: {
          approved_amount: number
          classification: string
          committed_amount: number
          created_at: string
          created_by: string | null
          currency: string
          department_id: string | null
          external_ref: string | null
          fiscal_year: number
          funding_source: string | null
          id: string
          is_demo: boolean
          name: string
          objective_id: string | null
          org_unit_id: string | null
          program_id: string | null
          project_id: string | null
          ref_code: string | null
          region: string | null
          revised_amount: number | null
          status: string
          sync_status: string
          synced_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          approved_amount?: number
          classification?: string
          committed_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          department_id?: string | null
          external_ref?: string | null
          fiscal_year: number
          funding_source?: string | null
          id?: string
          is_demo?: boolean
          name: string
          objective_id?: string | null
          org_unit_id?: string | null
          program_id?: string | null
          project_id?: string | null
          ref_code?: string | null
          region?: string | null
          revised_amount?: number | null
          status?: string
          sync_status?: string
          synced_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          approved_amount?: number
          classification?: string
          committed_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          department_id?: string | null
          external_ref?: string | null
          fiscal_year?: number
          funding_source?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          objective_id?: string | null
          org_unit_id?: string | null
          program_id?: string | null
          project_id?: string | null
          ref_code?: string | null
          region?: string | null
          revised_amount?: number | null
          status?: string
          sync_status?: string
          synced_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "me_budgets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_budgets_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "me_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_budgets_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_budgets_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "me_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      me_corrective_actions: {
        Row: {
          action_type: string
          classification: string
          closed_at: string | null
          closure_evidence_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          incident_id: string | null
          is_demo: boolean
          issue_id: string | null
          org_unit_id: string | null
          owner_profile_id: string | null
          project_id: string | null
          ref_code: string | null
          region: string | null
          risk_id: string | null
          status: string
          title: string
          updated_at: string
          verification_notes: string | null
        }
        Insert: {
          action_type?: string
          classification?: string
          closed_at?: string | null
          closure_evidence_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          incident_id?: string | null
          is_demo?: boolean
          issue_id?: string | null
          org_unit_id?: string | null
          owner_profile_id?: string | null
          project_id?: string | null
          ref_code?: string | null
          region?: string | null
          risk_id?: string | null
          status?: string
          title: string
          updated_at?: string
          verification_notes?: string | null
        }
        Update: {
          action_type?: string
          classification?: string
          closed_at?: string | null
          closure_evidence_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          incident_id?: string | null
          is_demo?: boolean
          issue_id?: string | null
          org_unit_id?: string | null
          owner_profile_id?: string | null
          project_id?: string | null
          ref_code?: string | null
          region?: string | null
          risk_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          verification_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "me_ca_incident_fk"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "me_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_corrective_actions_closure_evidence_id_fkey"
            columns: ["closure_evidence_id"]
            isOneToOne: false
            referencedRelation: "me_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_corrective_actions_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "me_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_corrective_actions_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_corrective_actions_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_corrective_actions_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_corrective_actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_corrective_actions_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "me_risks"
            referencedColumns: ["id"]
          },
        ]
      }
      me_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          from_id: string
          from_type: string
          id: string
          is_demo: boolean
          lag_days: number
          to_id: string
          to_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          from_id: string
          from_type: string
          id?: string
          is_demo?: boolean
          lag_days?: number
          to_id: string
          to_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          from_id?: string
          from_type?: string
          id?: string
          is_demo?: boolean
          lag_days?: number
          to_id?: string
          to_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      me_event_rules: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          created_by: string | null
          escalate_after_hours: number | null
          event_key: string
          id: string
          is_active: boolean
          is_demo: boolean
          last_run_at: string | null
          name: string
          recipient_roles: string[]
          updated_at: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          escalate_after_hours?: number | null
          event_key: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          last_run_at?: string | null
          name: string
          recipient_roles?: string[]
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          escalate_after_hours?: number | null
          event_key?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          last_run_at?: string | null
          name?: string
          recipient_roles?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      me_evidence: {
        Row: {
          classification: string
          content_hash: string | null
          created_at: string
          evidence_date: string | null
          evidence_type: string
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          is_demo: boolean
          mime_type: string | null
          org_unit_id: string | null
          related_id: string
          related_type: string
          retention_status: string
          source: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
          verification_notes: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          classification?: string
          content_hash?: string | null
          created_at?: string
          evidence_date?: string | null
          evidence_type?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_demo?: boolean
          mime_type?: string | null
          org_unit_id?: string | null
          related_id: string
          related_type: string
          retention_status?: string
          source?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
          verification_notes?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          classification?: string
          content_hash?: string | null
          created_at?: string
          evidence_date?: string | null
          evidence_type?: string
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_demo?: boolean
          mime_type?: string | null
          org_unit_id?: string | null
          related_id?: string
          related_type?: string
          retention_status?: string
          source?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          verification_notes?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "me_evidence_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_evidence_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_evidence_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      me_expenditures: {
        Row: {
          activity_id: string | null
          amount: number
          approved_by: string | null
          budget_id: string | null
          budget_line_id: string | null
          created_at: string
          description: string
          expenditure_type: string
          external_ref: string | null
          id: string
          invoice_ref: string | null
          is_demo: boolean
          paid_by: string | null
          payment_ref: string | null
          project_id: string | null
          purchase_order_id: string | null
          requested_by: string | null
          spend_date: string
          status: string
          sync_status: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          activity_id?: string | null
          amount: number
          approved_by?: string | null
          budget_id?: string | null
          budget_line_id?: string | null
          created_at?: string
          description: string
          expenditure_type?: string
          external_ref?: string | null
          id?: string
          invoice_ref?: string | null
          is_demo?: boolean
          paid_by?: string | null
          payment_ref?: string | null
          project_id?: string | null
          purchase_order_id?: string | null
          requested_by?: string | null
          spend_date?: string
          status?: string
          sync_status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          activity_id?: string | null
          amount?: number
          approved_by?: string | null
          budget_id?: string | null
          budget_line_id?: string | null
          created_at?: string
          description?: string
          expenditure_type?: string
          external_ref?: string | null
          id?: string
          invoice_ref?: string | null
          is_demo?: boolean
          paid_by?: string | null
          payment_ref?: string | null
          project_id?: string | null
          purchase_order_id?: string | null
          requested_by?: string | null
          spend_date?: string
          status?: string
          sync_status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "me_expenditures_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "me_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_expenditures_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "me_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_expenditures_budget_line_id_fkey"
            columns: ["budget_line_id"]
            isOneToOne: false
            referencedRelation: "me_budget_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_expenditures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_expenditures_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_expenditures_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "procurement_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      me_field_reports: {
        Row: {
          activity_id: string | null
          classification: string
          created_at: string
          department_id: string | null
          district_id: string | null
          id: string
          is_demo: boolean
          latitude: number | null
          location_accuracy_m: number | null
          longitude: number | null
          measure_id: string | null
          officer_profile_id: string | null
          org_unit_id: string | null
          payload: Json
          period_id: string | null
          program_id: string | null
          project_id: string | null
          ref_code: string | null
          region: string | null
          report_type: string
          reported_at: string
          reviewer_notes: string | null
          signature_data: string | null
          status: string
          submitted_by: string | null
          summary: string | null
          template_id: string | null
          template_version: number | null
          title: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          activity_id?: string | null
          classification?: string
          created_at?: string
          department_id?: string | null
          district_id?: string | null
          id?: string
          is_demo?: boolean
          latitude?: number | null
          location_accuracy_m?: number | null
          longitude?: number | null
          measure_id?: string | null
          officer_profile_id?: string | null
          org_unit_id?: string | null
          payload?: Json
          period_id?: string | null
          program_id?: string | null
          project_id?: string | null
          ref_code?: string | null
          region?: string | null
          report_type?: string
          reported_at?: string
          reviewer_notes?: string | null
          signature_data?: string | null
          status?: string
          submitted_by?: string | null
          summary?: string | null
          template_id?: string | null
          template_version?: number | null
          title: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          activity_id?: string | null
          classification?: string
          created_at?: string
          department_id?: string | null
          district_id?: string | null
          id?: string
          is_demo?: boolean
          latitude?: number | null
          location_accuracy_m?: number | null
          longitude?: number | null
          measure_id?: string | null
          officer_profile_id?: string | null
          org_unit_id?: string | null
          payload?: Json
          period_id?: string | null
          program_id?: string | null
          project_id?: string | null
          ref_code?: string | null
          region?: string | null
          report_type?: string
          reported_at?: string
          reviewer_notes?: string | null
          signature_data?: string | null
          status?: string
          submitted_by?: string | null
          summary?: string | null
          template_id?: string | null
          template_version?: number | null
          title?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "me_field_reports_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "me_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_field_reports_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_field_reports_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_field_reports_measure_id_fkey"
            columns: ["measure_id"]
            isOneToOne: false
            referencedRelation: "me_measures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_field_reports_officer_profile_id_fkey"
            columns: ["officer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_field_reports_officer_profile_id_fkey"
            columns: ["officer_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_field_reports_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_field_reports_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "me_reporting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_field_reports_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "me_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_field_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_field_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "me_form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_field_reports_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_field_reports_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      me_form_templates: {
        Row: {
          classification: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          name: string
          report_type: string
          requires_evidence: boolean
          requires_gps: boolean
          schema: Json
          updated_at: string
          version: number
        }
        Insert: {
          classification?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name: string
          report_type?: string
          requires_evidence?: boolean
          requires_gps?: boolean
          schema?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          classification?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name?: string
          report_type?: string
          requires_evidence?: boolean
          requires_gps?: boolean
          schema?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      me_framework_rows: {
        Row: {
          assumptions: string | null
          created_at: string
          framework_id: string
          id: string
          is_demo: boolean
          means_of_verification: string | null
          measure_id: string | null
          owner_profile_id: string | null
          parent_id: string | null
          result_level: string
          result_statement: string
          risk_note: string | null
          sort_order: number
          updated_at: string
          version: number
        }
        Insert: {
          assumptions?: string | null
          created_at?: string
          framework_id: string
          id?: string
          is_demo?: boolean
          means_of_verification?: string | null
          measure_id?: string | null
          owner_profile_id?: string | null
          parent_id?: string | null
          result_level: string
          result_statement: string
          risk_note?: string | null
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Update: {
          assumptions?: string | null
          created_at?: string
          framework_id?: string
          id?: string
          is_demo?: boolean
          means_of_verification?: string | null
          measure_id?: string | null
          owner_profile_id?: string | null
          parent_id?: string | null
          result_level?: string
          result_statement?: string
          risk_note?: string | null
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "me_framework_rows_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "me_frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_framework_rows_measure_id_fkey"
            columns: ["measure_id"]
            isOneToOne: false
            referencedRelation: "me_measures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_framework_rows_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_framework_rows_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_framework_rows_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "me_framework_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      me_frameworks: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_demo: boolean
          name: string
          objective_id: string | null
          program_id: string | null
          project_id: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_demo?: boolean
          name: string
          objective_id?: string | null
          program_id?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          objective_id?: string | null
          program_id?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "me_frameworks_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "me_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_frameworks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "me_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_frameworks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      me_incidents: {
        Row: {
          classification: string
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          district_id: string | null
          escalated_at: string | null
          id: string
          incident_type: string
          investigation_summary: string | null
          is_demo: boolean
          issue_id: string | null
          latitude: number | null
          location_name: string | null
          longitude: number | null
          occurred_at: string
          org_unit_id: string | null
          program_id: string | null
          project_id: string | null
          ref_code: string | null
          region: string | null
          reporting_profile_id: string | null
          resolution: string | null
          resolved_at: string | null
          response_summary: string | null
          risk_id: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          classification?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          district_id?: string | null
          escalated_at?: string | null
          id?: string
          incident_type?: string
          investigation_summary?: string | null
          is_demo?: boolean
          issue_id?: string | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          occurred_at?: string
          org_unit_id?: string | null
          program_id?: string | null
          project_id?: string | null
          ref_code?: string | null
          region?: string | null
          reporting_profile_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          response_summary?: string | null
          risk_id?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          classification?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          district_id?: string | null
          escalated_at?: string | null
          id?: string
          incident_type?: string
          investigation_summary?: string | null
          is_demo?: boolean
          issue_id?: string | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          occurred_at?: string
          org_unit_id?: string | null
          program_id?: string | null
          project_id?: string | null
          ref_code?: string | null
          region?: string | null
          reporting_profile_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          response_summary?: string | null
          risk_id?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "me_incidents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_incidents_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_incidents_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "me_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_incidents_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_incidents_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "me_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_incidents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_incidents_reporting_profile_id_fkey"
            columns: ["reporting_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_incidents_reporting_profile_id_fkey"
            columns: ["reporting_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_incidents_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "me_risks"
            referencedColumns: ["id"]
          },
        ]
      }
      me_issues: {
        Row: {
          classification: string
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          due_date: string | null
          id: string
          is_demo: boolean
          org_unit_id: string | null
          owner_profile_id: string | null
          priority: string
          program_id: string | null
          project_id: string | null
          ref_code: string | null
          region: string | null
          resolved_at: string | null
          risk_id: string | null
          root_cause: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          classification?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_demo?: boolean
          org_unit_id?: string | null
          owner_profile_id?: string | null
          priority?: string
          program_id?: string | null
          project_id?: string | null
          ref_code?: string | null
          region?: string | null
          resolved_at?: string | null
          risk_id?: string | null
          root_cause?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          classification?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_demo?: boolean
          org_unit_id?: string | null
          owner_profile_id?: string | null
          priority?: string
          program_id?: string | null
          project_id?: string | null
          ref_code?: string | null
          region?: string | null
          resolved_at?: string | null
          risk_id?: string | null
          root_cause?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "me_issues_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_issues_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_issues_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_issues_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_issues_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "me_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_issues_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "me_risks"
            referencedColumns: ["id"]
          },
        ]
      }
      me_measures: {
        Row: {
          activity_id: string | null
          archived_at: string | null
          baseline_date: string | null
          baseline_value: number | null
          calculation_method: string | null
          classification: string
          collection_method: string | null
          created_at: string
          created_by: string | null
          data_source: string | null
          definition: string | null
          department_id: string | null
          direction: string
          id: string
          is_demo: boolean
          measure_class: string
          name: string
          objective_id: string | null
          org_unit_id: string | null
          owner_profile_id: string | null
          program_id: string | null
          project_id: string | null
          ref_code: string
          region: string | null
          reporting_frequency: string
          requires_evidence: boolean
          result_level: string | null
          status: string
          threshold_amber: number
          threshold_green: number
          unit: string | null
          updated_at: string
          value_type: string
          verifier_profile_id: string | null
          version: number
        }
        Insert: {
          activity_id?: string | null
          archived_at?: string | null
          baseline_date?: string | null
          baseline_value?: number | null
          calculation_method?: string | null
          classification?: string
          collection_method?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          definition?: string | null
          department_id?: string | null
          direction?: string
          id?: string
          is_demo?: boolean
          measure_class?: string
          name: string
          objective_id?: string | null
          org_unit_id?: string | null
          owner_profile_id?: string | null
          program_id?: string | null
          project_id?: string | null
          ref_code: string
          region?: string | null
          reporting_frequency?: string
          requires_evidence?: boolean
          result_level?: string | null
          status?: string
          threshold_amber?: number
          threshold_green?: number
          unit?: string | null
          updated_at?: string
          value_type?: string
          verifier_profile_id?: string | null
          version?: number
        }
        Update: {
          activity_id?: string | null
          archived_at?: string | null
          baseline_date?: string | null
          baseline_value?: number | null
          calculation_method?: string | null
          classification?: string
          collection_method?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          definition?: string | null
          department_id?: string | null
          direction?: string
          id?: string
          is_demo?: boolean
          measure_class?: string
          name?: string
          objective_id?: string | null
          org_unit_id?: string | null
          owner_profile_id?: string | null
          program_id?: string | null
          project_id?: string | null
          ref_code?: string
          region?: string | null
          reporting_frequency?: string
          requires_evidence?: boolean
          result_level?: string | null
          status?: string
          threshold_amber?: number
          threshold_green?: number
          unit?: string | null
          updated_at?: string
          value_type?: string
          verifier_profile_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "me_measures_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "me_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_measures_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_measures_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "me_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_measures_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_measures_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_measures_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_measures_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "me_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_measures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_measures_verifier_profile_id_fkey"
            columns: ["verifier_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_measures_verifier_profile_id_fkey"
            columns: ["verifier_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      me_milestones: {
        Row: {
          achieved_date: string | null
          created_at: string
          criticality: string
          description: string | null
          due_date: string
          id: string
          is_demo: boolean
          name: string
          owner_profile_id: string | null
          program_id: string | null
          project_id: string
          requires_approval: boolean
          status: string
          updated_at: string
        }
        Insert: {
          achieved_date?: string | null
          created_at?: string
          criticality?: string
          description?: string | null
          due_date: string
          id?: string
          is_demo?: boolean
          name: string
          owner_profile_id?: string | null
          program_id?: string | null
          project_id: string
          requires_approval?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          achieved_date?: string | null
          created_at?: string
          criticality?: string
          description?: string | null
          due_date?: string
          id?: string
          is_demo?: boolean
          name?: string
          owner_profile_id?: string | null
          program_id?: string | null
          project_id?: string
          requires_approval?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "me_milestones_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_milestones_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_milestones_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "me_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      me_objectives: {
        Row: {
          archived_at: string | null
          budget_amount: number | null
          classification: string
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          district_id: string | null
          end_date: string | null
          id: string
          is_demo: boolean
          name: string
          org_unit_id: string | null
          owner_profile_id: string | null
          parent_id: string | null
          performance_score: number | null
          pillar_id: string | null
          priority: string
          ref_code: string
          region: string | null
          start_date: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          budget_amount?: number | null
          classification?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          district_id?: string | null
          end_date?: string | null
          id?: string
          is_demo?: boolean
          name: string
          org_unit_id?: string | null
          owner_profile_id?: string | null
          parent_id?: string | null
          performance_score?: number | null
          pillar_id?: string | null
          priority?: string
          ref_code: string
          region?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          budget_amount?: number | null
          classification?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          district_id?: string | null
          end_date?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          org_unit_id?: string | null
          owner_profile_id?: string | null
          parent_id?: string | null
          performance_score?: number | null
          pillar_id?: string | null
          priority?: string
          ref_code?: string
          region?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "me_objectives_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_objectives_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_objectives_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_objectives_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_objectives_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_objectives_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "me_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_objectives_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "me_pillars"
            referencedColumns: ["id"]
          },
        ]
      }
      me_pillars: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      me_programs: {
        Row: {
          archived_at: string | null
          budget_amount: number | null
          charter: string | null
          classification: string
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          director_profile_id: string | null
          district_id: string | null
          end_date: string | null
          health: string
          id: string
          is_demo: boolean
          name: string
          objective_id: string | null
          org_unit_id: string | null
          performance_score: number | null
          ref_code: string
          region: string | null
          start_date: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          budget_amount?: number | null
          charter?: string | null
          classification?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          director_profile_id?: string | null
          district_id?: string | null
          end_date?: string | null
          health?: string
          id?: string
          is_demo?: boolean
          name: string
          objective_id?: string | null
          org_unit_id?: string | null
          performance_score?: number | null
          ref_code: string
          region?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          budget_amount?: number | null
          charter?: string | null
          classification?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          director_profile_id?: string | null
          district_id?: string | null
          end_date?: string | null
          health?: string
          id?: string
          is_demo?: boolean
          name?: string
          objective_id?: string | null
          org_unit_id?: string | null
          performance_score?: number | null
          ref_code?: string
          region?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "me_programs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_programs_director_profile_id_fkey"
            columns: ["director_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_programs_director_profile_id_fkey"
            columns: ["director_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_programs_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_programs_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "me_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_programs_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      me_projects: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          archived_at: string | null
          budget_amount: number | null
          charter: string | null
          classification: string
          created_at: string
          created_by: string | null
          deliverables: string | null
          department_id: string | null
          description: string | null
          district_id: string | null
          end_date: string | null
          health: string
          health_score: number | null
          id: string
          is_demo: boolean
          latitude: number | null
          longitude: number | null
          manager_profile_id: string | null
          name: string
          objective_id: string | null
          org_unit_id: string | null
          percent_complete: number
          performance_score: number | null
          priority: string
          program_id: string | null
          ref_code: string
          region: string | null
          revised_budget_amount: number | null
          scope: string | null
          start_date: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          archived_at?: string | null
          budget_amount?: number | null
          charter?: string | null
          classification?: string
          created_at?: string
          created_by?: string | null
          deliverables?: string | null
          department_id?: string | null
          description?: string | null
          district_id?: string | null
          end_date?: string | null
          health?: string
          health_score?: number | null
          id?: string
          is_demo?: boolean
          latitude?: number | null
          longitude?: number | null
          manager_profile_id?: string | null
          name: string
          objective_id?: string | null
          org_unit_id?: string | null
          percent_complete?: number
          performance_score?: number | null
          priority?: string
          program_id?: string | null
          ref_code: string
          region?: string | null
          revised_budget_amount?: number | null
          scope?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          archived_at?: string | null
          budget_amount?: number | null
          charter?: string | null
          classification?: string
          created_at?: string
          created_by?: string | null
          deliverables?: string | null
          department_id?: string | null
          description?: string | null
          district_id?: string | null
          end_date?: string | null
          health?: string
          health_score?: number | null
          id?: string
          is_demo?: boolean
          latitude?: number | null
          longitude?: number | null
          manager_profile_id?: string | null
          name?: string
          objective_id?: string | null
          org_unit_id?: string | null
          percent_complete?: number
          performance_score?: number | null
          priority?: string
          program_id?: string | null
          ref_code?: string
          region?: string | null
          revised_budget_amount?: number | null
          scope?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "me_projects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_projects_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_projects_manager_profile_id_fkey"
            columns: ["manager_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_projects_manager_profile_id_fkey"
            columns: ["manager_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_projects_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "me_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_projects_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_projects_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "me_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      me_reporting_periods: {
        Row: {
          created_at: string
          end_date: string
          fiscal_year: number
          id: string
          is_demo: boolean
          is_open: boolean
          name: string
          period_type: string
          start_date: string
          submission_deadline: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          fiscal_year: number
          id?: string
          is_demo?: boolean
          is_open?: boolean
          name: string
          period_type?: string
          start_date: string
          submission_deadline?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          fiscal_year?: number
          id?: string
          is_demo?: boolean
          is_open?: boolean
          name?: string
          period_type?: string
          start_date?: string
          submission_deadline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      me_resource_allocations: {
        Row: {
          activity_id: string | null
          allocated_from: string | null
          allocated_to: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          department_id: string | null
          external_ref: string | null
          id: string
          inventory_item_id: string | null
          is_demo: boolean
          label: string | null
          notes: string | null
          org_unit_id: string | null
          profile_id: string | null
          program_id: string | null
          project_id: string | null
          quantity: number
          region: string | null
          resource_category: string
          status: string
          updated_at: string
          utilization_percent: number | null
          vehicle_id: string | null
        }
        Insert: {
          activity_id?: string | null
          allocated_from?: string | null
          allocated_to?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          external_ref?: string | null
          id?: string
          inventory_item_id?: string | null
          is_demo?: boolean
          label?: string | null
          notes?: string | null
          org_unit_id?: string | null
          profile_id?: string | null
          program_id?: string | null
          project_id?: string | null
          quantity?: number
          region?: string | null
          resource_category: string
          status?: string
          updated_at?: string
          utilization_percent?: number | null
          vehicle_id?: string | null
        }
        Update: {
          activity_id?: string | null
          allocated_from?: string | null
          allocated_to?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          external_ref?: string | null
          id?: string
          inventory_item_id?: string | null
          is_demo?: boolean
          label?: string | null
          notes?: string | null
          org_unit_id?: string | null
          profile_id?: string | null
          program_id?: string | null
          project_id?: string | null
          quantity?: number
          region?: string | null
          resource_category?: string
          status?: string
          updated_at?: string
          utilization_percent?: number | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "me_resource_allocations_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "me_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_resource_allocations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_resource_allocations_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_resource_allocations_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_resource_allocations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_resource_allocations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_resource_allocations_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "me_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_resource_allocations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_resource_allocations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      me_results: {
        Row: {
          created_at: string
          data_quality_status: string
          district_id: string | null
          id: string
          is_demo: boolean
          measure_id: string
          narrative: string | null
          org_unit_id: string | null
          period_id: string
          region: string | null
          reported_at: string | null
          reported_by: string | null
          reported_value: number | null
          target_id: string | null
          updated_at: string
          verification_notes: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
          verified_value: number | null
          version: number
        }
        Insert: {
          created_at?: string
          data_quality_status?: string
          district_id?: string | null
          id?: string
          is_demo?: boolean
          measure_id: string
          narrative?: string | null
          org_unit_id?: string | null
          period_id: string
          region?: string | null
          reported_at?: string | null
          reported_by?: string | null
          reported_value?: number | null
          target_id?: string | null
          updated_at?: string
          verification_notes?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_value?: number | null
          version?: number
        }
        Update: {
          created_at?: string
          data_quality_status?: string
          district_id?: string | null
          id?: string
          is_demo?: boolean
          measure_id?: string
          narrative?: string | null
          org_unit_id?: string | null
          period_id?: string
          region?: string | null
          reported_at?: string | null
          reported_by?: string | null
          reported_value?: number | null
          target_id?: string | null
          updated_at?: string
          verification_notes?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          verified_value?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "me_results_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_results_measure_id_fkey"
            columns: ["measure_id"]
            isOneToOne: false
            referencedRelation: "me_measures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_results_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_results_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "me_reporting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_results_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_results_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_results_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "me_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_results_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_results_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      me_risks: {
        Row: {
          activity_id: string | null
          category: string
          classification: string
          contingency: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          district_id: string | null
          due_date: string | null
          id: string
          impact: number
          is_demo: boolean
          last_reviewed_at: string | null
          mitigation: string | null
          objective_id: string | null
          org_unit_id: string | null
          owner_profile_id: string | null
          probability: number
          program_id: string | null
          project_id: string | null
          ref_code: string | null
          region: string | null
          risk_level: string
          risk_score: number | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          activity_id?: string | null
          category?: string
          classification?: string
          contingency?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          district_id?: string | null
          due_date?: string | null
          id?: string
          impact?: number
          is_demo?: boolean
          last_reviewed_at?: string | null
          mitigation?: string | null
          objective_id?: string | null
          org_unit_id?: string | null
          owner_profile_id?: string | null
          probability?: number
          program_id?: string | null
          project_id?: string | null
          ref_code?: string | null
          region?: string | null
          risk_level?: string
          risk_score?: number | null
          status?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          activity_id?: string | null
          category?: string
          classification?: string
          contingency?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          district_id?: string | null
          due_date?: string | null
          id?: string
          impact?: number
          is_demo?: boolean
          last_reviewed_at?: string | null
          mitigation?: string | null
          objective_id?: string | null
          org_unit_id?: string | null
          owner_profile_id?: string | null
          probability?: number
          program_id?: string | null
          project_id?: string | null
          ref_code?: string | null
          region?: string | null
          risk_level?: string
          risk_score?: number | null
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "me_risks_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "me_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_risks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_risks_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_risks_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "me_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_risks_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_risks_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_risks_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_risks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "me_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_risks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      me_scores: {
        Row: {
          calculated_at: string
          calculation_status: string
          components: Json
          created_at: string
          formula_version: string
          id: string
          is_demo: boolean
          period_id: string | null
          scope_id: string | null
          scope_label: string | null
          scope_type: string
          score: number
          weights: Json
        }
        Insert: {
          calculated_at?: string
          calculation_status?: string
          components?: Json
          created_at?: string
          formula_version?: string
          id?: string
          is_demo?: boolean
          period_id?: string | null
          scope_id?: string | null
          scope_label?: string | null
          scope_type: string
          score: number
          weights?: Json
        }
        Update: {
          calculated_at?: string
          calculation_status?: string
          components?: Json
          created_at?: string
          formula_version?: string
          id?: string
          is_demo?: boolean
          period_id?: string | null
          scope_id?: string | null
          scope_label?: string | null
          scope_type?: string
          score?: number
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "me_scores_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "me_reporting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      me_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
          version?: number
        }
        Relationships: []
      }
      me_targets: {
        Row: {
          created_at: string
          created_by: string | null
          district_id: string | null
          id: string
          is_demo: boolean
          measure_id: string
          notes: string | null
          org_unit_id: string | null
          period_id: string
          region: string | null
          target_value: number
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          district_id?: string | null
          id?: string
          is_demo?: boolean
          measure_id: string
          notes?: string | null
          org_unit_id?: string | null
          period_id: string
          region?: string | null
          target_value: number
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          district_id?: string | null
          id?: string
          is_demo?: boolean
          measure_id?: string
          notes?: string | null
          org_unit_id?: string | null
          period_id?: string
          region?: string | null
          target_value?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "me_targets_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_targets_measure_id_fkey"
            columns: ["measure_id"]
            isOneToOne: false
            referencedRelation: "me_measures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_targets_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_targets_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "me_reporting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      me_tasks: {
        Row: {
          activity_id: string | null
          actual_hours: number | null
          actual_start: string | null
          archived_at: string | null
          assigned_team: string | null
          classification: string
          completed_at: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          is_demo: boolean
          name: string
          org_unit_id: string | null
          owner_profile_id: string | null
          parent_id: string | null
          percent_complete: number
          planned_start: string | null
          priority: string
          project_id: string
          region: string | null
          requires_approval: boolean
          status: string
          task_type: string
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          actual_hours?: number | null
          actual_start?: string | null
          archived_at?: string | null
          assigned_team?: string | null
          classification?: string
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_demo?: boolean
          name: string
          org_unit_id?: string | null
          owner_profile_id?: string | null
          parent_id?: string | null
          percent_complete?: number
          planned_start?: string | null
          priority?: string
          project_id: string
          region?: string | null
          requires_approval?: boolean
          status?: string
          task_type?: string
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          actual_hours?: number | null
          actual_start?: string | null
          archived_at?: string | null
          assigned_team?: string | null
          classification?: string
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          is_demo?: boolean
          name?: string
          org_unit_id?: string | null
          owner_profile_id?: string | null
          parent_id?: string | null
          percent_complete?: number
          planned_start?: string | null
          priority?: string
          project_id?: string
          region?: string | null
          requires_approval?: boolean
          status?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "me_tasks_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "me_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_tasks_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_tasks_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_tasks_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "me_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      me_verifications: {
        Row: {
          created_at: string
          decision: string
          id: string
          notes: string | null
          related_id: string
          related_type: string
          verified_by: string
        }
        Insert: {
          created_at?: string
          decision: string
          id?: string
          notes?: string | null
          related_id: string
          related_type: string
          verified_by: string
        }
        Update: {
          created_at?: string
          decision?: string
          id?: string
          notes?: string | null
          related_id?: string
          related_type?: string
          verified_by?: string
        }
        Relationships: []
      }
      me_workstreams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_demo: boolean
          lead_profile_id: string | null
          name: string
          project_id: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          lead_profile_id?: string | null
          name: string
          project_id: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_demo?: boolean
          lead_profile_id?: string | null
          name?: string
          project_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "me_workstreams_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_workstreams_lead_profile_id_fkey"
            columns: ["lead_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_workstreams_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "me_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_appointment_audit: {
        Row: {
          action: string
          after_data: Json | null
          appointment_id: string | null
          before_data: Json | null
          details: Json | null
          id: string
          performed_at: string
          performed_by: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          appointment_id?: string | null
          before_data?: Json | null
          details?: Json | null
          id?: string
          performed_at?: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          appointment_id?: string | null
          before_data?: Json | null
          details?: Json | null
          id?: string
          performed_at?: string
          performed_by?: string | null
        }
        Relationships: []
      }
      medical_appointments: {
        Row: {
          authorized_by: string | null
          authorized_role: string | null
          conflict_override_at: string | null
          conflict_override_by: string | null
          conflict_override_reason: string | null
          conflict_override_role: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          scheduled_at: string
          service_id: string | null
          staff_profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          authorized_by?: string | null
          authorized_role?: string | null
          conflict_override_at?: string | null
          conflict_override_by?: string | null
          conflict_override_reason?: string | null
          conflict_override_role?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          scheduled_at: string
          service_id?: string | null
          staff_profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          authorized_by?: string | null
          authorized_role?: string | null
          conflict_override_at?: string | null
          conflict_override_by?: string | null
          conflict_override_reason?: string | null
          conflict_override_role?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          scheduled_at?: string
          service_id?: string | null
          staff_profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_appointments_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_appointments_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_inventory: {
        Row: {
          category: string | null
          created_at: string
          expiry_date: string | null
          id: string
          item_name: string
          notes: string | null
          quantity: number
          reorder_threshold: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_name: string
          notes?: string | null
          quantity?: number
          reorder_threshold?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_name?: string
          notes?: string | null
          quantity?: number
          reorder_threshold?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      medical_inventory_audit: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          delta: number | null
          id: string
          inventory_id: string | null
          item_name: string | null
          note: string | null
          performed_at: string
          performed_by: string | null
          quantity_after: number | null
          quantity_before: number | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          delta?: number | null
          id?: string
          inventory_id?: string | null
          item_name?: string | null
          note?: string | null
          performed_at?: string
          performed_by?: string | null
          quantity_after?: number | null
          quantity_before?: number | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          delta?: number | null
          id?: string
          inventory_id?: string | null
          item_name?: string | null
          note?: string | null
          performed_at?: string
          performed_by?: string | null
          quantity_after?: number | null
          quantity_before?: number | null
        }
        Relationships: []
      }
      medical_records: {
        Row: {
          attachment_path: string | null
          chief_complaint: string | null
          created_at: string
          created_by: string | null
          diagnosis: string | null
          id: string
          notes: string | null
          staff_profile_id: string
          treatment: string | null
          updated_at: string
          visit_date: string
          vitals: Json | null
        }
        Insert: {
          attachment_path?: string | null
          chief_complaint?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          id?: string
          notes?: string | null
          staff_profile_id: string
          treatment?: string | null
          updated_at?: string
          visit_date?: string
          vitals?: Json | null
        }
        Update: {
          attachment_path?: string | null
          chief_complaint?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          id?: string
          notes?: string | null
          staff_profile_id?: string
          treatment?: string | null
          updated_at?: string
          visit_date?: string
          vitals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_records_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_records_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_backup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mfa_challenge_audit: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          factor_id: string | null
          failure_reason: string | null
          id: string
          ip_address: string | null
          outcome: string
          staff_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          factor_id?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          outcome: string
          staff_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          factor_id?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          outcome?: string
          staff_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      mfa_recovery_requests: {
        Row: {
          created_at: string
          id: string
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_label: string | null
          staff_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_label?: string | null
          staff_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_label?: string | null
          staff_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      mfa_review_audit: {
        Row: {
          application_id: string
          created_at: string
          id: string
          new_status: string
          previous_status: string | null
          reviewed_at: string
          reviewer_id: string | null
          reviewer_notes: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          new_status: string
          previous_status?: string | null
          reviewed_at?: string
          reviewer_id?: string | null
          reviewer_notes?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          new_status?: string
          previous_status?: string | null
          reviewed_at?: string
          reviewer_id?: string | null
          reviewer_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_review_audit_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "passport_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_trusted_devices: {
        Row: {
          created_at: string
          expires_at: string
          fingerprint_hash: string
          id: string
          ip: string | null
          label: string | null
          last_used_at: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          trusted_hours: number
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          fingerprint_hash: string
          id?: string
          ip?: string | null
          label?: string | null
          last_used_at?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          trusted_hours?: number
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          fingerprint_hash?: string
          id?: string
          ip?: string | null
          label?: string | null
          last_used_at?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          trusted_hours?: number
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mfa_trusted_devices_archive: {
        Row: {
          archived_at: string
          created_at: string | null
          expires_at: string | null
          fingerprint_hash: string
          id: string
          ip: string | null
          label: string | null
          last_used_at: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          trusted_hours: number | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string
          created_at?: string | null
          expires_at?: string | null
          fingerprint_hash: string
          id: string
          ip?: string | null
          label?: string | null
          last_used_at?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          trusted_hours?: number | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string
          created_at?: string | null
          expires_at?: string | null
          fingerprint_hash?: string
          id?: string
          ip?: string | null
          label?: string | null
          last_used_at?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          trusted_hours?: number | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      misd_unit_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          id: string
          is_lead: boolean
          profile_id: string
          role_title: string | null
          unit_key: string
          unit_name: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_lead?: boolean
          profile_id: string
          role_title?: string | null
          unit_key: string
          unit_name: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_lead?: boolean
          profile_id?: string
          role_title?: string | null
          unit_key?: string
          unit_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "misd_unit_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "misd_unit_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      night_guard_activity_log: {
        Row: {
          created_at: string
          event_type: string
          id: string
          profile_id: string
          staff_id: string
          staff_name: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          profile_id: string
          staff_id: string
          staff_name: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          profile_id?: string
          staff_id?: string
          staff_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "night_guard_activity_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "night_guard_activity_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          reference_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          reference_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      office_history_access_log: {
        Row: {
          accessed_at: string
          allowed: boolean
          id: string
          profile_id: string
          reason: string
          viewer_user_id: string
        }
        Insert: {
          accessed_at?: string
          allowed: boolean
          id?: string
          profile_id: string
          reason: string
          viewer_user_id: string
        }
        Update: {
          accessed_at?: string
          allowed?: boolean
          id?: string
          profile_id?: string
          reason?: string
          viewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_history_access_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_history_access_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      official_applications: {
        Row: {
          applicant_name: string
          created_at: string
          date_of_birth: string | null
          emergency_contact: string | null
          foreign_address: string | null
          gender: string | null
          home_address: string | null
          id: string
          marital_status: string | null
          nationality: string
          nearest_landmark: string | null
          next_of_kin: string | null
          notes: string | null
          official_type: string
          passport_number: string | null
          phone: string | null
          processed_by: string | null
          purpose: string | null
          reference_number: string | null
          requesting_entity: string | null
          status: string
          street_name: string | null
          updated_at: string
        }
        Insert: {
          applicant_name: string
          created_at?: string
          date_of_birth?: string | null
          emergency_contact?: string | null
          foreign_address?: string | null
          gender?: string | null
          home_address?: string | null
          id?: string
          marital_status?: string | null
          nationality: string
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          official_type?: string
          passport_number?: string | null
          phone?: string | null
          processed_by?: string | null
          purpose?: string | null
          reference_number?: string | null
          requesting_entity?: string | null
          status?: string
          street_name?: string | null
          updated_at?: string
        }
        Update: {
          applicant_name?: string
          created_at?: string
          date_of_birth?: string | null
          emergency_contact?: string | null
          foreign_address?: string | null
          gender?: string | null
          home_address?: string | null
          id?: string
          marital_status?: string | null
          nationality?: string
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          official_type?: string
          passport_number?: string | null
          phone?: string | null
          processed_by?: string | null
          purpose?: string | null
          reference_number?: string | null
          requesting_entity?: string | null
          status?: string
          street_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      operations: {
        Row: {
          action_taken: string | null
          arrests_count: number
          authorized_by: string | null
          casualties_count: number
          contact_details: string | null
          created_at: string
          department_id: string | null
          description: string | null
          follow_up_notes: string | null
          follow_up_required: boolean
          gps_coordinates: string | null
          hq_reference_number: string | null
          id: string
          items_seized: string | null
          location: string | null
          log_reference: string | null
          mugshot_path: string | null
          notes: string | null
          officer_in_charge: string | null
          operation_date: string
          operation_time: string | null
          operation_type: string
          outcome: string | null
          reported_by: string
          severity: string
          status: string
          supervisor_remarks: string | null
          suspects_count: number
          updated_at: string
          vehicles_involved: string | null
          weapons_used: string | null
          witnesses: string | null
        }
        Insert: {
          action_taken?: string | null
          arrests_count?: number
          authorized_by?: string | null
          casualties_count?: number
          contact_details?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean
          gps_coordinates?: string | null
          hq_reference_number?: string | null
          id?: string
          items_seized?: string | null
          location?: string | null
          log_reference?: string | null
          mugshot_path?: string | null
          notes?: string | null
          officer_in_charge?: string | null
          operation_date?: string
          operation_time?: string | null
          operation_type?: string
          outcome?: string | null
          reported_by: string
          severity?: string
          status?: string
          supervisor_remarks?: string | null
          suspects_count?: number
          updated_at?: string
          vehicles_involved?: string | null
          weapons_used?: string | null
          witnesses?: string | null
        }
        Update: {
          action_taken?: string | null
          arrests_count?: number
          authorized_by?: string | null
          casualties_count?: number
          contact_details?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean
          gps_coordinates?: string | null
          hq_reference_number?: string | null
          id?: string
          items_seized?: string | null
          location?: string | null
          log_reference?: string | null
          mugshot_path?: string | null
          notes?: string | null
          officer_in_charge?: string | null
          operation_date?: string
          operation_time?: string | null
          operation_type?: string
          outcome?: string | null
          reported_by?: string
          severity?: string
          status?: string
          supervisor_remarks?: string | null
          suspects_count?: number
          updated_at?: string
          vehicles_involved?: string | null
          weapons_used?: string | null
          witnesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_authorized_by_fkey"
            columns: ["authorized_by"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      org_unit_assignments: {
        Row: {
          can_manage: boolean
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          org_unit_id: string
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          can_manage?: boolean
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          org_unit_id: string
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          can_manage?: boolean
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          org_unit_id?: string
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_unit_assignments_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      org_units: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          type: Database["public"]["Enums"]["org_unit_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          type: Database["public"]["Enums"]["org_unit_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          type?: Database["public"]["Enums"]["org_unit_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_units_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          code_hash: string | null
          created_at: string
          expires_at: string
          id: string
          purpose: string
          used: boolean
          user_id: string
        }
        Insert: {
          code_hash?: string | null
          created_at?: string
          expires_at: string
          id?: string
          purpose?: string
          used?: boolean
          user_id: string
        }
        Update: {
          code_hash?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      passport_applications: {
        Row: {
          address: string | null
          applicant_name: string
          application_reference: string | null
          application_type: string
          biometric_consent: boolean
          created_at: string
          date_of_birth: string
          declaration_date: string | null
          declaration_signed: boolean
          distinguishing_marks: string | null
          district: string | null
          email: string | null
          emergency_contact: string | null
          eye_colour: string | null
          father_name: string | null
          fee_charged: number | null
          fee_receipt_number: string | null
          foreign_address: string | null
          gender: string | null
          ghana_card_number: string | null
          ghana_post_gps: string | null
          height_cm: number | null
          id: string
          marital_status: string | null
          mfa_review_notes: string | null
          mfa_review_status: string
          mfa_reviewed_at: string | null
          mfa_reviewed_by: string | null
          mother_name: string | null
          nationality: string
          nearest_landmark: string | null
          next_of_kin: string | null
          notes: string | null
          occupation: string | null
          other_names: string | null
          phone: string | null
          place_of_birth: string | null
          previous_passport_expiry_date: string | null
          previous_passport_issue_date: string | null
          previous_passport_number: string | null
          previous_passport_place_of_issue: string | null
          processed_by: string | null
          processing_checklist: Json | null
          region: string | null
          spouse_name: string | null
          status: string
          street_name: string | null
          surname: string | null
          town: string | null
          updated_at: string
          witnessing_officer_name: string | null
          witnessing_officer_rank: string | null
        }
        Insert: {
          address?: string | null
          applicant_name: string
          application_reference?: string | null
          application_type?: string
          biometric_consent?: boolean
          created_at?: string
          date_of_birth: string
          declaration_date?: string | null
          declaration_signed?: boolean
          distinguishing_marks?: string | null
          district?: string | null
          email?: string | null
          emergency_contact?: string | null
          eye_colour?: string | null
          father_name?: string | null
          fee_charged?: number | null
          fee_receipt_number?: string | null
          foreign_address?: string | null
          gender?: string | null
          ghana_card_number?: string | null
          ghana_post_gps?: string | null
          height_cm?: number | null
          id?: string
          marital_status?: string | null
          mfa_review_notes?: string | null
          mfa_review_status?: string
          mfa_reviewed_at?: string | null
          mfa_reviewed_by?: string | null
          mother_name?: string | null
          nationality: string
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          occupation?: string | null
          other_names?: string | null
          phone?: string | null
          place_of_birth?: string | null
          previous_passport_expiry_date?: string | null
          previous_passport_issue_date?: string | null
          previous_passport_number?: string | null
          previous_passport_place_of_issue?: string | null
          processed_by?: string | null
          processing_checklist?: Json | null
          region?: string | null
          spouse_name?: string | null
          status?: string
          street_name?: string | null
          surname?: string | null
          town?: string | null
          updated_at?: string
          witnessing_officer_name?: string | null
          witnessing_officer_rank?: string | null
        }
        Update: {
          address?: string | null
          applicant_name?: string
          application_reference?: string | null
          application_type?: string
          biometric_consent?: boolean
          created_at?: string
          date_of_birth?: string
          declaration_date?: string | null
          declaration_signed?: boolean
          distinguishing_marks?: string | null
          district?: string | null
          email?: string | null
          emergency_contact?: string | null
          eye_colour?: string | null
          father_name?: string | null
          fee_charged?: number | null
          fee_receipt_number?: string | null
          foreign_address?: string | null
          gender?: string | null
          ghana_card_number?: string | null
          ghana_post_gps?: string | null
          height_cm?: number | null
          id?: string
          marital_status?: string | null
          mfa_review_notes?: string | null
          mfa_review_status?: string
          mfa_reviewed_at?: string | null
          mfa_reviewed_by?: string | null
          mother_name?: string | null
          nationality?: string
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          occupation?: string | null
          other_names?: string | null
          phone?: string | null
          place_of_birth?: string | null
          previous_passport_expiry_date?: string | null
          previous_passport_issue_date?: string | null
          previous_passport_number?: string | null
          previous_passport_place_of_issue?: string | null
          processed_by?: string | null
          processing_checklist?: Json | null
          region?: string | null
          spouse_name?: string | null
          status?: string
          street_name?: string | null
          surname?: string | null
          town?: string | null
          updated_at?: string
          witnessing_officer_name?: string | null
          witnessing_officer_rank?: string | null
        }
        Relationships: []
      }
      patrol_log_photos: {
        Row: {
          caption: string | null
          content_type: string | null
          created_at: string
          id: string
          patrol_log_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          caption?: string | null
          content_type?: string | null
          created_at?: string
          id?: string
          patrol_log_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string
        }
        Update: {
          caption?: string | null
          content_type?: string | null
          created_at?: string
          id?: string
          patrol_log_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "patrol_log_photos_patrol_log_id_fkey"
            columns: ["patrol_log_id"]
            isOneToOne: false
            referencedRelation: "patrol_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      patrol_logs: {
        Row: {
          created_at: string
          created_by: string
          district_id: string | null
          district_name: string | null
          end_time: string | null
          fuel_used_litres: number | null
          id: string
          incidents: string | null
          incidents_count: number
          observations: string | null
          odometer_end_km: number | null
          odometer_start_km: number | null
          org_unit_id: string | null
          patrol_date: string
          patrol_leader_id: string | null
          patrol_reference: string
          patrol_type: string
          personnel_count: number
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          route_summary: string | null
          start_time: string
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          district_id?: string | null
          district_name?: string | null
          end_time?: string | null
          fuel_used_litres?: number | null
          id?: string
          incidents?: string | null
          incidents_count?: number
          observations?: string | null
          odometer_end_km?: number | null
          odometer_start_km?: number | null
          org_unit_id?: string | null
          patrol_date?: string
          patrol_leader_id?: string | null
          patrol_reference: string
          patrol_type?: string
          personnel_count?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          route_summary?: string | null
          start_time: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          district_id?: string | null
          district_name?: string | null
          end_time?: string | null
          fuel_used_litres?: number | null
          id?: string
          incidents?: string | null
          incidents_count?: number
          observations?: string | null
          odometer_end_km?: number | null
          odometer_start_km?: number | null
          org_unit_id?: string | null
          patrol_date?: string
          patrol_leader_id?: string | null
          patrol_reference?: string
          patrol_type?: string
          personnel_count?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          route_summary?: string | null
          start_time?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patrol_logs_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_logs_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_logs_patrol_leader_id_fkey"
            columns: ["patrol_leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_logs_patrol_leader_id_fkey"
            columns: ["patrol_leader_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      patrol_plans: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          closed_at: string | null
          closed_by: string | null
          closure_notes: string | null
          created_at: string
          created_by: string
          district_id: string | null
          district_name: string | null
          end_time: string | null
          id: string
          objective: string | null
          org_unit_id: string | null
          outcome: string | null
          patrol_log_id: string | null
          patrol_type: string
          personnel_count: number
          plan_reference: string
          planned_date: string
          route_summary: string | null
          start_time: string
          status: string
          title: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_notes?: string | null
          created_at?: string
          created_by: string
          district_id?: string | null
          district_name?: string | null
          end_time?: string | null
          id?: string
          objective?: string | null
          org_unit_id?: string | null
          outcome?: string | null
          patrol_log_id?: string | null
          patrol_type?: string
          personnel_count?: number
          plan_reference?: string
          planned_date?: string
          route_summary?: string | null
          start_time?: string
          status?: string
          title: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_notes?: string | null
          created_at?: string
          created_by?: string
          district_id?: string | null
          district_name?: string | null
          end_time?: string | null
          id?: string
          objective?: string | null
          org_unit_id?: string | null
          outcome?: string | null
          patrol_log_id?: string | null
          patrol_type?: string
          personnel_count?: number
          plan_reference?: string
          planned_date?: string
          route_summary?: string | null
          start_time?: string
          status?: string
          title?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patrol_plans_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_plans_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_plans_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "ghana_districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_plans_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_plans_patrol_log_id_fkey"
            columns: ["patrol_log_id"]
            isOneToOne: false
            referencedRelation: "patrol_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          method: string
          notes: string | null
          payer_name: string
          phone: string
          purpose: string | null
          reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          notes?: string | null
          payer_name: string
          phone: string
          purpose?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          notes?: string | null
          payer_name?: string
          phone?: string
          purpose?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_staff_matches: {
        Row: {
          created_at: string
          created_profile_id: string | null
          entry_id: string | null
          gender: string | null
          id: string
          import_id: string | null
          matched_profile_id: string | null
          name_text: string
          rank_text: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          serial_no: number
          shift: string
          status: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          created_profile_id?: string | null
          entry_id?: string | null
          gender?: string | null
          id?: string
          import_id?: string | null
          matched_profile_id?: string | null
          name_text: string
          rank_text: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          serial_no: number
          shift: string
          status?: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          created_profile_id?: string | null
          entry_id?: string | null
          gender?: string | null
          id?: string
          import_id?: string | null
          matched_profile_id?: string | null
          name_text?: string
          rank_text?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          serial_no?: number
          shift?: string
          status?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_staff_matches_created_profile_id_fkey"
            columns: ["created_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_staff_matches_created_profile_id_fkey"
            columns: ["created_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_staff_matches_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "duty_roster_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_staff_matches_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "duty_roster_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_staff_matches_matched_profile_id_fkey"
            columns: ["matched_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_staff_matches_matched_profile_id_fkey"
            columns: ["matched_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_matrix_overrides: {
        Row: {
          access: string
          created_at: string
          feature_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          access: string
          created_at?: string
          feature_name: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          access?: string
          created_at?: string
          feature_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      permits: {
        Row: {
          applicant_category: string | null
          applicant_name: string
          application_reference: string | null
          biometrics_captured: boolean | null
          course_of_study: string | null
          created_at: string
          current_permit_expiry: string | null
          date_of_birth: string | null
          dual_nationality: string | null
          ecowas_id_number: string | null
          emergency_contact: string | null
          employer_sponsor_address: string | null
          employer_sponsor_name: string | null
          fee_charged: number | null
          fee_receipt_number: string | null
          foreign_address: string | null
          gender: string | null
          ghana_post_gps: string | null
          home_address: string | null
          host_address: string | null
          host_name: string | null
          host_phone: string | null
          id: string
          institution_name: string | null
          intended_duration_months: number | null
          marital_status: string | null
          medical_clearance: boolean | null
          nationality: string | null
          nearest_landmark: string | null
          next_of_kin: string | null
          notes: string | null
          occupation: string | null
          other_names: string | null
          passport_expiry_date: string | null
          passport_issue_date: string | null
          passport_number: string
          passport_place_of_issue: string | null
          passport_type: string | null
          permit_category: string | null
          permit_type: string
          phone: string | null
          place_of_birth: string | null
          police_clearance: boolean | null
          port_of_entry: string | null
          previous_permit_history: string | null
          processed_by: string | null
          processing_checklist: Json | null
          purpose: string | null
          requested_start_date: string | null
          status: string
          street_name: string | null
          surname: string | null
          updated_at: string
          yellow_fever_cert: boolean | null
        }
        Insert: {
          applicant_category?: string | null
          applicant_name: string
          application_reference?: string | null
          biometrics_captured?: boolean | null
          course_of_study?: string | null
          created_at?: string
          current_permit_expiry?: string | null
          date_of_birth?: string | null
          dual_nationality?: string | null
          ecowas_id_number?: string | null
          emergency_contact?: string | null
          employer_sponsor_address?: string | null
          employer_sponsor_name?: string | null
          fee_charged?: number | null
          fee_receipt_number?: string | null
          foreign_address?: string | null
          gender?: string | null
          ghana_post_gps?: string | null
          home_address?: string | null
          host_address?: string | null
          host_name?: string | null
          host_phone?: string | null
          id?: string
          institution_name?: string | null
          intended_duration_months?: number | null
          marital_status?: string | null
          medical_clearance?: boolean | null
          nationality?: string | null
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          occupation?: string | null
          other_names?: string | null
          passport_expiry_date?: string | null
          passport_issue_date?: string | null
          passport_number: string
          passport_place_of_issue?: string | null
          passport_type?: string | null
          permit_category?: string | null
          permit_type: string
          phone?: string | null
          place_of_birth?: string | null
          police_clearance?: boolean | null
          port_of_entry?: string | null
          previous_permit_history?: string | null
          processed_by?: string | null
          processing_checklist?: Json | null
          purpose?: string | null
          requested_start_date?: string | null
          status?: string
          street_name?: string | null
          surname?: string | null
          updated_at?: string
          yellow_fever_cert?: boolean | null
        }
        Update: {
          applicant_category?: string | null
          applicant_name?: string
          application_reference?: string | null
          biometrics_captured?: boolean | null
          course_of_study?: string | null
          created_at?: string
          current_permit_expiry?: string | null
          date_of_birth?: string | null
          dual_nationality?: string | null
          ecowas_id_number?: string | null
          emergency_contact?: string | null
          employer_sponsor_address?: string | null
          employer_sponsor_name?: string | null
          fee_charged?: number | null
          fee_receipt_number?: string | null
          foreign_address?: string | null
          gender?: string | null
          ghana_post_gps?: string | null
          home_address?: string | null
          host_address?: string | null
          host_name?: string | null
          host_phone?: string | null
          id?: string
          institution_name?: string | null
          intended_duration_months?: number | null
          marital_status?: string | null
          medical_clearance?: boolean | null
          nationality?: string | null
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          occupation?: string | null
          other_names?: string | null
          passport_expiry_date?: string | null
          passport_issue_date?: string | null
          passport_number?: string
          passport_place_of_issue?: string | null
          passport_type?: string | null
          permit_category?: string | null
          permit_type?: string
          phone?: string | null
          place_of_birth?: string | null
          police_clearance?: boolean | null
          port_of_entry?: string | null
          previous_permit_history?: string | null
          processed_by?: string | null
          processing_checklist?: Json | null
          purpose?: string | null
          requested_start_date?: string | null
          status?: string
          street_name?: string | null
          surname?: string | null
          updated_at?: string
          yellow_fever_cert?: boolean | null
        }
        Relationships: []
      }
      platform_sync_history: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          id: string
          platform: string
          profile_id: string
          sync_status: string
          synced_at: string
        }
        Insert: {
          action: string
          created_at?: string
          error_message?: string | null
          id?: string
          platform: string
          profile_id: string
          sync_status?: string
          synced_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          id?: string
          platform?: string
          profile_id?: string
          sync_status?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_sync_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_sync_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      postings_transfers: {
        Row: {
          approved_by: string | null
          attachment_path: string | null
          created_at: string
          effective_date: string
          from_department_id: string | null
          id: string
          profile_id: string
          remarks: string | null
          status: Database["public"]["Enums"]["leave_status"]
          to_department_id: string | null
          type: Database["public"]["Enums"]["transfer_type"]
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          attachment_path?: string | null
          created_at?: string
          effective_date: string
          from_department_id?: string | null
          id?: string
          profile_id: string
          remarks?: string | null
          status?: Database["public"]["Enums"]["leave_status"]
          to_department_id?: string | null
          type: Database["public"]["Enums"]["transfer_type"]
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          attachment_path?: string | null
          created_at?: string
          effective_date?: string
          from_department_id?: string | null
          id?: string
          profile_id?: string
          remarks?: string | null
          status?: Database["public"]["Enums"]["leave_status"]
          to_department_id?: string | null
          type?: Database["public"]["Enums"]["transfer_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "postings_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "postings_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "postings_transfers_from_department_id_fkey"
            columns: ["from_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "postings_transfers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "postings_transfers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "postings_transfers_to_department_id_fkey"
            columns: ["to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      presence_events: {
        Row: {
          created_at: string
          current_page: string | null
          details: Json
          event_type: Database["public"]["Enums"]["presence_event_type"]
          id: string
          last_active_at: string
          pruned_at: string | null
          user_id: string
          window_minutes: number | null
        }
        Insert: {
          created_at?: string
          current_page?: string | null
          details?: Json
          event_type: Database["public"]["Enums"]["presence_event_type"]
          id?: string
          last_active_at?: string
          pruned_at?: string | null
          user_id: string
          window_minutes?: number | null
        }
        Update: {
          created_at?: string
          current_page?: string | null
          details?: Json
          event_type?: Database["public"]["Enums"]["presence_event_type"]
          id?: string
          last_active_at?: string
          pruned_at?: string | null
          user_id?: string
          window_minutes?: number | null
        }
        Relationships: []
      }
      processing_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          progress: number
          result: Json | null
          status: string
          task_type: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          progress?: number
          result?: Json | null
          status?: string
          task_type: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          progress?: number
          result?: Json | null
          status?: string
          task_type?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      procurement_budgets: {
        Row: {
          budget_amount: number
          created_at: string
          created_by: string | null
          currency: string
          fiscal_year: number
          id: string
          notes: string | null
          org_unit_id: string
          updated_at: string
        }
        Insert: {
          budget_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          fiscal_year: number
          id?: string
          notes?: string | null
          org_unit_id: string
          updated_at?: string
        }
        Update: {
          budget_amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          fiscal_year?: number
          id?: string
          notes?: string | null
          org_unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_budgets_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_contracts: {
        Row: {
          contract_number: string
          contract_type: string
          created_at: string
          created_by: string
          currency: string
          description: string | null
          end_date: string | null
          id: string
          start_date: string | null
          status: string
          title: string
          updated_at: string
          value: number | null
          vendor_id: string | null
        }
        Insert: {
          contract_number: string
          contract_type?: string
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          end_date?: string | null
          id?: string
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          value?: number | null
          vendor_id?: string | null
        }
        Update: {
          contract_number?: string
          contract_type?: string
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          end_date?: string | null
          id?: string
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          value?: number | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_contracts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "procurement_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_documents: {
        Row: {
          created_at: string
          description: string | null
          document_type: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          reference_id: string | null
          reference_table: string | null
          tags: string[] | null
          title: string
          updated_at: string
          uploaded_by: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_type?: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          reference_id?: string | null
          reference_table?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          uploaded_by: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          reference_id?: string | null
          reference_table?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          uploaded_by?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "procurement_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_invoices: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          currency: string
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          paid_at: string | null
          payment_reference: string | null
          po_id: string | null
          status: string
          tax_amount: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          po_id?: string | null
          status?: string
          tax_amount?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          po_id?: string | null
          status?: string
          tax_amount?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "procurement_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_quotes: {
        Row: {
          created_at: string
          delivery_days: number | null
          id: string
          notes: string | null
          quoted_amount: number
          rfq_id: string
          selected: boolean
          valid_until: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          delivery_days?: number | null
          id?: string
          notes?: string | null
          quoted_amount: number
          rfq_id: string
          selected?: boolean
          valid_until?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          delivery_days?: number | null
          id?: string
          notes?: string | null
          quoted_amount?: number
          rfq_id?: string
          selected?: boolean
          valid_until?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "procurement_rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_quotes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "procurement_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_request_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          requisition_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          requisition_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          requisition_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_request_events_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_request_photos: {
        Row: {
          caption: string | null
          content_type: string | null
          created_at: string
          id: string
          kind: string
          requisition_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          caption?: string | null
          content_type?: string | null
          created_at?: string
          id?: string
          kind?: string
          requisition_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          caption?: string | null
          content_type?: string | null
          created_at?: string
          id?: string
          kind?: string
          requisition_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_request_photos_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_rfqs: {
        Row: {
          awarded_amount: number | null
          awarded_vendor_id: string | null
          closing_date: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          requisition_id: string | null
          rfq_number: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          awarded_amount?: number | null
          awarded_vendor_id?: string | null
          closing_date?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          requisition_id?: string | null
          rfq_number: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          awarded_amount?: number | null
          awarded_vendor_id?: string | null
          closing_date?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          requisition_id?: string | null
          rfq_number?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_rfqs_awarded_vendor_id_fkey"
            columns: ["awarded_vendor_id"]
            isOneToOne: false
            referencedRelation: "procurement_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_rfqs_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_vendors: {
        Row: {
          address: string | null
          category: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          is_blacklisted: boolean
          name: string
          notes: string | null
          phone: string | null
          rating: number | null
          tin_number: string | null
          updated_at: string
          vendor_code: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_blacklisted?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          tin_number?: string | null
          updated_at?: string
          vendor_code?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_blacklisted?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          tin_number?: string | null
          updated_at?: string
          vendor_code?: string | null
        }
        Relationships: []
      }
      profile_change_requests: {
        Row: {
          created_at: string
          id: string
          previous_values: Json | null
          profile_id: string
          requested_changes: Json
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          previous_values?: Json | null
          profile_id: string
          requested_changes: Json
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          previous_values?: Json | null
          profile_id?: string
          requested_changes?: Json
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_change_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_change_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_contacts: {
        Row: {
          contact_type: string
          created_at: string
          id: string
          is_primary: boolean
          label: string | null
          profile_id: string
          updated_at: string
          value: string
        }
        Insert: {
          contact_type?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          profile_id: string
          updated_at?: string
          value: string
        }
        Update: {
          contact_type?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          profile_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_departments: {
        Row: {
          created_at: string
          department_id: string
          id: string
          is_primary: boolean
          profile_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          is_primary?: boolean
          profile_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          is_primary?: boolean
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_departments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_departments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_office_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_office: string | null
          note: string | null
          previous_office: string | null
          profile_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_office?: string | null
          note?: string | null
          previous_office?: string | null
          profile_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_office?: string | null
          note?: string | null
          previous_office?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_office_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_office_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_portfolios: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          portfolio_id: string
          profile_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          portfolio_id: string
          profile_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          portfolio_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_portfolios_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_portfolios_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_portfolios_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_locked: boolean
          blood_group: string | null
          created_at: string
          current_appointment: string | null
          date_joined_service: string | null
          date_of_birth: string | null
          department_id: string | null
          email: string | null
          first_name: string
          gender: string | null
          ghana_card_number: string | null
          id: string
          intake: number | null
          last_name: string
          login_enabled: boolean
          marital_status: string | null
          office: string | null
          org_unit_id: string | null
          phone: string | null
          photo_url: string | null
          rank_id: string | null
          retirement_age: number
          shift_group: string | null
          staff_category: string | null
          staff_id: string
          status: Database["public"]["Enums"]["staff_status"]
          training_designation: string | null
          unit: string | null
          updated_at: string
          user_id: string | null
          weapon_trained: boolean | null
          weapon_training_date: string | null
        }
        Insert: {
          account_locked?: boolean
          blood_group?: string | null
          created_at?: string
          current_appointment?: string | null
          date_joined_service?: string | null
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          first_name: string
          gender?: string | null
          ghana_card_number?: string | null
          id?: string
          intake?: number | null
          last_name: string
          login_enabled?: boolean
          marital_status?: string | null
          office?: string | null
          org_unit_id?: string | null
          phone?: string | null
          photo_url?: string | null
          rank_id?: string | null
          retirement_age?: number
          shift_group?: string | null
          staff_category?: string | null
          staff_id: string
          status?: Database["public"]["Enums"]["staff_status"]
          training_designation?: string | null
          unit?: string | null
          updated_at?: string
          user_id?: string | null
          weapon_trained?: boolean | null
          weapon_training_date?: string | null
        }
        Update: {
          account_locked?: boolean
          blood_group?: string | null
          created_at?: string
          current_appointment?: string | null
          date_joined_service?: string | null
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          first_name?: string
          gender?: string | null
          ghana_card_number?: string | null
          id?: string
          intake?: number | null
          last_name?: string
          login_enabled?: boolean
          marital_status?: string | null
          office?: string | null
          org_unit_id?: string | null
          phone?: string | null
          photo_url?: string | null
          rank_id?: string | null
          retirement_age?: number
          shift_group?: string | null
          staff_category?: string | null
          staff_id?: string
          status?: Database["public"]["Enums"]["staff_status"]
          training_designation?: string | null
          unit?: string | null
          updated_at?: string
          user_id?: string | null
          weapon_trained?: boolean | null
          weapon_training_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_rank_id_fkey"
            columns: ["rank_id"]
            isOneToOne: false
            referencedRelation: "ranks"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          item_name: string
          po_id: string
          quantity: number
          received_qty: number
          unit: string | null
          unit_cost: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          item_name: string
          po_id: string
          quantity: number
          received_qty?: number
          unit?: string | null
          unit_cost?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          item_name?: string
          po_id?: string
          quantity?: number
          received_qty?: number
          unit?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          currency: string
          delivered_at: string | null
          delivery_address: string | null
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          payment_terms: string | null
          po_number: string
          requisition_id: string | null
          rfq_id: string | null
          status: string
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          currency?: string
          delivered_at?: string | null
          delivery_address?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          payment_terms?: string | null
          po_number: string
          requisition_id?: string | null
          rfq_id?: string | null
          status?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          delivered_at?: string | null
          delivery_address?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          payment_terms?: string | null
          po_number?: string
          requisition_id?: string | null
          rfq_id?: string | null
          status?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "procurement_rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "procurement_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisition_items: {
        Row: {
          created_at: string
          description: string | null
          estimated_unit_cost: number | null
          id: string
          inventory_item_id: string | null
          item_name: string
          quantity: number
          received_qty: number
          requisition_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_unit_cost?: number | null
          id?: string
          inventory_item_id?: string | null
          item_name: string
          quantity?: number
          received_qty?: number
          requisition_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_unit_cost?: number | null
          id?: string
          inventory_item_id?: string | null
          item_name?: string
          quantity?: number
          received_qty?: number
          requisition_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisition_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisition_items_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisitions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          department_id: string | null
          description: string | null
          estimated_cost: number | null
          id: string
          needed_by: string | null
          notes: string | null
          org_unit_id: string | null
          pr_number: string
          priority: string
          receive_notes: string | null
          received_at: string | null
          received_by: string | null
          rejection_reason: string | null
          requested_by: string
          status: string
          submitted_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          needed_by?: string | null
          notes?: string | null
          org_unit_id?: string | null
          pr_number: string
          priority?: string
          receive_notes?: string | null
          received_at?: string | null
          received_by?: string | null
          rejection_reason?: string | null
          requested_by: string
          status?: string
          submitted_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          estimated_cost?: number | null
          id?: string
          needed_by?: string | null
          notes?: string | null
          org_unit_id?: string | null
          pr_number?: string
          priority?: string
          receive_notes?: string | null
          received_at?: string | null
          received_by?: string | null
          rejection_reason?: string | null
          requested_by?: string
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisitions_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ranks: {
        Row: {
          abbreviation: string
          created_at: string
          id: string
          level: number
          name: string
        }
        Insert: {
          abbreviation: string
          created_at?: string
          id?: string
          level?: number
          name: string
        }
        Update: {
          abbreviation?: string
          created_at?: string
          id?: string
          level?: number
          name?: string
        }
        Relationships: []
      }
      recycle_bin: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          deleted_by_name: string | null
          display_context: string | null
          display_label: string | null
          expires_at: string
          id: string
          purged_at: string | null
          record_id: string
          restored_at: string | null
          restored_by: string | null
          snapshot: Json
          storage_paths: Json
          table_name: string
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_name?: string | null
          display_context?: string | null
          display_label?: string | null
          expires_at?: string
          id?: string
          purged_at?: string | null
          record_id: string
          restored_at?: string | null
          restored_by?: string | null
          snapshot: Json
          storage_paths?: Json
          table_name: string
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          deleted_by_name?: string | null
          display_context?: string | null
          display_label?: string | null
          expires_at?: string
          id?: string
          purged_at?: string | null
          record_id?: string
          restored_at?: string | null
          restored_by?: string | null
          snapshot?: Json
          storage_paths?: Json
          table_name?: string
        }
        Relationships: []
      }
      report_schedules: {
        Row: {
          created_at: string
          created_by: string
          enabled: boolean
          frequency: string
          id: string
          last_run_at: string | null
          next_run_at: string | null
          report_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          enabled?: boolean
          frequency: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          report_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          enabled?: boolean
          frequency?: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          report_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_uploads: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          category: string
          created_at: string
          department_id: string | null
          description: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          forwarded_to: string | null
          hoa_comment: string | null
          hoa_reviewed_at: string | null
          hoa_reviewer: string | null
          id: string
          ipse_comment: string | null
          ipse_reviewed_at: string | null
          ipse_reviewer: string | null
          ipse_status: string
          report_date: string
          review_comment: string | null
          severity: string | null
          source: string
          submitted_by: string | null
          title: string
          two_ic_comment: string | null
          two_ic_reviewed_at: string | null
          two_ic_reviewer: string | null
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          forwarded_to?: string | null
          hoa_comment?: string | null
          hoa_reviewed_at?: string | null
          hoa_reviewer?: string | null
          id?: string
          ipse_comment?: string | null
          ipse_reviewed_at?: string | null
          ipse_reviewer?: string | null
          ipse_status?: string
          report_date?: string
          review_comment?: string | null
          severity?: string | null
          source?: string
          submitted_by?: string | null
          title: string
          two_ic_comment?: string | null
          two_ic_reviewed_at?: string | null
          two_ic_reviewer?: string | null
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          forwarded_to?: string | null
          hoa_comment?: string | null
          hoa_reviewed_at?: string | null
          hoa_reviewer?: string | null
          id?: string
          ipse_comment?: string | null
          ipse_reviewed_at?: string | null
          ipse_reviewer?: string | null
          ipse_status?: string
          report_date?: string
          review_comment?: string | null
          severity?: string | null
          source?: string
          submitted_by?: string | null
          title?: string
          two_ic_comment?: string | null
          two_ic_reviewed_at?: string | null
          two_ic_reviewer?: string | null
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_uploads_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      request_approval_audit: {
        Row: {
          action: string
          actor_profile_id: string | null
          actor_role: string | null
          actor_user_id: string | null
          changed_fields: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_status: string | null
          notes: string | null
          previous_status: string | null
          request_profile_id: string
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          changed_fields?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
          request_profile_id: string
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          changed_fields?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_status?: string | null
          notes?: string | null
          previous_status?: string | null
          request_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_approval_audit_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_approval_audit_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_approval_audit_request_profile_id_fkey"
            columns: ["request_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_approval_audit_request_profile_id_fkey"
            columns: ["request_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      rotation_change_proposal_audit: {
        Row: {
          action: string
          actor_profile_id: string | null
          actor_user_id: string | null
          comment: string | null
          created_at: string
          id: string
          new_status: string | null
          previous_status: string | null
          proposal_id: string
          snapshot: Json | null
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          actor_user_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          previous_status?: string | null
          proposal_id: string
          snapshot?: Json | null
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          actor_user_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          new_status?: string | null
          previous_status?: string | null
          proposal_id?: string
          snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rotation_change_proposal_audit_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_change_proposal_audit_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_change_proposal_audit_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "rotation_change_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      rotation_change_proposals: {
        Row: {
          affected_profile_ids: string[] | null
          created_at: string
          effective_from: string
          id: string
          pattern: Json
          proposer_id: string
          proposer_user_id: string
          review_comment: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_profile_ids?: string[] | null
          created_at?: string
          effective_from: string
          id?: string
          pattern: Json
          proposer_id: string
          proposer_user_id: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_profile_ids?: string[] | null
          created_at?: string
          effective_from?: string
          id?: string
          pattern?: Json
          proposer_id?: string
          proposer_user_id?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotation_change_proposals_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_change_proposals_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_change_proposals_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotation_change_proposals_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      route_tracking_history: {
        Row: {
          client_ip: unknown
          created_at: string
          encrypted_route: string
          id: string
          point_count: number
          recorded_at: string
          source: string | null
          user_agent: string | null
          user_id: string
          view_mode: string | null
        }
        Insert: {
          client_ip?: unknown
          created_at?: string
          encrypted_route: string
          id?: string
          point_count?: number
          recorded_at?: string
          source?: string | null
          user_agent?: string | null
          user_id: string
          view_mode?: string | null
        }
        Update: {
          client_ip?: unknown
          created_at?: string
          encrypted_route?: string
          id?: string
          point_count?: number
          recorded_at?: string
          source?: string | null
          user_agent?: string | null
          user_id?: string
          view_mode?: string | null
        }
        Relationships: []
      }
      rum_events: {
        Row: {
          build_id: string | null
          created_at: string
          id: number
          kind: string
          meta: Json
          rating: string | null
          route: string | null
          session_id: string | null
          ua: string | null
          user_id: string | null
          value: number | null
          viewport: string | null
        }
        Insert: {
          build_id?: string | null
          created_at?: string
          id?: number
          kind: string
          meta?: Json
          rating?: string | null
          route?: string | null
          session_id?: string | null
          ua?: string | null
          user_id?: string | null
          value?: number | null
          viewport?: string | null
        }
        Update: {
          build_id?: string | null
          created_at?: string
          id?: number
          kind?: string
          meta?: Json
          rating?: string | null
          route?: string | null
          session_id?: string | null
          ua?: string | null
          user_id?: string | null
          value?: number | null
          viewport?: string | null
        }
        Relationships: []
      }
      scheduled_file_deliveries: {
        Row: {
          attempts: number
          created_at: string
          dispatched_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          last_error: string | null
          message: string | null
          mime_type: string | null
          scheduled_for: string
          sender_id: string
          status: Database["public"]["Enums"]["scheduled_delivery_status"]
          title: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dispatched_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          last_error?: string | null
          message?: string | null
          mime_type?: string | null
          scheduled_for: string
          sender_id: string
          status?: Database["public"]["Enums"]["scheduled_delivery_status"]
          title: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dispatched_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          last_error?: string | null
          message?: string | null
          mime_type?: string | null
          scheduled_for?: string
          sender_id?: string
          status?: Database["public"]["Enums"]["scheduled_delivery_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_file_recipients: {
        Row: {
          delivered: boolean
          delivered_at: string | null
          delivery_id: string
          error: string | null
          id: string
          recipient_user_id: string
        }
        Insert: {
          delivered?: boolean
          delivered_at?: string | null
          delivery_id: string
          error?: string | null
          id?: string
          recipient_user_id: string
        }
        Update: {
          delivered?: boolean
          delivered_at?: string | null
          delivery_id?: string
          error?: string | null
          id?: string
          recipient_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_file_recipients_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "scheduled_file_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      secure_file_uploads: {
        Row: {
          bucket: string
          created_at: string
          filename: string
          id: string
          mime_type: string | null
          scan_action: string
          scan_reason: string | null
          sha256: string | null
          size_bytes: number
          sniffed_mime: string | null
          storage_path: string
          uploaded_by: string
          uploaded_label: string | null
        }
        Insert: {
          bucket?: string
          created_at?: string
          filename: string
          id?: string
          mime_type?: string | null
          scan_action: string
          scan_reason?: string | null
          sha256?: string | null
          size_bytes: number
          sniffed_mime?: string | null
          storage_path: string
          uploaded_by: string
          uploaded_label?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string | null
          scan_action?: string
          scan_reason?: string | null
          sha256?: string | null
          size_bytes?: number
          sniffed_mime?: string | null
          storage_path?: string
          uploaded_by?: string
          uploaded_label?: string | null
        }
        Relationships: []
      }
      security_audit_anchors: {
        Row: {
          anchor_date: string
          created_at: string
          head_hash: string
          head_seq: number
          id: string
          row_count: number
        }
        Insert: {
          anchor_date: string
          created_at?: string
          head_hash: string
          head_seq: number
          id?: string
          row_count: number
        }
        Update: {
          anchor_date?: string
          created_at?: string
          head_hash?: string
          head_seq?: number
          id?: string
          row_count?: number
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string | null
          category: string
          created_at: string
          details: Json
          id: string
          ip_address: string | null
          prev_hash: string | null
          row_hash: string
          seq: number
          severity: string
          subject: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string | null
          category: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          prev_hash?: string | null
          row_hash: string
          seq?: number
          severity?: string
          subject?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string | null
          category?: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: string | null
          prev_hash?: string | null
          row_hash?: string
          seq?: number
          severity?: string
          subject?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      security_incidents: {
        Row: {
          assigned_to: string | null
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          incident_type: string
          location: string | null
          reported_by: string
          resolution_notes: string | null
          resolved_at: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          incident_type?: string
          location?: string | null
          reported_by: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          incident_type?: string
          location?: string | null
          reported_by?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_incidents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      security_monitor_alerts: {
        Row: {
          acknowledge_note: string | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          details: Json
          event_count: number
          id: string
          rule_key: string
          severity: string
          subject_key: string
          subject_label: string | null
          subject_user_id: string | null
          threshold: number
          window_end: string
          window_start: string
        }
        Insert: {
          acknowledge_note?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          details?: Json
          event_count?: number
          id?: string
          rule_key: string
          severity?: string
          subject_key?: string
          subject_label?: string | null
          subject_user_id?: string | null
          threshold?: number
          window_end: string
          window_start: string
        }
        Update: {
          acknowledge_note?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          details?: Json
          event_count?: number
          id?: string
          rule_key?: string
          severity?: string
          subject_key?: string
          subject_label?: string | null
          subject_user_id?: string | null
          threshold?: number
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      security_monitor_settings: {
        Row: {
          authz_failure_threshold: number
          authz_failure_window_minutes: number
          created_at: string
          email_alerts: boolean
          enabled: boolean
          id: string
          last_run_at: string | null
          role_change_threshold: number
          role_change_window_minutes: number
          updated_at: string
          upload_access_threshold: number
          upload_access_window_minutes: number
        }
        Insert: {
          authz_failure_threshold?: number
          authz_failure_window_minutes?: number
          created_at?: string
          email_alerts?: boolean
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          role_change_threshold?: number
          role_change_window_minutes?: number
          updated_at?: string
          upload_access_threshold?: number
          upload_access_window_minutes?: number
        }
        Update: {
          authz_failure_threshold?: number
          authz_failure_window_minutes?: number
          created_at?: string
          email_alerts?: boolean
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          role_change_threshold?: number
          role_change_window_minutes?: number
          updated_at?: string
          upload_access_threshold?: number
          upload_access_window_minutes?: number
        }
        Relationships: []
      }
      security_monitor_webhooks: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          kind: string
          label: string
          last_error: string | null
          last_sent_at: string | null
          last_status: string | null
          max_attempts: number
          min_severity: string
          signing_secret: string | null
          throttle_minutes: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          kind?: string
          label: string
          last_error?: string | null
          last_sent_at?: string | null
          last_status?: string | null
          max_attempts?: number
          min_severity?: string
          signing_secret?: string | null
          throttle_minutes?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          kind?: string
          label?: string
          last_error?: string | null
          last_sent_at?: string | null
          last_status?: string | null
          max_attempts?: number
          min_severity?: string
          signing_secret?: string | null
          throttle_minutes?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      security_scan_runs: {
        Row: {
          error_count: number
          error_message: string | null
          findings: Json
          finished_at: string | null
          id: string
          passed_count: number
          started_at: string
          status: string
          total_checks: number
          trigger_kind: string
          triggered_by: string | null
          warn_count: number
        }
        Insert: {
          error_count?: number
          error_message?: string | null
          findings?: Json
          finished_at?: string | null
          id?: string
          passed_count?: number
          started_at?: string
          status?: string
          total_checks?: number
          trigger_kind?: string
          triggered_by?: string | null
          warn_count?: number
        }
        Update: {
          error_count?: number
          error_message?: string | null
          findings?: Json
          finished_at?: string | null
          id?: string
          passed_count?: number
          started_at?: string
          status?: string
          total_checks?: number
          trigger_kind?: string
          triggered_by?: string | null
          warn_count?: number
        }
        Relationships: []
      }
      security_webhook_deliveries: {
        Row: {
          alert_count: number
          attempts: number
          created_at: string
          dead_at: string | null
          delivered_at: string | null
          id: string
          last_error: string | null
          last_status: string | null
          lease_until: string | null
          next_attempt_at: string
          payload: Json
          status: string
          top_severity: string | null
          updated_at: string
          webhook_id: string
        }
        Insert: {
          alert_count?: number
          attempts?: number
          created_at?: string
          dead_at?: string | null
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          last_status?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          payload: Json
          status?: string
          top_severity?: string | null
          updated_at?: string
          webhook_id: string
        }
        Update: {
          alert_count?: number
          attempts?: number
          created_at?: string
          dead_at?: string | null
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          last_status?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          payload?: Json
          status?: string
          top_severity?: string | null
          updated_at?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "security_monitor_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      sensitive_table_access_log: {
        Row: {
          accessed_by: string | null
          accessed_by_name: string | null
          action: string
          created_at: string
          filters: Json | null
          id: string
          ip_address: string | null
          reason: string | null
          record_count: number | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          accessed_by?: string | null
          accessed_by_name?: string | null
          action: string
          created_at?: string
          filters?: Json | null
          id?: string
          ip_address?: string | null
          reason?: string | null
          record_count?: number | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          accessed_by?: string | null
          accessed_by_name?: string | null
          action?: string
          created_at?: string
          filters?: Json | null
          id?: string
          ip_address?: string | null
          reason?: string | null
          record_count?: number | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      session_action_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          device_fingerprint: string | null
          id: string
          ip_address: string | null
          reason: string | null
          session_id: string | null
          sessions_affected: number
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          device_fingerprint?: string | null
          id?: string
          ip_address?: string | null
          reason?: string | null
          session_id?: string | null
          sessions_affected?: number
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          device_fingerprint?: string | null
          id?: string
          ip_address?: string | null
          reason?: string | null
          session_id?: string | null
          sessions_affected?: number
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      shift_assignment_overrides: {
        Row: {
          action: string
          created_at: string
          effective_date: string
          id: string
          import_id: string | null
          new_shift_id: string | null
          performed_by: string | null
          previous_shift_id: string | null
          profile_id: string
          reason: string | null
          source: string
        }
        Insert: {
          action: string
          created_at?: string
          effective_date: string
          id?: string
          import_id?: string | null
          new_shift_id?: string | null
          performed_by?: string | null
          previous_shift_id?: string | null
          profile_id: string
          reason?: string | null
          source?: string
        }
        Update: {
          action?: string
          created_at?: string
          effective_date?: string
          id?: string
          import_id?: string | null
          new_shift_id?: string | null
          performed_by?: string | null
          previous_shift_id?: string | null
          profile_id?: string
          reason?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignment_overrides_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "duty_roster_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignment_overrides_new_shift_id_fkey"
            columns: ["new_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignment_overrides_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignment_overrides_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignment_overrides_previous_shift_id_fkey"
            columns: ["previous_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignment_overrides_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignment_overrides_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          profile_id: string
          shift_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          profile_id: string
          shift_id: string
          start_date?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          profile_id?: string
          shift_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_attendance_window_overrides: {
        Row: {
          created_at: string
          early_checkin_minutes: number | null
          effective_from: string | null
          effective_to: string | null
          enforce_window: boolean | null
          grace_minutes: number | null
          id: string
          late_checkout_minutes: number | null
          notes: string | null
          shift_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          early_checkin_minutes?: number | null
          effective_from?: string | null
          effective_to?: string | null
          enforce_window?: boolean | null
          grace_minutes?: number | null
          id?: string
          late_checkout_minutes?: number | null
          notes?: string | null
          shift_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          early_checkin_minutes?: number | null
          effective_from?: string | null
          effective_to?: string | null
          enforce_window?: boolean | null
          grace_minutes?: number | null
          id?: string
          late_checkout_minutes?: number | null
          notes?: string | null
          shift_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_attendance_window_overrides_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_change_requests: {
        Row: {
          affected_date: string
          created_at: string
          current_shift_id: string | null
          id: string
          profile_id: string
          reason: string
          request_type: string
          requested_by: string
          requested_end_time: string | null
          requested_shift_id: string | null
          requested_start_time: string | null
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          affected_date: string
          created_at?: string
          current_shift_id?: string | null
          id?: string
          profile_id: string
          reason: string
          request_type: string
          requested_by: string
          requested_end_time?: string | null
          requested_shift_id?: string | null
          requested_start_time?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          affected_date?: string
          created_at?: string
          current_shift_id?: string | null
          id?: string
          profile_id?: string
          reason?: string
          request_type?: string
          requested_by?: string
          requested_end_time?: string | null
          requested_shift_id?: string | null
          requested_start_time?: string | null
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_change_requests_current_shift_id_fkey"
            columns: ["current_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_change_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_change_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_change_requests_requested_shift_id_fkey"
            columns: ["requested_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_connection_permissions: {
        Row: {
          action: string
          allowed: boolean
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action: string
          allowed?: boolean
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action?: string
          allowed?: boolean
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      shift_platform_connections: {
        Row: {
          created_at: string
          id: string
          is_connected: boolean
          last_sync_at: string | null
          offline_mode: boolean
          platform: string
          platform_username: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_connected?: boolean
          last_sync_at?: string | null
          offline_mode?: boolean
          platform: string
          platform_username?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_connected?: boolean
          last_sync_at?: string | null
          offline_mode?: boolean
          platform?: string
          platform_username?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_platform_connections_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_platform_connections_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_rotation_assignments: {
        Row: {
          created_at: string
          created_by: string
          end_date: string | null
          id: string
          notes: string | null
          priority: number
          schedule_id: string
          scope_type: Database["public"]["Enums"]["shift_rotation_scope"]
          scope_value: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          priority?: number
          schedule_id: string
          scope_type: Database["public"]["Enums"]["shift_rotation_scope"]
          scope_value?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          priority?: number
          schedule_id?: string
          scope_type?: Database["public"]["Enums"]["shift_rotation_scope"]
          scope_value?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_rotation_assignments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "shift_rotation_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_rotation_config: {
        Row: {
          anchor_date: string
          id: boolean
          pattern: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          anchor_date?: string
          id?: boolean
          pattern?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          anchor_date?: string
          id?: boolean
          pattern?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      shift_rotation_config_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          changed_fields: string[]
          id: string
          new_anchor_date: string | null
          new_pattern: string[] | null
          old_anchor_date: string | null
          old_pattern: string[] | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          changed_fields?: string[]
          id?: string
          new_anchor_date?: string | null
          new_pattern?: string[] | null
          old_anchor_date?: string | null
          old_pattern?: string[] | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          changed_fields?: string[]
          id?: string
          new_anchor_date?: string | null
          new_pattern?: string[] | null
          old_anchor_date?: string | null
          old_pattern?: string[] | null
        }
        Relationships: []
      }
      shift_rotation_deploy_audit: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          diff: Json
          id: string
          notes: string | null
          schedule_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string
          created_at?: string
          diff?: Json
          id?: string
          notes?: string | null
          schedule_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          diff?: Json
          id?: string
          notes?: string | null
          schedule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_rotation_deploy_audit_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "shift_rotation_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_rotation_exclusions: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          role?: string
        }
        Relationships: []
      }
      shift_rotation_individual_overrides: {
        Row: {
          created_at: string
          created_by: string
          group_letter: string
          id: string
          override_date: string
          profile_id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          group_letter: string
          id?: string
          override_date: string
          profile_id: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          group_letter?: string
          id?: string
          override_date?: string
          profile_id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shift_rotation_overrides: {
        Row: {
          anchor_date: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          notes: string | null
          pattern: string[]
          scope_type: string
          scope_value: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          anchor_date: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          notes?: string | null
          pattern: string[]
          scope_type: string
          scope_value: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          anchor_date?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          notes?: string | null
          pattern?: string[]
          scope_type?: string
          scope_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      shift_rotation_schedules: {
        Row: {
          anchor_date: string
          created_at: string
          created_by: string
          cycle_length: number | null
          description: string | null
          id: string
          name: string
          parent_schedule_id: string | null
          pattern: string[]
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["shift_rotation_status"]
          timezone: string
          updated_at: string
          version: number
        }
        Insert: {
          anchor_date: string
          created_at?: string
          created_by?: string
          cycle_length?: number | null
          description?: string | null
          id?: string
          name: string
          parent_schedule_id?: string | null
          pattern: string[]
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["shift_rotation_status"]
          timezone?: string
          updated_at?: string
          version?: number
        }
        Update: {
          anchor_date?: string
          created_at?: string
          created_by?: string
          cycle_length?: number | null
          description?: string | null
          id?: string
          name?: string
          parent_schedule_id?: string | null
          pattern?: string[]
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["shift_rotation_status"]
          timezone?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "shift_rotation_schedules_parent_schedule_id_fkey"
            columns: ["parent_schedule_id"]
            isOneToOne: false
            referencedRelation: "shift_rotation_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_window_override_audit: {
        Row: {
          action: string
          changed_fields: string[] | null
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          override_id: string | null
          performed_by: string | null
          performed_by_name: string | null
          shift_id: string | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          override_id?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          shift_id?: string | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          override_id?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          shift_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_window_override_audit_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          created_at: string
          description: string | null
          end_time: string | null
          id: string
          name: string
          pattern: Database["public"]["Enums"]["shift_pattern"]
          start_time: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          name: string
          pattern?: Database["public"]["Enums"]["shift_pattern"]
          start_time?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          name?: string
          pattern?: Database["public"]["Enums"]["shift_pattern"]
          start_time?: string | null
        }
        Relationships: []
      }
      staff_appraisal_audit: {
        Row: {
          action: string
          actor_id: string | null
          appraisal_id: string | null
          bulk_batch_id: string | null
          bulk_size: number | null
          created_at: string
          details: Json
          id: string
          period_month: number | null
          period_year: number
          staff_profile_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          appraisal_id?: string | null
          bulk_batch_id?: string | null
          bulk_size?: number | null
          created_at?: string
          details?: Json
          id?: string
          period_month?: number | null
          period_year: number
          staff_profile_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          appraisal_id?: string | null
          bulk_batch_id?: string | null
          bulk_size?: number | null
          created_at?: string
          details?: Json
          id?: string
          period_month?: number | null
          period_year?: number
          staff_profile_id?: string
        }
        Relationships: []
      }
      staff_appraisal_scores: {
        Row: {
          appraisal_id: string
          criterion: Database["public"]["Enums"]["appraisal_criterion"]
          id: string
          remarks: string | null
          score: number
        }
        Insert: {
          appraisal_id: string
          criterion: Database["public"]["Enums"]["appraisal_criterion"]
          id?: string
          remarks?: string | null
          score: number
        }
        Update: {
          appraisal_id?: string
          criterion?: Database["public"]["Enums"]["appraisal_criterion"]
          id?: string
          remarks?: string | null
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_appraisal_scores_appraisal_id_fkey"
            columns: ["appraisal_id"]
            isOneToOne: false
            referencedRelation: "staff_appraisals"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_appraisals: {
        Row: {
          appraised_by: string
          average_score: number
          comments: string | null
          created_at: string
          id: string
          outstanding: boolean
          period_month: number | null
          period_year: number
          staff_profile_id: string
          status: Database["public"]["Enums"]["appraisal_status"]
          submitted_at: string | null
          total_score: number
          updated_at: string
        }
        Insert: {
          appraised_by: string
          average_score?: number
          comments?: string | null
          created_at?: string
          id?: string
          outstanding?: boolean
          period_month?: number | null
          period_year: number
          staff_profile_id: string
          status?: Database["public"]["Enums"]["appraisal_status"]
          submitted_at?: string | null
          total_score?: number
          updated_at?: string
        }
        Update: {
          appraised_by?: string
          average_score?: number
          comments?: string | null
          created_at?: string
          id?: string
          outstanding?: boolean
          period_month?: number | null
          period_year?: number
          staff_profile_id?: string
          status?: Database["public"]["Enums"]["appraisal_status"]
          submitted_at?: string | null
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_appraisals_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_appraisals_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_bulk_upload_audit: {
        Row: {
          created_count: number
          dry_run: boolean
          error_count: number
          errors: Json
          file_name: string | null
          id: string
          skipped_count: number
          summary: Json
          total_rows: number
          updated_count: number
          uploaded_at: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          created_count?: number
          dry_run?: boolean
          error_count?: number
          errors?: Json
          file_name?: string | null
          id?: string
          skipped_count?: number
          summary?: Json
          total_rows?: number
          updated_count?: number
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          created_count?: number
          dry_run?: boolean
          error_count?: number
          errors?: Json
          file_name?: string | null
          id?: string
          skipped_count?: number
          summary?: Json
          total_rows?: number
          updated_count?: number
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: []
      }
      staff_bulk_upload_snapshots: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          night_guard_count: number
          night_guard_data: Json
          note: string | null
          profiles_count: number
          profiles_data: Json
          restored_at: string | null
          restored_by: string | null
          taken_by: string | null
          taken_by_name: string | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          night_guard_count?: number
          night_guard_data?: Json
          note?: string | null
          profiles_count?: number
          profiles_data?: Json
          restored_at?: string | null
          restored_by?: string | null
          taken_by?: string | null
          taken_by_name?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          night_guard_count?: number
          night_guard_data?: Json
          note?: string | null
          profiles_count?: number
          profiles_data?: Json
          restored_at?: string | null
          restored_by?: string | null
          taken_by?: string | null
          taken_by_name?: string | null
        }
        Relationships: []
      }
      staff_documents: {
        Row: {
          created_at: string
          document_number: string | null
          document_type: string
          expiry_date: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          id: string
          issue_date: string | null
          issuing_authority: string | null
          notes: string | null
          profile_id: string
          status: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_number?: string | null
          document_type: string
          expiry_date?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          issue_date?: string | null
          issuing_authority?: string | null
          notes?: string | null
          profile_id: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_number?: string | null
          document_type?: string
          expiry_date?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          issue_date?: string | null
          issuing_authority?: string | null
          notes?: string | null
          profile_id?: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_documents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_documents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "staff_birthdays"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_mapping_imports: {
        Row: {
          created_at: string
          error_count: number
          filename: string | null
          id: string
          imported_by: string | null
          notes: string | null
          skipped_count: number
          total_rows: number
          updated_count: number
        }
        Insert: {
          created_at?: string
          error_count?: number
          filename?: string | null
          id?: string
          imported_by?: string | null
          notes?: string | null
          skipped_count?: number
          total_rows?: number
          updated_count?: number
        }
        Update: {
          created_at?: string
          error_count?: number
          filename?: string | null
          id?: string
          imported_by?: string | null
          notes?: string | null
          skipped_count?: number
          total_rows?: number
          updated_count?: number
        }
        Relationships: []
      }
      staff_request_history: {
        Row: {
          actor: string | null
          actor_name: string | null
          comment: string | null
          created_at: string
          from_status: string | null
          id: string
          request_id: string
          request_kind: string
          to_status: string
        }
        Insert: {
          actor?: string | null
          actor_name?: string | null
          comment?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          request_id: string
          request_kind: string
          to_status: string
        }
        Update: {
          actor?: string | null
          actor_name?: string | null
          comment?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          request_id?: string
          request_kind?: string
          to_status?: string
        }
        Relationships: []
      }
      status_change_audit: {
        Row: {
          changed_by: string | null
          created_at: string
          entity_table: string
          from_status: string | null
          id: string
          reason: string | null
          record_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          entity_table: string
          from_status?: string | null
          id?: string
          reason?: string | null
          record_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          entity_table?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          record_id?: string
          to_status?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          performed_by?: string | null
        }
        Relationships: []
      }
      system_backup_audit: {
        Row: {
          actor_email: string | null
          byte_size: number
          created_at: string
          error_message: string | null
          id: string
          ip_address: string | null
          row_counts: Json
          schedule_id: string | null
          status: string
          tables_exported: string[]
          tables_requested: string[]
          total_rows: number
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          actor_email?: string | null
          byte_size?: number
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          row_counts?: Json
          schedule_id?: string | null
          status?: string
          tables_exported?: string[]
          tables_requested: string[]
          total_rows?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          actor_email?: string | null
          byte_size?: number
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          row_counts?: Json
          schedule_id?: string | null
          status?: string
          tables_exported?: string[]
          tables_requested?: string[]
          total_rows?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_backup_audit_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "system_backup_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      system_backup_restore_audit: {
        Row: {
          actor_email: string | null
          created_at: string
          error_message: string | null
          id: string
          ip_address: string | null
          rows_written: Json
          snapshot_id: string | null
          source_label: string | null
          status: string
          tables_requested: string[]
          tables_restored: string[]
          total_rows_written: number
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          actor_email?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          rows_written?: Json
          snapshot_id?: string | null
          source_label?: string | null
          status?: string
          tables_requested: string[]
          tables_restored?: string[]
          total_rows_written?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          actor_email?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          rows_written?: Json
          snapshot_id?: string | null
          source_label?: string | null
          status?: string
          tables_requested?: string[]
          tables_restored?: string[]
          total_rows_written?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_backup_restore_audit_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "system_backup_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      system_backup_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          frequency: Database["public"]["Enums"]["backup_frequency"]
          id: string
          is_active: boolean
          last_run_at: string | null
          last_run_error: string | null
          last_run_status: string | null
          name: string
          next_run_at: string
          retention_days: number | null
          tables_included: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          frequency: Database["public"]["Enums"]["backup_frequency"]
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_run_error?: string | null
          last_run_status?: string | null
          name: string
          next_run_at?: string
          retention_days?: number | null
          tables_included?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          frequency?: Database["public"]["Enums"]["backup_frequency"]
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_run_error?: string | null
          last_run_status?: string | null
          name?: string
          next_run_at?: string
          retention_days?: number | null
          tables_included?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      system_backup_settings: {
        Row: {
          cleanup_enabled: boolean
          id: string
          retention_count: number
          retention_days: number | null
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cleanup_enabled?: boolean
          id?: string
          retention_count?: number
          retention_days?: number | null
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cleanup_enabled?: boolean
          id?: string
          retention_count?: number
          retention_days?: number | null
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      system_backup_snapshots: {
        Row: {
          actor_email: string | null
          audit_id: string | null
          byte_size: number
          created_at: string
          created_by: string | null
          file_name: string
          id: string
          notes: string | null
          row_counts: Json
          schedule_id: string | null
          source: string
          storage_path: string
          tables_included: string[]
          total_rows: number
        }
        Insert: {
          actor_email?: string | null
          audit_id?: string | null
          byte_size?: number
          created_at?: string
          created_by?: string | null
          file_name: string
          id?: string
          notes?: string | null
          row_counts?: Json
          schedule_id?: string | null
          source?: string
          storage_path: string
          tables_included?: string[]
          total_rows?: number
        }
        Update: {
          actor_email?: string | null
          audit_id?: string | null
          byte_size?: number
          created_at?: string
          created_by?: string | null
          file_name?: string
          id?: string
          notes?: string | null
          row_counts?: Json
          schedule_id?: string | null
          source?: string
          storage_path?: string
          tables_included?: string[]
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_backup_snapshots_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "system_backup_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_backup_snapshots_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "system_backup_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          current_page: string | null
          device_fingerprint: string | null
          id: string
          ip_address: string | null
          last_seen_at: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          session_key: string
          started_at: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          current_page?: string | null
          device_fingerprint?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          session_key: string
          started_at?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          current_page?: string | null
          device_fingerprint?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          session_key?: string
          started_at?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      visa_applications: {
        Row: {
          applicant_category: string | null
          applicant_name: string
          biometrics_captured: boolean | null
          created_at: string
          date_of_birth: string | null
          dual_nationality: string | null
          duration_of_stay_days: number | null
          ecowas_id_number: string | null
          emergency_contact: string | null
          entry_date: string | null
          exit_date: string | null
          fee_charged: number | null
          fee_receipt_number: string | null
          foreign_address: string | null
          gender: string | null
          ghana_post_gps: string | null
          home_address: string | null
          host_address: string | null
          host_name: string | null
          host_phone: string | null
          id: string
          letter_of_invitation: boolean | null
          marital_status: string | null
          nationality: string
          nearest_landmark: string | null
          next_of_kin: string | null
          notes: string | null
          occupation: string | null
          other_names: string | null
          passport_expiry_date: string | null
          passport_issue_date: string | null
          passport_number: string
          passport_place_of_issue: string | null
          passport_type: string | null
          phone: string | null
          place_of_birth: string | null
          port_of_entry: string | null
          previous_visa_history: string | null
          processed_by: string | null
          processing_checklist: Json | null
          purpose: string | null
          status: string
          street_name: string | null
          surname: string | null
          updated_at: string
          visa_class: string | null
          visa_type: string
          yellow_fever_cert: boolean | null
        }
        Insert: {
          applicant_category?: string | null
          applicant_name: string
          biometrics_captured?: boolean | null
          created_at?: string
          date_of_birth?: string | null
          dual_nationality?: string | null
          duration_of_stay_days?: number | null
          ecowas_id_number?: string | null
          emergency_contact?: string | null
          entry_date?: string | null
          exit_date?: string | null
          fee_charged?: number | null
          fee_receipt_number?: string | null
          foreign_address?: string | null
          gender?: string | null
          ghana_post_gps?: string | null
          home_address?: string | null
          host_address?: string | null
          host_name?: string | null
          host_phone?: string | null
          id?: string
          letter_of_invitation?: boolean | null
          marital_status?: string | null
          nationality: string
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          occupation?: string | null
          other_names?: string | null
          passport_expiry_date?: string | null
          passport_issue_date?: string | null
          passport_number: string
          passport_place_of_issue?: string | null
          passport_type?: string | null
          phone?: string | null
          place_of_birth?: string | null
          port_of_entry?: string | null
          previous_visa_history?: string | null
          processed_by?: string | null
          processing_checklist?: Json | null
          purpose?: string | null
          status?: string
          street_name?: string | null
          surname?: string | null
          updated_at?: string
          visa_class?: string | null
          visa_type?: string
          yellow_fever_cert?: boolean | null
        }
        Update: {
          applicant_category?: string | null
          applicant_name?: string
          biometrics_captured?: boolean | null
          created_at?: string
          date_of_birth?: string | null
          dual_nationality?: string | null
          duration_of_stay_days?: number | null
          ecowas_id_number?: string | null
          emergency_contact?: string | null
          entry_date?: string | null
          exit_date?: string | null
          fee_charged?: number | null
          fee_receipt_number?: string | null
          foreign_address?: string | null
          gender?: string | null
          ghana_post_gps?: string | null
          home_address?: string | null
          host_address?: string | null
          host_name?: string | null
          host_phone?: string | null
          id?: string
          letter_of_invitation?: boolean | null
          marital_status?: string | null
          nationality?: string
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          occupation?: string | null
          other_names?: string | null
          passport_expiry_date?: string | null
          passport_issue_date?: string | null
          passport_number?: string
          passport_place_of_issue?: string | null
          passport_type?: string | null
          phone?: string | null
          place_of_birth?: string | null
          port_of_entry?: string | null
          previous_visa_history?: string | null
          processed_by?: string | null
          processing_checklist?: Json | null
          purpose?: string | null
          status?: string
          street_name?: string | null
          surname?: string | null
          updated_at?: string
          visa_class?: string | null
          visa_type?: string
          yellow_fever_cert?: boolean | null
        }
        Relationships: []
      }
      visa_extensions: {
        Row: {
          applicant_category: string | null
          applicant_name: string
          biometrics_captured: boolean | null
          created_at: string
          current_visa_expiry: string
          date_of_birth: string | null
          dual_nationality: string | null
          ecowas_id_number: string | null
          emergency_contact: string | null
          extension_duration_days: number | null
          fee_charged: number | null
          fee_receipt_number: string | null
          foreign_address: string | null
          gender: string | null
          ghana_post_gps: string | null
          home_address: string | null
          host_address: string | null
          host_name: string | null
          host_phone: string | null
          id: string
          marital_status: string | null
          nationality: string | null
          nearest_landmark: string | null
          next_of_kin: string | null
          notes: string | null
          occupation: string | null
          other_names: string | null
          passport_expiry_date: string | null
          passport_issue_date: string | null
          passport_number: string
          passport_place_of_issue: string | null
          passport_type: string | null
          permit_type: string | null
          phone: string | null
          place_of_birth: string | null
          port_of_entry: string | null
          processed_by: string | null
          processing_checklist: Json | null
          reason: string | null
          requested_extension_date: string
          status: string
          street_name: string | null
          surname: string | null
          updated_at: string
          visa_application_id: string | null
        }
        Insert: {
          applicant_category?: string | null
          applicant_name: string
          biometrics_captured?: boolean | null
          created_at?: string
          current_visa_expiry: string
          date_of_birth?: string | null
          dual_nationality?: string | null
          ecowas_id_number?: string | null
          emergency_contact?: string | null
          extension_duration_days?: number | null
          fee_charged?: number | null
          fee_receipt_number?: string | null
          foreign_address?: string | null
          gender?: string | null
          ghana_post_gps?: string | null
          home_address?: string | null
          host_address?: string | null
          host_name?: string | null
          host_phone?: string | null
          id?: string
          marital_status?: string | null
          nationality?: string | null
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          occupation?: string | null
          other_names?: string | null
          passport_expiry_date?: string | null
          passport_issue_date?: string | null
          passport_number: string
          passport_place_of_issue?: string | null
          passport_type?: string | null
          permit_type?: string | null
          phone?: string | null
          place_of_birth?: string | null
          port_of_entry?: string | null
          processed_by?: string | null
          processing_checklist?: Json | null
          reason?: string | null
          requested_extension_date: string
          status?: string
          street_name?: string | null
          surname?: string | null
          updated_at?: string
          visa_application_id?: string | null
        }
        Update: {
          applicant_category?: string | null
          applicant_name?: string
          biometrics_captured?: boolean | null
          created_at?: string
          current_visa_expiry?: string
          date_of_birth?: string | null
          dual_nationality?: string | null
          ecowas_id_number?: string | null
          emergency_contact?: string | null
          extension_duration_days?: number | null
          fee_charged?: number | null
          fee_receipt_number?: string | null
          foreign_address?: string | null
          gender?: string | null
          ghana_post_gps?: string | null
          home_address?: string | null
          host_address?: string | null
          host_name?: string | null
          host_phone?: string | null
          id?: string
          marital_status?: string | null
          nationality?: string | null
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          occupation?: string | null
          other_names?: string | null
          passport_expiry_date?: string | null
          passport_issue_date?: string | null
          passport_number?: string
          passport_place_of_issue?: string | null
          passport_type?: string | null
          permit_type?: string | null
          phone?: string | null
          place_of_birth?: string | null
          port_of_entry?: string | null
          processed_by?: string | null
          processing_checklist?: Json | null
          reason?: string | null
          requested_extension_date?: string
          status?: string
          street_name?: string | null
          surname?: string | null
          updated_at?: string
          visa_application_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visa_extensions_visa_application_id_fkey"
            columns: ["visa_application_id"]
            isOneToOne: false
            referencedRelation: "visa_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_audit: {
        Row: {
          actor_id: string | null
          created_at: string
          credential_id: string | null
          detail: string | null
          device_fingerprint: string | null
          device_label: string | null
          event: string
          id: string
          ip_address: string | null
          staff_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          credential_id?: string | null
          detail?: string | null
          device_fingerprint?: string | null
          device_label?: string | null
          event: string
          id?: string
          ip_address?: string | null
          staff_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          credential_id?: string | null
          detail?: string | null
          device_fingerprint?: string | null
          device_label?: string | null
          event?: string
          id?: string
          ip_address?: string | null
          staff_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      webauthn_challenges: {
        Row: {
          challenge: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          purpose: string
          staff_id: string | null
          user_id: string | null
        }
        Insert: {
          challenge: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          purpose: string
          staff_id?: string | null
          user_id?: string | null
        }
        Update: {
          challenge?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          staff_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      webauthn_credentials: {
        Row: {
          aaguid: string | null
          backed_up: boolean
          created_at: string
          credential_id: string
          device_label: string
          id: string
          last_used_at: string | null
          public_key: string
          revoked_at: string | null
          revoked_by: string | null
          sign_count: number
          transports: string[]
          updated_at: string
          user_id: string
          user_verified: boolean
        }
        Insert: {
          aaguid?: string | null
          backed_up?: boolean
          created_at?: string
          credential_id: string
          device_label?: string
          id?: string
          last_used_at?: string | null
          public_key: string
          revoked_at?: string | null
          revoked_by?: string | null
          sign_count?: number
          transports?: string[]
          updated_at?: string
          user_id: string
          user_verified?: boolean
        }
        Update: {
          aaguid?: string | null
          backed_up?: boolean
          created_at?: string
          credential_id?: string
          device_label?: string
          id?: string
          last_used_at?: string | null
          public_key?: string
          revoked_at?: string | null
          revoked_by?: string | null
          sign_count?: number
          transports?: string[]
          updated_at?: string
          user_id?: string
          user_verified?: boolean
        }
        Relationships: []
      }
      webauthn_stepup_tokens: {
        Row: {
          action: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          method: string
          token_hash: string
          user_id: string
        }
        Insert: {
          action: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          method?: string
          token_hash: string
          user_id: string
        }
        Update: {
          action?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          method?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      webauthn_user_settings: {
        Row: {
          biometric_login_enabled: boolean
          consented_at: string | null
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          biometric_login_enabled?: boolean
          consented_at?: string | null
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          biometric_login_enabled?: boolean
          consented_at?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      front_desk_visa_extensions_view: {
        Row: {
          applicant_name: string | null
          created_at: string | null
          current_visa_expiry: string | null
          fee_charged: number | null
          id: string | null
          nationality: string | null
          notes: string | null
          passport_number: string | null
          permit_type: string | null
          processed_by: string | null
          processed_by_first_name: string | null
          processed_by_last_name: string | null
          processed_by_name: string | null
          processed_by_staff_id: string | null
          reason: string | null
          requested_extension_date: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      staff_birthdays: {
        Row: {
          bday_day: number | null
          bday_month: number | null
          date_of_birth: string | null
          department_id: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          photo_url: string | null
          staff_id: string | null
          user_id: string | null
        }
        Insert: {
          bday_day?: never
          bday_month?: never
          date_of_birth?: string | null
          department_id?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          photo_url?: string | null
          staff_id?: string | null
          user_id?: string | null
        }
        Update: {
          bday_day?: never
          bday_month?: never
          date_of_birth?: string | null
          department_id?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          photo_url?: string | null
          staff_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      access_policy: {
        Args: never
        Returns: {
          accent_color: string
          allow_self_registration: boolean
          announcement_file_cleanup_last_run_at: string | null
          announcement_file_cleanup_mode: string
          announcement_file_retention_days_department: number
          announcement_file_retention_days_global: number
          announcement_file_retention_enabled: boolean
          auto_logout_minutes: number
          auto_logout_warning_seconds: number
          biometric_enrollment_enforced_at: string | null
          biometric_enrollment_grace_days: number
          biometric_enrollment_required: boolean
          biometric_login_enabled: boolean
          biometric_required_roles: Database["public"]["Enums"]["app_role"][]
          biometric_stepup_required: boolean
          company_name: string
          contact_address: string | null
          contact_email: string | null
          contact_phone: string | null
          contact_website: string | null
          created_at: string
          dashboard_logo_url: string | null
          email_footer_text: string | null
          email_from_name: string | null
          email_header_color: string | null
          email_logo_url: string | null
          email_reply_to: string | null
          email_signature: string | null
          enable_system_health_widget: boolean
          enforce_password_change: boolean
          favicon_url: string | null
          footer_text: string
          header_text: string | null
          id: string
          lockout_auto_unlock_minutes: number | null
          lockout_threshold: number
          lockout_window_minutes: number
          login_background_url: string | null
          login_logo_url: string | null
          login_tagline: string | null
          logo_url: string | null
          max_concurrent_sessions: number
          mfa_grace_days: number
          mfa_required_roles: string[]
          min_password_length: number
          org_name: string
          password_min_strength: number
          password_require_lower: boolean
          password_require_number: boolean
          password_require_symbol: boolean
          password_require_upper: boolean
          primary_color: string
          recaptcha_enabled: boolean
          recaptcha_min_score: number
          recaptcha_site_key: string | null
          secondary_color: string
          security_scan_enabled: boolean
          security_scan_frequency: string
          security_scan_last_run_at: string | null
          session_absolute_hours: number
          staff_id_mask_rules: Json
          system_description: string | null
          system_label: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "app_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_purge_shift_connections: { Args: never; Returns: number }
      admin_quick_search: { Args: { _q: string }; Returns: Json }
      admin_recovery_consume_backup_code: {
        Args: { _code: string; _user_id: string }
        Returns: boolean
      }
      admin_reset_failed_attempts: {
        Args: { _staff_id: string }
        Returns: undefined
      }
      admin_unlock_account: {
        Args: { _profile_id: string; _reason: string }
        Returns: Json
      }
      apply_announcement_file_retention: {
        Args: never
        Returns: {
          deactivated: number
          default_applied: number
          scanned: number
          soft_deleted: number
        }[]
      }
      appraisal_coverage_report: {
        Args: { _period_month?: number; _period_year: number }
        Returns: {
          appraisal_status: string
          department_name: string
          duplicate_attempts: number
          first_name: string
          has_appraisal: boolean
          last_attempt_at: string
          last_name: string
          rank_level: number
          rank_name: string
          staff_id: string
          staff_profile_id: string
          total_score: number
          unit: string
        }[]
      }
      auto_deploy_roster_assignments: {
        Args: { _import_id: string }
        Returns: Json
      }
      auto_match_roster_entries: { Args: { _import_id: string }; Returns: Json }
      biometric_reminder_mark: {
        Args: { _detail?: string; _log_id: string; _ok: boolean }
        Returns: undefined
      }
      biometric_reminder_run: { Args: { _force?: boolean }; Returns: Json }
      biometric_reminder_update_settings: {
        Args: { _patch: Json }
        Returns: {
          batch_size: number
          created_at: string
          enabled: boolean
          grace_body: string
          grace_interval_days: number
          grace_lead_days: number
          grace_subject: string
          id: string
          last_run_at: string | null
          last_run_summary: Json | null
          lease_until: string | null
          notify_email: boolean
          notify_in_app: boolean
          overdue_body: string
          overdue_interval_days: number
          overdue_subject: string
          paused_reason: string | null
          send_hour_utc: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "biometric_reminder_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      block_ip:
        | {
            Args: {
              _duration_minutes?: number
              _fingerprint?: string
              _ip: string
              _notes?: string
              _reason?: string
            }
            Returns: string
          }
        | {
            Args: {
              _duration_minutes?: number
              _fingerprint?: string
              _ip: string
              _mac?: string
              _notes?: string
              _reason?: string
            }
            Returns: string
          }
      can_access_detention: { Args: { _uid: string }; Returns: boolean }
      can_access_report_file: { Args: { _file_path: string }; Returns: boolean }
      can_access_staff_profile: {
        Args: { _profile_id: string; _user_id: string }
        Returns: boolean
      }
      can_approve_fuel_request: { Args: { _user_id: string }; Returns: boolean }
      can_approve_rotation_change: { Args: { _uid: string }; Returns: boolean }
      can_export_hrm: { Args: { _kind: string }; Returns: boolean }
      can_export_interlink_logs: {
        Args: { _user_id: string }
        Returns: boolean
      }
      can_manage_appraisals: { Args: { _uid: string }; Returns: boolean }
      can_manage_command_tier: { Args: { _user_id: string }; Returns: boolean }
      can_manage_fleet: { Args: { _user_id: string }; Returns: boolean }
      can_manage_org_unit: {
        Args: { _org_unit_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_procurement: { Args: { _user_id: string }; Returns: boolean }
      can_manage_sessions: { Args: { _user_id: string }; Returns: boolean }
      can_propose_rotation_change: { Args: { _uid: string }; Returns: boolean }
      can_see_org_unit: {
        Args: { _org_unit_id: string; _user_id: string }
        Returns: boolean
      }
      can_shift_connection_action: {
        Args: { _action: string }
        Returns: boolean
      }
      can_touch_attendance_photo: { Args: { _path: string }; Returns: boolean }
      can_use_recycle_bin: { Args: { _user_id: string }; Returns: boolean }
      can_view_command_alert: {
        Args: { _alert_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_org_unit: {
        Args: { _org_unit_id: string; _user_id: string }
        Returns: boolean
      }
      claim_due_backup_schedules: {
        Args: never
        Returns: {
          frequency: Database["public"]["Enums"]["backup_frequency"]
          id: string
          name: string
          retention_days: number
          tables_included: string[]
        }[]
      }
      clear_failed_login_attempts: {
        Args: { _staff_id: string }
        Returns: undefined
      }
      command_alert_add_note: {
        Args: { _alert_id: string; _note: string }
        Returns: undefined
      }
      command_alert_assign: {
        Args: { _alert_id: string; _assigned_to: string; _note?: string }
        Returns: undefined
      }
      command_alert_create: {
        Args: {
          _assigned_to?: string
          _category?: string
          _detail?: string
          _due_at?: string
          _location?: string
          _org_unit_id?: string
          _severity?: Database["public"]["Enums"]["command_alert_severity"]
          _source_ref?: string
          _title: string
        }
        Returns: string
      }
      command_alert_set_status: {
        Args: {
          _alert_id: string
          _note?: string
          _status: Database["public"]["Enums"]["command_alert_status"]
        }
        Returns: undefined
      }
      command_authority_level: { Args: { _user_id: string }; Returns: number }
      command_capability_report: {
        Args: { _target: string }
        Returns: {
          authority_level: number
          capability: string
          effective: boolean
          expires_at: string
          is_command_tier: boolean
          roles: string[]
          source: string
        }[]
      }
      command_dashboard: { Args: { _days?: number }; Returns: Json }
      command_reach_units: { Args: { _user_id: string }; Returns: string[] }
      compute_interlink_next_run: {
        Args: {
          _day_of_month: number
          _day_of_week: number
          _frequency: string
          _from?: string
          _run_time: string
        }
        Returns: string
      }
      compute_next_backup_run: {
        Args: {
          _frequency: Database["public"]["Enums"]["backup_frequency"]
          _from: string
        }
        Returns: string
      }
      consume_processing_job_credentials: {
        Args: { p_job_id: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      detect_rotation_conflicts: {
        Args: {
          _end_date: string
          _exclude_assignment_id?: string
          _scope_type: Database["public"]["Enums"]["shift_rotation_scope"]
          _scope_value: string
          _start_date: string
        }
        Returns: {
          assignment_id: string
          end_date: string
          schedule_id: string
          schedule_name: string
          start_date: string
        }[]
      }
      detention_find_duplicates: {
        Args: {
          _alias?: string
          _date_of_birth?: string
          _exclude_id?: string
          _first_name: string
          _id_number?: string
          _id_type?: string
          _last_name: string
        }
        Returns: {
          alias: string
          cell_number: string
          date_of_birth: string
          first_name: string
          id: string
          id_number: string
          id_type: string
          intake_at: string
          last_name: string
          match_reason: string
          severity: string
          status: string
        }[]
      }
      detention_norm: { Args: { _t: string }; Returns: string }
      email_queue_dispatch: { Args: never; Returns: undefined }
      empty_recycle_bin: { Args: never; Returns: Json }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_ip_blocks: { Args: never; Returns: number }
      export_medical_inventory_audit: {
        Args: {
          p_action?: string
          p_from?: string
          p_inventory_id?: string
          p_item_search?: string
          p_max_rows?: number
          p_performed_by?: string
          p_to?: string
        }
        Returns: {
          action: string
          delta: number
          id: string
          inventory_id: string
          item_name: string
          note: string
          performed_at: string
          performed_by: string
          quantity_after: number
          quantity_before: number
        }[]
      }
      export_security_audit: {
        Args: { _from: string; _to: string }
        Returns: {
          action: string
          actor_label: string
          category: string
          created_at: string
          details: Json
          id: string
          ip_address: string
          prev_hash: string
          row_hash: string
          seq: number
          severity: string
          subject: string
        }[]
      }
      firewall_block_quarantine: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      firewall_evaluate_file: {
        Args: { _filename: string; _mime: string; _size_bytes: number }
        Returns: Json
      }
      firewall_evaluate_url: { Args: { _url: string }; Returns: Json }
      firewall_record_event: {
        Args: {
          _action: Database["public"]["Enums"]["firewall_action"]
          _details?: Json
          _layer: Database["public"]["Enums"]["firewall_event_layer"]
          _matched_rule_id?: string
          _matched_threat_id?: string
          _subject: string
        }
        Returns: string
      }
      firewall_release_quarantine: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      fleet_activate_district_zones: {
        Args: {
          _district_ids: string[]
          _org_unit_id?: string
          _severity?: string
          _trigger?: string
        }
        Returns: number
      }
      fleet_create_ingest_key: {
        Args: { _label: string; _vehicle_id?: string }
        Returns: {
          api_key: string
          id: string
          label: string
          vehicle_id: string
        }[]
      }
      fleet_dashboard: { Args: { _days?: number }; Returns: Json }
      fleet_deactivate_district_zones: {
        Args: { _delete?: boolean; _district_ids: string[] }
        Returns: number
      }
      fleet_demo_tick: {
        Args: { _event?: string; _vehicle_id?: string }
        Returns: Json
      }
      fleet_distance_m: {
        Args: { _lat1: number; _lat2: number; _lng1: number; _lng2: number }
        Returns: number
      }
      fleet_feed_readiness: {
        Args: never
        Returns: {
          call_sign: string
          device_id: string
          driver_name: string
          feed_state: string
          fuel_readings_24h: number
          geofence_events_7d: number
          has_key: boolean
          last_position_at: string
          org_unit_id: string
          org_unit_name: string
          positions_24h: number
          registration_number: string
          status: string
          vehicle_id: string
        }[]
      }
      fleet_flag_offline_devices: {
        Args: { _minutes?: number }
        Returns: number
      }
      fleet_geofence_contains: {
        Args: {
          _geofence: Database["public"]["Tables"]["fleet_geofences"]["Row"]
          _lat: number
          _lng: number
        }
        Returns: boolean
      }
      fleet_list_ingest_keys: {
        Args: never
        Returns: {
          active: boolean
          call_sign: string
          created_at: string
          id: string
          label: string
          last_used_at: string
          registration_number: string
          vehicle_id: string
        }[]
      }
      fleet_maintenance_status: {
        Args: never
        Returns: {
          call_sign: string
          cost_12m: number
          days_remaining: number
          downtime_12m: number
          due_state: string
          interval_days: number
          interval_km: number
          km_remaining: number
          last_service_date: string
          last_service_odometer_km: number
          next_due_date: string
          next_due_km: number
          odometer_km: number
          org_unit_name: string
          registration_number: string
          service_type: string
          services_12m: number
          vehicle_id: string
        }[]
      }
      fleet_mark_messages_read: {
        Args: { _direction?: string; _vehicle_id: string }
        Returns: number
      }
      fleet_point_in_polygon: {
        Args: { _lat: number; _lng: number; _polygon: Json }
        Returns: boolean
      }
      fleet_polygon_points: {
        Args: { _polygon: Json }
        Returns: {
          lat: number
          lng: number
        }[]
      }
      fleet_raise_panic: {
        Args: {
          _lat?: number
          _lng?: number
          _note?: string
          _vehicle_id: string
        }
        Returns: string
      }
      fleet_send_message: {
        Args: {
          _body: string
          _direction?: string
          _lat?: number
          _lng?: number
          _priority?: string
          _vehicle_id: string
        }
        Returns: string
      }
      fleet_set_alert_status: {
        Args: {
          _alert_id: string
          _notes?: string
          _status: Database["public"]["Enums"]["fleet_alert_status"]
        }
        Returns: undefined
      }
      fleet_set_immobilizer: {
        Args: { _lock: boolean; _reason: string; _vehicle_id: string }
        Returns: string
      }
      fleet_set_ingest_key_active: {
        Args: { _active: boolean; _id: string }
        Returns: undefined
      }
      fleet_summary: { Args: never; Returns: Json }
      fleet_vehicle_usage: {
        Args: { _days?: number }
        Returns: {
          avg_hours_per_patrol: number
          call_sign: string
          km_per_hour: number
          km_per_litre: number
          last_odometer_reading: number
          last_reading_at: string
          litres_per_hour: number
          odometer_km: number
          patrol_count: number
          patrol_distance_km: number
          patrol_fuel_litres: number
          patrol_hours: number
          refuel_cost_ghs: number
          refuel_litres: number
          registration_number: string
          vehicle_id: string
        }[]
      }
      fleet_vehicle_visible: {
        Args: { _user_id: string; _vehicle_id: string }
        Returns: boolean
      }
      fuel_request_create: {
        Args: {
          _branch?: string
          _estimated_cost_ghs?: number
          _fuel_type?: string
          _litres: number
          _odometer_km?: number
          _org_unit_id?: string
          _purpose: string
          _urgency?: string
          _vehicle_id: string
        }
        Returns: string
      }
      fuel_request_set_status: {
        Args: {
          _action: string
          _litres_issued?: number
          _note?: string
          _odometer_km?: number
          _request_id: string
        }
        Returns: string
      }
      generate_asset_tag: { Args: never; Returns: string }
      get_effective_attendance_window: {
        Args: { _shift_id: string }
        Returns: {
          early_checkin_minutes: number
          enforce_window: boolean
          grace_minutes: number
          late_checkout_minutes: number
          source: string
        }[]
      }
      get_email_by_staff_id: { Args: { _staff_id: string }; Returns: string }
      get_gps_points: {
        Args: {
          _from?: string
          _limit?: number
          _sources?: string[]
          _to?: string
        }
        Returns: {
          created_at: string
          id: string
          label: string
          location: string
          reference: string
          source: string
          status: string
        }[]
      }
      get_inventory_alert_webhooks: {
        Args: never
        Returns: {
          record_id: string
          source: string
          webhook_url: string
        }[]
      }
      get_misd_department_id: { Args: never; Returns: string }
      get_password_policy: { Args: never; Returns: Json }
      get_profile_protected_fields: {
        Args: { _user_id: string }
        Returns: {
          account_locked: boolean
          department_id: string
          login_enabled: boolean
          rank_id: string
          shift_group: string
          staff_id: string
          status: string
          unit: string
        }[]
      }
      get_public_app_settings: {
        Args: never
        Returns: {
          accent_color: string
          allow_self_registration: boolean
          auto_logout_minutes: number
          auto_logout_warning_seconds: number
          company_name: string
          dashboard_logo_url: string
          enable_system_health_widget: boolean
          enforce_password_change: boolean
          favicon_url: string
          footer_text: string
          login_logo_url: string
          logo_url: string
          min_password_length: number
          org_name: string
          primary_color: string
          secondary_color: string
          staff_id_mask_rules: Json
          system_label: string
        }[]
      }
      get_public_branding: {
        Args: never
        Returns: {
          accent_color: string
          company_name: string
          contact_address: string
          contact_email: string
          contact_phone: string
          contact_website: string
          dashboard_logo_url: string
          favicon_url: string
          footer_text: string
          header_text: string
          login_background_url: string
          login_logo_url: string
          login_tagline: string
          logo_url: string
          org_name: string
          primary_color: string
          secondary_color: string
          system_description: string
          system_label: string
        }[]
      }
      get_realtime_rls_coverage: {
        Args: never
        Returns: {
          anon_reachable: number
          permissive_select: boolean
          rls_enabled: boolean
          rls_forced: boolean
          select_policies: number
          table_name: string
          total_policies: number
        }[]
      }
      get_recaptcha_config: {
        Args: never
        Returns: {
          enabled: boolean
          min_score: number
          site_key: string
        }[]
      }
      get_security_threat_summary: { Args: never; Returns: Json }
      get_user_department_id: { Args: { _user_id: string }; Returns: string }
      gh_phone_contact_canonical: {
        Args: { _input: string; _label: string }
        Returns: string
      }
      gh_phone_contact_canonical_list: {
        Args: { _input: string; _label: string }
        Returns: string
      }
      gh_phone_is_foreign_dialled: {
        Args: { _input: string }
        Returns: boolean
      }
      gh_phone_is_suspicious: { Args: { _input: string }; Returns: boolean }
      gh_phone_is_valid: { Args: { _input: string }; Returns: boolean }
      gh_phone_network: { Args: { _input: string }; Returns: string }
      gh_phone_normalize: { Args: { _input: string }; Returns: string }
      gh_phone_normalize_list: { Args: { _input: string }; Returns: string }
      gh_phone_validate_one: { Args: { _input: string }; Returns: string }
      has_command_capability: {
        Args: { _capability: string; _user_id: string }
        Returns: boolean
      }
      has_org_access: {
        Args: { _org_unit_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_announcement_file_downloads: {
        Args: { _file_id: string }
        Returns: undefined
      }
      is_command_tier: { Args: { _user_id: string }; Returns: boolean }
      is_ecowas_country: { Args: { _nationality: string }; Returns: boolean }
      is_frontdesk_realtime_topic: {
        Args: { _topic: string }
        Returns: boolean
      }
      is_gps_hub_authorized: { Args: { _user_id: string }; Returns: boolean }
      is_ip_blocked:
        | { Args: { _fingerprint?: string; _ip: string }; Returns: boolean }
        | {
            Args: { _fingerprint?: string; _ip: string; _mac?: string }
            Returns: boolean
          }
      is_ipse_tier: { Args: { _user_id: string }; Returns: boolean }
      is_misd_supervisor: { Args: { _user_id: string }; Returns: boolean }
      is_recyclable_table: { Args: { _table: string }; Returns: boolean }
      is_roster_manager: { Args: { _uid: string }; Returns: boolean }
      is_sensitive_realtime_topic: {
        Args: { _topic: string }
        Returns: boolean
      }
      is_shift_leader_tier: { Args: { _user_id: string }; Returns: boolean }
      is_staff_locked: { Args: { _staff_id: string }; Returns: boolean }
      is_supervisor_for_profile: {
        Args: { _profile_id: string; _user_id: string }
        Returns: boolean
      }
      issue_otp: {
        Args: { _purpose?: string; _ttl_minutes?: number }
        Returns: string
      }
      list_medical_inventory_audit: {
        Args: {
          p_action?: string
          p_from?: string
          p_inventory_id?: string
          p_item_search?: string
          p_page?: number
          p_page_size?: number
          p_performed_by?: string
          p_to?: string
        }
        Returns: {
          action: string
          delta: number
          id: string
          inventory_id: string
          item_name: string
          note: string
          performed_at: string
          performed_by: string
          quantity_after: number
          quantity_before: number
          total_count: number
        }[]
      }
      log_announcement_file_audit: {
        Args: {
          _action: Database["public"]["Enums"]["announcement_file_audit_action"]
          _file_id: string
          _ip?: string
          _metadata?: Json
          _user_agent?: string
        }
        Returns: string
      }
      log_appraisal_duplicate_attempt: {
        Args: {
          _bulk_batch_id?: string
          _bulk_size?: number
          _period_month: number
          _period_year: number
          _staff_profile_id: string
        }
        Returns: undefined
      }
      log_hrm_export: {
        Args: {
          _details?: Json
          _format: string
          _kind: string
          _row_count: number
          _subject: string
          _watermarked: boolean
        }
        Returns: string
      }
      log_office_history_access: {
        Args: { _profile_id: string }
        Returns: boolean
      }
      log_security_event: {
        Args: {
          _action: string
          _category: string
          _details?: Json
          _ip?: string
          _severity?: string
          _subject?: string
          _ua?: string
        }
        Returns: string
      }
      log_sensitive_access: {
        Args: {
          _action: string
          _filters?: Json
          _reason?: string
          _record_count?: number
          _table_name: string
        }
        Returns: undefined
      }
      log_sensitive_read: {
        Args: { _context?: Json; _entity_id: string; _entity_type: string }
        Returns: undefined
      }
      mark_backup_schedule_ran: {
        Args: { _error: string; _schedule_id: string; _status: string }
        Returns: undefined
      }
      me_approval_queue: { Args: { _status?: string }; Returns: Json }
      me_approval_reviewer: { Args: never; Returns: boolean }
      me_can_delete: { Args: never; Returns: boolean }
      me_can_manage: { Args: never; Returns: boolean }
      me_can_verify: { Args: never; Returns: boolean }
      me_can_view: {
        Args: { _classification: string; _org_unit_id: string }
        Returns: boolean
      }
      me_classification_rank: { Args: { _c: string }; Returns: number }
      me_command_attention: { Args: { _region?: string }; Returns: Json }
      me_command_center: {
        Args: { _department_id?: string; _period_id?: string; _region?: string }
        Returns: Json
      }
      me_data_quality: {
        Args: { _scope?: string; _scope_id?: string }
        Returns: Json
      }
      me_decide_approval: {
        Args: { _approval_id: string; _comment: string; _decision: string }
        Returns: Json
      }
      me_geo_summary: {
        Args: { _region?: string }
        Returns: {
          active_projects: number
          avg_complete: number
          field_reports: number
          open_incidents: number
          open_risks: number
          projects: number
          region: string
        }[]
      }
      me_measure_achievement: {
        Args: { _measure_id: string; _period_id?: string }
        Returns: {
          achievement_percent: number
          measure_id: string
          performance_status: string
          period_id: string
          reported_value: number
          target_value: number
          variance: number
          verified_value: number
        }[]
      }
      me_project_health: { Args: { _project_id: string }; Returns: Json }
      me_recalculate_scores: { Args: { _period_id?: string }; Returns: number }
      me_submit_for_approval: {
        Args: {
          _record_id: string
          _record_type: string
          _workflow_key?: string
        }
        Returns: string
      }
      me_user_clearance: { Args: { _user_id: string }; Returns: number }
      mfa_consume_backup_code: { Args: { _code: string }; Returns: boolean }
      mfa_generate_backup_codes: {
        Args: never
        Returns: {
          code: string
        }[]
      }
      mfa_my_trusted_devices: {
        Args: { _include_revoked?: boolean }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          is_active: boolean
          label: string
          last_used_at: string
          revoke_reason: string
          revoked_at: string
          revoked_by_self: boolean
          trusted_hours: number
          user_agent: string
        }[]
      }
      mfa_purge_expired_trusted_devices: {
        Args: { _archive_after_days?: number }
        Returns: Json
      }
      mfa_register_trusted_device: {
        Args: {
          _fingerprint_hash: string
          _hours?: number
          _label?: string
          _user_agent?: string
        }
        Returns: string
      }
      mfa_revoke_all_trusted_devices: {
        Args: { _reason: string; _user_id: string }
        Returns: number
      }
      mfa_revoke_trusted_device: {
        Args: { _device_id: string; _reason: string }
        Returns: boolean
      }
      mfa_revoke_trusted_devices_bulk: {
        Args: { _items: Json }
        Returns: number
      }
      mfa_trusted_device_check: {
        Args: { _fingerprint_hash: string }
        Returns: string
      }
      mfa_trusted_devices_feed: {
        Args: { _include_revoked?: boolean; _limit?: number; _user_id?: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          is_active: boolean
          label: string
          last_used_at: string
          revoke_reason: string
          revoked_at: string
          revoked_by_name: string
          staff_identifier: string
          staff_name: string
          trusted_hours: number
          user_agent: string
          user_id: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_mfa_policy: { Args: never; Returns: Json }
      next_cyber_incident_number: { Args: never; Returns: string }
      normalize_mac: { Args: { _mac: string }; Returns: string }
      notify_admins: {
        Args: {
          _message: string
          _reference_id?: string
          _title: string
          _type?: string
        }
        Returns: number
      }
      notify_roles: {
        Args: {
          _message: string
          _ref: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _title: string
          _type: string
        }
        Returns: undefined
      }
      org_unit_ancestors: { Args: { _node: string }; Returns: string[] }
      org_unit_descendants: { Args: { _root: string }; Returns: string[] }
      override_shift_assignment: {
        Args: {
          _effective_date: string
          _new_shift_code: string
          _profile_id: string
          _reason?: string
        }
        Returns: Json
      }
      patrol_gps_activity: { Args: { _days?: number }; Returns: Json }
      procurement_actor_name: { Args: { _uid: string }; Returns: string }
      procurement_budget_status: {
        Args: { _fiscal_year?: number }
        Returns: {
          budget_amount: number
          committed: number
          currency: string
          fiscal_year: number
          org_unit_code: string
          org_unit_id: string
          org_unit_name: string
          over_budget: boolean
          pending: number
          remaining: number
          request_count: number
          utilisation_pct: number
        }[]
      }
      procurement_inventory: { Args: { _days?: number }; Returns: Json }
      procurement_request_decide: {
        Args: { _approve: boolean; _note?: string; _requisition_id: string }
        Returns: undefined
      }
      procurement_request_receive: {
        Args: { _items?: Json; _note?: string; _requisition_id: string }
        Returns: string
      }
      procurement_request_submit: {
        Args: { _note?: string; _requisition_id: string }
        Returns: undefined
      }
      prune_backup_schedule_history: {
        Args: { _schedule_id: string }
        Returns: number
      }
      prune_stale_sessions: {
        Args: { _older_than_days?: number }
        Returns: number
      }
      prune_system_backup_audit: { Args: never; Returns: Json }
      purge_expired_recycle_bin: { Args: never; Returns: Json }
      purge_old_presence_events: {
        Args: { _retention_days?: number }
        Returns: number
      }
      purge_recycle_bin_entry: { Args: { _bin_id: string }; Returns: Json }
      read_attendance_report_recipients: {
        Args: { _reason?: string }
        Returns: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          period: string
        }[]
        SetofOptions: {
          from: "*"
          to: "attendance_report_recipients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      read_failed_login_attempts: {
        Args: { _limit?: number; _reason?: string }
        Returns: {
          attempted_at: string
          created_at: string
          id: string
          ip_address: string | null
          staff_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "failed_login_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_failed_login:
        | { Args: { _staff_id: string }; Returns: Json }
        | { Args: { _ip_address?: string; _staff_id: string }; Returns: Json }
      record_mfa_challenge: {
        Args: {
          _device_fingerprint?: string
          _factor_id?: string
          _failure_reason?: string
          _ip_address?: string
          _outcome: string
          _staff_id?: string
          _user_agent?: string
        }
        Returns: string
      }
      redact_old_job_passwords: { Args: never; Returns: undefined }
      register_app_build: {
        Args: {
          p_app_version?: string
          p_build_time?: string
          p_fingerprint: string
          p_prefix?: string
        }
        Returns: {
          app_version: string | null
          build_date: string
          build_time: string
          created_at: string
          fingerprint: string
          first_seen_at: string
          id: string
          registered_by: string | null
          seq: number
          updated_at: string
          version_id: string
        }
        SetofOptions: {
          from: "*"
          to: "app_build_releases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_session: {
        Args: {
          _fingerprint?: string
          _ip?: string
          _page?: string
          _session_key: string
          _user_agent?: string
        }
        Returns: string
      }
      restore_recycle_bin_entry: {
        Args: { _bin_id: string }
        Returns: undefined
      }
      restore_staff_bulk_snapshot: {
        Args: { p_snapshot_id: string }
        Returns: Json
      }
      revoke_all_user_sessions: {
        Args: { _keep_session_key?: string; _reason?: string; _user_id: string }
        Returns: number
      }
      revoke_session: {
        Args: { _reason?: string; _session_id: string }
        Returns: boolean
      }
      roster_clock_action:
        | {
            Args: { _action: string; _notes?: string; _profile_id: string }
            Returns: Json
          }
        | {
            Args: {
              _action: string
              _notes?: string
              _photo_path?: string
              _profile_id: string
              _reason?: string
            }
            Returns: Json
          }
      run_security_hygiene_scan: { Args: never; Returns: Json }
      search_approval_audit: {
        Args: {
          _actions?: string[]
          _actor_roles?: string[]
          _cursor_created?: string
          _cursor_id?: string
          _entity_id: string
          _entity_type: string
          _from?: string
          _limit?: number
          _to?: string
        }
        Returns: {
          action: string
          actor_first_name: string
          actor_last_name: string
          actor_rank_abbrev: string
          actor_role: string
          changed_fields: Json
          created_at: string
          id: string
          new_status: string
          notes: string
          previous_status: string
          request_profile_id: string
        }[]
      }
      search_authorising_officers: {
        Args: { _limit?: number; _search?: string }
        Returns: {
          department_name: string
          first_name: string
          id: string
          last_name: string
          rank_abbrev: string
          role: string
        }[]
      }
      security_audit_create_anchor: { Args: never; Returns: string }
      security_event_feed: {
        Args: { _from?: string; _limit?: number; _to?: string }
        Returns: {
          action: string
          actor_name: string
          category: string
          detail: string
          id: string
          ip_address: string
          occurred_at: string
          severity: string
          staff_id: string
          subject_name: string
        }[]
      }
      security_monitor_acknowledge: {
        Args: { _alert_id: string; _note?: string }
        Returns: undefined
      }
      security_monitor_scan: { Args: never; Returns: Json }
      security_monitor_webhook_delete: {
        Args: { _id: string }
        Returns: undefined
      }
      security_monitor_webhook_save: {
        Args: {
          _clear_signing_secret?: boolean
          _enabled: boolean
          _id: string
          _kind: string
          _label: string
          _max_attempts?: number
          _min_severity: string
          _signing_secret?: string
          _throttle_minutes: number
          _url: string
        }
        Returns: string
      }
      security_monitor_webhooks_list: {
        Args: never
        Returns: {
          created_at: string
          dead_deliveries: number
          enabled: boolean
          has_signing_secret: boolean
          id: string
          kind: string
          label: string
          last_error: string
          last_sent_at: string
          last_status: string
          max_attempts: number
          min_severity: string
          pending_deliveries: number
          throttle_minutes: number
          url_preview: string
        }[]
      }
      security_policy_dashboard: { Args: { _hours?: number }; Returns: Json }
      security_webhook_claim_deliveries: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          id: string
          kind: string
          max_attempts: number
          payload: Json
          signing_secret: string
          url: string
          webhook_id: string
        }[]
      }
      security_webhook_deliveries_list: {
        Args: { _limit?: number; _status?: string }
        Returns: {
          alert_count: number
          attempts: number
          created_at: string
          dead_at: string
          delivered_at: string
          id: string
          last_error: string
          last_status: string
          max_attempts: number
          next_attempt_at: string
          status: string
          top_severity: string
          webhook_id: string
          webhook_label: string
        }[]
      }
      security_webhook_delivery_action: {
        Args: { _action: string; _id: string }
        Returns: undefined
      }
      security_webhook_settle_delivery: {
        Args: { _error?: string; _id: string; _ok: boolean; _status: string }
        Returns: string
      }
      send_appraisal_reminders: {
        Args: { _period_month?: number; _period_year: number }
        Returns: {
          sent: number
          skipped: number
        }[]
      }
      session_heartbeat: {
        Args: { _page?: string; _session_key: string }
        Returns: boolean
      }
      set_inventory_alert_webhook: {
        Args: { _record_id: string; _source: string; _webhook_url: string }
        Returns: undefined
      }
      set_record_status: {
        Args: {
          _entity: string
          _id: string
          _reason?: string
          _status: string
        }
        Returns: Json
      }
      should_force_signout: {
        Args: { _fingerprint?: string; _ip: string }
        Returns: boolean
      }
      soft_delete_record: {
        Args: {
          _display_context?: string
          _display_label?: string
          _record_id: string
          _storage_paths?: Json
          _table: string
        }
        Returns: string
      }
      status_workflow_options: { Args: { _entity: string }; Returns: string[] }
      tag_appraisal_audit_batch: {
        Args: {
          _appraisal_id: string
          _bulk_batch_id: string
          _bulk_size: number
        }
        Returns: undefined
      }
      test_profile_office_history_access: {
        Args: never
        Returns: {
          actual_visible: number
          expected_visible: number
          scenario: string
          status: string
        }[]
      }
      top5_staff_of_month: {
        Args: { _month: number; _year: number }
        Returns: {
          appraisal_count: number
          avg_score: number
          staff_name: string
          staff_profile_id: string
        }[]
      }
      top5_staff_of_year: {
        Args: { _year: number }
        Returns: {
          appraisal_count: number
          avg_score: number
          staff_name: string
          staff_profile_id: string
        }[]
      }
      unblock_ip: { Args: { _block_id: string }; Returns: undefined }
      unit_dashboard: { Args: { _org_unit_id: string }; Returns: Json }
      user_department_ids: {
        Args: { _user_id: string }
        Returns: {
          department_id: string
        }[]
      }
      user_org_scope: { Args: { _user_id: string }; Returns: string[] }
      validate_password_policy: { Args: { _password: string }; Returns: Json }
      verify_interlink_approval_chain: {
        Args: never
        Returns: {
          first_break_at: string
          first_break_id: string
          total: number
          verified: number
        }[]
      }
      verify_otp: { Args: { _code: string }; Returns: boolean }
      verify_security_audit_chain: {
        Args: never
        Returns: {
          actual_prev: string
          broken_id: string
          broken_seq: number
          expected_prev: string
        }[]
      }
      verify_threshold_audit_chain: {
        Args: never
        Returns: {
          first_break_at: string
          first_break_id: string
          total: number
          verified: number
        }[]
      }
      webauthn_admin_enrollment_report: {
        Args: never
        Returns: {
          compliance: string
          department: string
          device_count: number
          first_enrolled_at: string
          full_name: string
          last_used_at: string
          required: boolean
          roles: string[]
          staff_id: string
          user_id: string
        }[]
      }
      webauthn_admin_list_credentials: {
        Args: never
        Returns: {
          backed_up: boolean
          created_at: string
          device_label: string
          full_name: string
          id: string
          last_used_at: string
          revoked_at: string
          staff_id: string
          user_id: string
        }[]
      }
      webauthn_admin_reset_user: {
        Args: { _reason: string; _user_id: string }
        Returns: number
      }
      webauthn_admin_set_enrollment_policy: {
        Args: { _grace_days: number; _required: boolean; _roles: string[] }
        Returns: Json
      }
      webauthn_audit_feed: {
        Args: { _events?: string[]; _limit?: number; _since?: string }
        Returns: {
          actor_id: string
          actor_name: string
          created_at: string
          detail: string
          device_label: string
          event: string
          id: string
          staff_identifier: string
          staff_name: string
          user_id: string
        }[]
      }
      webauthn_consume_stepup: {
        Args: { _action: string; _token_hash: string }
        Returns: boolean
      }
      webauthn_list_my_credentials: {
        Args: never
        Returns: {
          backed_up: boolean
          created_at: string
          device_label: string
          id: string
          last_used_at: string
        }[]
      }
      webauthn_log_enrollment_event: {
        Args: { _detail?: string; _device_label?: string; _event: string }
        Returns: undefined
      }
      webauthn_log_event: {
        Args: {
          _credential_id?: string
          _detail?: string
          _device_fingerprint?: string
          _device_label?: string
          _event: string
          _ip_address?: string
          _staff_id?: string
          _user_agent?: string
        }
        Returns: undefined
      }
      webauthn_my_enrollment_status: { Args: never; Returns: Json }
      webauthn_my_status: { Args: never; Returns: Json }
      webauthn_prune_expired: { Args: never; Returns: number }
      webauthn_revoke_credential: {
        Args: { _id: string; _reason?: string }
        Returns: undefined
      }
      webauthn_set_enabled: {
        Args: { _consent?: boolean; _enabled: boolean }
        Returns: boolean
      }
    }
    Enums: {
      announcement_file_audit_action:
        | "upload"
        | "download"
        | "preview"
        | "permission_change"
        | "delete"
      app_role:
        | "admin"
        | "supervisor"
        | "staff"
        | "deputy_supervisor"
        | "deputy_shift_leader"
        | "deputy"
        | "shift_leader"
        | "special_duties"
        | "front_desk"
        | "oic"
        | "2ic"
        | "shift_supervisor"
        | "deputy_shift_supervisor"
        | "official"
        | "enquiry"
        | "storekeeper"
        | "procurement_officer"
        | "staff_officer"
        | "ipse_supervisor"
        | "ipse_deputy_supervisor"
        | "head_of_administration"
        | "chief_staff_officer"
        | "head_of_processing"
        | "deputy_head_of_processing"
        | "medical_officer"
        | "command_officer"
        | "me_officer"
        | "project_manager"
        | "field_officer"
      appraisal_criterion:
        | "job_knowledge"
        | "quality_of_work"
        | "productivity"
        | "discipline_conduct"
        | "leadership_teamwork"
        | "initiative"
        | "punctuality_attendance"
      appraisal_status: "draft" | "submitted" | "acknowledged"
      attendance_status: "present" | "late" | "absent" | "excused"
      backup_frequency:
        | "hourly"
        | "daily"
        | "weekly"
        | "monthly"
        | "quarterly"
        | "annually"
      command_alert_severity: "critical" | "high" | "medium" | "low" | "info"
      command_alert_status:
        | "new"
        | "assigned"
        | "in_progress"
        | "escalated"
        | "closed"
      firewall_action: "allow" | "warn" | "quarantine" | "block"
      firewall_event_layer: "file" | "url" | "auth" | "waf"
      firewall_quarantine_status: "pending" | "released" | "blocked" | "expired"
      firewall_rule_kind:
        | "file_extension"
        | "file_mime"
        | "file_hash"
        | "url_domain"
        | "url_keyword"
        | "url_full"
        | "ip_address"
        | "ip_cidr"
        | "asn"
        | "waf_pattern"
      fleet_alert_severity: "info" | "warning" | "critical"
      fleet_alert_status: "new" | "acknowledged" | "resolved" | "dismissed"
      fleet_alert_type:
        | "panic"
        | "geofence_enter"
        | "geofence_exit"
        | "speeding"
        | "fuel_drop"
        | "fuel_low"
        | "device_offline"
        | "ignition_on"
        | "harsh_driving"
        | "door_open"
        | "boot_open"
      fleet_fuel_event: "reading" | "refuel" | "drain"
      fleet_geofence_kind: "circle" | "polygon"
      fleet_geofence_trigger: "enter" | "exit" | "both"
      fleet_vehicle_status:
        | "active"
        | "maintenance"
        | "grounded"
        | "decommissioned"
      leave_status: "pending" | "approved" | "rejected"
      leave_type: "annual" | "sick" | "compassionate" | "pass" | "study"
      org_unit_type:
        | "national"
        | "regional"
        | "sector"
        | "district"
        | "station"
        | "unit"
      presence_event_type: "heartbeat" | "prune" | "online" | "offline"
      scheduled_delivery_status: "pending" | "sent" | "failed" | "cancelled"
      shift_pattern: "8h" | "12h" | "custom"
      shift_rotation_scope: "org" | "department" | "role" | "staff"
      shift_rotation_status: "draft" | "published" | "archived"
      staff_status: "active" | "inactive" | "study_leave" | "transferred"
      transfer_type: "posting" | "transfer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      announcement_file_audit_action: [
        "upload",
        "download",
        "preview",
        "permission_change",
        "delete",
      ],
      app_role: [
        "admin",
        "supervisor",
        "staff",
        "deputy_supervisor",
        "deputy_shift_leader",
        "deputy",
        "shift_leader",
        "special_duties",
        "front_desk",
        "oic",
        "2ic",
        "shift_supervisor",
        "deputy_shift_supervisor",
        "official",
        "enquiry",
        "storekeeper",
        "procurement_officer",
        "staff_officer",
        "ipse_supervisor",
        "ipse_deputy_supervisor",
        "head_of_administration",
        "chief_staff_officer",
        "head_of_processing",
        "deputy_head_of_processing",
        "medical_officer",
        "command_officer",
        "me_officer",
        "project_manager",
        "field_officer",
      ],
      appraisal_criterion: [
        "job_knowledge",
        "quality_of_work",
        "productivity",
        "discipline_conduct",
        "leadership_teamwork",
        "initiative",
        "punctuality_attendance",
      ],
      appraisal_status: ["draft", "submitted", "acknowledged"],
      attendance_status: ["present", "late", "absent", "excused"],
      backup_frequency: [
        "hourly",
        "daily",
        "weekly",
        "monthly",
        "quarterly",
        "annually",
      ],
      command_alert_severity: ["critical", "high", "medium", "low", "info"],
      command_alert_status: [
        "new",
        "assigned",
        "in_progress",
        "escalated",
        "closed",
      ],
      firewall_action: ["allow", "warn", "quarantine", "block"],
      firewall_event_layer: ["file", "url", "auth", "waf"],
      firewall_quarantine_status: ["pending", "released", "blocked", "expired"],
      firewall_rule_kind: [
        "file_extension",
        "file_mime",
        "file_hash",
        "url_domain",
        "url_keyword",
        "url_full",
        "ip_address",
        "ip_cidr",
        "asn",
        "waf_pattern",
      ],
      fleet_alert_severity: ["info", "warning", "critical"],
      fleet_alert_status: ["new", "acknowledged", "resolved", "dismissed"],
      fleet_alert_type: [
        "panic",
        "geofence_enter",
        "geofence_exit",
        "speeding",
        "fuel_drop",
        "fuel_low",
        "device_offline",
        "ignition_on",
        "harsh_driving",
        "door_open",
        "boot_open",
      ],
      fleet_fuel_event: ["reading", "refuel", "drain"],
      fleet_geofence_kind: ["circle", "polygon"],
      fleet_geofence_trigger: ["enter", "exit", "both"],
      fleet_vehicle_status: [
        "active",
        "maintenance",
        "grounded",
        "decommissioned",
      ],
      leave_status: ["pending", "approved", "rejected"],
      leave_type: ["annual", "sick", "compassionate", "pass", "study"],
      org_unit_type: [
        "national",
        "regional",
        "sector",
        "district",
        "station",
        "unit",
      ],
      presence_event_type: ["heartbeat", "prune", "online", "offline"],
      scheduled_delivery_status: ["pending", "sent", "failed", "cancelled"],
      shift_pattern: ["8h", "12h", "custom"],
      shift_rotation_scope: ["org", "department", "role", "staff"],
      shift_rotation_status: ["draft", "published", "archived"],
      staff_status: ["active", "inactive", "study_leave", "transferred"],
      transfer_type: ["posting", "transfer"],
    },
  },
} as const
