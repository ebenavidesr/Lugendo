import { z } from "zod/v4";
import { COUNTRY_NAME_BY_CODE } from "@workspace/db/countries";

const TransportModeSchema = z.enum([
  "plane", "ship", "ferry", "train", "self_drive",
  "car_driver", "bus", "motorcycle", "bicycle", "walking",
]).nullable().optional();

const SegmentSchema = z.enum(["basic", "standard", "premium"]);
const SegmentOptionalSchema = SegmentSchema.nullable().optional();

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const LoginInputSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const RegisterInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  acceptTerms: z.literal(true),
});

export const ForgotPasswordInputSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordInputSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

// ─── Agency ───────────────────────────────────────────────────────────────────

const WritingToneSchema = z.enum(["informative", "friendly", "adventurous", "luxury", "professional"]);
const AgencyTypeSchema = z.enum(["agency", "advisor"]);

// Top-level path segments already claimed by the frontend router (artifacts/lugendo-app/src/App.tsx).
// The public agency profile lives at /:slug (tarea #162), so a slug matching one of these would
// shadow a real page — kept in sync manually with App.tsx's route list and use-auth.tsx's exemption.
export const RESERVED_AGENCY_SLUGS = [
  "login", "register", "pending", "verify-email", "forgot-password", "reset-password",
  "foto", "buscar", "itinerarios", "dashboard", "trips", "itineraries", "hotels", "activities",
  "team", "agencies", "settings", "traveler", "inquiries",
];

const AgencySlugSchema = z.string()
  .min(1)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "El slug solo puede tener minúsculas, números y guiones")
  .refine(s => !RESERVED_AGENCY_SLUGS.includes(s), "Ese slug está reservado, elige otro");

export const AgencyInputSchema = z.object({
  name: z.string().min(1),
  slug: AgencySlugSchema,
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  writingTone: WritingToneSchema.optional(),
  // Almacena HTML enriquecido (negrita/cursiva/listas), no texto plano -- el límite tiene que
  // cubrir el margen de las etiquetas, no solo el texto visible.
  description: z.string().max(4000).optional(),
  publicProfileEnabled: z.boolean().optional(),
  agencyType: AgencyTypeSchema.optional(),
});

export const AgencyUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  logoUrl: z.string().nullable().optional(),
  primaryColor: z.string().nullable().optional(),
  writingTone: WritingToneSchema.optional(),
  active: z.boolean().optional(),
  description: z.string().max(4000).nullable().optional(),
  publicProfileEnabled: z.boolean().optional(),
  agencyType: AgencyTypeSchema.optional(),
});

// ─── Hotel ────────────────────────────────────────────────────────────────────

export const HotelInputSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  type: z.string().optional(),
  stars: z.number().int().min(1).max(5).optional(),
  description: z.string().optional(),
});

export const HotelUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  stars: z.number().int().min(1).max(5).nullable().optional(),
  description: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export const DayHotelInputSchema = z.object({
  hotelId: z.number().int().positive(),
  segment: SegmentOptionalSchema,
  guaranteed: z.boolean().optional(),
  alternatives: z.array(z.string()).optional(),
  reviewManually: z.boolean().optional(),
});

const TimeOfDaySchema = z.enum(["mañana", "tarde", "noche"]);

export const ItineraryDayActivityInputSchema = z.object({
  activityId: z.number().int().positive(),
  sortOrder: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  startTime: z.string().optional(),
  timeOfDay: TimeOfDaySchema.optional(),
});

// ─── Activity ─────────────────────────────────────────────────────────────────

const ActivityCategorySchema = z.enum([
  "cultural", "gastronomic", "adventure", "nature",
  "beach", "city", "excursion", "transport", "other",
]);

export const ActivityInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: ActivityCategorySchema.optional(),
  durationHours: z.number().positive().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  pricePerPerson: z.number().nonnegative().optional(),
  minPax: z.number().int().positive().optional(),
  maxPax: z.number().int().positive().optional(),
});

export const ActivityUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: ActivityCategorySchema.nullable().optional(),
  durationHours: z.number().positive().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  pricePerPerson: z.number().nonnegative().nullable().optional(),
  minPax: z.number().int().positive().nullable().optional(),
  maxPax: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
});

// ─── Itinerary ────────────────────────────────────────────────────────────────

const DifficultySchema = z.enum(["easy", "moderate", "demanding"]);

// Taxonomía cerrada y común a toda la plataforma (tarea #161). Ampliable editando esta lista,
// sin migración de esquema porque no se modela como enum de Postgres.
export const TRIP_TYPES = [
  "adventure",
  "beach",
  "cultural",
  "culinary",
  "nature",
  "city",
  "wellness",
  "family",
] as const;

const TripTypeSchema = z.enum(TRIP_TYPES);

