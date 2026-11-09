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
          config: Json
          created_at: string
          created_by: string | null
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
          config?: Json
          created_at?: string
          created_by?: string | null
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
          config?: Json
          created_at?: string
          created_by?: string | null
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
