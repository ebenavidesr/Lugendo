export type PackingCategory = "ropa" | "higiene" | "documentos" | "electronica" | "actividades" | "otros";

export interface GeneratedPackingItem {
  title: string;
  category: PackingCategory;
}

export interface PackingListInput {
  durationDays: number;
  startDate: string;
  activityCategories: string[];
}

const BASE_ITEMS: GeneratedPackingItem[] = [
  { title: "Pasaporte o DNI", category: "documentos" },
  { title: "Billetes / reservas de viaje", category: "documentos" },
  { title: "Seguro de viaje", category: "documentos" },
  { title: "Efectivo y tarjetas", category: "documentos" },
  { title: "Cepillo y pasta de dientes", category: "higiene" },
  { title: "Desodorante", category: "higiene" },
  { title: "Artículos de aseo personal", category: "higiene" },
  { title: "Cargador de móvil", category: "electronica" },
  { title: "Adaptador de corriente", category: "electronica" },
  { title: "Ropa interior", category: "ropa" },
  { title: "Calcetines", category: "ropa" },
  { title: "Pijama", category: "ropa" },
];

const CLIMATE_ITEMS_BY_MONTH: Record<number, GeneratedPackingItem[]> = {
  0: [{ title: "Abrigo de invierno", category: "ropa" }, { title: "Bufanda y guantes", category: "ropa" }],
  1: [{ title: "Abrigo de invierno", category: "ropa" }, { title: "Bufanda y guantes", category: "ropa" }],
  11: [{ title: "Abrigo de invierno", category: "ropa" }, { title: "Bufanda y guantes", category: "ropa" }],
  2: [{ title: "Chaqueta ligera", category: "ropa" }],
  3: [{ title: "Chaqueta ligera", category: "ropa" }],
  4: [{ title: "Chaqueta ligera", category: "ropa" }],
  9: [{ title: "Chaqueta ligera", category: "ropa" }],
  10: [{ title: "Chaqueta ligera", category: "ropa" }],
  5: [{ title: "Protector solar", category: "higiene" }, { title: "Gafas de sol", category: "ropa" }, { title: "Ropa ligera / transpirable", category: "ropa" }],
  6: [{ title: "Protector solar", category: "higiene" }, { title: "Gafas de sol", category: "ropa" }, { title: "Ropa ligera / transpirable", category: "ropa" }],
  7: [{ title: "Protector solar", category: "higiene" }, { title: "Gafas de sol", category: "ropa" }, { title: "Ropa ligera / transpirable", category: "ropa" }],
  8: [{ title: "Protector solar", category: "higiene" }, { title: "Gafas de sol", category: "ropa" }],
};

const ACTIVITY_ITEMS_BY_CATEGORY: Record<string, GeneratedPackingItem[]> = {
  adventure: [
    { title: "Calzado de trekking", category: "actividades" },
    { title: "Mochila pequeña de día", category: "actividades" },
  ],
  beach: [
    { title: "Bañador", category: "actividades" },
    { title: "Toalla de playa", category: "actividades" },
    { title: "Chanclas", category: "actividades" },
  ],
  nature: [
    { title: "Repelente de insectos", category: "actividades" },
    { title: "Calzado cómodo para caminar", category: "actividades" },
  ],
  cultural: [{ title: "Calzado cómodo para caminar", category: "actividades" }],
  city: [{ title: "Calzado cómodo para caminar", category: "actividades" }],
  excursion: [{ title: "Botella de agua reutilizable", category: "actividades" }],
  gastronomic: [],
  other: [],
};

function addQuantifiedClothing(items: GeneratedPackingItem[], durationDays: number): void {
  const outfitCount = Math.max(1, Math.min(durationDays, 7));
  items.push({ title: `Camisetas / camisas (${outfitCount})`, category: "ropa" });
  items.push({ title: `Pantalones (${Math.max(1, Math.ceil(outfitCount / 2))})`, category: "ropa" });
  if (durationDays >= 3) items.push({ title: "Botiquín básico", category: "higiene" });
  if (durationDays >= 5) items.push({ title: "Bolsa de ropa sucia", category: "ropa" });
}

export function generatePackingList({ durationDays, startDate, activityCategories }: PackingListInput): GeneratedPackingItem[] {
  const items: GeneratedPackingItem[] = [...BASE_ITEMS];

  addQuantifiedClothing(items, durationDays);

  const month = new Date(startDate).getMonth();
  if (!Number.isNaN(month) && CLIMATE_ITEMS_BY_MONTH[month]) {
    items.push(...CLIMATE_ITEMS_BY_MONTH[month]);
  }

  const seenActivityCategories = new Set(activityCategories);
  for (const category of seenActivityCategories) {
    const activityItems = ACTIVITY_ITEMS_BY_CATEGORY[category];
    if (activityItems) items.push(...activityItems);
  }

  const seenTitles = new Set<string>();
  return items.filter(item => {
    if (seenTitles.has(item.title)) return false;
    seenTitles.add(item.title);
    return true;
  });
}