const ChecklistEntrySchema = z.object({
  item: z.string().min(1),
  category: z.string().nullable().optional(),
});

export const ItineraryInputSchema = z.object({
  name: z.string().min(1),
  numDays: z.number().int().positive(),
  countries: z.array(z.string()).optional(),
  region: z.string().optional(),
  difficulty: DifficultySchema.optional(),
  description: z.string().optional(),
  videoUrl: z.string().optional(),
  recommendedMonths: z.array(z.string()).optional(),
  priceRange: z.string().optional(),
  tags: z.array(z.string()).optional(),
  tripNotes: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
  checklist: z.array(ChecklistEntrySchema).optional(),
  publishedInSearch: z.boolean().optional(),
  tripTypes: z.array(TripTypeSchema).optional(),
  priceFrom: z.number().int().nonnegative().optional(),
});

export const ItineraryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  numDays: z.number().int().positive().optional(),
  countries: z.array(z.string()).optional(),
  region: z.string().nullable().optional(),
  difficulty: DifficultySchema.nullable().optional(),
  description: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  recommendedMonths: z.array(z.string()).optional(),
  priceRange: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  tripNotes: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
  checklist: z.array(ChecklistEntrySchema).optional(),
  active: z.boolean().optional(),
  publishedInSearch: z.boolean().optional(),
  tripTypes: z.array(TripTypeSchema).optional(),
  priceFrom: z.number().int().nonnegative().nullable().optional(),
});

// ─── Public search (tarea #161) ────────────────────────────────────────────────

export const PublicItinerarySearchQuerySchema = z.object({
  destination: z.string().min(1).optional(),
  tripTypes: z.array(TripTypeSchema).optional(),
  maxBudget: z.coerce.number().int().nonnegative().optional(),
});

export const ItineraryDayInputSchema = z.object({
  dayNumber: z.number().int().positive(),
  cityFrom: z.string().optional(),
  cityTo: z.string().optional(),
  cityFromCountry: z.string().optional(),
  cityToCountry: z.string().optional(),
  transport: TransportModeSchema,
  description: z.string().optional(),
  meals: z.string().optional(),
  isTransitNight: z.boolean().optional(),
});

export const ItineraryDayUpdateSchema = z.object({
  dayNumber: z.number().int().positive().optional(),
  cityFrom: z.string().nullable().optional(),
  cityTo: z.string().nullable().optional(),
  cityFromCountry: z.string().nullable().optional(),
  cityToCountry: z.string().nullable().optional(),
  transport: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  meals: z.string().nullable().optional(),
  isTransitNight: z.boolean().optional(),
  photoUrl: z.string().nullable().optional(),
});

// ─── Agency inquiry (tarea #163) ───────────────────────────────────────────────

export const AgencyInquiryInputSchema = z.object({
  agencyId: z.number().int().positive(),
  itineraryId: z.number().int().positive().optional(),
  message: z.string().min(1).max(2000),
});

// ─── Trip ─────────────────────────────────────────────────────────────────────

const TripStatusSchema = z.enum(["draft", "scheduled", "active", "finished", "cancelled"]);

const FlightLegSchema = z.object({
  airline: z.string().optional(),
  flightNumber: z.string().optional(),
  cityFrom: z.string().optional(),
  cityTo: z.string().optional(),
  date: z.string().optional(),
  departureTime: z.string().optional(),
  arrivalTime: z.string().optional(),
  reservationCode: z.string().optional(),
});

const FlightLegsSchema = z.array(FlightLegSchema).nullable().optional();

export const TripInputSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  description: z.string().optional(),
  itineraryId: z.number().int().positive().optional(),
  endDate: z.string().optional(),
  maxCapacity: z.number().int().positive().optional(),
  airline: z.string().optional(),
  flightNumber: z.string().optional(),
  flightTime: z.string().optional(),
  reservationCode: z.string().optional(),
  flightNotes: z.string().optional(),
  returnAirline: z.string().optional(),
  returnFlightNumber: z.string().optional(),
  returnFlightTime: z.string().optional(),
  returnReservationCode: z.string().optional(),
  outboundFlights: FlightLegsSchema,
  returnFlights: FlightLegsSchema,
});

export const TripUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: TripStatusSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  maxCapacity: z.number().int().positive().nullable().optional(),
  airline: z.string().nullable().optional(),
  flightNumber: z.string().nullable().optional(),
  flightTime: z.string().nullable().optional(),
  reservationCode: z.string().nullable().optional(),
  flightNotes: z.string().nullable().optional(),
  returnAirline: z.string().nullable().optional(),
  returnFlightNumber: z.string().nullable().optional(),
  returnFlightTime: z.string().nullable().optional(),
  returnReservationCode: z.string().nullable().optional(),
  outboundFlights: FlightLegsSchema,
  returnFlights: FlightLegsSchema,
});

