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
        ]
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
            foreignKeyName: "detention_records_officer_in_charge_id_fkey"
            columns: ["officer_in_charge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_records_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      enforcement_operations: {
        Row: {
          arrests_count: number
          contact_details: string | null
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          location: string | null
          notes: string | null
          officer_in_charge: string | null
          operation_date: string
          operation_type: string
          outcome: string | null
          reported_by: string
          severity: string
          status: string
          suspects_count: number
          updated_at: string
        }
        Insert: {
          arrests_count?: number
          contact_details?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          officer_in_charge?: string | null
          operation_date?: string
          operation_type?: string
          outcome?: string | null
          reported_by: string
          severity?: string
          status?: string
          suspects_count?: number
          updated_at?: string
        }
        Update: {
          arrests_count?: number
          contact_details?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          officer_in_charge?: string | null
          operation_date?: string
          operation_type?: string
          outcome?: string | null
          reported_by?: string
          severity?: string
          status?: string
          suspects_count?: number
          updated_at?: string
        }
        Relationships: [
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
        ]
      }
      inventory_items: {
        Row: {
          category_id: string | null
          condition: string | null
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          min_stock: number
          name: string
          notes: string | null
          photo_url: string | null
          qty_on_hand: number
          sku: string | null
          unit: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          min_stock?: number
          name: string
          notes?: string | null
          photo_url?: string | null
          qty_on_hand?: number
          sku?: string | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          condition?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          min_stock?: number
          name?: string
          notes?: string | null
          photo_url?: string | null
          qty_on_hand?: number
          sku?: string | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string
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
          arrests_count: number
          contact_details: string | null
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          location: string | null
          notes: string | null
          officer_in_charge: string | null
          operation_date: string
          operation_type: string
          outcome: string | null
          reported_by: string
          severity: string
          status: string
          suspects_count: number
          updated_at: string
        }
        Insert: {
          arrests_count?: number
          contact_details?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          officer_in_charge?: string | null
          operation_date?: string
          operation_type?: string
          outcome?: string | null
          reported_by: string
          severity?: string
          status?: string
          suspects_count?: number
          updated_at?: string
        }
        Update: {
          arrests_count?: number
          contact_details?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          officer_in_charge?: string | null
          operation_date?: string
          operation_type?: string
          outcome?: string | null
          reported_by?: string
          severity?: string
          status?: string
          suspects_count?: number
          updated_at?: string
        }
        Relationships: [
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
          application_type: string
          created_at: string
          date_of_birth: string
          emergency_contact: string | null
          foreign_address: string | null
          gender: string | null
          id: string
          marital_status: string | null
          nationality: string
          nearest_landmark: string | null
          next_of_kin: string | null
          notes: string | null
          phone: string | null
          processed_by: string | null
          status: string
          street_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          applicant_name: string
          application_type?: string
          created_at?: string
          date_of_birth: string
          emergency_contact?: string | null
          foreign_address?: string | null
          gender?: string | null
          id?: string
          marital_status?: string | null
          nationality: string
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          phone?: string | null
          processed_by?: string | null
          status?: string
          street_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          applicant_name?: string
          application_type?: string
          created_at?: string
          date_of_birth?: string
          emergency_contact?: string | null
          foreign_address?: string | null
          gender?: string | null
          id?: string
          marital_status?: string | null
          nationality?: string
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          phone?: string | null
          processed_by?: string | null
          status?: string
          street_name?: string | null
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
        ]
      }
      profiles: {
        Row: {
          account_locked: boolean
          blood_group: string | null
          created_at: string
          department_id: string | null
          email: string | null
          first_name: string
          gender: string | null
          ghana_card_number: string | null
          id: string
          intake: number | null
          last_name: string
          login_enabled: boolean
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
          department_id?: string | null
          email?: string | null
          first_name: string
          gender?: string | null
          ghana_card_number?: string | null
          id?: string
          intake?: number | null
          last_name: string
          login_enabled?: boolean
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
          department_id?: string | null
          email?: string | null
          first_name?: string
          gender?: string | null
          ghana_card_number?: string | null
          id?: string
          intake?: number | null
          last_name?: string
          login_enabled?: boolean
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
          date_of_birth: string | null
          emergency_contact: string | null
          entry_date: string | null
          exit_date: string | null
          foreign_address: string | null
          gender: string | null
          home_address: string | null
          id: string
          marital_status: string | null
          nationality: string
          nearest_landmark: string | null
          next_of_kin: string | null
          notes: string | null
          passport_number: string
          phone: string | null
          processed_by: string | null
          purpose: string | null
          status: string
          street_name: string | null
          updated_at: string
          visa_type: string
        }
        Insert: {
          applicant_name: string
          created_at?: string
          date_of_birth?: string | null
          emergency_contact?: string | null
          entry_date?: string | null
          exit_date?: string | null
          foreign_address?: string | null
          gender?: string | null
          home_address?: string | null
          id?: string
          marital_status?: string | null
          nationality: string
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          passport_number: string
          phone?: string | null
          processed_by?: string | null
          purpose?: string | null
          status?: string
          street_name?: string | null
          updated_at?: string
          visa_type?: string
        }
        Update: {
          applicant_name?: string
          created_at?: string
          date_of_birth?: string | null
          emergency_contact?: string | null
          entry_date?: string | null
          exit_date?: string | null
          foreign_address?: string | null
          gender?: string | null
          home_address?: string | null
          id?: string
          marital_status?: string | null
          nationality?: string
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          passport_number?: string
          phone?: string | null
          processed_by?: string | null
          purpose?: string | null
          status?: string
          street_name?: string | null
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
          emergency_contact: string | null
          fee_charged: number | null
          foreign_address: string | null
          gender: string | null
          home_address: string | null
          id: string
          marital_status: string | null
          nationality: string | null
          nearest_landmark: string | null
          next_of_kin: string | null
          notes: string | null
          passport_number: string
          permit_type: string | null
          phone: string | null
          processed_by: string | null
          reason: string | null
          requested_extension_date: string
          status: string
          street_name: string | null
          updated_at: string
          visa_application_id: string | null
        }
        Insert: {
          applicant_name: string
          created_at?: string
          current_visa_expiry: string
          date_of_birth?: string | null
          emergency_contact?: string | null
          fee_charged?: number | null
          foreign_address?: string | null
          gender?: string | null
          home_address?: string | null
          id?: string
          marital_status?: string | null
          nationality?: string | null
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          passport_number: string
          permit_type?: string | null
          phone?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_extension_date: string
          status?: string
          street_name?: string | null
          updated_at?: string
          visa_application_id?: string | null
        }
        Update: {
          applicant_name?: string
          created_at?: string
          current_visa_expiry?: string
          date_of_birth?: string | null
          emergency_contact?: string | null
          fee_charged?: number | null
          foreign_address?: string | null
          gender?: string | null
          home_address?: string | null
          id?: string
          marital_status?: string | null
          nationality?: string | null
          nearest_landmark?: string | null
          next_of_kin?: string | null
          notes?: string | null
          passport_number?: string
          permit_type?: string | null
          phone?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_extension_date?: string
          status?: string
          street_name?: string | null
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
    }
    Functions: {
      admin_reset_failed_attempts: {
        Args: { _staff_id: string }
        Returns: undefined
      }
      can_access_report_file: { Args: { _file_path: string }; Returns: boolean }
      can_use_recycle_bin: { Args: { _user_id: string }; Returns: boolean }
      clear_failed_login_attempts: {
        Args: { _staff_id: string }
        Returns: undefined
      }
      empty_recycle_bin: { Args: never; Returns: Json }
      get_email_by_staff_id: { Args: { _staff_id: string }; Returns: string }
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
      is_ipse_tier: { Args: { _user_id: string }; Returns: boolean }
      is_misd_supervisor: { Args: { _user_id: string }; Returns: boolean }
      is_recyclable_table: { Args: { _table: string }; Returns: boolean }
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
      purge_expired_recycle_bin: { Args: never; Returns: Json }
      purge_recycle_bin_entry: { Args: { _bin_id: string }; Returns: Json }
      record_failed_login: { Args: { _staff_id: string }; Returns: Json }
      restore_recycle_bin_entry: {
        Args: { _bin_id: string }
        Returns: undefined
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
        | "official"
        | "enquiry"
        | "storekeeper"
        | "procurement_officer"
        | "staff_officer"
        | "ipse_supervisor"
        | "ipse_deputy_supervisor"
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
        "official",
        "enquiry",
        "storekeeper",
        "procurement_officer",
        "staff_officer",
        "ipse_supervisor",
        "ipse_deputy_supervisor",
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
