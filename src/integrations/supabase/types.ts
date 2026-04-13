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
          created_at: string
          enforce_password_change: boolean
          id: string
          min_password_length: number
          org_name: string
          system_label: string
          updated_at: string
        }
        Insert: {
          allow_self_registration?: boolean
          auto_logout_minutes?: number
          created_at?: string
          enforce_password_change?: boolean
          id?: string
          min_password_length?: number
          org_name?: string
          system_label?: string
          updated_at?: string
        }
        Update: {
          allow_self_registration?: boolean
          auto_logout_minutes?: number
          created_at?: string
          enforce_password_change?: boolean
          id?: string
          min_password_length?: number
          org_name?: string
          system_label?: string
          updated_at?: string
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
        ]
      }
      certifications: {
        Row: {
          certificate_number: string | null
          certification_name: string
          created_at: string
          date_obtained: string | null
          expiry_date: string | null
          id: string
          issuing_body: string | null
          notes: string | null
          profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          certificate_number?: string | null
          certification_name: string
          created_at?: string
          date_obtained?: string | null
          expiry_date?: string | null
          id?: string
          issuing_body?: string | null
          notes?: string | null
          profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          certificate_number?: string | null
          certification_name?: string
          created_at?: string
          date_obtained?: string | null
          expiry_date?: string | null
          id?: string
          issuing_body?: string | null
          notes?: string | null
          profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
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
      leave_requests: {
        Row: {
          approved_by: string | null
          comments: string | null
          created_at: string
          end_date: string
          id: string
          profile_id: string
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          type: Database["public"]["Enums"]["leave_type"]
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          comments?: string | null
          created_at?: string
          end_date: string
          id?: string
          profile_id: string
          reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          type: Database["public"]["Enums"]["leave_type"]
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          comments?: string | null
          created_at?: string
          end_date?: string
          id?: string
          profile_id?: string
          reason?: string | null
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
            foreignKeyName: "leave_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          application_type: string
          created_at: string
          date_of_birth: string
          gender: string | null
          id: string
          nationality: string
          notes: string | null
          phone: string | null
          processed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          applicant_name: string
          application_type?: string
          created_at?: string
          date_of_birth: string
          gender?: string | null
          id?: string
          nationality: string
          notes?: string | null
          phone?: string | null
          processed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          applicant_name?: string
          application_type?: string
          created_at?: string
          date_of_birth?: string
          gender?: string | null
          id?: string
          nationality?: string
          notes?: string | null
          phone?: string | null
          processed_by?: string | null
          status?: string
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
        ]
      }
      postings_transfers: {
        Row: {
          approved_by: string | null
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
            foreignKeyName: "postings_transfers_to_department_id_fkey"
            columns: ["to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
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
      profiles: {
        Row: {
          account_locked: boolean
          created_at: string
          department_id: string | null
          first_name: string
          gender: string | null
          id: string
          last_name: string
          login_enabled: boolean
          phone: string | null
          photo_url: string | null
          rank_id: string | null
          shift_group: string | null
          staff_id: string
          status: Database["public"]["Enums"]["staff_status"]
          unit: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_locked?: boolean
          created_at?: string
          department_id?: string | null
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          login_enabled?: boolean
          phone?: string | null
          photo_url?: string | null
          rank_id?: string | null
          shift_group?: string | null
          staff_id: string
          status?: Database["public"]["Enums"]["staff_status"]
          unit?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_locked?: boolean
          created_at?: string
          department_id?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          login_enabled?: boolean
          phone?: string | null
          photo_url?: string | null
          rank_id?: string | null
          shift_group?: string | null
          staff_id?: string
          status?: Database["public"]["Enums"]["staff_status"]
          unit?: string | null
          updated_at?: string
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
          {
            foreignKeyName: "profiles_rank_id_fkey"
            columns: ["rank_id"]
            isOneToOne: false
            referencedRelation: "ranks"
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
          category: string
          created_at: string
          department_id: string | null
          description: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          report_date: string
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          category?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          report_date?: string
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          category?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          report_date?: string
          title?: string
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
            foreignKeyName: "shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
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
      staff_documents: {
        Row: {
          created_at: string
          document_number: string | null
          document_type: string
          expiry_date: string | null
          id: string
          issue_date: string | null
          issuing_authority: string | null
          notes: string | null
          profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_number?: string | null
          document_type: string
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          issuing_authority?: string | null
          notes?: string | null
          profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_number?: string | null
          document_type?: string
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          issuing_authority?: string | null
          notes?: string | null
          profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_documents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          entry_date: string | null
          exit_date: string | null
          id: string
          nationality: string
          notes: string | null
          passport_number: string
          processed_by: string | null
          purpose: string | null
          status: string
          updated_at: string
          visa_type: string
        }
        Insert: {
          applicant_name: string
          created_at?: string
          entry_date?: string | null
          exit_date?: string | null
          id?: string
          nationality: string
          notes?: string | null
          passport_number: string
          processed_by?: string | null
          purpose?: string | null
          status?: string
          updated_at?: string
          visa_type?: string
        }
        Update: {
          applicant_name?: string
          created_at?: string
          entry_date?: string | null
          exit_date?: string | null
          id?: string
          nationality?: string
          notes?: string | null
          passport_number?: string
          processed_by?: string | null
          purpose?: string | null
          status?: string
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
          id: string
          notes: string | null
          passport_number: string
          processed_by: string | null
          reason: string | null
          requested_extension_date: string
          status: string
          updated_at: string
          visa_application_id: string | null
        }
        Insert: {
          applicant_name: string
          created_at?: string
          current_visa_expiry: string
          id?: string
          notes?: string | null
          passport_number: string
          processed_by?: string | null
          reason?: string | null
          requested_extension_date: string
          status?: string
          updated_at?: string
          visa_application_id?: string | null
        }
        Update: {
          applicant_name?: string
          created_at?: string
          current_visa_expiry?: string
          id?: string
          notes?: string | null
          passport_number?: string
          processed_by?: string | null
          reason?: string | null
          requested_extension_date?: string
          status?: string
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
      [_ in never]: never
    }
    Functions: {
      can_access_report_file: { Args: { _file_path: string }; Returns: boolean }
      get_email_by_staff_id: { Args: { _staff_id: string }; Returns: string }
      get_user_department_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_supervisor_for_profile: {
        Args: { _profile_id: string; _user_id: string }
        Returns: boolean
      }
      verify_otp: { Args: { _code: string }; Returns: boolean }
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
      attendance_status: "present" | "late" | "absent" | "excused"
      leave_status: "pending" | "approved" | "rejected"
      leave_type: "annual" | "sick" | "compassionate" | "pass" | "study"
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
      ],
      attendance_status: ["present", "late", "absent", "excused"],
      leave_status: ["pending", "approved", "rejected"],
      leave_type: ["annual", "sick", "compassionate", "pass", "study"],
      shift_pattern: ["8h", "12h", "custom"],
      staff_status: ["active", "inactive", "study_leave", "transferred"],
      transfer_type: ["posting", "transfer"],
    },
  },
} as const
