# Lugendo — Checklist de validación

Marca cada ítem a medida que lo pruebes. Actualiza este archivo cuando una feature quede validada ✅ o si encuentras un bug ❌.

---

## Sprint actual

### #149 — Editar el día de las actividades: mover entre días y desplazar el itinerario/viaje (2026-07-29)
- [x] Investigación previa: `day_number` (en `itinerary_days`/`trip_days`) es un índice relativo, no una fecha absoluta — la fecha real de un día de viaje se calcula como `trips.start_date + (day_number - 1)`, así que cambiar la fecha de inicio de un viaje no requiere tocar ningún día (ya funciona por diseño, sin cambios)
- [x] Backend: nuevo campo `dayId` opcional en `PATCH /trips/{tripId}/days/{dayId}/activities/{linkId}` y `PATCH /itineraries/{itineraryId}/days/{dayId}/activities/{linkId}` para mover una actividad a otro día, con verificación de que el día destino pertenece al mismo viaje/itinerario (`verifyTripDayAccess` reutilizado para viajes; comprobación equivalente añadida para itinerarios)
- [x] Backend: helper `day-renumbering.ts` (`closeDayGap`, `repositionDay`) — borrar un día de en medio cierra el hueco automáticamente; reposicionar el número de un día existente desplaza los demás manteniendo la secuencia contigua. Aplicado en `itineraries.ts`, `trips.ts` y `traveler.ts` (`PATCH /me/trips/{tripId}/days/{dayId}`, que antes sobrescribía `dayNumber` sin renumerar nada)
- [x] Backend: `trip_notes.dayNumber`/`endDayNumber` se remapean junto con los días de un viaje (`shiftTripNotesForDayRemoval`, `shiftTripNotesForReposition`); una nota de un solo día anclada exactamente en el día borrado se desvincula (`dayNumber = null`) en vez de reasignarse a otro día
- [x] Frontend: selector "Día" en `ActivityDetailSheet` (mismo componente reutilizado en itinerario y viaje) para mover una actividad; al guardar con día distinto, se invalidan las queries del día de origen y del día de destino
- [x] `lib/api-spec/openapi.yaml` + Orval: `dayId` en `TripDayActivityUpdate`/`ItineraryDayActivityUpdate`, `dayNumber` en `TripDayUpdate`/`ItineraryDayUpdate`, regenerados
- [x] `pnpm run typecheck` y `pnpm run build` limpios en `api-server` y `lugendo-app` (el fallo de `mockup-sandbox` en `pnpm run build` es preexistente y no relacionado — falta la variable de entorno `PORT` en ese paquete)
- [x] Lógica SQL de renumeración (`closeDayGap`, `repositionDay`, remapeo de `trip_notes`) verificada contra la base de datos real dentro de una transacción con rollback explícito (datos de prueba desechables, sin FK a agencias/usuarios reales, cero filas persistidas) — se encontró y corrigió un bug real: el mapping de `repositionDay` puede ser un ciclo de permutación (ej. día 2→4, 3→2, 4→3), y aplicar el remapeo de notas secuencialmente por `WHERE day_number = oldNumber` corrompía datos cuando una fila ya remapeada volvía a coincidir con un paso posterior; ahora se hace un snapshot de las filas afectadas por su valor original antes de actualizar
- [ ] **No se pudo probar en el navegador con una cuenta de agencia real** — `/trips/:id` e `/itineraries/:id` (donde vive esta UI) están detrás de `ProtectedBackOffice`, que excluye el rol `traveler`; no hay contraseña de agente/manager/admin válida documentada en este entorno (la de `admin@lugendo.io` no es la real, ver nota en `CLAUDE.md`) y crear una cuenta de agencia nueva no es posible vía registro público (solo crea `traveler` pendiente de aprobación). Pendiente de que Quique lo valide con una cuenta real, o de que facilite credenciales de prueba de agencia para próximas tareas
- [ ] Mover una actividad de un día a otro dentro del editor de itinerarios (agencia) y el cambio persiste
- [ ] Mover una actividad de un día a otro dentro de un viaje concreto y el cambio persiste
- [ ] Intentar mover una actividad a un día de OTRO itinerario/viaje falla (autorización / IDOR)
- [ ] Borrar un día de en medio de un itinerario/viaje renumera correctamente los siguientes, sin huecos
- [ ] Cambiar la fecha de inicio de un viaje: todas las fechas de los días se recalculan correctamente en la UI, sin tocar `trip_days`
- [ ] Recursos ligados a un día (hotel, transporte, etc.) se mantienen coherentes tras mover una actividad de día

### #140 — Reclasificar vista de viajes del viajero: Programados / Realizados / Compartidos (2026-07-28)
- [x] Investigación previa: no existe una única tabla "viajero-viaje" — el acceso se resuelve por 3 vías distintas (`trips.ownerId` para propios, `invitations` para agencia, `trip_shares` entre viajeros); se decidió con Quique crear una tabla nueva dedicada en vez de forzar la clasificación en una de las 3 existentes
- [x] Backend: nueva tabla `trip_classifications` (Drizzle) con FK a `users`/`trips` (`onDelete: cascade`), enum `programado`/`realizado`/`compartido`, constraint único `(user_id, trip_id)`; migración `0019_clear_zaladane.sql` generada y aplicada en Neon
- [x] Valor por defecto al ganar acceso a un viaje: fechas del viaje (pasado → `realizado`, futuro/en curso → `programado`) para viaje propio o invitación de agencia; siempre `compartido` para un share aceptado. Se engancha en los 4 puntos donde una invitación/share pasa a `accepted` (`auth.ts` login auto-accept, `auth.ts` registro con código, `invitations.ts` aceptar código, `traveler.ts` aceptar share) y en la creación de viaje propio
- [x] Endpoint `PATCH /me/trips/{tripId}/classification` — el viajero puede cambiar la clasificación en cualquier momento, sin restricciones de flujo (incluye Programado/Realizado, no solo Compartido)
- [x] `GET /me/trips` unificado: ahora incluye todos los viajes con acceso aceptado (propios + invitados + compartidos) con su `classification` efectiva; se elimina la lógica antigua `SHARED_MINE_STATUSES` basada en el `status` del viaje
- [x] `GET /me/shared-trips` simplificado: solo devuelve invitaciones pendientes de aceptar (las aceptadas ya aparecen en `/me/trips`, clasificadas como `compartido` por defecto)
- [x] Al salir de un viaje (`leave`) o descartarlo (`dismiss`) se borra también su fila de clasificación
- [x] Frontend (`traveler-home.tsx`): 3 pestañas "Programados / Realizados / Compartidos" sustituyendo "Mis viajes / Compartidos", filtrando por `classification`; el panel de código de invitación e invitaciones pendientes se mantiene dentro de la pestaña Compartidos
- [x] Frontend (`trip-detail-header.tsx` + `traveler-trip.tsx`): selector editable junto al badge de estado en la cabecera del viaje para cambiar la clasificación manualmente
- [x] `lib/api-spec/openapi.yaml` + Orval: nuevo schema `TravelerTripClassification` y endpoint `PATCH /me/trips/{tripId}/classification` documentados y regenerados
- [x] `pnpm run typecheck` limpio en todo el workspace
- [x] Verificado en local (dev server, cuenta de viajero de prueba creada y eliminada tras la prueba): crear un viaje propio con fecha futura → aparece en "Programados"; cambiar su clasificación a "Realizado" desde el selector de la ficha → toast de confirmación y se mueve a "Realizados"; pestaña "Compartidos" muestra correctamente el panel de código de invitación y el empty state
- [ ] Aceptar una invitación de agencia real y un share entre viajeros real → confirmar que quedan clasificados correctamente (agencia: Programado/Realizado según fechas; share: Compartido) — no probado end-to-end por falta de una segunda cuenta/agencia de prueba en este pase
- [ ] Validar en producción tras desplegar (aplica la migración automáticamente al arrancar el servidor)

### #139 — Países visitados y países objetivo del viajero: listas editables + mapa de POIs (2026-07-27)
- [x] Backend: tabla `user_countries` (Drizzle) con FK a `users`, `country_code` (ISO-2), `status` (`visitado`/`objetivo`), constraint único `(user_id, country_code)`; migración `0018_flawless_reavers.sql` generada y aplicada en Neon
- [x] Dataset de países reubicado de `lib/api-client-react` a `lib/db/src/countries.ts` (accesible también desde el backend vía subpath `@workspace/db/countries`), con mapas `COUNTRY_CODE_BY_NAME`/`COUNTRY_NAME_BY_CODE`; `api-client-react` re-exporta para no romper el combobox de país existente
- [x] Endpoints `GET/POST/PATCH/DELETE /me/countries` y `GET /me/trips/{tripId}/countries` (países del viaje aún sin clasificar, para el modal), documentados en OpenAPI y regenerados con Orval
- [x] `GET /me/profile`: `countriesVisited` deja de auto-derivarse de los viajes del usuario y ahora refleja solo los países marcados manualmente como "visitado" (tener un viaje a un país ya no implica marcarlo como visitado)
- [x] Frontend: sección "Mis países" en `/traveler/profile` (chips con bandera + nombre + quitar, selector de país reutilizando `CountrySelect`, "Marcar como visitado" en la lista Objetivo, aviso de mover si el país ya está en la otra lista)
- [x] Modal no bloqueante tras crear un viaje propio o unirse (invitación o compartido) que pregunta, país por país, "Ya lo he visitado / Quiero visitarlo / No añadir" — se puede cerrar sin guardar nada
- [x] Mapa de coropleta "Mapa de mis países" (Mapbox GL, GeoJSON estático de fronteras — Natural Earth 110m, sin tileset de pago), colorea el país completo en Terracota (visitado) / Índigo (objetivo), popup con acción rápida
- [x] `pnpm run typecheck` limpio (api-server, lugendo-app, libs)
- [ ] **No se pudo probar visualmente en local** — mismo problema de entorno preexistente y no relacionado que en tareas anteriores (rollup/dev server), y además el `.env` local no se carga automáticamente (nada en el código hace `dotenv`) ni el dev server de Vite tiene proxy a `/api`; anotado como posible tarea aparte
- [ ] Añadir un país a "Visitados" y a "Quiero visitar" desde el perfil, y confirmar que aparece/desaparece sin recargar
- [ ] Intentar añadir un país que ya está en la otra lista → ofrece moverlo, no duplica
- [ ] "Marcar como visitado" sobre un país de la lista Objetivo lo mueve correctamente
- [ ] Crear un viaje nuevo → aparece el modal con los países correctos del itinerario, sin los ya clasificados
- [ ] Aceptar una invitación de agencia y un código de viaje compartido → el modal también aparece en ambos casos
- [ ] Cerrar el modal sin elegir nada, y elegir "No añadir" en algún país → no se guarda nada
- [ ] El mapa pinta el país completo (no un pin) con el color correcto, y el popup permite "Marcar como visitado"
- [ ] Validar en producción tras desplegar (aplica la migración automáticamente al arrancar el servidor)