export const TripDayUpdateSchema = z.object({
  dayNumber: z.number().int().positive().optional(),
  cityFrom: z.string().nullable().optional(),
  cityTo: z.string().nullable().optional(),
  cityFromCountry: z.string().nullable().optional(),
  cityToCountry: z.string().nullable().optional(),
  transport: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  isTransitNight: z.boolean().optional(),
  photoUrl: z.string().nullable().optional(),
});

// ─── Trip Day Activities ──────────────────────────────────────────────────────

export const DayActivityInputSchema = z.object({
  activityId: z.number().int().positive().optional(),
  activityTitle: z.string().optional(),
  sortOrder: z.number().int().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
  companyContact: z.string().optional(),
  addressOverride: z.string().optional(),
  included: z.boolean().optional(),
  transportMode: TransportModeSchema,
  costAmount: z.number().nonnegative().optional(),
  participantIds: z.array(z.number().int().positive()).optional(),
});

export const ItineraryDayActivityUpdateSchema = z.object({
  dayId: z.number().int().positive().optional(),
  startTime: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const TripDayActivityUpdateSchema = z.object({
  dayId: z.number().int().positive().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  companyContact: z.string().nullable().optional(),
  addressOverride: z.string().nullable().optional(),
  included: z.boolean().optional(),
  transportMode: TransportModeSchema,
  activityTitle: z.string().nullable().optional(),
  costAmount: z.number().nonnegative().nullable().optional(),
});

// ─── Invitations ─────────────────────────────────────────────────────────────

export const InvitationInputSchema = z.union([
  z.object({
    invitees: z.array(z.object({ email: z.string().email(), segment: SegmentOptionalSchema })).min(1),
    emails: z.array(z.string().email()).optional(),
  }),
  z.object({
    emails: z.array(z.string().email()).min(1),
    invitees: z.array(z.object({ email: z.string().email(), segment: SegmentOptionalSchema })).optional(),
  }),
  z.object({
    invitees: z.array(z.object({ email: z.string().email(), segment: SegmentOptionalSchema })).length(0).optional(),
    emails: z.array(z.string().email()).length(0).optional(),
  }),
]);

export const InvitationUpdateSchema = z.object({
  segment: SegmentOptionalSchema,
});

// ─── Users ────────────────────────────────────────────────────────────────────

const UserRoleSchema = z.enum(["admin", "manager", "agent", "advisor", "traveler"]);

export const UserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: UserRoleSchema,
  password: z.string().min(8).optional(),
  agencyId: z.number().int().positive().nullable().optional(),
});

export const UserUpdateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  role: UserRoleSchema.optional(),
  agencyId: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
  status: z.enum(["approved", "rejected"]).optional(),
  password: z.string().min(8).optional(),
});

// ─── Traveler (personal trips) ────────────────────────────────────────────────

export const PersonalTripInputSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().nullable().optional(),
  itineraryId: z.number().int().positive().optional(),
  maxCapacity: z.number().int().positive().optional(),
  airline: z.string().optional(),
  flightNumber: z.string().optional(),
  flightTime: z.string().optional(),
  reservationCode: z.string().optional(),
  returnAirline: z.string().optional(),
  returnFlightNumber: z.string().optional(),
  returnFlightTime: z.string().optional(),
  returnReservationCode: z.string().optional(),
  outboundFlights: FlightLegsSchema,
  returnFlights: FlightLegsSchema,
});

export const PersonalTripUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  status: TripStatusSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  airline: z.string().nullable().optional(),
  flightNumber: z.string().nullable().optional(),
  flightTime: z.string().nullable().optional(),
  reservationCode: z.string().nullable().optional(),
  returnAirline: z.string().nullable().optional(),
  returnFlightNumber: z.string().nullable().optional(),
  returnFlightTime: z.string().nullable().optional(),
  returnReservationCode: z.string().nullable().optional(),
  outboundFlights: FlightLegsSchema,
  returnFlights: FlightLegsSchema,
});

export const PersonalTripDayInputSchema = z.object({
  dayNumber: z.number().int().positive(),
  cityFrom: z.string().nullable().optional(),
  cityTo: z.string().nullable().optional(),
  cityFromCountry: z.string().nullable().optional(),
  cityToCountry: z.string().nullable().optional(),
  transport: TransportModeSchema,
  description: z.string().nullable().optional(),
  isTransitNight: z.boolean().optional(),
});

export const PersonalTripDayUpdateSchema = z.object({
  dayNumber: z.number().int().positive().optional(),
  cityFrom: z.string().nullable().optional(),
  cityTo: z.string().nullable().optional(),
  cityFromCountry: z.string().nullable().optional(),
  cityToCountry: z.string().nullable().optional(),
  transport: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  isTransitNight: z.boolean().optional(),
  photoUrl: z.string().nullable().optional(),
});

