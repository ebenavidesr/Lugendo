CREATE TABLE "traveler_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"avatar_storage_key" text,
	"show_visited_countries" boolean DEFAULT false NOT NULL,
	"show_wanted_countries" boolean DEFAULT false NOT NULL,
	"show_tags" boolean DEFAULT false NOT NULL,
	"agency_tags_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traveler_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "traveler_tag_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"axis" text NOT NULL,
	"family" text,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traveler_tag_catalog_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "traveler_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traveler_tags_user_id_tag_id_unique" UNIQUE("user_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "traveler_profiles" ADD CONSTRAINT "traveler_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traveler_tags" ADD CONSTRAINT "traveler_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traveler_tags" ADD CONSTRAINT "traveler_tags_tag_id_traveler_tag_catalog_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."traveler_tag_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Seed the closed tag catalog (#155): 9 "estilo" tags (family NULL) + 29 "intereses" tags
-- grouped into 4 families for the selector's visual layout only (no meaning in the data model).
INSERT INTO "traveler_tag_catalog" ("slug", "axis", "family", "label", "description", "sort_order") VALUES
('mochilero', 'estilo', NULL, 'Mochilero', 'Ligero de equipaje y de presupuesto, sin plan cerrado', 1),
('lujo-y-confort', 'estilo', NULL, 'Lujo y confort', 'Buenos hoteles, buenos restaurantes, sin renuncias', 2),
('slow-travel', 'estilo', NULL, 'Slow travel', 'Pocos destinos, muchos días en cada uno', 3),
('road-trip', 'estilo', NULL, 'Road trip', 'El trayecto por carretera es parte del viaje', 4),
('crucero', 'estilo', NULL, 'Crucero', 'Viajes por mar con base flotante', 5),
('en-familia', 'estilo', NULL, 'En familia', 'Viaja con niños y planifica en consecuencia', 6),
('en-solitario', 'estilo', NULL, 'En solitario', 'Viaja solo por elección', 7),
('viaje-organizado', 'estilo', NULL, 'Viaje organizado', 'Todo cerrado de antemano, sin sorpresas', 8),
('nomada-digital', 'estilo', NULL, 'Nómada digital', 'Trabaja mientras viaja, estancias largas', 9),
('trekking-y-senderismo', 'intereses', 'naturaleza', 'Trekking y senderismo', 'Rutas a pie, de un día o de varios', 10),
('montana', 'intereses', 'naturaleza', 'Montaña', 'Alta montaña, refugios, altura', 11),
('deportes-de-aventura', 'intereses', 'naturaleza', 'Deportes de aventura', 'Rafting, escalada, barranquismo, parapente', 12),
('fauna-y-safari', 'intereses', 'naturaleza', 'Fauna y safari', 'Observación de animales en su medio', 13),
('buceo-y-snorkel', 'intereses', 'naturaleza', 'Buceo y snorkel', 'Vida marina y arrecifes', 14),
('mar-y-playa', 'intereses', 'naturaleza', 'Mar y playa', 'Costa, sol y baño', 15),
('desierto', 'intereses', 'naturaleza', 'Desierto', 'Dunas, oasis, cielos abiertos', 16),
('nieve-y-esqui', 'intereses', 'naturaleza', 'Nieve y esquí', 'Estaciones y deportes de invierno', 17),
('cicloturismo', 'intereses', 'naturaleza', 'Cicloturismo', 'Rutas en bicicleta', 18),
('astroturismo', 'intereses', 'naturaleza', 'Astroturismo', 'Cielos oscuros y observación nocturna', 19),
('historia', 'intereses', 'cultura', 'Historia', 'Lugares donde pasó algo importante', 20),
('arte-y-museos', 'intereses', 'cultura', 'Arte y museos', 'Museos, galerías y exposiciones como motivo de viaje', 21),
('cultura-local', 'intereses', 'cultura', 'Cultura local', 'Vida cotidiana, barrios, cómo se vive en el sitio', 22),
('arquitectura', 'intereses', 'cultura', 'Arquitectura', 'Edificios y urbanismo', 23),
('arqueologia', 'intereses', 'cultura', 'Arqueología', 'Ruinas y yacimientos', 24),
('etnografia-y-pueblos-locales', 'intereses', 'cultura', 'Etnografía y pueblos locales', 'Comunidades rurales o indígenas y sus formas de vida', 25),
('templos-y-lugares-sagrados', 'intereses', 'cultura', 'Templos y lugares sagrados', 'Catedrales, mezquitas, monasterios, santuarios', 26),
('fiestas-y-tradiciones', 'intereses', 'cultura', 'Fiestas y tradiciones', 'Festivales y calendario local', 27),
('ciudades', 'intereses', 'ciudad', 'Ciudades', 'Grandes urbes como destino en sí', 28),
('gastronomia', 'intereses', 'ciudad', 'Gastronomía', 'Comer bien, de mercado o de mantel', 29),
('vinos-y-bebidas', 'intereses', 'ciudad', 'Vinos y bebidas', 'Bodegas, destilerías, cultura de la bebida', 30),
('vida-nocturna', 'intereses', 'ciudad', 'Vida nocturna', 'Bares, música en directo, salir de noche', 31),
('compras-y-mercados', 'intereses', 'ciudad', 'Compras y mercados', 'Artesanía, mercados locales, tiendas', 32),
('musica-y-festivales', 'intereses', 'ciudad', 'Música y festivales', 'Conciertos y festivales como motivo de viaje', 33),
('deporte-en-vivo', 'intereses', 'ciudad', 'Deporte en vivo', 'Partidos, carreras y eventos deportivos', 34),
('bienestar-y-retiros', 'intereses', 'ciudad', 'Bienestar y retiros', 'Yoga, termalismo, retiros, spa', 35),
('fotografia', 'intereses', 'personal', 'Fotografía', 'El viaje se organiza alrededor de las fotos', 36),
('ecoturismo-y-sostenibilidad', 'intereses', 'personal', 'Ecoturismo y sostenibilidad', 'Bajo impacto y turismo responsable', 37),
('voluntariado', 'intereses', 'personal', 'Voluntariado', 'Colaborar con proyectos locales', 38)
ON CONFLICT ("slug") DO NOTHING;