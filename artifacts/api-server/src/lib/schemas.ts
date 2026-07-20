import { z } from "zod/v4";

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
  inviteCode: z.string().optional(),
});

// ─── Agency ───────────────────────────────────────────────────────────────────

const WritingToneSchema = z.enum(["informative", "friendly", "adventurous", "luxury", "professional"]);

export const AgencyInputSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  writingTone: WritingToneSchema.optional(),
});

export const AgencyUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  logoUrl: z.string().nullable().optional(),
  primaryColor: z.string().nullable().optional(),
  writingTone: WritingToneSchema.optional(),
  active: z.boolean().optional(),
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
});

export const ItineraryDayActivityUpdateSchema = z.object({
  startTime: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const TripDayActivityUpdateSchema = z.object({
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  companyContact: z.string().nullable().optional(),
  addressOverride: z.string().nullable().optional(),
  included: z.boolean().optional(),
  transportMode: TransportModeSchema,
  activityTitle: z.string().nullable().optional(),
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

const UserRoleSchema = z.enum(["admin", "manager", "agent", "traveler"]);

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
  active: z.boolean().optional(),
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
});

export const UpdateShareInputSchema = z.object({
  permission: z.enum(["full", "read"]),
});

export const TripDocumentInputSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  storageKey: z.string().min(1),
});

export const TripDocumentRenameSchema = z.object({
  filename: z.string().min(1),
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
