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
      agent_settings: {
        Row: {
          admin_daily_limit: number
          id: number
          updated_at: string
          updated_by: string | null
          user_daily_limit: number
        }
        Insert: {
          admin_daily_limit?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
          user_daily_limit?: number
        }
        Update: {
          admin_daily_limit?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
          user_daily_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_instructions: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          feature: string
          id: number
          restored_from: number | null
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          feature: string
          id?: never
          restored_from?: number | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          feature?: string
          id?: never
          restored_from?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_instructions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_instructions_restored_from_fkey"
            columns: ["restored_from"]
            isOneToOne: false
            referencedRelation: "ai_instructions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          actor_id: string | null
          category: string
          created_at: string
          document_id: number | null
          event_type: string
          id: number
          payload: Json
          priority: string | null
          source_id: number | null
          summary: string | null
          title: string | null
        }
        Insert: {
          actor_id?: string | null
          category: string
          created_at?: string
          document_id?: number | null
          event_type: string
          id?: never
          payload?: Json
          priority?: string | null
          source_id?: number | null
          summary?: string | null
          title?: string | null
        }
        Update: {
          actor_id?: string | null
          category?: string
          created_at?: string
          document_id?: number | null
          event_type?: string
          id?: never
          payload?: Json
          priority?: string | null
          source_id?: number | null
          summary?: string | null
          title?: string | null
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          actions: Json
          content: string
          conversation_id: string
          created_at: string
          id: number
          role: string
          user_id: string
        }
        Insert: {
          actions?: Json
          content: string
          conversation_id: string
          created_at?: string
          id?: never
          role: string
          user_id: string
        }
        Update: {
          actions?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          id?: never
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_version_files: {
        Row: {
          extract_note: string | null
          filename: string
          hash_only_reason: string | null
          id: number
          sha256: string
          size_label: string | null
          source_id: number
          storage_path: string | null
          text_content: string | null
          version_id: number
        }
        Insert: {
          extract_note?: string | null
          filename: string
          hash_only_reason?: string | null
          id?: never
          sha256: string
          size_label?: string | null
          source_id: number
          storage_path?: string | null
          text_content?: string | null
          version_id: number
        }
        Update: {
          extract_note?: string | null
          filename?: string
          hash_only_reason?: string | null
          id?: never
          sha256?: string
          size_label?: string | null
          source_id?: number
          storage_path?: string | null
          text_content?: string | null
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_version_files_version_id_source_id_fkey"
            columns: ["version_id", "source_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id", "source_id"]
          },
        ]
      }
      document_versions: {
        Row: {
          body_hash: string
          body_text: string
          category: string | null
          change_type: string
          classification: Json | null
          created_at: string
          document_id: number
          document_summary: string | null
          document_summary_at: string | null
          id: number
          priority: string | null
          source_id: number
          summary: string | null
          summary_source: string | null
          title: string
          version_no: number
        }
        Insert: {
          body_hash: string
          body_text: string
          category?: string | null
          change_type: string
          classification?: Json | null
          created_at?: string
          document_id: number
          document_summary?: string | null
          document_summary_at?: string | null
          id?: never
          priority?: string | null
          source_id: number
          summary?: string | null
          summary_source?: string | null
          title: string
          version_no: number
        }
        Update: {
          body_hash?: string
          body_text?: string
          category?: string | null
          change_type?: string
          classification?: Json | null
          created_at?: string
          document_id?: number
          document_summary?: string | null
          document_summary_at?: string | null
          id?: never
          priority?: string | null
          source_id?: number
          summary?: string | null
          summary_source?: string | null
          title?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_source_id_fkey"
            columns: ["document_id", "source_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "source_id"]
          },
        ]
      }
      documents: {
        Row: {
          external_id: string
          first_seen_at: string
          id: number
          last_seen_at: string | null
          latest_version_id: number | null
          miss_count: number
          posted_on: string | null
          removed_at: string | null
          review_reason: string | null
          source_id: number
          source_url: string
          status: string
          title: string
        }
        Insert: {
          external_id: string
          first_seen_at?: string
          id?: never
          last_seen_at?: string | null
          latest_version_id?: number | null
          miss_count?: number
          posted_on?: string | null
          removed_at?: string | null
          review_reason?: string | null
          source_id: number
          source_url: string
          status?: string
          title: string
        }
        Update: {
          external_id?: string
          first_seen_at?: string
          id?: never
          last_seen_at?: string | null
          latest_version_id?: number | null
          miss_count?: number
          posted_on?: string | null
          removed_at?: string | null
          review_reason?: string | null
          source_id?: number
          source_url?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_latest_version_id_fkey"
            columns: ["latest_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      draft_versions: {
        Row: {
          created_at: string
          draft_id: string
          id: number
          instruction: string
          markdown: string
          origin: string
          user_id: string
          version_no: number
        }
        Insert: {
          created_at?: string
          draft_id: string
          id?: never
          instruction?: string
          markdown: string
          origin: string
          user_id: string
          version_no: number
        }
        Update: {
          created_at?: string
          draft_id?: string
          id?: never
          instruction?: string
          markdown?: string
          origin?: string
          user_id?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "draft_versions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_versions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          ai_override_source_ids: number[]
          created_at: string
          document_refs: Json
          extra_guides: Json
          guide_ids: number[]
          id: string
          instruction: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_override_source_ids?: number[]
          created_at?: string
          document_refs?: Json
          extra_guides?: Json
          guide_ids?: number[]
          id?: string
          instruction?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_override_source_ids?: number[]
          created_at?: string
          document_refs?: Json
          extra_guides?: Json
          guide_ids?: number[]
          id?: string
          instruction?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drafts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          archived_at: string | null
          body_text: string
          created_at: string
          created_by: string | null
          filename: string
          id: number
          sha256: string
          title: string
        }
        Insert: {
          archived_at?: string | null
          body_text: string
          created_at?: string
          created_by?: string | null
          filename?: string
          id?: never
          sha256: string
          title: string
        }
        Update: {
          archived_at?: string | null
          body_text?: string
          created_at?: string
          created_by?: string | null
          filename?: string
          id?: never
          sha256?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "guides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitals: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          name: string
          note: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          name: string
          note?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          name?: string
          note?: string
          updated_at?: string
        }
        Relationships: []
      }
      mail_claims: {
        Row: {
          created_at: string
          key: string
        }
        Insert: {
          created_at?: string
          key: string
        }
        Update: {
          created_at?: string
          key?: string
        }
        Relationships: []
      }
      notification_prefs: {
        Row: {
          digest_enabled: boolean
          last_digest_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          digest_enabled?: boolean
          last_digest_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          digest_enabled?: boolean
          last_digest_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string | null
          email: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      project_hospitals: {
        Row: {
          added_at: string
          hospital_id: number
          project_id: number
        }
        Insert: {
          added_at?: string
          hospital_id: number
          project_id: number
        }
        Update: {
          added_at?: string
          hospital_id?: number
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_hospitals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_hospitals_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: number
          name: string
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_credentials: {
        Row: {
          ciphertext: string
          owner_label: string
          site: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ciphertext: string
          owner_label: string
          site: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ciphertext?: string
          owner_label?: string
          site?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_credentials_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      source_alert_state: {
        Row: {
          notified_at: string
          notified_level: string
          notified_reason: string | null
          source_id: number
        }
        Insert: {
          notified_at?: string
          notified_level: string
          notified_reason?: string | null
          source_id: number
        }
        Update: {
          notified_at?: string
          notified_level?: string
          notified_reason?: string | null
          source_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "source_alert_state_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_guides: {
        Row: {
          created_at: string
          guide_id: number
          source_id: number
        }
        Insert: {
          created_at?: string
          guide_id: number
          source_id: number
        }
        Update: {
          created_at?: string
          guide_id?: number
          source_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "source_guides_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_guides_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_members: {
        Row: {
          added_at: string
          added_by: string | null
          source_id: number
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          source_id: number
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          source_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_members_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          adapter: string
          ai_enabled: boolean
          board_kind: string
          config: Json
          created_at: string
          created_by: string | null
          hospital_id: number
          id: number
          is_active: boolean
          last_scan_at: string | null
          last_scan_error: string | null
          last_scan_status: string | null
          name: string
          needs_browser: boolean
          requires_login: boolean
          scan_started_at: string | null
          scans_paused_reason: string | null
          url: string
        }
        Insert: {
          adapter: string
          ai_enabled?: boolean
          board_kind?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          hospital_id: number
          id?: never
          is_active?: boolean
          last_scan_at?: string | null
          last_scan_error?: string | null
          last_scan_status?: string | null
          name: string
          needs_browser?: boolean
          requires_login?: boolean
          scan_started_at?: string | null
          scans_paused_reason?: string | null
          url: string
        }
        Update: {
          adapter?: string
          ai_enabled?: boolean
          board_kind?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          hospital_id?: number
          id?: never
          is_active?: boolean
          last_scan_at?: string | null
          last_scan_error?: string | null
          last_scan_status?: string | null
          name?: string
          needs_browser?: boolean
          requires_login?: boolean
          scan_started_at?: string | null
          scans_paused_reason?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          source_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          source_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          source_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      summary_requests: {
        Row: {
          created_at: string
          id: number
          user_id: string
          version_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          user_id: string
          version_id: number
        }
        Update: {
          created_at?: string
          id?: never
          user_id?: string
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "summary_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "summary_requests_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commit_scan: {
        Args: {
          p_cards: Json
          p_documents: Json
          p_error: string
          p_now: string
          p_seen: string[]
          p_source_id: number
          p_status: string
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
    Enums: {},
  },
} as const
