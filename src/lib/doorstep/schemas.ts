import { z } from "zod";

/** Shared, strict schemas. Every AI response and API payload is validated against these. */

export const LanguageSchema = z.enum(["English", "Spanish", "Vietnamese", "Arabic", "Mandarin"]);
export const ChannelSchema = z.enum(["sms", "voice"]);

export const ReplyCategorySchema = z.enum([
  "safe",
  "needs_assistance",
  "urgent_assistance",
  "evacuated",
  "info_request",
  "unclear",
]);
export type ReplyCategory = z.infer<typeof ReplyCategorySchema>;

export const NeedTagSchema = z.enum([
  "power_medical",
  "medical",
  "transportation",
  "mobility",
  "accessible_shelter",
  "shelter",
  "information",
  "insurance_guidance",
  "property_damage",
]);
export type NeedTag = z.infer<typeof NeedTagSchema>;

export const AiProviderSchema = z.enum(["nemotron", "gemini", "rules"]);
export type AiProvider = z.infer<typeof AiProviderSchema>;

export const ClassificationSchema = z.object({
  category: ReplyCategorySchema,
  urgency: z.enum(["routine", "elevated", "urgent"]),
  needs: z.array(NeedTagSchema).max(9),
  detectedLanguage: z.string().min(2).max(24),
  /** Short English rendering of the reply for coordinators. */
  translation: z.string().max(400),
  explanation: z.string().min(1).max(400),
  recommendedAction: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const ClassificationResultSchema = ClassificationSchema.extend({
  provider: AiProviderSchema,
  /** True when the model was unavailable or uncertain and rules decided. */
  uncertain: z.boolean(),
});
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

export const SummarySchema = z.object({
  summary: z.string().min(1).max(700),
});

export const CheckInMessageSchema = z.object({
  message: z.string().min(1).max(480),
});

// ---------- API payloads ----------
export const ResidentIdSchema = z.string().regex(/^[0-9]{3}$/, "Synthetic resident id");

export const ClassifyRequestSchema = z.object({
  text: z.string().min(1).max(1000),
  residentId: ResidentIdSchema.optional(),
  preferredLanguage: LanguageSchema.optional(),
});

export const CheckInRequestSchema = z.object({
  residentId: ResidentIdSchema,
  channel: ChannelSchema.default("sms"),
  stage: z.number().int().min(0).max(2).default(0),
});

export const EscalateRequestSchema = z.object({
  residentId: ResidentIdSchema,
  stage: z.number().int().min(1).max(5),
  /** Required by the server for stages 3–5 (third-party outreach / welfare checks). */
  coordinatorApproval: z
    .object({ approvedBy: z.string().min(1).max(80), approvedAt: z.string() })
    .optional(),
  idempotencyKey: z.string().min(3).max(120),
});

export const InboundWebhookSchema = z.object({
  /** Our mock format; the Photon adapter normalizes into this shape. */
  from: z.string().min(3).max(40),
  text: z.string().min(1).max(2000),
  messageId: z.string().min(1).max(120),
  channel: ChannelSchema.default("sms"),
  residentId: ResidentIdSchema.optional(),
});

export const SummarizeRequestSchema = z.object({
  residentId: ResidentIdSchema,
  facts: z.array(z.string().max(300)).max(30),
});
