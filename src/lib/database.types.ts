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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_jobs: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          input: Json
          kind: Database["public"]["Enums"]["ai_job_kind"]
          result: Json | null
          status: Database["public"]["Enums"]["ai_job_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json
          kind: Database["public"]["Enums"]["ai_job_kind"]
          result?: Json | null
          status?: Database["public"]["Enums"]["ai_job_status"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json
          kind?: Database["public"]["Enums"]["ai_job_kind"]
          result?: Json | null
          status?: Database["public"]["Enums"]["ai_job_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      application_events: {
        Row: {
          application_id: string
          created_at: string
          from_stage: Database["public"]["Enums"]["app_stage"] | null
          id: string
          kind: string | null
          note: string | null
          occurred_at: string | null
          to_stage: Database["public"]["Enums"]["app_stage"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["app_stage"] | null
          id?: string
          kind?: string | null
          note?: string | null
          occurred_at?: string | null
          to_stage?: Database["public"]["Enums"]["app_stage"] | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["app_stage"] | null
          id?: string
          kind?: string | null
          note?: string | null
          occurred_at?: string | null
          to_stage?: Database["public"]["Enums"]["app_stage"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string | null
          channel: Database["public"]["Enums"]["app_channel"] | null
          company_name: string | null
          created_at: string
          id: string
          last_activity_at: string | null
          outcome: Database["public"]["Enums"]["app_outcome"] | null
          posting_id: string | null
          referral_contact_id: string | null
          source: string | null
          stage: Database["public"]["Enums"]["app_stage"] | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          channel?: Database["public"]["Enums"]["app_channel"] | null
          company_name?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string | null
          outcome?: Database["public"]["Enums"]["app_outcome"] | null
          posting_id?: string | null
          referral_contact_id?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["app_stage"] | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          applied_at?: string | null
          channel?: Database["public"]["Enums"]["app_channel"] | null
          company_name?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string | null
          outcome?: Database["public"]["Enums"]["app_outcome"] | null
          posting_id?: string | null
          referral_contact_id?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["app_stage"] | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_posting_id_fkey"
            columns: ["posting_id"]
            isOneToOne: false
            referencedRelation: "postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_referral_contact_id_fkey"
            columns: ["referral_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      bars: {
        Row: {
          company: string | null
          created_at: string
          id: string
          pay_cents: number | null
          pay_period: string | null
          role: string | null
          rules: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          id?: string
          pay_cents?: number | null
          pay_period?: string | null
          role?: string | null
          rules?: Json | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          id?: string
          pay_cents?: number | null
          pay_period?: string | null
          role?: string | null
          rules?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          aliases: string[]
          ats: Database["public"]["Enums"]["ats_kind"]
          ats_meta: Json
          ats_token: string | null
          careers_url: string | null
          coverage: Database["public"]["Enums"]["coverage_status"]
          coverage_reason: string | null
          created_at: string
          id: string
          industry: string | null
          is_fortune500: boolean
          name: string
          normalized_name: string
          regions: string[]
          resolved_at: string | null
          updated_at: string
          watchers: number
        }
        Insert: {
          aliases?: string[]
          ats?: Database["public"]["Enums"]["ats_kind"]
          ats_meta?: Json
          ats_token?: string | null
          careers_url?: string | null
          coverage?: Database["public"]["Enums"]["coverage_status"]
          coverage_reason?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          is_fortune500?: boolean
          name: string
          normalized_name: string
          regions?: string[]
          resolved_at?: string | null
          updated_at?: string
          watchers?: number
        }
        Update: {
          aliases?: string[]
          ats?: Database["public"]["Enums"]["ats_kind"]
          ats_meta?: Json
          ats_token?: string | null
          careers_url?: string | null
          coverage?: Database["public"]["Enums"]["coverage_status"]
          coverage_reason?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          is_fortune500?: boolean
          name?: string
          normalized_name?: string
          regions?: string[]
          resolved_at?: string | null
          updated_at?: string
          watchers?: number
        }
        Relationships: []
      }
      contacts: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          id: string
          is_referral: boolean | null
          linkedin_url: string | null
          name: string | null
          notes: string | null
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_referral?: boolean | null
          linkedin_url?: string | null
          name?: string | null
          notes?: string | null
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_referral?: boolean | null
          linkedin_url?: string | null
          name?: string | null
          notes?: string | null
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_items: {
        Row: {
          bullets: Json | null
          created_at: string
          end_date: string | null
          id: string
          kind: Database["public"]["Enums"]["experience_kind"] | null
          org: string | null
          start_date: string | null
          tags: string[] | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bullets?: Json | null
          created_at?: string
          end_date?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["experience_kind"] | null
          org?: string | null
          start_date?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          bullets?: Json | null
          created_at?: string
          end_date?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["experience_kind"] | null
          org?: string | null
          start_date?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      field_categories: {
        Row: {
          name: string
          slug: string
          sort: number
          source: string
        }
        Insert: {
          name: string
          slug: string
          sort: number
          source?: string
        }
        Update: {
          name?: string
          slug?: string
          sort?: number
          source?: string
        }
        Relationships: []
      }
      finder_run_items: {
        Row: {
          company_id: string | null
          error: string | null
          fetched: number
          found: number
          gone: number
          id: string
          new: number
          run_id: string
          scope: string
          seen: number
          source: string
          status: Database["public"]["Enums"]["run_item_status"]
        }
        Insert: {
          company_id?: string | null
          error?: string | null
          fetched?: number
          found?: number
          gone?: number
          id?: string
          new?: number
          run_id: string
          scope: string
          seen?: number
          source: string
          status?: Database["public"]["Enums"]["run_item_status"]
        }
        Update: {
          company_id?: string | null
          error?: string | null
          fetched?: number
          found?: number
          gone?: number
          id?: string
          new?: number
          run_id?: string
          scope?: string
          seen?: number
          source?: string
          status?: Database["public"]["Enums"]["run_item_status"]
        }
        Relationships: [
          {
            foreignKeyName: "finder_run_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finder_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "finder_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      finder_runs: {
        Row: {
          finished_at: string | null
          id: string
          started_at: string
          status: string
          totals: Json
          trigger: string | null
        }
        Insert: {
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          totals?: Json
          trigger?: string | null
        }
        Update: {
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          totals?: Json
          trigger?: string | null
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted_at: string | null
          email: string
          invited_at: string
          note: string | null
        }
        Insert: {
          accepted_at?: string | null
          email: string
          invited_at?: string
          note?: string | null
        }
        Update: {
          accepted_at?: string | null
          email?: string
          invited_at?: string
          note?: string | null
        }
        Relationships: []
      }
      majors: {
        Row: {
          cip_code: string
          family: string
          title: string
        }
        Insert: {
          cip_code: string
          family: string
          title: string
        }
        Update: {
          cip_code?: string
          family?: string
          title?: string
        }
        Relationships: []
      }
      posting_matches: {
        Row: {
          ai_score: number | null
          bar_verdict: Database["public"]["Enums"]["bar_verdict"]
          base_score: number | null
          confirm_pay: boolean
          created_at: string
          filter_reasons: string[]
          id: string
          passed_filter: boolean
          posting_id: string
          reasons: Json
          state: Database["public"]["Enums"]["match_state"]
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_score?: number | null
          bar_verdict?: Database["public"]["Enums"]["bar_verdict"]
          base_score?: number | null
          confirm_pay?: boolean
          created_at?: string
          filter_reasons?: string[]
          id?: string
          passed_filter?: boolean
          posting_id: string
          reasons?: Json
          state?: Database["public"]["Enums"]["match_state"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          ai_score?: number | null
          bar_verdict?: Database["public"]["Enums"]["bar_verdict"]
          base_score?: number | null
          confirm_pay?: boolean
          created_at?: string
          filter_reasons?: string[]
          id?: string
          passed_filter?: boolean
          posting_id?: string
          reasons?: Json
          state?: Database["public"]["Enums"]["match_state"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posting_matches_posting_id_fkey"
            columns: ["posting_id"]
            isOneToOne: false
            referencedRelation: "postings"
            referencedColumns: ["id"]
          },
        ]
      }
      posting_sources: {
        Row: {
          external_id: string
          first_seen: string
          gone_at: string | null
          id: string
          last_seen: string
          posting_id: string
          scope: string
          source: string
          source_url: string | null
        }
        Insert: {
          external_id: string
          first_seen?: string
          gone_at?: string | null
          id?: string
          last_seen?: string
          posting_id: string
          scope: string
          source: string
          source_url?: string | null
        }
        Update: {
          external_id?: string
          first_seen?: string
          gone_at?: string | null
          id?: string
          last_seen?: string
          posting_id?: string
          scope?: string
          source?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posting_sources_posting_id_fkey"
            columns: ["posting_id"]
            isOneToOne: false
            referencedRelation: "postings"
            referencedColumns: ["id"]
          },
        ]
      }
      postings: {
        Row: {
          apply_url: string | null
          company_id: string | null
          company_name: string
          countries: string[]
          created_at: string
          dedupe_key: string
          field_slugs: string[]
          first_seen: string
          id: string
          last_seen: string
          level: Database["public"]["Enums"]["job_level"]
          location_unknown: boolean
          locations: string[]
          pay_max_cents: number | null
          pay_min_cents: number | null
          pay_period: Database["public"]["Enums"]["pay_period"] | null
          posted_date: string | null
          remote: Database["public"]["Enums"]["remote_kind"]
          season: string | null
          snippet: string | null
          states: string[]
          status: Database["public"]["Enums"]["posting_status"]
          terms: string[]
          title: string
          updated_at: string
        }
        Insert: {
          apply_url?: string | null
          company_id?: string | null
          company_name: string
          countries?: string[]
          created_at?: string
          dedupe_key: string
          field_slugs?: string[]
          first_seen?: string
          id?: string
          last_seen?: string
          level?: Database["public"]["Enums"]["job_level"]
          location_unknown?: boolean
          locations?: string[]
          pay_max_cents?: number | null
          pay_min_cents?: number | null
          pay_period?: Database["public"]["Enums"]["pay_period"] | null
          posted_date?: string | null
          remote?: Database["public"]["Enums"]["remote_kind"]
          season?: string | null
          snippet?: string | null
          states?: string[]
          status?: Database["public"]["Enums"]["posting_status"]
          terms?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          apply_url?: string | null
          company_id?: string | null
          company_name?: string
          countries?: string[]
          created_at?: string
          dedupe_key?: string
          field_slugs?: string[]
          first_seen?: string
          id?: string
          last_seen?: string
          level?: Database["public"]["Enums"]["job_level"]
          location_unknown?: boolean
          locations?: string[]
          pay_max_cents?: number | null
          pay_min_cents?: number | null
          pay_period?: Database["public"]["Enums"]["pay_period"] | null
          posted_date?: string | null
          remote?: Database["public"]["Enums"]["remote_kind"]
          season?: string | null
          snippet?: string | null
          states?: string[]
          status?: Database["public"]["Enums"]["posting_status"]
          terms?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "postings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_fields: {
        Row: {
          category_slug: string | null
          created_at: string
          id: string
          label: string
          updated_at: string
          user_id: string
          weight: Database["public"]["Enums"]["field_weight"]
        }
        Insert: {
          category_slug?: string | null
          created_at?: string
          id?: string
          label: string
          updated_at?: string
          user_id?: string
          weight: Database["public"]["Enums"]["field_weight"]
        }
        Update: {
          category_slug?: string | null
          created_at?: string
          id?: string
          label?: string
          updated_at?: string
          user_id?: string
          weight?: Database["public"]["Enums"]["field_weight"]
        }
        Relationships: [
          {
            foreignKeyName: "profile_fields_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "field_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      profile_industries: {
        Row: {
          created_at: string
          id: string
          industry: string
          preference: Database["public"]["Enums"]["industry_pref"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          industry: string
          preference: Database["public"]["Enums"]["industry_pref"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          industry?: string
          preference?: Database["public"]["Enums"]["industry_pref"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_mode: Database["public"]["Enums"]["ai_mode"] | null
          alert_style: string | null
          career_stage: Database["public"]["Enums"]["career_stage"] | null
          created_at: string
          grad_date: string | null
          home_location: string | null
          home_state: string | null
          in_state_school: boolean | null
          major: string | null
          major_cip: string | null
          onboarding_step: number
          pay_floor_cents: number | null
          pay_floor_period: Database["public"]["Enums"]["pay_period"] | null
          school: string | null
          school_id: string | null
          school_location: string | null
          school_state: string | null
          season: string | null
          updated_at: string
          user_id: string
          work_anywhere_us: boolean
          work_auth: string | null
          work_countries: string[]
          work_states: string[]
          work_style: string | null
        }
        Insert: {
          ai_mode?: Database["public"]["Enums"]["ai_mode"] | null
          alert_style?: string | null
          career_stage?: Database["public"]["Enums"]["career_stage"] | null
          created_at?: string
          grad_date?: string | null
          home_location?: string | null
          home_state?: string | null
          in_state_school?: boolean | null
          major?: string | null
          major_cip?: string | null
          onboarding_step?: number
          pay_floor_cents?: number | null
          pay_floor_period?: Database["public"]["Enums"]["pay_period"] | null
          school?: string | null
          school_id?: string | null
          school_location?: string | null
          school_state?: string | null
          season?: string | null
          updated_at?: string
          user_id?: string
          work_anywhere_us?: boolean
          work_auth?: string | null
          work_countries?: string[]
          work_states?: string[]
          work_style?: string | null
        }
        Update: {
          ai_mode?: Database["public"]["Enums"]["ai_mode"] | null
          alert_style?: string | null
          career_stage?: Database["public"]["Enums"]["career_stage"] | null
          created_at?: string
          grad_date?: string | null
          home_location?: string | null
          home_state?: string | null
          in_state_school?: boolean | null
          major?: string | null
          major_cip?: string | null
          onboarding_step?: number
          pay_floor_cents?: number | null
          pay_floor_period?: Database["public"]["Enums"]["pay_period"] | null
          school?: string | null
          school_id?: string | null
          school_location?: string | null
          school_state?: string | null
          season?: string | null
          updated_at?: string
          user_id?: string
          work_anywhere_us?: boolean
          work_auth?: string | null
          work_countries?: string[]
          work_states?: string[]
          work_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_major_cip_fkey"
            columns: ["major_cip"]
            isOneToOne: false
            referencedRelation: "majors"
            referencedColumns: ["cip_code"]
          },
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_rules: {
        Row: {
          created_at: string
          id: string
          rules: Json
          updated_at: string
          user_id: string | null
          version: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          rules: Json
          updated_at?: string
          user_id?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          rules?: Json
          updated_at?: string
          user_id?: string | null
          version?: number | null
        }
        Relationships: []
      }
      resumes: {
        Row: {
          created_at: string
          extraction_ok: boolean | null
          extraction_report: Json | null
          id: string
          kind: Database["public"]["Enums"]["resume_kind"] | null
          posting_id: string | null
          storage_path: string | null
          suggestions: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extraction_ok?: boolean | null
          extraction_report?: Json | null
          id?: string
          kind?: Database["public"]["Enums"]["resume_kind"] | null
          posting_id?: string | null
          storage_path?: string | null
          suggestions?: Json | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          extraction_ok?: boolean | null
          extraction_report?: Json | null
          id?: string
          kind?: Database["public"]["Enums"]["resume_kind"] | null
          posting_id?: string | null
          storage_path?: string | null
          suggestions?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      school_companies: {
        Row: {
          company_id: string
          id: string
          relation: string | null
          school_id: string
          source: string | null
        }
        Insert: {
          company_id: string
          id?: string
          relation?: string | null
          school_id: string
          source?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          relation?: string | null
          school_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_companies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          alias: string | null
          city: string | null
          id: string
          name: string
          search_text: string | null
          state: string | null
          unitid: number | null
        }
        Insert: {
          alias?: string | null
          city?: string | null
          id?: string
          name: string
          search_text?: string | null
          state?: string | null
          unitid?: number | null
        }
        Update: {
          alias?: string | null
          city?: string | null
          id?: string
          name?: string
          search_text?: string | null
          state?: string | null
          unitid?: number | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          created_at: string
          due_at: string | null
          id: string
          kind: Database["public"]["Enums"]["task_kind"] | null
          ref_id: string | null
          ref_table: string | null
          snoozed_until: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["task_kind"] | null
          ref_id?: string | null
          ref_table?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          due_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["task_kind"] | null
          ref_id?: string | null
          ref_table?: string | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_companies: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          relation: Database["public"]["Enums"]["company_relation"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          relation?: Database["public"]["Enums"]["company_relation"] | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          relation?: Database["public"]["Enums"]["company_relation"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      count_users_without_profile: { Args: never; Returns: number }
      finish_finder_run: { Args: { p_run: string }; Returns: Json }
      hook_require_invite: { Args: { event: Json }; Returns: Json }
      prune_finder_data: { Args: { p_key_prefix?: string }; Returns: Json }
      search_majors: {
        Args: { lim?: number; q: string }
        Returns: {
          cip_code: string
          family: string
          title: string
        }[]
        SetofOptions: {
          from: "*"
          to: "majors"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_schools: {
        Args: { lim?: number; q: string }
        Returns: {
          alias: string | null
          city: string | null
          id: string
          name: string
          search_text: string | null
          state: string | null
          unitid: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "schools"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      us_state_from_location: { Args: { t: string }; Returns: string }
    }
    Enums: {
      ai_job_kind:
        | "score_fit"
        | "tailor_resume"
        | "draft_outreach"
        | "parse_resume"
      ai_job_status: "queued" | "claimed" | "done" | "failed"
      ai_mode: "off" | "queue" | "api"
      app_channel: "cold" | "referral"
      app_outcome:
        | "rejected"
        | "withdrawn"
        | "no_response"
        | "declined"
        | "accepted"
      app_stage:
        | "saved"
        | "applied"
        | "screened"
        | "interviewed"
        | "final"
        | "offer"
        | "closed"
      ats_kind:
        | "greenhouse"
        | "lever"
        | "ashby"
        | "smartrecruiters"
        | "recruitee"
        | "rippling"
        | "personio"
        | "workable"
        | "workday"
        | "other"
        | "unknown"
      bar_verdict: "beats" | "does_not_beat" | "no_bar"
      career_stage: "intern" | "new_grad" | "experienced" | "career_switcher"
      company_relation: "dream" | "target" | "capped" | "rejected"
      coverage_status: "covered" | "not_covered" | "unknown"
      experience_kind:
        | "role"
        | "project"
        | "education"
        | "skill"
        | "tool"
        | "metric"
        | "never_claim"
      field_weight: "primary" | "secondary"
      industry_pref: "prefer" | "avoid"
      job_level: "internship" | "new_grad" | "experienced" | "unknown"
      match_state: "new" | "saved" | "hidden" | "applied"
      pay_period: "hour" | "year"
      posting_status: "new" | "seen" | "gone"
      remote_kind: "onsite" | "hybrid" | "remote" | "unknown"
      resume_kind: "uploaded" | "generated"
      run_item_status: "ok" | "failed" | "skipped"
      task_kind:
        | "assessment"
        | "interview"
        | "follow_up"
        | "outreach"
        | "closing_soon"
        | "onboarding"
        | "other"
      task_status: "open" | "done" | "snoozed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_job_kind: [
        "score_fit",
        "tailor_resume",
        "draft_outreach",
        "parse_resume",
      ],
      ai_job_status: ["queued", "claimed", "done", "failed"],
      ai_mode: ["off", "queue", "api"],
      app_channel: ["cold", "referral"],
      app_outcome: [
        "rejected",
        "withdrawn",
        "no_response",
        "declined",
        "accepted",
      ],
      app_stage: [
        "saved",
        "applied",
        "screened",
        "interviewed",
        "final",
        "offer",
        "closed",
      ],
      ats_kind: [
        "greenhouse",
        "lever",
        "ashby",
        "smartrecruiters",
        "recruitee",
        "rippling",
        "personio",
        "workable",
        "workday",
        "other",
        "unknown",
      ],
      bar_verdict: ["beats", "does_not_beat", "no_bar"],
      career_stage: ["intern", "new_grad", "experienced", "career_switcher"],
      company_relation: ["dream", "target", "capped", "rejected"],
      coverage_status: ["covered", "not_covered", "unknown"],
      experience_kind: [
        "role",
        "project",
        "education",
        "skill",
        "tool",
        "metric",
        "never_claim",
      ],
      field_weight: ["primary", "secondary"],
      industry_pref: ["prefer", "avoid"],
      job_level: ["internship", "new_grad", "experienced", "unknown"],
      match_state: ["new", "saved", "hidden", "applied"],
      pay_period: ["hour", "year"],
      posting_status: ["new", "seen", "gone"],
      remote_kind: ["onsite", "hybrid", "remote", "unknown"],
      resume_kind: ["uploaded", "generated"],
      run_item_status: ["ok", "failed", "skipped"],
      task_kind: [
        "assessment",
        "interview",
        "follow_up",
        "outreach",
        "closing_soon",
        "onboarding",
        "other",
      ],
      task_status: ["open", "done", "snoozed"],
    },
  },
} as const
