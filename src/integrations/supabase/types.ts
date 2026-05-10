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
      app_settings: {
        Row: {
          allow_self_registration: boolean
          auto_logout_minutes: number
          auto_logout_warning_seconds: number
          created_at: string
          enforce_password_change: boolean
          id: string
          mfa_required_roles: string[]
          min_password_length: number
          org_name: string
          system_label: string
          updated_at: string
        }
        Insert: {
          allow_self_registration?: boolean
          auto_logout_minutes?: number
          auto_logout_warning_seconds?: number
          created_at?: string
          enforce_password_change?: boolean
          id?: string
          mfa_required_roles?: string[]
          min_password_length?: number
          org_name?: string
          system_label?: string
          updated_at?: string
        }
        Update: {
          allow_self_registration?: boolean
          auto_logout_minutes?: number
          auto_logout_warning_seconds?: number
          created_at?: string
          enforce_password_change?: boolean
          id?: string
          mfa_required_roles?: string[]
          min_password_length?: number
          org_name?: string
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
          check_out: string | null
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
          check_out?: string | null
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
          check_out?: string | null
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
          incident_number: string
          incident_type: string
          reported_at: string
          reported_by: string
          resolution_notes: string | null
          resolved_at: string | null
          severity: string
          source: string | null
          status: string
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
          incident_number: string
          incident_type?: string
          reported_at?: string
          reported_by: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          source?: string | null
          status?: string
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
          incident_number?: string
          incident_type?: string
          reported_at?: string
          reported_by?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          source?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
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
          release_reason: string | null
          released_at: string | null
          released_by: string | null
          risk_level: string
          status: string
          updated_at: string
        }
        Insert: {
          alias?: string | null
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
          release_reason?: string | null
          released_at?: string | null
          released_by?: string | null
          risk_level?: string
          status?: string
          updated_at?: string
        }
        Update: {
          alias?: string | null
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
          release_reason?: string | null
          released_at?: string | null
          released_by?: string | null
          risk_level?: string
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
        Relationships: []
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
          applicant_name: string
          application_reference: string | null
          course_of_study: string | null
          created_at: string
          current_permit_expiry: string | null
          date_of_birth: string | null
          dual_nationality: string | null
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
        }
        Insert: {
          applicant_name: string
          application_reference?: string | null
          course_of_study?: string | null
          created_at?: string
          current_permit_expiry?: string | null
          date_of_birth?: string | null
          dual_nationality?: string | null
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
        }
        Update: {
          applicant_name?: string
          application_reference?: string | null
          course_of_study?: string | null
          created_at?: string
          current_permit_expiry?: string | null
          date_of_birth?: string | null
          dual_nationality?: string | null
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
      profiles: {
        Row: {
          account_locked: boolean
          blood_group: string | null
          created_at: string
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
          phone: string | null
          photo_url: string | null
          rank_id: string | null
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
          phone?: string | null
          photo_url?: string | null
          rank_id?: string | null
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
          phone?: string | null
          photo_url?: string | null
          rank_id?: string | null
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
          item_name: string
          quantity: number
          requisition_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_unit_cost?: number | null
          id?: string
          item_name: string
          quantity?: number
          requisition_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_unit_cost?: number | null
          id?: string
          item_name?: string
          quantity?: number
          requisition_id?: string
          unit?: string | null
        }
        Relationships: [
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
          pr_number: string
          priority: string
          rejection_reason: string | null
          requested_by: string
          status: string
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
          pr_number: string
          priority?: string
          rejection_reason?: string | null
          requested_by: string
          status?: string
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
          pr_number?: string
          priority?: string
          rejection_reason?: string | null
          requested_by?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
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
          status?: string
          tables_exported?: string[]
          tables_requested?: string[]
          total_rows?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
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
      visa_applications: {
        Row: {
          applicant_name: string
          created_at: string
          date_of_birth: string | null
          dual_nationality: string | null
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
          visa_type: string
        }
        Insert: {
          applicant_name: string
          created_at?: string
          date_of_birth?: string | null
          dual_nationality?: string | null
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
          visa_type?: string
        }
        Update: {
          applicant_name?: string
          created_at?: string
          date_of_birth?: string | null
          dual_nationality?: string | null
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
          visa_type?: string
        }
        Relationships: []
      }
      visa_extensions: {
        Row: {
          applicant_name: string
          created_at: string
          current_visa_expiry: string
          date_of_birth: string | null
          dual_nationality: string | null
          emergency_contact: string | null
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
          applicant_name: string
          created_at?: string
          current_visa_expiry: string
          date_of_birth?: string | null
          dual_nationality?: string | null
          emergency_contact?: string | null
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
          applicant_name?: string
          created_at?: string
          current_visa_expiry?: string
          date_of_birth?: string | null
          dual_nationality?: string | null
          emergency_contact?: string | null
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
      admin_purge_shift_connections: { Args: never; Returns: number }
      admin_quick_search: { Args: { _q: string }; Returns: Json }
      admin_reset_failed_attempts: {
        Args: { _staff_id: string }
        Returns: undefined
      }
      admin_unlock_account: {
        Args: { _profile_id: string; _reason: string }
        Returns: Json
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
      block_ip: {
        Args: {
          _duration_minutes?: number
          _fingerprint?: string
          _ip: string
          _notes?: string
          _reason?: string
        }
        Returns: string
      }
      can_access_report_file: { Args: { _file_path: string }; Returns: boolean }
      can_approve_rotation_change: { Args: { _uid: string }; Returns: boolean }
      can_export_hrm: { Args: { _kind: string }; Returns: boolean }
      can_export_interlink_logs: {
        Args: { _user_id: string }
        Returns: boolean
      }
      can_manage_appraisals: { Args: { _uid: string }; Returns: boolean }
      can_propose_rotation_change: { Args: { _uid: string }; Returns: boolean }
      can_shift_connection_action: {
        Args: { _action: string }
        Returns: boolean
      }
      can_use_recycle_bin: { Args: { _user_id: string }; Returns: boolean }
      clear_failed_login_attempts: {
        Args: { _staff_id: string }
        Returns: undefined
      }
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
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
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
      get_misd_department_id: { Args: never; Returns: string }
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
      get_security_threat_summary: { Args: never; Returns: Json }
      get_user_department_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_command_tier: { Args: { _user_id: string }; Returns: boolean }
      is_frontdesk_realtime_topic: {
        Args: { _topic: string }
        Returns: boolean
      }
      is_gps_hub_authorized: { Args: { _user_id: string }; Returns: boolean }
      is_ip_blocked: {
        Args: { _fingerprint?: string; _ip: string }
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
      mfa_consume_backup_code: { Args: { _code: string }; Returns: boolean }
      mfa_generate_backup_codes: {
        Args: never
        Returns: {
          code: string
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
      restore_recycle_bin_entry: {
        Args: { _bin_id: string }
        Returns: undefined
      }
      restore_staff_bulk_snapshot: {
        Args: { p_snapshot_id: string }
        Returns: Json
      }
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
      send_appraisal_reminders: {
        Args: { _period_month?: number; _period_year: number }
        Returns: {
          sent: number
          skipped: number
        }[]
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
      user_department_ids: {
        Args: { _user_id: string }
        Returns: {
          department_id: string
        }[]
      }
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
    }
    Enums: {
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
      leave_status: "pending" | "approved" | "rejected"
      leave_type: "annual" | "sick" | "compassionate" | "pass" | "study"
      presence_event_type: "heartbeat" | "prune"
      shift_pattern: "8h" | "12h" | "custom"
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
      leave_status: ["pending", "approved", "rejected"],
      leave_type: ["annual", "sick", "compassionate", "pass", "study"],
      presence_event_type: ["heartbeat", "prune"],
      shift_pattern: ["8h", "12h", "custom"],
      staff_status: ["active", "inactive", "study_leave", "transferred"],
      transfer_type: ["posting", "transfer"],
    },
  },
} as const
