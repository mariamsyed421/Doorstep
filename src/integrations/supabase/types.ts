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
  public: {
    Tables: {
      check_ins: {
        Row: {
          channel: string
          classification: Json | null
          created_at: string
          delivery_status: string | null
          direction: string
          id: string
          idempotency_key: string | null
          incident_id: string
          message: string | null
          provider: string | null
          reply: string | null
          resident_id: string
          stage: number | null
        }
        Insert: {
          channel: string
          classification?: Json | null
          created_at?: string
          delivery_status?: string | null
          direction?: string
          id?: string
          idempotency_key?: string | null
          incident_id: string
          message?: string | null
          provider?: string | null
          reply?: string | null
          resident_id: string
          stage?: number | null
        }
        Update: {
          channel?: string
          classification?: Json | null
          created_at?: string
          delivery_status?: string | null
          direction?: string
          id?: string
          idempotency_key?: string | null
          incident_id?: string
          message?: string | null
          provider?: string | null
          reply?: string | null
          resident_id?: string
          stage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_events: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          delivery_status: string | null
          id: string
          idempotency_key: string | null
          incident_id: string
          label: string
          resident_id: string
          stage: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          delivery_status?: string | null
          id?: string
          idempotency_key?: string | null
          incident_id: string
          label: string
          resident_id: string
          stage: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          delivery_status?: string | null
          id?: string
          idempotency_key?: string | null
          incident_id?: string
          label?: string
          resident_id?: string
          stage?: number
        }
        Relationships: [
          {
            foreignKeyName: "escalation_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_events_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          area: string
          disaster_type: string
          id: string
          started_at: string
          status: string
        }
        Insert: {
          area: string
          disaster_type: string
          id: string
          started_at?: string
          status?: string
        }
        Update: {
          area?: string
          disaster_type?: string
          id?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      outage_events: {
        Row: {
          active: boolean
          center_lat: number
          center_lng: number
          confidence: number | null
          detected_at: string
          estimated_households: number | null
          id: string
          outage_type: string
          radius_m: number
          severity: string | null
          simulated: boolean
          source: string
        }
        Insert: {
          active?: boolean
          center_lat: number
          center_lng: number
          confidence?: number | null
          detected_at?: string
          estimated_households?: number | null
          id: string
          outage_type: string
          radius_m: number
          severity?: string | null
          simulated?: boolean
          source: string
        }
        Update: {
          active?: boolean
          center_lat?: number
          center_lng?: number
          confidence?: number | null
          detected_at?: string
          estimated_households?: number | null
          id?: string
          outage_type?: string
          radius_m?: number
          severity?: string | null
          simulated?: boolean
          source?: string
        }
        Relationships: []
      }
      priority_assessments: {
        Row: {
          confidence: string
          evidence: string[]
          explanation: string
          factors: Json
          incident_id: string
          level: string
          recommended_action: string
          resident_id: string
          score: number
          updated_at: string
        }
        Insert: {
          confidence: string
          evidence: string[]
          explanation: string
          factors: Json
          incident_id: string
          level: string
          recommended_action: string
          resident_id: string
          score: number
          updated_at?: string
        }
        Update: {
          confidence?: string
          evidence?: string[]
          explanation?: string
          factors?: Json
          incident_id?: string
          level?: string
          recommended_action?: string
          resident_id?: string
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "priority_assessments_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "priority_assessments_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      residents: {
        Row: {
          consent: Json
          contact_channels: string[]
          created_at: string
          emergency_contacts: Json
          household_size: number
          id: string
          insurance: Json | null
          lat: number
          lives_alone: boolean
          lng: number
          name: string
          needs: Json
          phone: string | null
          plan_detail: string | null
          preferred_language: string
          preparedness_plan: string | null
        }
        Insert: {
          consent?: Json
          contact_channels?: string[]
          created_at?: string
          emergency_contacts?: Json
          household_size?: number
          id: string
          insurance?: Json | null
          lat: number
          lives_alone?: boolean
          lng: number
          name: string
          needs?: Json
          phone?: string | null
          plan_detail?: string | null
          preferred_language: string
          preparedness_plan?: string | null
        }
        Update: {
          consent?: Json
          contact_channels?: string[]
          created_at?: string
          emergency_contacts?: Json
          household_size?: number
          id?: string
          insurance?: Json | null
          lat?: number
          lives_alone?: boolean
          lng?: number
          name?: string
          needs?: Json
          phone?: string | null
          plan_detail?: string | null
          preferred_language?: string
          preparedness_plan?: string | null
        }
        Relationships: []
      }
      resources: {
        Row: {
          accessible: boolean | null
          capacity: number | null
          generator: boolean | null
          id: string
          lat: number
          lng: number
          name: string
          pets: boolean | null
          population: number | null
          source: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          accessible?: boolean | null
          capacity?: number | null
          generator?: boolean | null
          id: string
          lat: number
          lng: number
          name: string
          pets?: boolean | null
          population?: number | null
          source: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          accessible?: boolean | null
          capacity?: number | null
          generator?: boolean | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          pets?: boolean | null
          population?: number | null
          source?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
