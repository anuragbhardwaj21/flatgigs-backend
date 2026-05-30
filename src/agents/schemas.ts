import { z } from "zod";

export const MANDATORY_SLOTS = ["city", "checkIn", "checkOut", "adults"] as const;

export const OPTIONAL_SLOTS = [
  "children",
  "rooms",
  "budgetMax",
  "priceMin",
  "propertyTypes",
  "vibe",
  "areaPreference",
  "mustHaveAmenities",
  "ratingMin",
] as const;

export const conversationSlotsSchema = z.object({
  city: z.string().optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  adults: z.number().optional(),
  children: z.number().optional(),
  rooms: z.number().optional(),
  budgetMax: z.number().optional(),
  priceMin: z.number().optional(),
  propertyTypes: z.array(z.string()).optional(),
  vibe: z.string().optional(),
  areaPreference: z.string().optional(),
  mustHaveAmenities: z.array(z.string()).optional(),
  ratingMin: z.number().optional(),
});

export type ConversationSlots = z.infer<typeof conversationSlotsSchema>;

export const chipSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export type Chip = z.infer<typeof chipSchema>;

export const intentOutputSchema = z.object({
  slots: conversationSlotsSchema,
  forceSearch: z.boolean().optional(),
  nextQuestion: z.string().optional(),
  transitionMessage: z.string().optional(),
});

export type IntentOutput = z.infer<typeof intentOutputSchema>;

export type TraceStep = {
  agent: string;
  action: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
};