export const TripNoteInputSchema = z.object({
  content: z.string().min(1),
  dayNumber: z.number().int().nonnegative().nullable().optional(),
  endDayNumber: z.number().int().nonnegative().nullable().optional(),
}).refine(
  d => d.endDayNumber == null || d.dayNumber == null || d.endDayNumber >= d.dayNumber,
  { message: "endDayNumber debe ser mayor o igual que dayNumber", path: ["endDayNumber"] },
);

export const TripNoteUpdateSchema = z.object({
  content: z.string().min(1),
  dayNumber: z.number().int().nonnegative().nullable().optional(),
  endDayNumber: z.number().int().nonnegative().nullable().optional(),
}).refine(
  d => d.endDayNumber == null || d.dayNumber == null || d.endDayNumber >= d.dayNumber,
  { message: "endDayNumber debe ser mayor o igual que dayNumber", path: ["endDayNumber"] },
);

export const ShareTripInputSchema = z.object({
  email: z.string().email(),
  permission: z.enum(["full", "read"]).optional(),
  memberType: z.enum(["member", "guest"]).optional(),
});

export const UpdateShareInputSchema = z.object({
  permission: z.enum(["full", "read"]).optional(),
  memberType: z.enum(["member", "guest"]).optional(),
}).refine(d => d.permission !== undefined || d.memberType !== undefined, {
  message: "Debe indicarse permission y/o memberType",
});

export const TripDocumentInputSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  storageKey: z.string().min(1),
});

export const TripDocumentRenameSchema = z.object({
  filename: z.string().min(1),
});

export const TripResourceSharesInputSchema = z.object({
  travelerIds: z.array(z.number().int().positive()).min(1),
  // When true, the resource is also flagged "shared with all" so travelers who join the trip
  // *after* this call are auto-backfilled a share row (see backfillSharedWithAll), instead of
  // "share with all" only covering whoever happened to be a member at the time of the click.
  shareWithAll: z.boolean().optional(),
});

// "Enlaces" (links) -- independent feature reusing the trip_documents ownership/visibility
// pattern (see lib/db/src/schema/trip_links.ts). URLs without a scheme are treated as https://
// before validation, so "youtube.com/..." pasted without a protocol still parses -- but always
// re-normalized/validated server-side, never trusting whatever the client already prepended.
function normalizeLinkUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const TripLinkInputSchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().trim().min(1).transform(normalizeLinkUrl).pipe(z.string().url()),
});

// ─── Checklists ───────────────────────────────────────────────────────────────

export const ChecklistTemplateInputSchema = z.object({
  title: z.string().min(1),
  active: z.boolean().optional(),
});

export const ChecklistTemplateUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

const ChecklistItemOriginSchema = z.enum(["suggested", "agency", "personal"]);

export const CreateTripChecklistInputSchema = z.object({
  items: z.array(z.object({
    title: z.string().min(1),
    origin: ChecklistItemOriginSchema,
    templateId: z.number().int().positive().nullable().optional(),
  })).min(1),
});

export const TripChecklistItemInputSchema = z.object({
  title: z.string().min(1),
});

export const TripChecklistItemUpdateSchema = z.object({
  completed: z.boolean(),
});

// ─── Packing lists ──────────────────────────────────────────────────────────

const PackingCategorySchema = z.enum(["ropa", "higiene", "documentos", "electronica", "actividades", "otros"]);

export const TripPackingItemInputSchema = z.object({
  title: z.string().min(1),
  category: PackingCategorySchema,
});

export const TripPackingItemUpdateSchema = z.object({
  packed: z.boolean(),
});

// ─── User countries (visitados / objetivo) ─────────────────────────────────

export const UserCountryStatusSchema = z.enum(["visitado", "objetivo"]);

export const UserCountryInputSchema = z.object({
  countryCode: z.string().refine(code => code in COUNTRY_NAME_BY_CODE, "País no reconocido"),
  status: UserCountryStatusSchema,
});

export const UserCountryStatusUpdateSchema = z.object({
  status: UserCountryStatusSchema,
});

// ─── Trip classification (Programado / Realizado / Compartido) ────────────

export const TripClassificationUpdateSchema = z.object({
  classification: z.enum(["programado", "realizado", "compartido"]),
});

// ─── Traveler profile (#155) ───────────────────────────────────────────────

export const TravelProfileVisibilityUpdateSchema = z.object({
  showVisitedCountries: z.boolean().optional(),
  showWantedCountries: z.boolean().optional(),
  showTags: z.boolean().optional(),
  agencyTagsConsent: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, "Nada que actualizar");

export const TravelerTagInputSchema = z.object({
  tagId: z.number().int().positive(),
});
