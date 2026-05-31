import { z } from "zod";

export const MANDATORY_SLOTS = ["city", "checkIn", "checkOut", "adults"] as const;

export const OPTIONAL_SLOTS = [
  "budgetMax",
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

export const conciergeTurnSchema = z.object({
  reply: z.string(),
  messageType: z.enum(["question", "transition", "answer"]),
  slots: conversationSlotsSchema.optional(),
  readyToSearch: z.boolean(),
});

export type ConciergeTurn = z.infer<typeof conciergeTurnSchema>;

export type VerifiedSearchInputs = {
  city: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
  priceMin?: number;
  budgetMax?: number;
  ratingMin?: number;
  propertyTypes?: string[];
  amenities?: string[];
};

export type SelectedFacets = {
  priceRange: { min: number | null; max: number | null };
  propertyTypes: Record<string, true>;
  amenities: Record<string, true>;
  ratingMin: number | null;
  city: string | null;
  dates: { checkIn: string | null; checkOut: string | null };
  guests: { adults: number | null; children: number | null; rooms: number | null };
  vibe: string | null;
  areaPreference: string | null;
};

export type TraceStep = {
  agent: string;
  action: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
};