**Feedback de QA (2026-07-27): 2 mejoras + 1 bug**
- [x] Bug — "los países no aparecen en el mapa": causa raíz identificada — `buildFillColorExpr` generaba una expresión `match` de Mapbox inválida (sin ningún par valor→color) cuando la lista de países del usuario está vacía en el momento en que se crea la capa (carrera de carga: el GeoJSON local suele resolver antes que `/me/countries`), lo que hacía fallar `map.addLayer` y ningún país llegaba a pintarse, ni siquiera el contorno sin colorear. Corregido: si no hay países clasificados, usa un color de relleno constante en vez de un `match` vacío
- [x] Mejora — Ordenar los nombres de país alfabéticamente en "Mis países" (`localeCompare` con locale "es", ya lo hacía el modal de países del viaje)
- [x] Mejora — Contador de países junto al título de cada lista ("Visitados N" / "Quiero visitar N")
- [x] `pnpm run typecheck` limpio tras los 3 cambios
- [ ] **No se pudo probar visualmente en local** (mismo gap de entorno, tarea #147) — validar en producción: el mapa pinta países al menos con la lista vacía (sin crash) y con países ya clasificados; las listas aparecen ordenadas A-Z con el contador correcto

### #127 — Botón "Expandir/Colapsar todos" en el acordeón de días (2026-07-26)
- [x] Back office (viajes, `trip-detail.tsx`) y back office (itinerarios, `itinerary-detail.tsx`) ya tenían el botón implementado desde antes; se corrigió su lógica para que solo muestre "Colapsar todos" cuando **todos** los días están expandidos (antes bastaba con que hubiera uno solo expandido)
- [x] Pasaporte del viajero (`traveler-trip.tsx`, pestaña Itinerario): añadido el botón "Expandir todos" / "Colapsar todos", que antes no existía en esta vista
- [x] En el pasaporte del viajero se mantiene el comportamiento de expandir automáticamente "hoy" y "mañana" al entrar; el botón nuevo actúa por encima de ese estado inicial
- [x] `pnpm run typecheck` limpio
- [x] Verificado en producción tras el deploy: agencia/admin en detalle de viaje e itinerario (probado por Claude vía navegador), y viajero en su pasaporte (probado por Quique)
- [x] Con un día expandido manualmente y el resto colapsados, el botón dice "Expandir todos" (no "Colapsar todos") en detalle de viaje e itinerario
- [x] Pulsar el botón en el pasaporte del viajero expande/colapsa todos los días sin romper el auto-expandido de hoy/mañana en la carga inicial

### #126 — Sistema de aprobación manual de nuevos registros (registro restringido a beta) (2026-07-25)
- [x] Schema: nuevas columnas en `users` — `status` (`pending`/`approved`/`rejected`, default `approved` para no invalidar filas existentes), `terms_accepted_at`, `approval_token` (único, nulo tras usarse). Migración generada (`0017_aberrant_mantis.sql`), pendiente de aplicar en Railway al desplegar
- [x] Registro (`POST /auth/register`) crea el usuario con `status: pending`, guarda `termsAcceptedAt` (el checkbox de T&Cs ya existía en el formulario — no hizo falta crear placeholder de T&Cs, solo persistir la fecha de aceptación) y genera un `approvalToken` de un solo uso
- [x] Decisión de alcance confirmada con Quique: los viajeros que se registran con código de invitación también quedan en `pending` (no se auto-aprueban)
- [x] Email de notificación a `ebenavidesr@gmail.com` (configurable vía `ADMIN_NOTIFICATION_EMAIL`) con nombre/email/rol/fecha y enlaces Aprobar/Rechazar — reutiliza la infraestructura de email ya existente (Resend), no SMTP de Outlook como se planteaba originalmente en Notion
- [x] `GET /auth/approve?token=...&action=approved|rejected` (sin login) actualiza el estado, invalida el token y muestra una página HTML simple de confirmación; un segundo clic sobre el mismo enlace muestra "enlace ya utilizado"
- [x] `requireAuth`/`requireRoles` devuelven 403 (`AccountPending`) si la sesión tiene `status: pending` o `rejected`; las sesiones ya existentes sin ese campo (creadas antes de este cambio) no se bloquean, evitando desloguear a todo el mundo tras el deploy
- [x] `/auth/me` y `/auth/logout` siguen accesibles para usuarios `pending`/`rejected` (middleware `requireSession` separado) para que el frontend pueda leer el estado y cerrar sesión
- [x] Usuarios creados por un admin desde Equipo (`POST /users`) quedan `approved` automáticamente (no pasan por el registro público, ya están vetados)
- [x] Frontend: nueva pantalla `/pending` (mensaje distinto para pending vs rejected, botón de cerrar sesión); `use-auth.tsx` redirige ahí automáticamente si `user.status !== approved`; `ProtectedBackOffice`/`ProtectedTraveler` no renderizan contenido para usuarios no aprobados
- [x] `pnpm run typecheck` limpio en todos los paquetes (api-server, lugendo-app, libs)
- [x] `pnpm --filter @workspace/api-server run build` (esbuild) limpio
- [ ] **No se pudo probar visualmente en local**: el build/dev server de Vite falló por un problema de entorno preexistente y no relacionado (binarios nativos de rollup/lightningcss ausentes); se reinstaló `node_modules` por completo pero el problema persiste — parece venir del propio `pnpm-lock.yaml`, no de este cambio. Quedó anotado como tarea aparte para investigar
- [ ] Registrar un usuario nuevo sin invitación → queda en `pending`, ve la pantalla de espera, llega el email a Quique con los dos botones
- [ ] Registrar un usuario con código de invitación válido → también queda `pending` (según la decisión de alcance)
- [ ] Pulsar "Aprobar" en el email → el usuario pasa a `approved` y en su próxima carga entra normal a la app
- [ ] Pulsar "Rechazar" en el email → el usuario ve la pantalla de "acceso no aprobado"
- [ ] Reutilizar el mismo enlace de aprobar/rechazar una segunda vez → muestra "enlace ya utilizado", no vuelve a cambiar el estado
- [ ] Un usuario `pending` no puede llamar a rutas protegidas de la API (403) pero sí a `/auth/me` y `/auth/logout`
- [ ] Los usuarios que ya tenían sesión iniciada antes de desplegar este cambio no se ven desconectados ni bloqueados
- [ ] Validar en producción tras desplegar (aplica la migración automáticamente al arrancar el servidor)

### Fix — Teclado no aparecía en Safari iOS (iPhone/iPad) en los campos de email/contraseña de login y registro (2026-07-25)
- [x] Causa raíz identificada: el fix reforzado anti-autofill del 2026-07-11 dejaba los campos de email/contraseña en `readOnly` hasta el primer `onFocus`; en iOS Safari un input `readOnly` no abre el teclado virtual, y el cambio de estado (React re-render) llega después de que Safari ya decidió no mostrarlo — de ahí que fuera inconsistente por dispositivo/versión de iOS
- [x] Eliminado el mecanismo `readOnly`/`onFocus` de los 5 campos afectados (`login.tsx`: email y contraseña de login; nombre/apellidos no lo tenían; email, contraseña y confirmar contraseña de registro), manteniendo el resto de mitigaciones anti-autofill (`autoComplete="off"`/`new-password`/`current-password`, `data-lpignore`, `data-1p-ignore`, nombres de campo no estándar, placeholder sin "@")
- [x] `pnpm run typecheck` limpio
- [ ] **No se pudo probar visualmente en local** — el dev server falla en este checkout por un problema de entorno preexistente y no relacionado (`Cannot find module @rollup/rollup-darwin-arm64`)
- [x] En Safari de iPhone, tocar el campo Email en `/login` abre el teclado a la primera y se puede escribir — **validado por Quique**
- [x] En Safari de iPhone, tocar el campo Contraseña en `/login` abre el teclado a la primera y se puede escribir/pegar — **validado por Quique**
- [x] Igual en Safari de iPad — **validado por Quique**
- [ ] En Safari de iPhone/iPad, los campos de `/register` (nombre, apellidos, email, contraseña, confirmar contraseña) abren el teclado correctamente
- [ ] Confirmar que el autocompletado nativo del navegador (Llavero/Keychain) sigue sin secuestrar el formulario en Safari/Chrome tras quitar el `readOnly` (regresión del fix del 2026-07-11)
- [x] Login completa correctamente de principio a fin en Safari iOS — **validado por Quique**

### #138 — Lector de itinerarios: soportar Excel (.xlsx) con datos repartidos en varias pestañas (2026-07-24)
- [x] Backend: `POST /itineraries/parse-pdf` acepta `.xlsx` (librería `exceljs`); cada pestaña se convierte a tabla Markdown (filas/columnas preservadas) prefijada con `### Pestaña: <nombre>`, todas las pestañas se concatenan y se mandan en una sola llamada al modelo reutilizando el flujo de texto existente (mismo que `.docx`/`.txt`), no el flujo "vision" de PDF
- [x] Pestañas vacías se excluyen automáticamente del texto enviado al modelo
- [x] `.xls` (formato binario antiguo, no soportado por `exceljs`) se rechaza explícitamente con 422 y mensaje claro, en vez de fallar de forma confusa
- [x] Límite de tamaño: mismo límite que PDF (14MB), con error 422 claro en vez de un 413 genérico de Express
- [x] Prompt de sistema actualizado: cuando detecta bloques `### Pestaña: <nombre>`, busca activamente hoteles/vuelos/actividades en todas las pestañas (nombres arbitrarios, no asume "Itinerario"/"Hoteles" fijos) y las reconcilia por número de día/fecha/ciudad
- [x] Frontend: los 4 puntos de subida (`itinerary-wizard`, `trip-wizard`, `traveler-trip-wizard`, `itinerary-detail`) aceptan `.xlsx` (`accept` del input) y el texto de ayuda menciona Excel
- [x] Prueba unitaria de la conversión pestaña→Markdown con un libro sintético de 3 pestañas con datos + 1 vacía (fechas, celdas con `|`, pestaña vacía excluida) — resultado correcto
- [x] `pnpm run typecheck` limpio en todos los paquetes
- [x] Validado en producción contra el ejemplo real disponible (China, 17 días, varias pestañas): la extracción reconcilia bien datos de vuelos/hoteles/itinerario repartidos entre pestañas — **validado por Quique**
- [x] Bug corregido tras la prueba real: `POST` y `DELETE /itineraries/:itineraryId/days/:dayId/hotels` exigían rol admin/manager/agent, así que un `traveler` creando su propio itinerario (con hoteles auto-asignados desde el Excel) recibía 403 Forbidden al crear el viaje — se amplió a `traveler` en ambos endpoints, igual que ya estaba abierto para días y actividades
- [x] Re-probado el flujo completo de creación de viaje del viajero (traveler-trip-wizard) tras el fix de permisos de hoteles — confirmado, ya no da 403 — **validado por Quique**
- [ ] Probar con un Excel de una sola pestaña (caso simple) — confirmar que no se rompe
- [ ] Confirmar que un Excel que supera el límite de tamaño devuelve el error claro, no un 413 genérico
- [ ] Confirmar que PDF/DOCX/TXT siguen funcionando exactamente igual (sin regresión)
- [ ] Anotado: por la variabilidad total esperada entre agencias, hace falta validar con más ejemplos reales antes de dar el feature por maduro (solo hay un ejemplo conocido hoy)

### #135 — Borrar itinerario (sin viajes vinculados) y marcar como inactivo (con viajes vinculados) (2026-07-23)
- [x] El campo `active: boolean` ya existía en el schema de itinerarios (`lib/db/src/schema/itineraries.ts`) — no hizo falta migración
- [x] Backend: `DELETE /itineraries/:itineraryId` ahora rechaza con 409 (`{error, linkedTrips}`) si hay viajes vinculados, en vez de desvincularlos y borrar; si no hay viajes, hace borrado real (`204`). Roles ampliados a admin/manager/agent (antes solo admin/manager)
- [x] Backend: `GET /itineraries/:itineraryId` ahora incluye `tripCount` (antes solo lo tenía el listado)
- [x] Backend: `PATCH /itineraries/:itineraryId` ya aceptaba `active` — sin cambios, reutilizado para marcar/desmarcar inactivo
- [x] `lib/api-spec/openapi.yaml`: DELETE ahora documenta 204/409 (`DeleteItineraryConflict` sustituye a `DeleteItineraryResult`); `ItineraryDetail` incluye `tripCount`; clientes regenerados con Orval
- [x] Frontend: ficha de itinerario (`itinerary-detail.tsx`) — nuevos botones "Marcar como inactivo/activo" (siempre visible) y "Borrar itinerario" (deshabilitado con tooltip si `tripCount > 0`), diálogo de confirmación explícita, badge "Inactivo" junto al título
- [x] Frontend: listado de itinerarios (`itineraries.tsx`) — corregido bug donde "Desactivar" llamaba al mismo DELETE que "Eliminar" (nunca desactivaba de verdad); badge Activo/Inactivo clicable por fila; botón de borrar deshabilitado con tooltip cuando hay viajes vinculados; filtro "Mostrar inactivos" (oculto por defecto)
- [x] Frontend: `trip-wizard.tsx` excluye itinerarios inactivos de la selección de catálogo al crear un viaje nuevo
- [x] Permisos: acciones de borrar/desactivar visibles y permitidas solo para admin, manager y agent (frontend y backend)
- [x] `pnpm run typecheck` limpio en todos los paquetes
- [ ] **No se pudo probar de extremo a extremo en local** — `DATABASE_URL` no está configurada en este checkout, no se puede levantar el backend
- [ ] Itinerario sin viajes vinculados: botón "Borrar" habilitado, borrado funciona tras confirmación
- [ ] Itinerario con al menos un viaje vinculado: botón "Borrar" deshabilitado con tooltip correcto (ficha y listado)
- [ ] Intentar borrar por API un itinerario con viajes vinculados (manipulando la petición) → rechazado por el backend con 409
- [ ] Marcar un itinerario con viajes vinculados como inactivo → aparece con badge "Inactivo" en el listado y en la ficha
- [ ] Filtro "Mostrar inactivos" en el listado oculta/muestra correctamente los itinerarios inactivos
- [ ] Un itinerario inactivo no aparece como opción al crear un viaje nuevo desde catálogo (trip-wizard)
- [ ] Un viaje ya creado a partir de un itinerario ahora inactivo sigue funcionando con normalidad
- [ ] Reactivar un itinerario inactivo funciona y vuelve a aparecer en la creación de viajes
- [ ] Rol Guía local: no existe todavía en el código (tarea #91 sin empezar) — no aplica, cubierto automáticamente cuando se implemente

### #133 — Reestructurar Dockerfile para aprovechar cache de capas de Docker (2026-07-22)
- [ ] `Dockerfile`: copia primero `package.json` raíz, `pnpm-lock.yaml`, `pnpm-workspace.yaml` y el `package.json` de cada uno de los 11 paquetes del monorepo, ejecuta `pnpm install --frozen-lockfile`, y solo después copia el resto del código (`COPY . .`) y compila
- [ ] **No se pudo probar localmente** — Docker no está disponible en este checkout; falta verificar el build real en Railway
- [ ] Deploy en Railway arranca correctamente (build + start sin errores) con el Dockerfile reestructurado
- [ ] Un deploy que solo cambia código de la app (sin tocar `package.json`/lockfiles) es notablemente más rápido que antes (reutiliza la capa de `pnpm install` cacheada)
- [ ] Un deploy que sí cambia un `package.json` o el lockfile reinstala dependencias correctamente (no sirve una cache stale)

### #134 — Wizard de itinerario (PDF): buscar-o-crear automáticamente el hotel/actividad detectado por IA (2026-07-22)
- [x] Utilidad compartida `lib/pdf-day-autofill.ts` (`matchOrCreateActivityIds`/`matchOrCreateHotelId`) usada por los 4 puntos de subida de PDF
- [x] `itinerary-wizard.tsx`: tras analizar el PDF, el hotel y las actividades detectados por IA quedan pre-asignados al día (Select de hotel y pills de actividad), sin repetir el trabajo a mano — **validado en producción por Quique**
- [x] Bug corregido: la creación automática de hotel fallaba siempre en silencio por enviar `country: ""` (el backend exige país no vacío); ahora se deriva del único país detectado en el itinerario — **validado en producción**: un hotel que no existía en el catálogo se creó automáticamente y quedó asignado
- [x] `trip-wizard.tsx`: mismo comportamiento (ya tenía una versión propia del auto-fill; ahora usa la utilidad compartida)
- [x] `traveler-trip-wizard.tsx`: migrado de los campos legacy (`day.hotels`/`day.activities`) a los estructurados (`day.hotel`/`day.parsedActivities`); corregido bug existente por el que el hotel asignado nunca se persistía al crear el viaje (faltaba `useAddItineraryDayHotel`)
- [x] `itinerary-detail.tsx` → "Rellenar desde PDF": ahora muestra badges de hotel/actividad detectados (antes no existían) y los aplica automáticamente a los días importados
- [x] Si la IA marcó el hotel con `reviewManually` (incertidumbre entre tabla y listado de ciudad), NO se auto-asigna en ninguno de los 4 puntos — queda como sugerencia informativa ("⚠ Revisar hotel") a resolver a mano
- [x] El flujo manual de búsqueda/creación de hotel y actividad (ya existente) sigue funcionando igual en los 4 puntos
- [x] `pnpm run typecheck` limpio

### #132 — Analizar PDF de itinerario con input nativo en vez de texto plano (2026-07-22)
- [ ] Cambio de alcance: solo afecta a archivos `.pdf`; `.docx`/`.doc`/`.txt` siguen extrayendo texto plano (mammoth / lectura directa) exactamente como antes
- [ ] Backend: `POST /itineraries/parse-pdf` con un PDF manda el archivo directamente al modelo (`responses.create` con `input_file`) en vez de extraerlo primero con `pdf-parse`
- [ ] `pnpm run typecheck` limpio (`api-server`)
- [ ] **No se pudo probar de extremo a extremo en local** — `DATABASE_URL` no está configurada en este checkout (ver nota de hosting en memoria), y la llamada real a OpenAI tiene coste; falta validar contra un documento real
- [ ] Verificado en Railway/staging: subir un dossier real de agencia (PDF, ~15 páginas) produce un JSON de itinerario igual o más preciso que antes, especialmente en la reconciliación tabla vs. prosa (hoteles, comidas)
- [ ] Verificado: un PDF mayor a 14MB devuelve el error claro ("PDF too large") en vez de un 413 genérico de Express
- [ ] Verificado: los 4 puntos de subida (itinerary-wizard, trip-wizard, traveler-trip-wizard, itinerary-detail) siguen funcionando igual para todos los roles
- [ ] Comparar tiempo de respuesta real contra el enfoque anterior (riesgo conocido: el input nativo de PDF puede tardar más que el texto plano)

### #131 — Vincular usuarios de agencia a su agencia (2026-07-20)
- [ ] Decisión de alcance (documentada en la tarjeta de Notion #131): el rol "Guía local" mencionado en la descripción original no existe todavía en el código (es la tarea #91, sin empezar); la agencia obligatoria se implementa de forma genérica para "cualquier rol que no sea traveler", así que #91 quedará cubierto automáticamente en el futuro sin cambios adicionales aquí
- [ ] Backend: `POST /users` responde 400 si el rol no es `traveler` y no hay `agencyId` resuelto (ni enviado por un admin ni heredado de la sesión de un manager/agente)
- [ ] Frontend: al crear un usuario con rol admin/manager/agente, el selector de agencia es obligatorio y bloquea el envío si no se elige una
- [ ] Frontend: al crear un usuario con rol viajero, no se muestra el selector de agencia
- [ ] Frontend: nueva ficha de agencia (`/agencies/:id`), accesible desde el listado de `/agencies`, muestra los usuarios vinculados (nombre, rol, email, estado)
- [ ] Frontend: Equipos (vista admin) muestra la columna "Agencia" en la tabla de personal, con badge "Sin agencia" para usuarios preexistentes sin agencyId
- [ ] Usuarios ya existentes sin agencia no se ven afectados (sin migración forzada)
- [ ] **Cambio de alcance (2026-07-21, pedido directamente por Quique):** reasignar la agencia de un usuario ya creado, inicialmente marcada como fuera de alcance, se añadió al detectar que los usuarios de agencia existentes ya tenían `agencyId=1` (Lugendo Demo) desde antes de esta tarea — no era un dato afectado por este cambio, sino el estado previo de la BD, y no había forma de corregirlo desde la UI
- [ ] Backend: `PATCH /users/:userId` acepta `agencyId` (incluido `null` para desasignar); solo se aplica si quien edita es admin
- [ ] Frontend: el formulario "Editar usuario" tiene un selector de Agencia (con opción "Sin agencia") para roles que no son viajero, precargado con la agencia actual del usuario
- [ ] `pnpm run typecheck` limpio

### #129 — Subida de logo como archivo en la ficha de creación/edición de agencia (2026-07-20)
- [x] Cambio de alcance decidido al empezar (documentado en la tarjeta de Notion #129): el logo se guarda en Cloudflare R2 (reutilizando el mismo patrón público de `/storage/public-objects/*` construido para las fotos de día) en vez de bytea/base64 en Postgres — la razón original para bytea (evitar una dependencia de storage antes de migrar de Replit) ya no aplica, la migración #117 está hecha. Esto también elimina la necesidad del endpoint dedicado `GET /api/agencies/:id/logo`: el frontend usa `logoFileUrl ?? logoUrl` directamente
- [x] Backend: columna `logo_file_url` nullable en `agencies` (migración `0016_swift_baron_strucker.sql`); `logoUrl` se mantiene como fallback
- [x] Backend: `POST /agencies/:agencyId/logo` (multer, memoria, límite 2MB, formatos PNG/JPG/SVG/WebP) y `DELETE /agencies/:agencyId/logo`
- [x] Backend: sanitización de SVG (`sanitizeSvg` en `lib/sanitize.ts`) con allowlist estricta de tags/atributos — sin `<script>`, sin `on*`, sin `href`/`xlink:href` de ningún tipo, así que no hay URI `javascript:` que filtrar
- [x] Backend: `agencyLogoUrl` en las superficies del viajero (`traveler.ts`) ahora usa `COALESCE(logo_file_url, logo_url)`
- [x] Frontend: componente `AgencyLogoField` (subida inmediata + reemplazo + eliminar) integrado en Configuración de agencia y en editar agencia (superadmin); flujo de archivo diferido (sube tras crear) en el diálogo de nueva agencia
- [x] `typecheck` y `build` de `api-server` limpios; `lugendo-app` typecheck limpio (el build con Vite sigue fallando localmente por el problema de entorno preexistente ya documentado, no relacionado)
- [x] Detectado y reportado por separado (no corregido aquí, fuera de alcance de esta tarea): `PATCH /agencies/:agencyId` y los dos endpoints de logo nuevos no comprueban que el `agencyId` de la URL coincida con la agencia del usuario — cualquier admin/manager puede editar el logo de otra agencia. Tarea sugerida en cola de background.
- [ ] **No se pudo verificar visualmente en local** — mismo problema preexistente de `@rollup/rollup-darwin-arm64`
- [ ] Verificado en `lugendo.io`: crear una agencia nueva subiendo un logo PNG/JPG/SVG/WebP
- [ ] Verificado: archivo >2MB o formato no soportado muestra error claro sin romper el formulario
- [ ] Verificado: el logo se ve en la vista previa del formulario tras subir
- [ ] Verificado: reemplazar y eliminar el logo desde Configuración de agencia y desde Editar agencia (superadmin)
- [ ] Verificado: agencias existentes con `logoUrl` (sin archivo subido) siguen mostrando su logo sin acción manual
- [ ] Verificado: migración `0016` aplicada sin errores en el arranque del servidor de producción

### Foto de portada del día (subir, recortar, hacer zoom y reposicionar) (2026-07-20)
- [x] Backend: columna `photo_url` nullable añadida a `trip_days` e `itinerary_days` (migración `0015_thankful_terrax.sql`, sin backfill necesario)
- [x] Backend: nuevo modo `visibility: "public"` en `POST /storage/uploads/request-url` — sube a un prefijo `public/day-photos/` en R2 servido sin autenticación por la ruta ya existente `GET /storage/public-objects/*`, para poder usar la foto directamente en un `<img src>` sin firmar URLs
- [x] Backend: `photoUrl` añadido a los 3 endpoints de actualización de día (back office viaje, back office plantilla de itinerario, viajero) y a la migración perezosa itinerary_days → trip_days
- [x] Frontend: nuevo componente `DayPhotoZone` (`day-photo-editor.tsx`) con selección de archivo, recorte/zoom/reposicionamiento vía `react-easy-crop` (nueva dependencia) y subida directa a R2
- [x] Integrado en las 3 superficies: encabezado de la ficha del día en el Pasaporte del viajero (`trip-day-card.tsx`), formulario de edición de día en el back office de viaje (`trip-detail.tsx`) y en la plantilla de itinerario (`itinerary-detail.tsx`)
- [x] `typecheck` limpio en todo el workspace (`api-server`, `lugendo-app`, libs)
- [ ] **No se pudo verificar visualmente en local** — el dev server de `lugendo-app` falla por el problema preexistente de entorno (`@rollup/rollup-darwin-arm64` no encontrado, no reproducible en CI) documentado en la tarea #128
- [ ] Verificado en `lugendo.io` tras deploy: subir una foto nueva en el Pasaporte (modo edición, viaje personal), recortarla/hacer zoom/reposicionarla, guardar, y confirmar que se ve correctamente en el encabezado del día
- [ ] Verificado en `lugendo.io`: mismo flujo desde el back office de un viaje real (`/trips/:id`, editar día)
- [ ] Verificado en `lugendo.io`: mismo flujo desde una plantilla de itinerario (`/itineraries/:id`, editar día)
- [ ] Verificado: quitar una foto ya subida (botón de papelera) la elimina correctamente
- [ ] Verificado: migración `0015` aplicada sin errores en el arranque del servidor de producción

### Foto de portada del día — arreglos de edición y subida (2026-07-24)
- [x] Bug: el modal de edición se cerraba solo al arrastrar/hacer zoom en la foto — causa raíz: el `Dialog` (Radix, portal a `document.body`) se renderizaba dentro del mismo `div` con `onClick={onToggle}` que colapsa la tarjeta del día; React burbujea por el árbol de componentes (no el DOM), así que soltar el drag o tocar el slider de zoom disparaba `onToggle`. Fix: `stopPropagation` en el `DialogContent` (`day-photo-editor.tsx`)
- [x] Bug: subida lenta — la foto original (p. ej. 10-20MB de cámara de móvil) se decodificaba y dibujaba dos veces a tamaño completo (preview interactivo del recorte + generación del blob final), todo síncrono en el hilo principal. Fix: nueva función `downscaleForEditing` que reduce la imagen a un máximo de 2400px de lado nada más seleccionarla, antes de pasarla al editor; el blob final subido nunca fue el problema (ya se comprimía a 1200px de ancho)
- [x] Bug: el recorte mostrado en el editor no coincidía con el resultado tras subir — causa raíz: `DayPhotoZone` mostraba la foto en una caja de altura fija (134px, 100px) con ancho fluido, dando ratios distintos según pantalla (2.5 en móvil hasta 8+ en desktop), mientras el editor siempre recorta a un ratio fijo (2.5); `object-cover` volvía a recortar la imagen ya recortada para encajarla, cortando lo que el usuario había enmarcado. Fix: la caja ahora usa `aspect-ratio: 2.5` (CSS) igual que el recorte, con `height` como tope máximo en vez de altura fija
- [ ] **No se pudo verificar visualmente en local** — la base de datos de development no es accesible fuera de Replit/producción, así que no se puede levantar el backend para probar el flujo completo (ver [Local development](CLAUDE.md#local-development))
- [ ] Verificado en `lugendo.io`: al recortar/hacer zoom en el editor, el modal ya no se cierra solo
- [ ] Verificado en `lugendo.io`: subir una foto de móvil (varios MB) se siente notablemente más rápido que antes
- [ ] Verificado en `lugendo.io`: la zona enmarcada en el editor coincide con lo que se ve tras guardar, en las 3 superficies (Pasaporte, back office de viaje, plantilla de itinerario) y en distintos anchos de pantalla (móvil y desktop)

### #128 — Editar día completo (destino, origen y país por ciudad) en itinerarios y viajes (2026-07-19)
- [x] Investigación previa: se detectó que `país` era un único campo por día, y que el viaje real de Sri Lanka tenía `country: null` en los 17 días — causa raíz de que "Matale" y "Galle" geocodificaran a Sudáfrica y Suiza (relevancia 1.0, no lo frena el umbral mínimo del fix anterior de Girithale)
- [x] Cambio de alcance acordado con Quique: el país pasa de ser por día a ser **por ciudad** (origen y destino por separado), ya que un mismo día puede cruzar de un país a otro
- [x] Migración de esquema: `trip_days` e `itinerary_days` ganan `cityFromCountry`/`cityToCountry`; la columna `country` se elimina tras un backfill que copia su valor a ambos campos nuevos (`0013_tidy_talos.sql` + `0014_bright_white_tiger.sql`)
- [x] Backend: geocoding usa el país específico de cada ciudad (origen con `cityFromCountry`, destino con `cityToCountry`) en las 3 superficies (back office viaje, back office itinerario, viajero personal) y en el backfill perezoso del mapa
- [x] `typecheck` y `build` de `api-server` limpios tras el cambio; `lugendo-app` typecheck limpio (el build con Vite falla localmente por un problema de entorno preexistente y no relacionado — falta el binario nativo `@rollup/rollup-darwin-arm64`, no reproducible en CI)
- [ ] Verificado en `lugendo.io` tras deploy: back office de viaje (`/trips/:id`) — el formulario "Editar día" muestra "País origen" y "País destino" como selects independientes, y guardar persiste ambos valores y regeocodifica correctamente
- [ ] Back office de itinerario (plantilla) — mismos dos campos, tanto en "Añadir día" como en "Editar día"
- [x] Vista del viajero (Pasaporte, viaje personal, modo edición) — mismos dos campos en el editor inline de día, verificado en vivo con Quique (usados para corregir Matale, Galle y el país origen del día 1)
- [x] Corregidos los días "Matale" (→ Sri Lanka, 7.468663/80.622765) y "Galle" (→ Sri Lanka, 6.026162/80.21786) del viaje real — verificado en la respuesta real de `GET /api/me/trips/:id/map`, ya no hay pines en Sudáfrica/Suiza
- [ ] La sección "Viaja Seguro" (que agrega países visitados desde `trip_days`) sigue mostrando los países correctos tras el cambio de columna
- [x] Migración `0013`/`0014` aplicada sin errores en el arranque del servidor de producción — confirmado indirectamente (los datos ya devuelven `cityFromCountry`/`cityToCountry` correctamente en producción)

### Fix — "Viaja Seguro" mostraba JS crudo sin formato (2026-07-20)
- [x] Causa raíz: cuando el scraper de `exteriores.gob.es` no encuentra el accordion de secciones (pasó con Sri Lanka), cae a un fallback de texto plano vía `cheerio` `.text()` sobre `<body>`, que incluye el contenido de `<script>`/`<style>` como si fuera texto — eso es lo que se veía renderizado (código JS de la web del Ministerio) desbordando el cajón
- [x] Arreglado eliminando `<script>`/`<style>`/`<noscript>` antes de extraer el texto de fallback (`travel-advisory-scraper.ts`)
- [x] Defensa adicional en el frontend: `break-words` en el párrafo de fallback para que contenido sin espacios no rompa el layout aunque vuelva a colarse basura (`trip-safety-advisories.tsx`)
- [x] `typecheck` limpio en `api-server` y `lugendo-app`
- [ ] Verificado en `lugendo.io`: la fila de Sri Lanka en `country_advisories` se auto-refresca (caché de 20h) y la pestaña "Viaja Seguro" del viaje real muestra el contenido oficial correctamente formateado, sin código JS visible

### Fix — Mapa en blanco (2026-07-19)
- [x] Primer intento (`ResizeObserver` sobre el contenedor) no fue la causa real — descartado con el DOM en vivo
- [x] Causa raíz encontrada en vivo con Quique: el contenedor del mapa usaba clases Tailwind `absolute inset-0` para ocupar los 420px del padre, pero Mapbox GL le añade su propia clase `mapboxgl-map` que fuerza `position: relative` en ese mismo elemento — con `position: relative`, `inset-0` deja de tener efecto de tamaño, y el contenedor colapsaba a 0px justo cuando Mapbox leía sus dimensiones (de ahí el canvas con altura de reserva de 300px en vez de 420px)
- [x] Arreglado cambiando el contenedor a `w-full h-full`, que sí funciona sin importar qué `position` le imponga Mapbox después
- [x] Verificado en `lugendo.io` con Quique: el mapa carga correctamente con los 13 pines y la ruta
- [x] Detectado y corregido un dato incorrecto durante la verificación: el día 1 (origen Madrid) tenía el país origen puesto en Sri Lanka en vez de España, lo que geocodificaba "Madrid, Sri Lanka" a Yakarta, Indonesia — corregido manualmente a España desde el editor del viajero

### #125 — Sección "Mapa": ruta del itinerario con Mapbox (2026-07-12)
- [x] **Requiere publicar con los secrets `VITE_MAPBOX_TOKEN` y `MAPBOX_ACCESS_TOKEN` configurados en Replit (mismo token público de Mapbox en ambos) antes de poder probar nada de lo siguiente** — hecho por Quique

### Fix — Geocodificación de pueblos pequeños daba coordenadas de otro país (2026-07-12)
- [x] Encontrado tras el primer intento real de Quique con el viaje "Sri Lanka Agosto 2026": `Girithale` (pueblo pequeño) resolvía a `Lankaran, Azerbaiyán` (relevancia 0.43) en vez de a Sri Lanka, porque el filtro `types=place` no cubre pueblos pequeños en el dataset de Mapbox
- [x] Arreglado: tipos ampliados a `place,locality,neighborhood` + umbral mínimo de relevancia (0.5) como red de seguridad — verificado contra la API real de Mapbox con 8 ciudades de Sri Lanka (Kandy, Anuradhapura, Girithale, Sigiriya, Ella, Nuwara Eliya, Galle, Colombo), las 8 con relevancia 1.0 tras el cambio
- [x] Migración de datos (`0012_reset_geocoded_coordinates.sql`) que limpia las coordenadas ya guardadas (posiblemente incorrectas) para forzar que se regeneren con la lógica corregida la próxima vez que se abra el mapa de cada viaje
- [ ] Confirmar con el viaje real de Sri Lanka que el mapa ahora sí carga y todos los pines están en el país correcto
- [ ] Al entrar en la pestaña Mapa de un viaje con ciudades conocidas, aparece un pin numerado por cada ciudad única del itinerario, en orden de visita
- [ ] La ruta entre pines se dibuja en Terracota siguiendo carreteras reales (Directions API), no solo líneas rectas
- [ ] El mapa se ajusta automáticamente para mostrar toda la ruta (fitBounds)
- [ ] Tocar un pin lleva a la pestaña Itinerario y hace scroll hasta el día correspondiente, expandiéndolo
- [ ] Probado con un viaje multi-ciudad real (ej. Sri Lanka, ~11 ciudades)
- [ ] Un viaje que abarca más de un país centra el mapa correctamente sobre toda la extensión geográfica
- [ ] Días consecutivos en la misma ciudad no generan pines duplicados
- [ ] Un viaje sin ciudades geocodificables muestra un mensaje, no un mapa roto
- [ ] El mapa NO se carga (no hay llamada a Mapbox) hasta que el viajero entra realmente en la pestaña Mapa
- [ ] Crear o editar un día con ciudad nueva geocodifica automáticamente esa ciudad (verificable indirectamente: el mapa la muestra sin retraso notable la primera vez que se abre)
- [ ] Un día antiguo (creado antes de esta funcionalidad, sin coordenadas guardadas) se geocodifica solo la primera vez que se abre el mapa del viaje, sin romper nada

### #124 — Navegación móvil del viajero: pestañas fijas + menú "Más" e integración de Mapa (2026-07-12)
- [x] Itinerario, Viajeros y Documentos se ven siempre como pestañas fijas en mobile — verificado en navegador a 375px de ancho
- [x] El resto de secciones (Viaja Seguro, Checklist, Equipaje, Notas, Mapa) aparecen dentro del menú "Más" — verificado, se abre como bottom sheet con icono + nombre por sección
- [x] El menú "Más" se abre y cierra correctamente en mobile — reutiliza el componente `Sheet` (`side="bottom"`) ya usado en la app (activity-detail-sheet.tsx), no se introdujo un patrón nuevo
- [x] Los targets táctiles del menú tienen al menos 44px — `min-h-[44px]` explícito en cada fila y en los botones fijos/Más
- [x] Si la sección activa está dentro de "Más", el botón "Más" lo refleja visualmente — verificado: al seleccionar "Mapa", el botón pasa a mostrar "Mapa" con el subrayado activo en vez de "Más"
- [x] La sección "Mapa" aparece como entrada navegable — implementación real (Mapbox) entregada en #125
- [x] Comportamiento correcto también en desktop — verificado: las 8 pestañas caben en una fila sin solaparse ni saltar de línea al ancho real de producción (`max-w-3xl`, 768px)
- [x] Se puede seguir añadiendo secciones futuras al menú "Más" sin rediseñar el patrón — `MORE_TABS` es un array simple, añadir una entrada no requiere tocar la lógica del componente
- [x] Probado con datos reales de un viaje (no solo datos de ejemplo) — confirmado por Quique en producción con el viaje "Sri Lanka Agosto 2026"

### #123 — Mejoras en las Notas: rango de fechas, texto enriquecido, editor más grande (2026-07-11)
- [ ] Se puede crear una nota asociada a un solo día, como antes
- [ ] Se puede crear una nota asociada a un rango de días (seleccionar día inicio y "hasta el día")
- [ ] El selector de "hasta el día" solo permite elegir días iguales o posteriores al día de inicio
- [ ] Una nota con rango se muestra como "Días X–Y"; una nota de un solo día sigue mostrando "Día X"
- [ ] El editor de notas (crear y editar) tiene botones de negrita, cursiva y lista, y funcionan sobre texto seleccionado
- [ ] El contenido con formato se guarda y se vuelve a mostrar correctamente al recargar la página
- [ ] El área de edición es notablemente más grande que antes (~20 líneas) tanto al crear como al editar una nota
- [ ] Una nota creada ANTES de este cambio (texto plano con saltos de línea) se sigue viendo correctamente tras publicar — sin HTML roto ni texto de más, con los saltos de línea conservados
- [ ] La pestaña de Notas en el panel de agencia (fuera de alcance de esta tarea) quedó anotada en BACKLOG.md, no implementada

### #122 — Formato del texto del MAE en "Viaja Seguro" (2026-07-11)
- [ ] En la pestaña "Viaja Seguro" de un viaje a un país con datos del MAE, el contenido se muestra dividido en secciones con título (Notas importantes, Documentación y visados, Seguridad, Sanidad, Divisas, Otros, Direcciones y teléfonos de interés) en vez de un bloque de texto único
- [ ] Dentro de cada sección se ven párrafos separados, negritas y listas cuando el original las tiene (p. ej. "Documentación y visados" y "Sanidad" tienen listas de vacunas)
- [ ] Los enlaces dentro del contenido (p. ej. "Tarjeta Sanitaria Europea", embajadas) funcionan y abren en pestaña nueva
- [ ] La tipografía y espaciados son consistentes con el resto de la app
- [ ] Un viaje cuyo país todavía tiene datos antiguos en caché (formato de texto plano previo al fix) se sigue viendo correctamente, sin errores, mientras se refresca
- [ ] No hay ningún error de consola ni contenido roto/HTML sin escapar visible en pantalla

### #121 — Mostrar vuelos solo en la pestaña Itinerario (2026-07-11)
- [ ] En el detalle de un viaje del viajero, el bloque de Vuelos (Ida/Vuelta) aparece en la pestaña Itinerario
- [ ] El bloque de Vuelos NO aparece en Viajeros, Viaja Seguro, Documentos, Checklist, Equipaje ni Notas
- [ ] Al cambiar de pestaña, el bloque desaparece del DOM (no solo oculto visualmente)
- [ ] El botón Editar de vuelos y el guardado siguen funcionando igual desde Itinerario

### Fix — Faltaba Reino Unido en el listado de países (hoteles/actividades) (2026-07-11)
- [ ] Al crear/editar un hotel, el desplegable de país incluye "Reino Unido"
- [ ] Al crear/editar una actividad, el desplegable de país incluye "Reino Unido"
- [ ] Buscar "Escocia" en el buscador del desplegable muestra "Reino Unido" como resultado
- [ ] Buscar "Inglaterra" en el buscador del desplegable muestra "Reino Unido" como resultado
- [ ] Buscar "Gran Bretaña" o "Gales" también encuentra "Reino Unido"
- [ ] Seleccionar "Reino Unido" y guardar el hotel/actividad funciona correctamente
- [ ] El desplegable incluye "Palestina" (faltaba junto con Reino Unido; auditado el resto de la lista contra los 193 estados miembros de la ONU + Vaticano y Palestina como observadores, y no falta ningún otro)

### Fix — Campo de email bloqueado por el autocompletado del navegador (recurrente)
- [x] En `/register`, el campo Email acepta texto, también tras salir del campo y volver a entrar
- [ ] En `/login`, el campo Email acepta texto igualmente
- [ ] El campo ya no dispara el wizard de autocompletado de email/dirección del navegador (o lo hace con mucha menos frecuencia — es una mitigación, no eliminable al 100%)
- [ ] Si el navegador rellena el email directamente (autofill nativo), el valor se conserva al enviar el formulario (sincronización en onBlur)
- [ ] El resto de campos del registro (Nombre, Apellidos, Contraseña, Confirmar, Código de invitación, Términos) siguen habilitados y editables
- [ ] El registro y el login completan correctamente tras el cambio

### Fix — Mismo bloqueo de autocompletado en alta/edición de usuario (Equipo) e invitar viajero (2026-07-11)
- [ ] En Equipo → "Crear usuario", el campo Email acepta texto, también tras salir y volver a entrar
- [ ] En Equipo → editar usuario existente, el campo Email acepta texto igualmente
- [ ] En la pestaña Viajeros de un viaje → "Invitar viajero", el campo Email acepta texto igualmente
- [ ] Crear usuario, editar usuario e invitar viajero completan correctamente tras el cambio, con el email introducido conservado

### Fix reforzado — Bloqueo total del campo Email en /register desde la primera tecla, en Safari/Chrome/móvil (2026-07-11)
- [x] En `/register`, hacer clic o tap en el campo Email y escribir inmediatamente funciona a la primera tecla, en Chrome de escritorio
- [x] Igual en Safari de escritorio, con Llavero/iCloud Keychain activo y con emails guardados en el navegador
- [x] Igual en un navegador móvil (Chrome o Safari en el teléfono)
- [ ] En `/login`, el campo Email acepta texto a la primera tecla igualmente (ya no tiene `autoFocus`, así que requiere clic/tap primero)
- [ ] El placeholder ya no muestra "nombre@email.com" sino "Introduce tu correo" (sin "@")
- [ ] Registro y login completan correctamente de principio a fin tras el cambio, con el email introducido conservado

### Fix reforzado — Bloqueo total del campo Contraseña en /login desde la primera tecla, ni escribir ni pegar (2026-07-11)
- [x] En `/login`, hacer clic o tap en el campo Contraseña y escribir inmediatamente funciona a la primera tecla, en Chrome de escritorio
- [ ] Igual en Safari de escritorio, con Llavero/iCloud Keychain activo y con contraseñas guardadas
- [x] Igual en un navegador móvil (Chrome o Safari en el teléfono)
- [ ] Pegar una contraseña copiada (Cmd/Ctrl+V) en el campo funciona correctamente
- [ ] El botón de "Mostrar/Ocultar contraseña" (icono de ojo) sigue funcionando y no cuenta como foco del campo
- [ ] En `/register`, los campos Contraseña y Repetir contraseña aceptan texto y pegado igual de bien (mismo fix aplicado preventivamente)
- [ ] Login y registro completan correctamente de principio a fin, con la contraseña introducida conservada

### #20 — Mejorar extracción de vuelos, hoteles y actividades del PDF
- [ ] Al analizar un PDF/Word con tabla resumen + desarrollo en prosa, la extracción reconcilia ambos bloques: días completos con título multilocalidad, régimen de comidas normalizado ("D, CE" → "Desayuno y cena") y descripción narrativa
- [ ] El hotel de cada día prioriza la tabla resumen, se cruza con el listado de hoteles por ciudad y muestra las alternativas ("+N alt."); "o similar" marca el hotel como no garantizado
- [ ] Si el hotel de la tabla no aparece en el listado por ciudad, el día muestra el badge "⚠ Revisar hotel/manualmente"
- [ ] Las actividades se descomponen del párrafo narrativo con tipo (Visita/Traslado/Libre/Gastronomía/Vuelo/Actividad) y momento (mañana/tarde/noche) cuando el texto lo indica; los días libres generan una actividad "Libre" y los días de vuelo no se omiten
- [ ] Las notas ("NOTA:", "IMPORTANTE:") se capturan a nivel de día o de viaje; el equipaje se convierte en checklist (un ítem por elemento); los puntos fuertes van a recomendaciones; las cláusulas legales se descartan
- [ ] En el wizard de itinerarios (paso 2), la vista previa de extracción muestra comidas, hotel con alternativas, nº de actividades, notas y contadores de notas/recomendaciones/checklist del viaje
- [ ] Al crear el itinerario desde el wizard se persisten: tripNotes/recomendaciones/checklist, comidas por día, y el hotel vinculado con garantizado/alternativas/revisión manual (verificable vía API)
- [ ] En el wizard de viajes, las actividades auto-creadas desde el PDF reciben categoría según su tipo (Visita→excursión, Gastronomía→gastronómica) y el hotel auto-creado hereda la ciudad del día
- [ ] `pnpm run typecheck` pasa sin errores tras los cambios de schema, OpenAPI y frontend

### Diagnóstico — Healthcheck 500 / promote colgado en producción (Autoscale)
- [ ] El endpoint `/api/healthz` sigue respondiendo `200 {"ok":true}` en desarrollo tras el cambio
- [ ] Tras un nuevo despliegue, si vuelve a fallar el healthcheck, los logs de producción muestran ahora una línea `"Unhandled request error"` con el error real (no solo `500` sin contexto)
- [ ] El servidor arranca con bind explícito a `0.0.0.0` (en vez de `::`) para que la detección de puertos por fallback (`/proc/net/tcp`, solo IPv4) lo vea correctamente
- [ ] Los logs de despliegue muestran la línea `BUILD <timestamp>` y, tras el arranque, `LISTENING port=8080`, confirmando que el build desplegado es el más reciente y que el proceso sí llega a escuchar
- [ ] Si el despliegue vuelve a colgarse, los `heartbeat <timestamp>` (escritos cada segundo vía `fs.writeSync`, sin pasar por el logger) siguen apareciendo — si dejan de aparecer, confirma un cuelgue real del proceso; si nunca aparecen ni el primero, confirma que es un problema de captura de logs de la plataforma, no de la app
- [ ] El despliegue completa el healthcheck de arranque y el servicio queda "Running" en Autoscale

### #119 — Rediseñar estado por defecto de vuelos
- [x] Si el viaje no tiene ningún vuelo (ida ni vuelta), la sección "Vuelos" aparece expandida automáticamente mostrando "No has añadido tu vuelo todavía" y un botón CTA "Añadir vuelo" que abre el formulario
- [x] Si ya hay al menos un vuelo, la sección muestra siempre el resumen del primer vuelo de ida (y de vuelta si existe) con origen → destino, fecha y horas de salida/llegada, visible sin necesidad de expandir el acordeón
- [x] El acordeón sigue existiendo, pero ahora solo controla la visibilidad de tramos adicionales y del formulario completo de edición
- [x] Cada tramo de vuelo (`FlightLeg`) incluye un campo de fecha, capturable en el formulario y persistido correctamente (schema Drizzle, OpenAPI y validación Zod del servidor)
- [x] El comportamiento es consistente para agencia (`trip-detail.tsx`) y viajero (`traveler-trip.tsx`, incluyendo modo solo lectura)
- [x] `pnpm run typecheck` pasa sin errores tras los cambios de schema, OpenAPI y frontend

### #118 — Toggle Incluida/Por libre al crear itinerario
- [x] En el paso 3 del asistente de creación de itinerarios, cada actividad añadida a un día (vinculada desde catálogo o creada nueva) muestra un selector "Incluida / Por libre" con el mismo estilo visual que en `ActivityDetailSheet`
- [x] Por defecto las actividades quedan marcadas como "Incluida", y se puede cambiar a "Por libre" antes de finalizar la creación
- [x] Al pulsar "Crear", el itinerario se guarda con el valor `included` correcto por cada actividad de cada día
- [x] La fila resumen de cada actividad añadida en el día refleja visualmente si es "Incluida" o "Por libre" (colores igual que en el panel de edición)
- [x] El valor persistido se refleja correctamente en la vista de edición del itinerario tras crearlo

### #116 — Verificar el toggle de noche en transporte con una cuenta de viajero real
- [x] Login con un usuario de rol `traveler` real (`e2e-transit-t116@lugendo.io` / `e2etest1234`, viaje de prueba "Viaje E2E Tránsito" en `/traveler/trips/11`) y redirección al Passport del viajero
- [x] El badge "Noche en transporte" se muestra en el día marcado como tránsito (día 2), tanto en la fila colapsada como en la vista expandida ("Sin hotel asignado para este día.")
- [x] NO aparece ningún control de edición/toggle de "Noche en transporte" para el viajero (solo lectura), ni siquiera en un viaje personal donde los hoteles sí son editables
- [x] El contador "Nth noche" se muestra correctamente: día 3 con el mismo hotel que día 1 muestra "2ª noche" (la noche en tránsito del día 2 no rompe la racha), y día 1 no muestra contador

### #115 — Noche en transporte (toggle en panel de hotel)
- [x] En el panel de hotel de un día (itinerario o viaje) hay un toggle "Noche en transporte" visible para admin/manager/agente
- [x] Al activar el toggle, si el día ya tenía hotel(es) asignado(s), se pide confirmación antes de desvincularlos
- [x] Con el toggle activo, no se muestra la UI de búsqueda/asignación de hotel; en su lugar aparece un panel informativo de "noche en transporte"
- [x] El badge "Noche en transporte" aparece en la fila colapsada del día (itinerario y viaje, back office)
- [x] El badge aparece también en la vista expandida del día junto al resto de la info del hotel
- [x] El viajero ve el mismo badge en su Passport, en modo solo lectura (sin el toggle)
- [x] El contador de "Nth noche" (noches consecutivas en el mismo hotel) salta las noches marcadas como tránsito sin romper ni reiniciar la racha
- [x] La funcionalidad es idéntica para itinerarios y para viajes
- [x] `pnpm run typecheck` pasa sin errores tras los cambios de schema, OpenAPI y frontend

### #117 — Fix: cambios de día no se guardan (ciudad/país/transporte)
- [x] En el diálogo "Editar día" de una plantilla de itinerario (`/itineraries/:id`), si el diálogo permanece abierto y ocurre un refetch en segundo plano, los campos no se resetean ni pierden lo que el usuario está escribiendo
- [x] Limpiar un campo (dejarlo vacío) en ese mismo diálogo y pulsar "Guardar" persiste el campo como vacío tras recargar, en vez de ignorarse
- [x] Editar ciudad origen/destino, país, transporte y descripción y guardar funciona y persiste tras recargar en el diálogo de itinerarios/plantillas
- [x] En el panel de back-office (`/trips/:id`), editar y guardar un día sigue funcionando correctamente (comportamiento ya correcto, sin regresión)
- [x] La ruta de API de días de viaje personal del viajero (`POST/PATCH/DELETE /api/me/trips/:tripId/days`) ahora opera sobre la tabla real de días de viaje (`trip_days`), migrando primero desde la plantilla si hace falta, en vez de escribir en la tabla de plantilla de itinerario
- [x] Crear, editar (incl. limpiar un campo) y eliminar un día de un viaje personal desde esa API persiste correctamente y es visible en `GET /api/me/trips/:tripId`

### #113 — Bloquear borrado de tareas de agencia en checklist
- [ ] En la pestaña Checklist del viajero, las tareas con badge "Agencia" no muestran el botón de eliminar activo (aparece deshabilitado/gris con tooltip explicativo)
- [ ] Las tareas "Sugerido" y "Personal" siguen mostrando el botón de eliminar funcional, con confirmación como antes
- [ ] Intentar borrar una tarea de origen "agencia" directamente contra el endpoint del servidor devuelve 403 y el ítem no se elimina
- [ ] Marcar como completado/pendiente, añadir tarea personal y crear checklist inicial siguen funcionando igual que antes

### #101 — Pestaña "Viaja Seguro" con recomendaciones oficiales
- [x] En el Passport del viajero aparece la pestaña "Viaja Seguro" entre "Viajeros" y "Documentos"
- [x] Si todos los días del viaje son en España (o el país no está definido), la pestaña muestra únicamente el disclaimer de que esta sección sólo tiene contenido para viajes fuera de España
- [x] Si el viaje incluye uno o más países fuera de España, se muestran las recomendaciones por país con la fecha de última actualización (o un mensaje de que aún no se pudo obtener el contenido oficial, de forma resiliente sin romper la pantalla)
- [x] La información se refresca automáticamente una vez al día durante los 15 días previos al inicio del viaje y durante todos los días del viaje
- [ ] Si el contenido oficial de un país cambia respecto a la última vez que el viajero lo consultó, se muestra un aviso destacado de "han cambiado las recomendaciones"
- [x] La pestaña incluye la sección de descarga de la app oficial MAUC con enlaces a App Store y Google Play
- [x] La agencia (admin/manager/agent) puede consultar la misma información de recomendaciones en modo sólo lectura desde la ficha de viaje del back office
- [x] Se añade "Registro del viajero en la app del Ministerio de Asuntos Exteriores" a la lista de tareas sugeridas del checklist de viaje

### #106 — Fila de KPIs en Pasaporte del viajero
- [x] Al abrir el detalle de un viaje en la vista de Pasaporte, aparece una fila de 5 tarjetas justo antes del bloque morado con el nombre del viaje
- [x] En desktop las 5 tarjetas se ven en una sola línea; en móvil se acomodan en un grid de 2-3 columnas sin cortarse ni superponerse
- [x] Tarjeta Hoteles muestra "días con hotel / total de días"
- [x] Tarjeta Actividades muestra "días con actividades / total de días"
- [x] Tarjeta Checklist muestra "tareas completadas / total de tareas"
- [x] Tarjeta Documentos muestra el número total de documentos subidos (sin formato X/Y)
- [x] Tarjeta Viajeros muestra el número total de personas con acceso (shares aceptados + propietario)
- [x] El valor se resalta en ámbar si el KPI de ratio está por debajo del 50%, y en verde si está al 100%
- [x] Las tarjetas son informativas (no clicables) y se muestran igual para todos los roles que acceden a esta vista

### #99 — Checklist de viaje (Passport) + plantillas de agencia
- [x] En la ficha de viaje del viajero aparece la pestaña "Checklist" entre "Documentos" y "Notas"
- [x] Al abrir la pestaña por primera vez se muestra una pantalla de creación con ítems sugeridos por el sistema (marcados por defecto) y las plantillas de la agencia (si las hay)
- [x] Al crear la checklist se genera la lista de tareas seleccionadas con una barra de progreso
- [x] Marcar/desmarcar un ítem actualiza el progreso de inmediato
- [x] El viajero puede añadir ítems personales propios
- [x] El viajero puede eliminar sus ítems personales (con confirmación)
- [x] Los ítems sugeridos y los de plantilla de agencia muestran su badge de origen ("Sugerido" / nombre de plantilla)
- [x] Administradores y managers tienen una sección "Checklists" en Configuración (`/settings`) para crear, editar (título) y activar/desactivar plantillas de agencia
- [x] Los agentes no pueden gestionar plantillas de agencia (solo admin/manager)
- [x] La funcionalidad respeta el mismo scoping por rol usado en notas/documentos (viajero solo ve/edita su propia checklist)

### #112 — Fix checklist de viaje: estado "completada" por defecto y persistencia del toggle
- [x] Al crear la checklist, todos los ítems (sugeridos, de agencia y personales) aparecen SIN marcar por defecto, reflejando el estado real guardado en la base de datos
- [x] Marcar/desmarcar un ítem guarda el cambio de inmediato en el servidor, sin ningún botón de "guardar"
- [x] Al cambiar de pestaña (desmontando y remontando el componente) después de marcar/desmarcar, el estado mostrado sigue siendo el correcto
- [x] Al recargar la página por completo, el estado marcado/desmarcado persiste correctamente
- [x] Alternar el mismo ítem varias veces seguidas (incluso cambiando de pestaña rápido entre cada toggle) siempre refleja el estado final correcto, sin quedarse "atascado" en un valor
- [x] El progreso (%) del checklist siempre refleja el estado real persistido

### #103 — Elegir qué ítems sugeridos/de plantilla incluir al crear la checklist
- [x] En la pantalla de creación, cada ítem sugerido y cada plantilla de agencia tiene su propio checkbox individual (no se incluyen todos automáticamente)
- [x] Todos los ítems vienen premarcados por defecto, pero el viajero puede desmarcar cualquiera antes de crear la checklist
- [x] Solo los ítems que quedan marcados se envían y aparecen en la checklist creada
- [x] Si el viajero desmarca todos los ítems, no puede crear la checklist (aviso de "selecciona al menos una tarea")

### #71 — Fecha junto al número de día
- [x] En detalle de viaje (back office): el badge del día muestra la fecha debajo en letra pequeña
- [x] En el panel bulk de hoteles: aparece la fecha junto al número de día
- [x] En la tarjeta del viajero (`trip-day-card`): la fecha aparece como badge en el encabezado colapsado
- [x] En la tarjeta del viajero: al expandir el día, la fecha aparece en la zona de foto

### #109 — Toggle vista resumen/detalle en itinerario
- [ ] El toggle "Detalle / Resumen" es visible en la cabecera de la sección de días.
- [ ] La "Vista resumen" muestra filas compactas con número de día, fecha, origen → destino, hoteles y conteo de actividades.
- [ ] Al hacer clic en una fila de la vista resumen, el día se expande mostrando el detalle completo.
- [ ] La "Vista detalle" mantiene el comportamiento anterior (badges de día, paneles de hotel/actividades).
- [ ] Las transiciones entre vistas y expansiones son suaves (animaciones CSS).

### #107 — TripHeader: cuenta regresiva y ciudades clickables
- [x] Si el viaje aún no ha empezado, la cabecera muestra una cuenta regresiva ("Faltan X días" / "Falta 1 día")
- [x] Las ciudades del itinerario en la cabecera son clickables y abren un popover con el listado completo ("Itinerario completo")

### #110 — Wizard de viaje: de 7 pasos a 4
- [x] El wizard de "Crear viaje propio" tiene exactamente 4 pasos visibles: Inicio, Programa, Datos del viaje, Crear
- [x] El paso de Vuelos desaparece por completo (sin campos ni resumen de vuelos en ningún paso)
- [x] El paso 4 ("Crear") combina en una sola pantalla la asignación de hoteles/actividades por día y el resumen final con el botón de creación
- [x] El modo "Unirse con código" sigue funcionando igual dentro del nuevo stepper de 4 pasos
- [x] Crear un viaje de principio a fin en modo "Desde cero" funciona correctamente y crea el viaje, el itinerario y los días sin enviar datos de vuelo
- [x] No quedan referencias a pasos antiguos (5/6/7) ni código muerto en la pantalla final

### #72 — Detalles del hotel (dirección / teléfono / web)
- [ ] Al asignar un hotel a un día, si tiene dirección se muestra debajo del nombre
- [ ] Si tiene teléfono aparece como link `tel:` (toca para llamar)
- [ ] Si tiene web aparece como link externo (dominio sin protocolo)
- [ ] Los campos vacíos no muestran línea en blanco

### #3 — Búsqueda antes de listar hoteles
- [x] Botón "Añadir hotel" abre un campo de búsqueda (no va directo al formulario de creación)
- [x] Al escribir, filtra hoteles del catálogo por nombre o ciudad
- [x] Al hacer clic en un resultado se asigna el hotel al día
- [x] El enlace "Crear hotel nuevo" al fondo lleva al formulario completo

### #4 — Pre-relleno de ciudad al crear hotel
- [ ] Al ir a "Crear hotel nuevo" desde un día, el campo Ciudad viene pre-relleno con la ciudad de destino del día
- [ ] El campo País también viene pre-relleno si el día lo tiene
- [ ] Después de crear un hotel, si hay otros días en la misma ciudad aparece la pregunta "¿Aplicar a más días?"

### #5 — Panel bulk de hoteles en detalle de viaje
- [ ] En el detalle de un viaje aparece el botón "Hoteles" en la cabecera de la sección de días
- [ ] Al hacer clic, se despliega un panel con todos los días listados
- [ ] Cada día del panel tiene su propio `DayHotelPanel` funcional (añadir / quitar hoteles)
- [ ] El panel muestra la fecha y la ciudad del día si los tiene

### #75 — Datos de vuelo en el viaje
- [ ] Back office: el panel de vuelos aparece en la ficha del viaje y permite añadir/editar vuelos de ida y vuelta con aerolínea, nº vuelo, origen, destino, hora salida/llegada y código de reserva
- [ ] Back office: se puede añadir más de un tramo (escala) tanto en ida como en vuelta
- [ ] Passport del viajero (viaje de agencia): el panel de vuelos aparece en modo solo lectura con el resumen de vuelos configurado por la agencia
- [ ] Passport del viajero (viaje propio en modo edición): el panel de vuelos es editable desde el modo de edición del viaje personal
- [ ] Si no hay vuelos configurados, el panel muestra "Sin vuelos" en modo solo lectura o la invitación a añadirlos en modo edición

### #29 — Ficha del viajero: países visitados y perfil
- [ ] El nombre/icono de usuario en el header del Passport es un enlace clickable que lleva a `/traveler/profile`
- [ ] La página de perfil muestra: avatar con iniciales del nombre (con color), nombre completo, email y fecha de alta
- [ ] La página muestra stats de "Viajes" (total) y "Países" (únicos)
- [ ] La sección "Países visitados" lista todos los países únicos de los trip_days de los viajes del viajero (propios + de agencia + compartidos)
- [ ] Los países de los itinerarios de agencia (campo `countries` del itinerario) también contribuyen a la lista
- [ ] Si no hay países, aparece un estado vacío con mensaje informativo
- [ ] El botón "← Mis viajes" lleva de vuelta a la home del viajero

### #98 — Lista de equipaje inteligente sugerida por destino y actividades
- [x] En la ficha de viaje del viajero aparece la pestaña "Equipaje" entre "Checklist" y "Notas"
- [x] Al abrir la pestaña por primera vez, la lista se genera automáticamente (sin pantalla de creación manual) con ítems sugeridos según duración del viaje, mes/clima y actividades del itinerario
- [x] Los ítems se agrupan por categoría (Documentos, Ropa, Higiene, Electrónica, Actividades, Otros)
- [x] Una tarjeta de progreso muestra "X de Y elementos empaquetados" con barra y porcentaje
- [x] Marcar/desmarcar un ítem actualiza el progreso de inmediato
- [x] El viajero puede añadir ítems personales propios eligiendo categoría
- [x] El viajero puede eliminar cualquier ítem (sugerido o propio) con confirmación
- [x] La funcionalidad respeta el mismo scoping de acceso usado en checklist/notas (propietario, invitado o compartido)

### #100 — Empty states para tabs Documentos y Notas
- [x] Tab "Documentos": cuando el viajero no tiene documentos propios, se muestra un icono de archivo, el texto "Guarda aquí tu e-ticket, seguro de viaje o reservas de hotel" y un botón "Subir archivo" que abre el selector de archivos
- [x] Tab "Notas": cuando no hay notas para el viaje, se muestra un icono de bloc de notas, el texto "Apunta ideas, listas de equipaje o cosas que no quieres olvidar" y un botón "Nueva nota" que abre el formulario de creación
- [x] Ambos estados vacíos usan los tokens de marca (`--indigo` para el icono, `--arena` para el fondo) en vez de valores hex sueltos
- [ ] El resto del comportamiento de las tabs (listados, subida, edición, borrado) sigue funcionando igual

### #119 — Noche en transporte en los wizards de creación
- [ ] Wizard de itinerario (back office): cada día del paso "Días" muestra un botón "Noche en transporte"; al activarlo, el selector de hotel y el botón "Nuevo" desaparecen y se muestra el badge índigo
- [ ] Wizard de itinerario: al crear, los días marcados se guardan con noche en transporte (visible en el detalle del itinerario)
- [ ] Wizard de viaje (modo nuevo itinerario/PDF): mismo toggle por día y se persiste al crear los días
- [ ] Wizard de viaje (modo itinerario existente): activar el toggle en un día con hotel asignado elimina esa asignación y marca el día como noche en transporte
- [ ] Wizard de viaje: al cambiar de itinerario seleccionado, los toggles/hoteles/actividades marcados se reinician (no se aplican al nuevo itinerario)
- [ ] Wizard de viajero (importar PDF): pill "Noche en transporte" por día; al activarla se oculta el pill/botón de hotel y se persiste al crear
- [ ] El viaje creado desde un itinerario copia la marca de noche en transporte a los días del viaje (visible en el pasaporte del viajero)

### #120 — Noche en transporte al editar viajes e itinerarios ya creados
- [x] Detalle de viaje (back office): el formulario "Editar día" (icono lápiz) muestra ahora el panel de hoteles con el botón "Noche en transporte"
- [x] Activar el toggle desde ese formulario elimina los hoteles asignados (previa confirmación) y marca el día; desactivarlo lo revierte
- [x] Pasaporte del viajero: en un viaje propio (o compartido con permiso total), el día expandido muestra el botón "Noche en transporte" y funciona (guarda vía el endpoint del viajero)
- [x] Un viajero con acceso de solo lectura (viaje de agencia o compartido sin permiso total) sigue sin ver el toggle
- [x] Detalle de itinerario (back office): el toggle sigue disponible en el día expandido y en su formulario de edición
- [x] Seguridad: quitar un hotel de un día solo borra asignaciones que pertenecen a ese día

---

## Tasks mergeados recientemente

### #54 — Agentes pueden renombrar documentos que subieron
- [ ] Un agente puede renombrar un documento que él mismo subió
- [ ] Un agente NO puede renombrar documentos subidos por otro usuario
- [ ] Administradores y managers pueden renombrar cualquier documento

### #57 — Notificación al viajero cuando se sube un documento
- [ ] Al subir un documento a un viaje, el/los viajeros reciben un email
- [ ] El email contiene el nombre del documento y un link directo a la pestaña Documentos del viaje
- [ ] Si el viajero no tiene nombre registrado, el saludo es genérico
- [ ] La subida del documento no se ralentiza aunque falle el email (fire-and-forget)

### #117 — Migrar hosting fuera de Replit (Cloudflare Workers + Railway + Neon)
- [x] Base de datos: datos **reales** de producción (no la base de development `helium`, ver incidente abajo) copiados a la cuenta propia de Neon; conteo de filas verificado idéntico en las 22 tablas
- [x] Incidente detectado post-cutover: dos migraciones (`0009`, `0011`) estaban marcadas como aplicadas sin haberse ejecutado de verdad — columnas añadidas manualmente y verificadas contra el esquema completo, sin pérdida de datos
- [x] Email: invitaciones, bienvenida, documento subido y actualización de viaje se envían vía Resend (dominio `lugendo.io` verificado) en vez del proxy de Replit
- [x] Almacenamiento de archivos: mismo bucket entre development y production, sin necesidad de re-migrar; documento real de Sri Lanka confirmado accesible en R2
- [x] Backend: login y sesión persistente verificados en Railway con cuenta real (Quique); notas del viaje de Sri Lanka confirmadas visibles tras el arreglo de esquema
- [x] Frontend: la SPA carga y el proxy `/api/*` funciona a través del Worker de Cloudflare
- [x] CI: GitHub Actions corre typecheck + build de `api-server` y `lugendo-app` en cada push/PR
- [x] Cutover: `lugendo.io` apunta al nuevo stack (DNS verificado, login funcional en el dominio real con datos reales)
- [x] Login y funcionalidad probados como admin y agent en `lugendo.io`, ambos correctos
- [ ] Probar login como manager y traveler en `lugendo.io`
- [ ] Replit archivado tras el periodo de gracia (recordatorio programado para el 2026-07-22)

### #147 — Arreglar entorno de desarrollo local (Vite/Rollup, .env, proxy a /api)
- [x] `pnpm install` resuelve los binarios nativos de darwin-arm64 (rollup, esbuild, lightningcss, `@tailwindcss/oxide`) sin tocar la resolución para Linux/Railway
- [x] `pnpm --filter @workspace/lugendo-app run build` completa sin el error `ERR_MODULE_NOT_FOUND` de rollup
- [x] `artifacts/api-server/.env` y `lib/db/.env` se cargan automáticamente (sin exportar variables a mano) al correr `dev`, `generate`, `migrate` y `stamp-baseline`
- [x] `pnpm --filter @workspace/api-server run dev` arranca, corre las migraciones y queda escuchando en `:8080` contra la base de Neon real
- [x] `pnpm --filter @workspace/lugendo-app run dev` (`:18147`) hace proxy de `/api/*` al backend local sin usar `setBaseUrl`; probado con un login real que llegó hasta el backend (401 por credenciales, no por fallo de red/proxy)
- [ ] Confirmar el mismo flujo en otra máquina/checkout (Intel Mac o Linux) para descartar que algo quedó atado a este entorno concreto

---

> Seed admin: `admin@lugendo.io` existe en la base real (agencyId=1, role=admin), pero la contraseña `admin1234` documentada históricamente ya no es válida — la base local apunta a los datos reales de producción (ver #117), no a un seed desechable.
