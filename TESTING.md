# Lugendo — Checklist de validación

Marca cada ítem a medida que lo pruebes. Actualiza este archivo cuando una feature quede validada ✅ o si encuentras un bug ❌.

---

## Sprint actual

### #163 (Notion) — Contacto agencia-viajero desde el itinerario (2026-08-23)
> Depende de #161 y #162, ambas implementadas los días previos, código completo pendiente de QA.
> Nota de alcance: la tarjeta habla de "la página de un itinerario" — hoy no existe una página pública de detalle por itinerario (fuera del alcance de #161/#162), así que el punto de entrada es la tarjeta de itinerario tal como aparece en `/buscar` y en el perfil público de agencia (`/:slug`), cada una con su propio botón "Consultar sobre este viaje". No se ha creado ninguna página nueva para esto.
- [x] Un usuario sin sesión iniciada no puede enviar una consulta; se le invita a iniciar sesión — verificado en el navegador: el botón de contacto (tanto en `/buscar` como en el perfil de agencia) redirige a `/login` si no hay sesión, y los 4 endpoints (`POST/GET /agency-inquiries`, `GET /agency-inquiries/me`, `PATCH /agency-inquiries/:id/read`) devuelven 401 sin sesión (verificado por curl)
- [x] La consulta enviada queda asociada al itinerario y a la agencia correctos — verificado insertando una fila de prueba y comprobando el JOIN de `GET /agency-inquiries` (bandeja de la agencia) y `GET /agency-inquiries/me` (historial del viajero), ambos devuelven el itinerario y la agencia esperados; limpiado tras la prueba
- [x] La agencia recibe la consulta en su sección de back office y por email — sección "Consultas" implementada (`/inquiries`, roles Admin/Manager); el envío de email (`sendAgencyInquiryEmail`, Resend) reutiliza el patrón de `#145` y se verificó por lectura de código + verificación de a quién se notificaría (admins/managers activos de la agencia) sin disparar el envío real, para no mandar un email de prueba a una bandeja real
- [x] La consulta no es visible para ninguna otra agencia distinta de la destinataria — verificado directamente contra la base: una query filtrada por `agencyId` de otra agencia devuelve 0 filas para una consulta que pertenece a la agencia 1
- [x] El viajero ve el historial de sus propias consultas enviadas — página `/traveler/inquiries` implementada y enlazada desde el header del portal del viajero; verificado el JOIN por API/DB
- [x] El resultado de la investigación sobre qué roles ven la sección de consultas queda documentado y aplicado — Admin y Manager (mismo patrón que "Equipo"/`checklist-templates`); Agent no tiene acceso, decisión explícita de la tarjeta
- [ ] Verificación visual en navegador del formulario de contacto y de ambas listas (`/inquiries`, `/traveler/inquiries`) por clic — pendiente por falta de credenciales de login funcionales en local (ver nota sobre `admin@lugendo.io` al final de este archivo); typecheck limpio y lógica de negocio verificada a nivel de API/DB

### #162 (Notion) — Perfil público de agencia: descripción y escaparate de itinerarios (2026-08-23)
> Depende de #161 (buscador multiagencia), implementado en la entrada de abajo el mismo día — código completo, pendiente de validación en QA.
- [x] Una agencia con el interruptor de visibilidad desactivado no tiene página pública accesible — verificado por API (`GET /agencies/public/:slug` devuelve 404) y en el navegador (mensaje "Esta página no existe o la agencia no la ha publicado")
- [x] La página de agencia es accesible sin sesión iniciada — verificado en el navegador, incluye la exención genérica de rutas de un solo segmento en `use-auth.tsx`
- [x] Solo aparecen itinerarios marcados como publicados en el buscador (#161); ningún viaje con fechas o viajeros reales — el endpoint público solo consulta `itineraries`/`agencies`, nunca `trips`
- [x] El slug de la URL es único y legible — reutiliza la columna `agencies.slug` (ya única desde el inicio); añadida validación de formato (minúsculas/números/guiones) y lista de palabras reservadas (rutas del front) para que una agencia no pueda elegir un slug que choque con una ruta real
- [ ] El botón de contacto abre el flujo de #163 con la agencia correcta preseleccionada — **no implementado**: #163 sigue en Backlog en Notion, así que el botón "Contactar con la agencia" está deshabilitado con un tooltip "Próximamente"; queda listo para conectarse en cuanto exista #163
- [ ] Panel de agencia: descripción (solo Admin) y toggle "Perfil visible públicamente" en `/settings` — implementado y typecheck limpio, pendiente de verificación visual en navegador por falta de credenciales de login funcionales en local (ver nota sobre `admin@lugendo.io` al final de este archivo)
- [x] Verificado end-to-end contra la base real: publiqué temporalmente el perfil de una agencia y uno de sus itinerarios, confirmé por API y en el navegador que la página renderiza identidad visual, descripción e itinerario correctamente, y revertí ambos cambios tras la prueba

### #161 (Notion) — Buscador de viajes multiagencia: destino, tipo, presupuesto (2026-08-23)
> Nota: hay otro epígrafe "#161 (Notion)" más abajo para "Simplificar invitación a viaje" — ese contenido corresponde en realidad a la tarjeta **#168** de Notion; hubo un desfase histórico de numeración entre los commits locales y el board. Esta entrada usa el número real de Notion para la tarjeta de la que depende #162 (perfil público de agencia).
- [x] Un itinerario con "publicado en el buscador" desactivado no aparece nunca en resultados, aunque los filtros coincidan — verificado con curl contra la base real (2 itinerarios publicados temporalmente, comprobado con y sin filtros, revertido tras la prueba)
- [x] El buscador (`/buscar`) es accesible sin haber iniciado sesión — verificado en el navegador, incluye la exención explícita del guard global de sesión en `use-auth.tsx`
- [x] El filtro de destino devuelve solo itinerarios de ese destino — verificado por API (`?destination=Iceland`) y en la UI real (campo de texto filtra la rejilla de resultados)
- [x] El filtro de tipo de viaje permite selección múltiple y combina correctamente con el resto de filtros — verificado por API con `tripTypes` repetido + overlap de array en Postgres
- [x] El filtro de presupuesto máximo excluye itinerarios con precio orientativo superior al indicado — verificado por API (`maxBudget=500` excluye un itinerario con `priceFrom=1200`)
- [x] Un itinerario sin precio orientativo informado se excluye al filtrar por presupuesto (no se asume que encaja) — verificado por API con un itinerario publicado sin `priceFrom`
- [x] Los resultados no exponen ningún dato de viajeros de viajes concretos — el endpoint público solo consulta `itineraries`/`agencies` (plantillas de catálogo), nunca `trips`
- [ ] El enlace a la agencia desde un resultado lleva al perfil de agencia (#162) — el enlace ya apunta a `/{slug}` y está listo, pero la página en sí es responsabilidad de la tarjeta #162 (todavía no implementada); hoy cae en el guard de sesión → `/login`
- [ ] Panel de agencia: toggle "Publicado en el buscador", selector de tipo de viaje y campo de precio orientativo en el editor de itinerario (`/itineraries`, diálogo de edición) — implementado y typecheck limpio, pendiente de verificación visual en navegador por falta de credenciales de login funcionales en local (ver nota sobre `admin@lugendo.io` al final de este archivo)

### #161 (Notion) — Simplificar invitación a viaje: alta directa por email, sin código (2026-08-22)
- [x] Migraciones aplicadas en Neon: `trip_shares` extendida con `origin` (agency/traveler), `segment`, `tokenExpiresAt`, `acceptedAt`; columna `shareCode` renombrada a nivel de código a `inviteToken` (la columna DB sigue llamándose `share_code` para evitar un rename destructivo); tabla `invitations` eliminada (estaba vacía en producción, verificado antes de generar la migración)
- [x] Backend: invitar por email a alguien con cuenta existente → `trip_share` creado directamente como `accepted`, sin paso de confirmación intermedio — verificado con curl end-to-end (contexto agencia y contexto viajero), el destinatario ve el viaje al instante en `GET /me/trips`
- [x] Backend: invitar por email a alguien sin cuenta → token de un solo uso generado, `tokenExpiresAt` a 7 días, registro con `?email=` pre-cargado y bloqueado en el formulario, vínculo creado automáticamente al verificar el email (`GET /auth/verify-email/:token` llama a `resolvePendingTripSharesForUser`) — verificado end-to-end con curl (registro → token extraído de BD → verificación → `trip_share` pasó a `accepted` con el `user_id` correcto)
- [ ] Backend: token caducado → no se resuelve al verificar/loguear — implementado (`resolvePendingTripSharesForUser` descarta filas con `tokenExpiresAt` pasado) pero no se probó manualmente forzando la caducidad
- [x] Contexto agencia: el invitado entra siempre como `member_type=member`, `origin=agency` — verificado con curl (agente de prueba invita a un email con cuenta y a uno sin cuenta, ambos entran como member); no se tocó la restricción de edición del itinerario oficial (#151, sin cambios)
- [x] Contexto viajero: el organizador sigue pudiendo elegir Miembro/Invitado al compartir (UI sin cambios, #141) — verificado con curl que un `guest` cae en `origin=traveler`, permiso `read`, clasificación `compartido`
- [x] Back office: la tabla "Viajeros invitados" del detalle de viaje ya no muestra la columna "Código"; estados y fechas de aceptación correctos — verificado visualmente en navegador con datos de prueba reales (creados y limpiados en la misma sesión)
- [x] Dashboard de agencia: `totalTravelers` y "Últimas invitaciones" filtran correctamente por `origin=agency` (no mezclan altas de viajero-a-viajero) — verificado con curl
- [x] Opción "Unirse con código" eliminada de `traveler-trip-wizard.tsx` (paso 1 y paso 2), junto con el panel "¿Tienes un código de invitación?" / "Invitaciones pendientes" de `traveler-home.tsx` — ya no hace falta: toda invitación se resuelve sola (al crearla si el email ya tiene cuenta, o al verificar el email si es nueva). El flujo de "foto compartida" (`#141`, código de plantilla) no se tocó
- [x] Plantillas de email (`sendInvitationEmail`, `sendTripShareInvitationEmail` en `email.ts` — no existen como HTML separado, son template literals) rediseñadas sin caja de código, con CTA "Iniciar sesión" o "Crear mi cuenta" según si el destinatario ya tenía cuenta
- [ ] **Descuento del 50% en primera licencia vía token de invitación — fuera de alcance**: la investigación previa confirmó que ese sistema de fee/licencia no existe en el código (ni en `invitations` ni en ningún otro sitio); decisión de Quique fue dejarlo fuera de esta tarea
- [x] `pnpm run typecheck` y `pnpm run build` limpios en todo el workspace (`api-server`, `lugendo-app`)
- [x] Verificado en producción tras desplegar — Quique invitó a un viajero real (`viajero3@lugendo.io`) a un viaje, quedó vinculado correctamente. (Aparte, se detectó y explicó un bug preexistente no relacionado: la sesión de un usuario recién aprobado no se refresca sola, hay que volver a iniciar sesión — ver nota abajo)

**Validado en producción por Quique (2026-08-23). Tarjeta de Notion movida a Completed.**

**Bug preexistente detectado durante la validación (no relacionado con la #161):** cuando una cuenta pasa de `pending` a `approved` (aprobación manual, #126), la sesión ya activa del usuario sigue guardando el estado `pending` — `req.session.status` se cachea en el login y no se refresca contra la base de datos en cada petición. `GET /auth/me` sí lee el estado fresco (por eso no se le redirige a "/pending"), pero cualquier endpoint con `requireRoles` (como `/me/trips`) lo rechaza con 403 hasta que el usuario cierra sesión y vuelve a entrar. Reproducido con `viajero3@lugendo.io`: tras aprobar la cuenta, no veía ningún viaje en ninguna pestaña hasta re-loguearse. Pendiente decisión de Quique sobre si se añade a `BACKLOG.md`.

**Nota técnica:** se optó por extender `trip_shares` en vez de mantener `invitations` como tabla separada (opción "menos duplicación" planteada en la propia tarjeta) — `trip_shares` ya tenía email, `user_id` nullable, tipo de acceso y estado pendiente/aceptado, casi el modelo objetivo. Esto obligó a adaptar ~8 archivos del backend que leían `invitations` directamente (`trips.ts`, `dashboard.ts`, `traveler-profiles.ts`, `trip-reminders.ts`, `auth.ts`) filtrando por `origin='agency'` donde antes solo existía esa fuente. El endpoint `POST /trips/:tripId/invitations` (agencia) y las rutas `/me/trips/:tripId/shares` (viajero) ahora comparten la misma tabla e infraestructura de resolución (`resolvePendingTripSharesForUser`, llamado desde login y desde verificación de email). Se eliminaron por completo los endpoints de "aceptar por código" (`POST /invitations/:code/accept`, `POST /me/shares/:shareCode/accept`, `GET /me/shared-trips`) al dejar de ser necesarios.

### #159 (Notion) — Vista de itinerario: fila con foto cuadrada y actividades expandibles con detalle completo (2026-08-22)
- [x] En escritorio, cada día se muestra como fila con foto cuadrada a la izquierda y contenido a la derecha (verificado en back office con datos reales — Sri Lanka, Kenya)
- [x] En móvil, la foto cuadrada se alinea a la izquierda (no centrada) con el contenido debajo — `flex-col sm:flex-row` en `trip-day-card.tsx` y en la fila de día de `trip-detail.tsx`
- [x] Cada día muestra su fecha concreta junto a "Día N", antes de la ubicación
- [x] Cada actividad colapsada muestra etiqueta + hora + título en una sola línea, sin desbordar en móvil — confirmado en back office (Sri Lanka día 6: "Incluída 10:00–11:00 Fuerte de Sigiriya", "Por libre · Enrique Benavides 12:30–13:30 Masaje Ayurvédico")
- [x] La etiqueta de cada actividad usa el copy y la lógica ya implementados (Incluída/Por libre/Mi actividad en vista viajero; Por libre·nombre en back office), sin etiquetas nuevas — no se tocó la lógica, solo el layout
- [x] La etiqueta "Por libre" usa el nuevo estilo (fondo Arena, texto Ocre, borde Duna) en ambas vistas (viajero y back office)
- [x] Al pulsar una actividad, se despliega su detalle: descripción, dirección, contacto y notas cuando existen
- [x] El coste ("Precio por viajero") solo aparece en el detalle de actividades por libre, nunca en las incluidas
- [x] Un día con 6+ actividades no oculta ninguna actividad a nivel de lista; cada una se expande de forma independiente
- [x] Varias actividades pueden estar expandidas a la vez sin romper el layout (estado independiente por `id` en un `Set`)
- [x] Sin regresión en la lógica de permisos, participantes ni visibilidad de #151 (cambio puramente de presentación; la rama `isItinerary` de `day-activities-panel.tsx` quedó intacta)
- [x] Sin regresión en el toggle "Incluida"/"Por libre" del sheet de edición de actividad — validado por Quique
- [x] La vista de itinerarios (plantillas sin fechas) no se ve afectada por este cambio — `day-activities-panel.tsx` mantiene una rama separada sin acordeón para `isItinerary`
- [x] Validado en dispositivo móvil real por Quique

**Corrección de fidelidad al mockup (2026-08-22, segunda pasada):** la primera implementación no incluía el prototipo HTML de la tarjeta (se añadió después). Al comparar contra `lugendo-itinerario-prototipo-v2.html`, se corrigió: badges como chips rectangulares (radio 5px) en mayúsculas —"Incluída" en Índigo sólido con texto Arena, ya no un pill con fondo claro—; se eliminó el punto circular con emoji de categoría y la línea de timeline vertical, sustituidos por una lista plana con borde superior sutil entre actividades; hora en color Ocre (antes Terracota) y chevron en Ocre (antes gris); el detalle expandido pasó de líneas con emoji (📍🏢💶) a filas "Etiqueta: valor" (Dirección → Coste → Contacto, en ese orden) sin iconos, con las notas en una caja destacada aparte (fondo Arena); la cabecera del día pasó a "DÍA N" en Terracota mayúsculas + fecha y ubicación en Ocre en una sola línea (antes el back office usaba un badge cuadrado de número). Verificado en navegador contra datos reales (Sri Lanka) en escritorio y a 375px de ancho.

**Correcciones tras validación real de Quique (2026-08-22, tercera pasada):**
- Cada día en back office pasó de vivir en un único panel dividido (`divide-y`) a ser su propia tarjeta blanca con radio/sombra y separación, igual que en el mockup y que en la vista de viajero (que ya tenía este patrón).
- El rango de horas ("16:00 – 17:30") se partía en 3 líneas por un ancho fijo de 38px pensado para una hora simple; corregido con ancho natural + `whitespace-nowrap`.
- En el pasaporte del viajero, la foto cuadrada solo acompañaba a la cabecera (Día N + título) y las secciones de Hoteles/Actividades quedaban a ancho completo debajo, "huérfanas" de la foto — corregido para que la foto acompañe a todo el contenido del día, como ya hacía correctamente el back office.
- Añadido un botón explícito de colapsar (chevron) junto a la cabecera del día en el pasaporte del viajero, ya que la foto cuadrada (a diferencia del banner ancho anterior) no sugiere que sea pulsable para colapsar.

**Validado end-to-end por Quique en producción (2026-08-22).** Tarjeta de Notion movida a Completed.

**Nota técnica:** se añadió el campo `description` (descripción del catálogo de actividades) a `TripDayActivityItem`/`DayActivity`, que no se exponía antes en la API pese a existir ya en la tabla `activities` — sin migración de schema, solo openapi.yaml + codegen + `trips.ts` + `traveler.ts`.

### #158 — Corregir solape de horas en móvil y completar campos en el alta de actividades (2026-08-22)
- [x] Investigación previa: el solape era el mismo patrón (`grid grid-cols-2 gap-3` sin variante responsive) en `activity-detail-sheet.tsx` y `free-activity-sheet.tsx`; `dayActivityInput.ts` ya soportaba `endTime`, `companyContact`, `addressOverride`, `included`, `transportMode`, `costAmount` — sin cambios de backend/OpenAPI
- [x] En móvil (viewport ≤375px), los inputs de hora de inicio/fin no se solapan ni se recortan, en la ficha de edición y en la hoja de actividad libre — verificado en navegador contra un viaje real (`activity-detail-sheet.tsx`, midiendo `getBoundingClientRect()`: ambos inputs a 375px de ancho, mismo `x`, `y` distinto → apilados sin overlap). `free-activity-sheet.tsx` recibió el mismo cambio de clase (`grid-cols-1 sm:grid-cols-2`, patrón ya usado en `traveler-tag-selector.tsx`) pero no se pudo abrir esa hoja concreta en esta sesión por no tener cuenta de viajero válida en local — mismo patrón, sin verificación visual directa en ese componente
- [x] En escritorio, ambos inputs de hora se siguen viendo lado a lado como antes — verificado (mismo `y`, `x` consecutivos sin solape)
- [x] Al dar de alta una actividad nueva en un viaje, se pueden rellenar: hora de inicio, hora de fin, empresa/contacto, dirección, transporte, tipo (incluida/por libre) y coste por persona si es por libre — verificado en navegador contra el viaje real "Sri Lanka Agosto 2026 (Quique)": los 4 campos nuevos (`endTime`, `companyContact`, `addressOverride`, `transportMode`) se guardaron correctamente en el `POST` (confirmado en la respuesta de la API), y el toggle "Por libre" mostró/ocultó el campo de coste correctamente
- [x] Los valores rellenados en el alta se guardan correctamente y aparecen ya presentes al abrir la ficha de edición justo después de crear la actividad — verificado leyendo los `value` del DOM de la ficha de edición recién abierta: hora de inicio, hora de fin, empresa/contacto y dirección coincidían exactamente con lo introducido en el alta
- [x] El alta de actividades dentro de un itinerario (sin fechas) sigue mostrando solo los campos actuales (nombre, ciudad, país, categoría, notas) — no se le añaden los campos nuevos — verificado en navegador sobre el itinerario real vinculado
- [x] El modo "Vincular actividad existente" sigue funcionando igual que antes — no tenía el patrón de grid de horas (solo un campo de hora de inicio), así que no aplicaba el fix de solape; no se tocó
- [x] Confirmado (no regresión): el toggle "Por libre" en el alta respeta la misma regla de permisos ya existente en el backend (`routes/trips.ts`, tarea #151) que en la edición — un admin/manager recibe 403 "No tienes permiso para crear actividades por libre en este viaje" al intentar crear una actividad por libre (solo `agent` o `traveler` no-guest pueden); comportamiento idéntico al de la ficha de edición, no introducido por esta tarea
- [x] `pnpm run typecheck` limpio (api-server + lugendo-app)
- [x] Datos de prueba (1 actividad de catálogo creada y vinculada a un día real del viaje "Sri Lanka Agosto 2026", más una segunda fila de catálogo huérfana del intento fallido por el 403 anterior) eliminados al terminar por API autenticada — sin rastro en la base real

### Fix — El error al usar un código de invitación/compartición era siempre genérico (2026-08-14)
- [x] **Origen**: reporte de un código de invitación de agencia que "no funciona" para amaiaar84@hotmail.com en un viaje a Sri Lanka — sin acceso a la base de datos real desde aquí no se pudo ver la fila real, pero se encontró que `handleJoin` (`traveler-trip-wizard.tsx`, pantalla "¿Te han invitado a un viaje?") ocultaba siempre el motivo real del fallo: probaba el código primero como invitación de agencia y, si fallaba por CUALQUIER motivo (código ya usado, email de la cuenta no coincide con el invitado, etc.), lo intentaba de nuevo como código de compartición personal — que también fallaba (normalmente con 404, al no ser ese tipo de código) — y mostraba siempre el mismo mensaje genérico "Código no válido o ya utilizado", sin importar cuál de los dos motivos reales hubiera sido
- [x] Fix: solo se reintenta como compartición personal cuando el primer intento falla con 404 (código no encontrado como invitación de agencia). Si el código SÍ existe como invitación pero falla por otro motivo (ya aceptado, email no coincide), se muestra ese motivo específico directamente, usando el `{error: "..."}` que ya devuelve el backend (mismo patrón `getApiErrorMessage` que ya usa el resto de la app)
- [x] De paso, se localizan a español dos mensajes de error del backend que quedaban en inglés (`invitations.ts`: "Invitation not found" → "Código no encontrado", "Already accepted" → "Este código ya fue usado") — antes no se veían nunca porque el frontend los descartaba; ahora si se ven
- [x] `pnpm run typecheck` y `pnpm run build` (frontend + backend) limpios
- [ ] **Pendiente**: no se pudo confirmar la causa real del caso de Amaia sin acceso a la base de datos — validar tras desplegar pidiéndole que reintente el código y reportando el mensaje de error específico que aparece ahora
- [ ] Probar los tres motivos de fallo por separado: código inexistente, código ya aceptado, código de invitación válido pero con una cuenta logueada con otro email
- [ ] Confirmar que un código de compartición personal (no de agencia) sigue funcionando igual que antes

### Fix — Botón de editar día "no respondía" en iPhone (2026-08-06)
- [x] **Diagnóstico real** (confirmado en dispositivo con el usuario, tras descartar un primer diagnóstico equivocado sobre `pointer-events` en iOS Safari): el lapicero sí abre el formulario de edición del día — el problema es que ese formulario inline se renderiza en `trip-day-card.tsx` **después de toda la lista de actividades del día**, mientras que el botón está arriba, sobre la foto. En un día con varias actividades esto lo empuja fuera de la pantalla en móvil sin ningún scroll automático, así que tocar el lápiz parecía no hacer nada
- [x] Fix de UX: al abrirse el formulario (`dayEditOpen`), un `useEffect` hace `scrollIntoView({ behavior: "smooth", block: "nearest" })` sobre él, llevando al usuario hasta el formulario en vez de dejarlo enterrado fuera de vista
- [x] Se revisó el equivalente en el back office (`trip-detail.tsx`) — ahí el formulario de edición *sustituye* al panel de actividades/hotel en el mismo sitio en vez de aparecer después, así que no tiene este problema y no necesitó cambios
- [x] De paso, se dejó un pequeño endurecimiento defensivo en `DayPhotoZone` (`pointer-events-none` en la imagen/icono decorativos de fondo) del primer diagnóstico descartado — no era la causa real, pero es una mejora inocua y correcta por sí misma, así que se mantiene
- [x] `pnpm run typecheck` y `pnpm run build` limpios
- [ ] **No se pudo probar en un iPhone real en este contenedor** — el fix de scroll se verificó por lectura de código, no en dispositivo (el diagnóstico sí lo confirmó el usuario en su iPhone). Validar tras desplegar: en un viaje propio con varias actividades en un día, activar "Editar", tocar el lápiz sobre la foto de ese día y confirmar que la pantalla se desplaza automáticamente hasta el formulario "Editar información del día"
- [ ] Confirmar que con un día sin actividades (formulario cerca del botón) el scroll no se nota/molesta

### Mejora — "Compartir con todos" incluye a futuros viajeros del viaje (Notas, Documentos, Enlaces, Actividades) (2026-08-06)
- [x] **Diagnóstico**: "Compartir con todos" era un snapshot de una sola vez — insertaba filas de compartición solo para quien ya fuera miembro del viaje en ese momento. Confirmado también que aceptar una invitación o compartición no hacía ningún backfill de contenido ya compartido. Actividades ("por libre", #151) no tenía ni siquiera la opción de compartir en bloque — se añade como funcionalidad nueva con la misma lógica desde el principio
- [x] Nueva columna `shared_with_all` (boolean, default false) en `trip_notes`, `trip_documents`, `trip_links` y `trip_day_activities` — marca la intención "compartir con todos, incluidos quienes se unan después"
- [x] Enfoque elegido: marca + backfill al unirse (no visibilidad dinámica por flag) — preserva exactamente el comportamiento actual: la lista de "compartido con" sigue mostrando destinatarios reales, y "salir" individual sigue funcionando igual, tanto para quien se unió antes como después
- [x] Al aceptar una invitación de agencia (`POST /invitations/:code/accept`) o una compartición de viajero tipo "member" (`POST /me/shares/:shareCode/accept`, excluye "guest" — mismo criterio que ya excluye a los invitados de `listTripMembers` en todos los pickers) se ejecuta `backfillSharedWithAll`: inserta la fila de compartición/participante en todo lo marcado `shared_with_all` de ese viaje, para el nuevo miembro
- [x] El botón "Compartir con todos (N)" del selector de destinatarios (notas/documentos/enlaces) y el nuevo botón equivalente en el picker de participantes de actividades por libre marcan `shared_with_all = true` además de compartir con los miembros actuales; se ve un chip "Todos (futuros incl.)" cuando está activo
- [x] El botón "Compartir todas/todos" (bulk cross-elemento de notas/documentos, ver entrada anterior) también marca cada elemento como `shared_with_all` al rellenar sus huecos
- [x] **Fix post-validación**: "Compartir con todos" solo se mostraba con 2+ viajeros disponibles para añadir (umbral heredado de cuando la opción era solo un atajo de bulk-add). Con el nuevo significado ("incluye a quien se una después"), la opción aporta valor real aunque solo falte 1 viajero por compartir, así que el umbral baja a 1+ en los cuatro pickers (notas/documentos/enlaces/actividades)
- [x] Migración SQL generada (`0027_absurd_power_man.sql`, 4 `ALTER TABLE ... ADD COLUMN` con `DEFAULT false NOT NULL`, aditiva, sin tocar columnas existentes)
- [x] `pnpm run typecheck` y `pnpm run build` (frontend + backend) limpios en todo el monorepo
- [ ] **No se pudo probar en vivo en este contenedor** — sin `.env` no se pudo levantar el servidor contra la base real; verificado por lectura de código, typecheck y build
- [ ] Validar tras desplegar: compartir una nota/documento/enlace/actividad "con todos", invitar a un viajero nuevo al viaje, aceptar la invitación desde su cuenta y confirmar que ya ve ese contenido sin que nadie lo comparta manualmente
- [ ] Confirmar que un "Invitado" (guest, acceso de solo inspiración) que acepta una compartición NO recibe el backfill — sigue excluido igual que del resto de pickers
- [ ] Confirmar que quitar a alguien individualmente de un elemento marcado "compartido con todos" sigue funcionando (no se le vuelve a añadir automáticamente salvo que vuelva a unirse al viaje)
- [ ] En el picker de participantes de una actividad por libre, probar "Compartir con todos (N)" y confirmar que aparece el chip "Todos (futuros incl.)"

### Nueva funcionalidad — "Enlaces" dentro de Documentos (2026-08-05)
- [x] Nuevas tablas `trip_links` y `trip_link_shares`, replicando exactamente el patrón de ownership/cascade de `trip_documents`/`trip_document_shares` (#153) — sin tocar esas tablas ni su código. A diferencia del `autor_tipo` propuesto originalmente, el rol del creador se resuelve por join a `users.role` en tiempo de lectura (igual que `uploaderRole` en Documentos), evitando un campo redundante que pueda quedar desincronizado
- [x] Reglas de visibilidad idénticas a Documentos: enlace de agencia visible para todo el viaje; enlace de viajero privado salvo compartición explícita; compartido aparece en "Mis enlaces"; destinatario puede abandonar libremente (sin coste asociado). Resolución siempre en el backend (`GET /me/trips/:tripId/links`), nunca filtrada en el cliente
- [x] Back office (`agency-trip-documents.tsx`) nunca ve enlaces privados/compartidos de un viajero — mismo filtro por rol que ya usa Documentos, no una columna de origen paralela
- [x] La "foto" pública para Seguidores (#141, `buildTripPhotoSnapshot`) no se tocó y no incluye documentos ni enlaces — ya no los incluía antes de esta tarea, así que la regla se cumple sin cambios
- [x] UI: pestaña "Documentos" del viajero y del back office ahora tienen un selector "Documentos" / "Enlaces". Formulario de alta: Título (obligatorio) + URL (obligatoria, normalizada a `https://` si falta el esquema y validada en el backend). La URL en crudo nunca se muestra, solo el título (enlace clicable, abre en pestaña nueva)
- [x] Icono por plataforma derivado del hostname en tiempo de lectura (`lib/link-platform.ts`), sin persistir campo tipo/plataforma: YouTube (youtube.com/youtu.be), Google Drive (drive.google.com), Instagram (instagram.com), resto → icono genérico
- [x] `pnpm run typecheck` y `pnpm run build` (frontend + backend) limpios en todo el monorepo
- [x] Migración SQL generada (`0026_early_king_bedlam.sql`, crea `trip_links` y `trip_link_shares` con sus FKs en cascada, sin tocar tablas existentes) — `drizzle-kit generate` solo necesita `DATABASE_URL` como string para pasar la validación de config, no una conexión real, así que sí se pudo generar aquí aunque `migrate` no. El servidor la aplica sola al arrancar (ver "Deploying to production" en CLAUDE.md); no hace falta ningún paso manual al desplegar
- [ ] **No se pudo probar en vivo en este contenedor** — sin `.env` no se pudo levantar el servidor contra la base real; verificado por lectura de código, typecheck y build
- [ ] Validar tras desplegar: crear un enlace propio como viajero, confirmar que aparece en "Mis enlaces" con icono genérico, compartirlo con otro viajero y confirmar que aparece en su vista
- [ ] Crear un enlace de YouTube/Google Drive/Instagram y confirmar que se muestra el icono correcto
- [ ] Como agencia (admin/manager/agent), crear un enlace y confirmar que es visible para todos los viajeros del viaje, y que el viajero no puede editarlo/eliminarlo
- [ ] Confirmar que un viajero nunca ve el back office con sus enlaces privados, y que el JSON de "la foto" para Seguidores no incluye documentos ni enlaces
- [ ] Pegar una URL sin `https://` (p. ej. `youtube.com/watch?v=abc`) y confirmar que se guarda correctamente con el esquema añadido; probar una URL inválida y confirmar que el formulario la rechaza

### Mejora — Botón "Compartir todas/todos" para notas y documentos propios del viajero (2026-08-05)
- [x] Nuevo botón "Compartir todas" (Notas) / "Compartir todos" (Documentos), en índigo, junto a "Nueva nota"/"Subir archivo" — comparte de una vez todas las notas/documentos propios del viajero con los viajeros del mismo viaje que aún no tienen acceso
- [x] Solo rellena huecos: nunca quita a nadie ni comparte más allá de lo ya compartido — si el dueño excluyó a alguien a propósito en un elemento concreto, esta acción no lo vuelve a añadir ahí
- [x] Diálogo de confirmación antes de ejecutar, con el recuento real de elementos y viajeros afectados; si ya está todo compartido, muestra un mensaje informativo en vez de la confirmación
- [x] Se oculta cuando no aplica: sin notas/documentos propios, o si el viaje solo tiene 1 viajero
- [x] `pnpm run typecheck` limpio
- [ ] **No se pudo probar en vivo en este contenedor** — no hay `.env` configurado para levantar los servidores aquí; verificado por lectura de código y typecheck
- [ ] Validar en producción: en un viaje con varios viajeros y varias notas/documentos propios sin compartir del todo, pulsar "Compartir todas/todos", confirmar el recuento mostrado y verificar que tras confirmar todos los viajeros ganan acceso a los elementos que les faltaban
- [ ] Confirmar que una nota/documento donde ya excluiste a alguien a propósito no lo vuelve a compartir con esa persona tras usar el botón bulk
- [ ] Con todo ya compartido, el botón sigue visible pero el diálogo muestra "ya está todo compartido" sin acción de confirmar
- [ ] Con un solo viajero en el viaje (o sin notas/documentos propios), el botón no aparece

### Mejora — Opción "Compartir con todos" al elegir destinatarios de notas y documentos (2026-08-05)
- [x] El selector de destinatarios (`resource-share-panel.tsx`, compartido por Notas y Documentos del viajero) ya aceptaba un array de `travelerIds` de punta a punta (prop `onAdd`, mutaciones `addShares` y endpoint backend, que ya filtra IDs válidos y excluye al propio dueño) — solo el picker de un solo click por viajero, sin opción de bulk
- [x] Se añade "Compartir con todos (N)" como primera opción del desplegable, visible solo cuando quedan 2+ viajeros disponibles por añadir; añade a todos los que faltan en una sola llamada
- [x] `pnpm run typecheck` limpio
- [ ] **No se pudo probar en vivo en este contenedor** — no hay `.env` configurado para levantar los servidores aquí; verificado por lectura de código y typecheck
- [ ] Validar en producción: en un viaje con varios viajeros, abrir el selector de destinatarios de una nota o de un documento propio y confirmar que "Compartir con todos" añade a todos los que faltan de una vez
- [ ] Con solo 1 viajero disponible para añadir, la opción "Compartir con todos" no aparece (queda solo el ítem individual)
- [ ] Añadir individualmente después de usar "Compartir con todos" sigue funcionando igual (sin duplicados, sin errores)

### Fix — Nombre de la actividad no era editable en el panel rápido de día (2026-08-05)
- [x] **Diagnóstico**: el panel de detalle/edición de actividad (`activity-detail-sheet.tsx`, usado desde el detalle de viaje y de itinerario) permitía editar dirección, duración, horario, notas, etc., pero el nombre de la actividad se mostraba como texto estático en la cabecera — sin campo para cambiarlo. El backend ya soportaba renombrar en ambos casos (`ActivityUpdate.name` para actividades de catálogo — ya usado por este mismo panel para dirección/duración —, y `TripDayActivityUpdate.activityTitle` para actividades "Por libre" del viajero, ya validado en el backend aunque no expuesto en el frontend)
- [x] Actividades de catálogo (agencia/itinerario): campo "Nombre" en la sección "Datos generales de la actividad", guarda vía `PATCH /activities/:id` — cambia el nombre en el catálogo compartido (mismo alcance que ya tenían dirección/duración ahí)
- [x] Actividades "Por libre" del viajero (sin vínculo a catálogo): campo "Nombre" en "Detalles para este día", guarda vía `PATCH` del enlace día-actividad del viaje (`activityTitle`, por viaje, no afecta a otros viajes)
- [x] `pnpm run typecheck` limpio
- [ ] **No se pudo probar en vivo en este contenedor** — no hay `.env` configurado para levantar los servidores aquí; verificado por lectura de código y typecheck
- [ ] Validar en producción: renombrar una actividad de catálogo desde el panel de un viaje y confirmar que el nuevo nombre aparece en todos los viajes/itinerarios que la usan
- [ ] Validar en producción: renombrar una actividad "Por libre" añadida por un viajero y confirmar que solo cambia en ese viaje
- [ ] Sin regresión en el resto de campos del panel (dirección, duración, horario, notas, participantes, coste)

### Fix — Enlace de "restablecer contraseña" llevaba a login en vez de al formulario de reset (2026-08-05)
- [x] **Diagnóstico** (reportado por un usuario): el fix del 2026-07-30 (commit `0b67a34`) cambió el enlace de reset de query-string (`/reset-password?token=...`) a segmento de ruta (`/reset-password/:token`) para evitar que Resend/Gmail corrompieran el `=` en tránsito. El router (`App.tsx`) y la página (`reset-password.tsx`) se actualizaron, pero **dos sitios se quedaron sin migrar**:
  1. `use-auth.tsx`: el guard de rutas públicas comparaba `location === "/reset-password"` por igualdad exacta, así que nunca reconocía `/reset-password/<token>` como pública — el usuario deslogueado que pulsa el enlace es redirigido a `/login` antes de que la página de reset llegue a renderizar (el síntoma exacto reportado)
  2. `users.ts` (email de alta de usuario de agencia, `sendAgencyOnboardingEmail`): seguía generando el formato antiguo `/reset-password?token=...`, que con el router actual resuelve a un token vacío y muestra "Este enlace no es válido"
- [x] Fix 1: `use-auth.tsx` — `isPublicRoute` pasa a comparar por prefijo (`location.startsWith("/reset-password")`), igual que ya se hacía para `/foto/` y `/traveler`
- [x] Fix 2: `users.ts` — `activateUrl` usa el mismo formato de ruta que `auth.ts` (`/reset-password/${passwordResetToken}`)
- [x] `pnpm run typecheck` limpio
- [ ] **No se pudo probar en vivo en este contenedor** — no hay `.env` configurado (`DATABASE_URL`/`SESSION_SECRET`) para levantar `api-server` localmente aquí; verificado solo por lectura de código y trazado del flujo completo (enlace generado en backend → ruta del router → guard de `use-auth.tsx` → página `reset-password.tsx`)
- [ ] Validar en producción tras desplegar: solicitar "Olvidé mi contraseña", pulsar el enlace del email real (incluido en Safari de iPhone, que es donde se reportó el bug), confirmar que se queda en el formulario de nueva contraseña sin pasar por login, y que el login posterior funciona con la contraseña nueva
- [ ] Validar el flujo de alta de usuario de agencia (Equipo → Crear usuario con rol no-viajero): el email de activación lleva al mismo formulario de nueva contraseña correctamente

### Fix — Campo Contraseña bloqueado en Safari de iPhone en /login y /register (2026-08-04)
- [x] Diagnóstico: los campos de Contraseña (login), Contraseña y Confirmar contraseña (registro) seguían siendo inputs controlados por react-hook-form (`{...field}` con `value={field.value}`) — el mismo patrón ya diagnosticado y corregido para el campo Email el 2026-07-29 (commit `9c147dd`), pero nunca aplicado a los de contraseña. En Safari, el autofill/Keychain escribe en el DOM sin disparar el evento `input`, así que el `value` controlado revierte el campo y bloquea el tecleo posterior
- [x] Aplicado el mismo fix que en Email: los 3 campos pasan a no controlados (`defaultValue` + `onChange`/`onBlur` manuales), conservando `name` para que `syncDomValueIntoForm` los siga sincronizando al enviar el formulario
- [x] `pnpm run typecheck` limpio
- [ ] Validado por Quique en Safari de iPhone/iPad: escribir la contraseña en `/login` funciona a la primera tecla
- [ ] Validado por Quique en Safari de iPhone/iPad: escribir Contraseña y Confirmar contraseña en `/register` funciona igual
- [ ] Sin regresión en Chrome de escritorio/móvil ni en Safari de escritorio (mostrar/ocultar contraseña, pegar, Llavero)
- [ ] Login y registro completan correctamente de principio a fin, con la contraseña introducida conservada

### #155 — Perfil de viajero compartible: etiquetas, foto y privacidad (2026-08-03)
- [x] **Cambio de alcance (2026-08-03, pedido por Quique):** se elimina el límite de 2 etiquetas de estilo / 8 de intereses. Un viajero puede seleccionar cualquier número de etiquetas de cada eje; solo se rechaza (409 `AlreadyTagged`) volver a añadir una etiqueta ya seleccionada. La sección "Perfil compartible" del perfil del viajero pasa a ser colapsable (cerrada por defecto, con resumen "X de 4 activados" en la cabecera)
- [x] Las 38 etiquetas del catálogo aparecen con su descripción en el selector — verificado en navegador (9 estilo + 29 intereses agrupadas en 4 familias visuales: Naturaleza y aire libre, Cultura e historia, Ciudad y ocio, Enfoque personal)
- [x] Un compañero de viaje ve el perfil según los tres interruptores del dueño — verificado con dos cuentas desechables compartiendo un viaje: el compañero vio países visitados y etiquetas (activados) pero no países deseados (desactivado)
- [x] Al desactivar "países visitados", ese bloque desaparece para todos los observadores de inmediato — la resolución de visibilidad ocurre en cada petición, sin caché
- [x] Un viajero sin viaje en común y sin relación de favorito recibe 403 al pedir el perfil por URL directa — verificado con una tercera cuenta sin viaje compartido
- [x] La foto se ve siempre que se ve el perfil, sin interruptor propio — verificado subiendo una foto real (sharp la redimensionó a 512×512 JPEG) y descargándola como el compañero
- [x] Sin foto subida, se muestran las iniciales — verificado en navegador
- [x] Sin consentimiento a la agencia, el back office no ve ninguna etiqueta del viajero — verificado como admin y como manager
- [x] Con consentimiento, agente y guía local ven las etiquetas individuales — verificado como manager de la misma agencia que el viaje del viajero (con un viaje de otra agencia, correctamente denegado con 403 hasta que hay un viaje que coincide)
- [x] La agencia no ve países visitados ni deseados en ningún caso — estructuralmente garantizado, el endpoint de agencia solo devuelve etiquetas
- [ ] La foto para Seguidores (#141) no incluye ningún dato de perfil de ningún viajero — no se tocó el código de #141 en esta tarea, se asume intacto por no haberlo modificado; sin verificación visual explícita
- [x] Al revocar el consentimiento, la agencia deja de ver las etiquetas de inmediato — verificado con `curl`
- [ ] Al eliminar un viajero de un viaje, deja de ver los perfiles de los demás si no le queda ningún viaje en común — lógica implementada (companions se recalculan en cada petición, no se cachean), pero no probado con el flujo real de "eliminar viajero de un viaje"
- [x] Toda la resolución de visibilidad ocurre en la query del backend; el frontend nunca recibe datos que deba ocultar — los campos ausentes (`visitedCountries`, `wantedCountries`, `tags`) directamente no vienen en la respuesta cuando el interruptor está desactivado
- [x] `pnpm run typecheck` y `pnpm run build` limpios (api-server + lugendo-app; el fallo de `mockup-sandbox` es preexistente y no relacionado, requiere `PORT` en su `vite.config.ts`)
- [x] Verificado en navegador contra la base real con cuentas y viajes desechables (creados y eliminados por SQL directo, sin dejar rastro): toggles, selector de etiquetas, subida de foto con recorte, perfil de compañero, columna "Etiquetas" en back office

### #152 — Crear un viaje propio a partir de un viaje compartido (2026-08-01)
- [x] Investigación previa: reutiliza `buildTripPhotoSnapshot`/`materializeTripFromSnapshot` (`traveler.ts`, tarea #141) sin escribir un segundo copiador — se llaman directamente desde el nuevo endpoint en el mismo archivo, sin necesidad de moverlas a un módulo aparte (ya comparten dependencias con otros endpoints del mismo archivo)
- [x] Acceso resuelto reutilizando `verifyTripAccessCore` (`routes/trips.ts`), que ya devolvía `memberType` ("member"/"guest"/null) — sin escribir un helper paralelo
- [x] Nuevo endpoint `POST /me/trips/:tripId/use-as-template`: exige un `trip_shares` aceptado (member o guest, `memberType != null`); construye el snapshot desde el punto de vista del copiador (privacidad #151 ya aplicada); copia días/hoteles/actividades incluidas + por-libre propias del copiador; copia las notas visibles para el copiador (propias + compartidas vía `trip_note_shares`) como notas nuevas independientes (`copyVisibleTripNotes`); no copia documentos; clasifica el resultado como "compartido" (#140)
- [x] Campo nuevo `myMemberType` en `GET /me/trips/:tripId` para distinguir el copy del botón: "Usar como base para un viaje mío" (Invitado) vs "Duplicar viaje" (Miembro) — misma llamada de API en ambos casos, solo cambia la etiqueta
- [x] Frontend (`traveler-trip.tsx`): banner + botón bajo la cabecera del viaje, visible solo cuando `!isOwner && trip.myMemberType`; éxito navega al viaje nuevo con toast de confirmación
- [x] `openapi.yaml` + Orval regenerados (`useUseSharedTripAsTemplate`); `pnpm run typecheck` y `pnpm run build` limpios (api-server + lugendo-app; el fallo de `mockup-sandbox` es preexistente y no relacionado, requiere `PORT` en su `vite.config.ts`)
- [x] **Verificado end-to-end en el navegador** con dos cuentas desechables creadas por SQL directo (owner + guest, sin pasar por Resend) y un viaje de prueba con: actividad incluida, actividad por-libre del owner, actividad por-libre del guest, nota privada del owner, nota compartida con el guest. Como Invitado (`guest`): banner con el copy correcto, clic creó el viaje nuevo, y el itinerario copiado mostró la actividad incluida + la actividad por-libre propia del guest, **sin la actividad privada del owner**; en Notas, solo apareció la nota compartida, no la privada. Cambiando el share a `member`: el copy pasó a "Duplicar viaje" y la llamada directa al endpoint repitió el mismo resultado correctamente (201)
- [x] Verificado 403 al llamar el endpoint sobre un `tripId` sin `trip_shares` aceptado para el usuario
- [x] Datos de prueba (2 usuarios, 1 viaje original, 2 copias, hotel/actividades de catálogo) eliminados al terminar, sin dejar rastro en la base real

### #142 — Unificar el alta de viaje de agencia/admin con el wizard del viajero (2026-08-01)
- [x] Investigación previa: el precedente citado en la ficha de Notion (tarea #134, "reutilizar UI de subida de itinerarios") solo compartía un módulo de utilidades puras (`lib/pdf-day-autofill.ts`) y el endpoint `POST /itineraries/parse-pdf`, no un componente de wizard — no había precedente real de componente compartido en este código
- [x] Decisión de arquitectura confirmada con Quique: extraer piezas compartidas (`components/trip-itinerary-wizard/`: `wizard-stepper.tsx`, `itinerary-upload-panel.tsx` + `use-itinerary-import.ts`, `hotel-inline-panel.tsx`/`activity-inline-panel.tsx` + `use-day-assignment.ts`, `types.ts`) en vez de fusionar en un único componente — `trip-wizard.tsx` (1397→997 líneas) y `traveler-trip-wizard.tsx` (1261→859 líneas) siguen siendo dos páginas separadas, ahora compuestas a partir de las piezas compartidas, sin duplicación real de UI/lógica
- [x] Efecto colateral corregido: el alta inline de hotel ahora expone teléfono/web en ambos contextos (antes solo en agencia) y el alta inline de actividad ahora expone categoría en ambos contextos (antes solo en agencia) — mismo formulario compartido
- [x] `pnpm run typecheck` limpio (monorepo completo) y `pnpm --filter @workspace/lugendo-app run build` exitoso
- [x] **Verificado en producción (lugendo.io) con la cuenta real de Quique, ya logado como viajero** — recorrido completo del wizard de viajero: Inicio → "Crear viaje propio" → "Desde cero" (con los campos nombre/nº días/dificultad) → "Datos del viaje" → "Itinerario y confirmación" (resumen final correcto, sin sección de itinerario porque no hay `parsedItinerary`, como se espera) → "Crear viaje" creó el viaje real (`POST /me/trips`) sin errores de consola de la app. Se comprobó que aparecía correctamente en "Programados" (tras refrescar — el listado no se revalida solo al volver del wizard, un comportamiento preexistente no relacionado con esta tarea) y se eliminó el viaje de prueba al terminar, dejando la cuenta como estaba
- [x] **Verificado en producción con una cuenta de agencia real (sobre la versión de 7 pasos, antes de la reducción a 4 descrita abajo)** — `/trips/new` → "Partir de un itinerario" → seleccioné el itinerario real "Kenya Safari – 6 Nights 7 Days" → Fechas → Vuelos → Nombre → **Itinerario detallado con los días reales del itinerario**: probé "Nuevo" en el día 1 → `HotelInlineCreatePanel` (variante agencia, sin selector de catálogo redundante ya que existe el `<Select>` de la fila) con búsqueda web + formulario nombre/ciudad/país/dirección/**teléfono/web** → creé un hotel de prueba y quedó correctamente asignado en el `<Select>` del día. Probé "Actividad" → `ActivityInlineAddPanel` con lista de catálogo real (255+ actividades) + "Nueva actividad" → formulario con nombre/ciudad/país/**categoría** → creé una actividad de prueba con categoría "Cultural" y quedó correctamente asignada como chip. **No completé la creación del viaje** (no pulsé "Crear viaje") porque, al partir de un itinerario existente, `handleCreate` aplica los cambios de hotel/actividad directamente sobre los días del itinerario de catálogo real (no sobre una copia) — completar la creación habría dejado permanentemente el hotel/actividad de prueba en el itinerario real de la agencia. Marqué ambas entradas de catálogo creadas como Inactivo/Inactiva (no hay borrado duro en la UI) para no dejar basura de prueba
- [x] **Ampliación de alcance**: Quique aclaró que el objetivo real era reducir el wizard de agencia de 7 a 4 pasos, igual que el del viajero (no solo compartir código sin tocar la UX). Se eliminó el paso "Vuelos" (los vuelos ya se pueden añadir después desde `FlightEditPanel` en la ficha del viaje, igual que para el viajero desde la #110); se fusionó Fechas+Nombre en "Datos del viaje"; se fusionó Itinerario detallado+Invitaciones+resumen final en "Crear". `trip-wizard.tsx` queda con la misma estructura de 4 pasos que `traveler-trip-wizard.tsx`. `pnpm run typecheck` limpio tras el cambio
- [x] **Recorrido completo de los 4 pasos nuevos verificado en producción con la cuenta de agencia real** — Origen → "Crear itinerario nuevo" → Programa (Desde cero) → "Datos del viaje" (nombre+fechas+capacidad+descripción, todo junto y funcionando) → "Crear" (sin itinerario detallado porque no hay días en un itinerario scratch nuevo, "Sin días definidos" como se espera; emails de invitación + resumen final correctos) → "Crear viaje" creó un viaje real de principio a fin (`POST /trips` + itinerario nuevo). Se confirmó además que `FlightEditPanel` en la ficha del viaje sigue permitiendo añadir un vuelo después de crear el viaje (formulario ida/vuelta completo, sin regresión). Se limpiaron los datos de prueba: viaje marcado "Cancelado" e itinerario marcado "Inactivo" (sin borrado duro disponible para ninguno de los dos en la UI)
- [ ] **Import PDF/DOCX/XLSX no probado** (ni agencia ni viajero) — el navegador solo permite subir archivos ya compartidos con la sesión, y no había ninguno disponible; el panel de subida (`ItineraryUploadPanel`) se verificó visualmente (dropzone, textos) pero no el flujo completo de análisis con IA
- [ ] Agencia: el envío real de "Crear viaje" de principio a fin con invitaciones (no se completó por la razón indicada arriba) — pendiente de repetir con un itinerario de prueba desechable, o que Quique lo confirme directamente
- [ ] Viajero: unirse con código y usar foto compartida sin cambios de comportamiento (incluye el colapso visual del Stepper a 2 pasos) — no probado, requeriría un código de invitación/foto real
- [ ] Toggle de noche en tránsito — no probado explícitamente (el botón está presente y sin errores visuales en ambos wizards, pero no se verificó el efecto tras guardar)
- [ ] Smoke-test de los 2 puntos de importación PDF no tocados (`itinerary-wizard.tsx`, `itinerary-detail.tsx`) — no deberían tener regresión al no haberse modificado su código, pero conviene confirmarlo

### #153 (Notion) — Documentos y Notas: origen agencia vs propios, compartición selectiva y salida del destinatario (2026-07-31)
- [x] Investigación previa (evitó trabajo duplicado y corrigió el alcance): `trip_documents`/`trip_notes` ya tenían `userId` como autor; el origen agencia/propio ya se derivaba sin campo paralelo en `GET /me/trips/:tripId/documents` (`uploaderRole` vía join con `users.role`) — se reutilizó el mismo patrón para notas. `verifyTripAccessCore`/`listTripMembers` (`trips.ts`) ya existían y ya excluían invitados — se exportaron y reutilizaron en vez de reimplementar el chequeo de acceso
- [x] **Hallazgo no anticipado en la tarjeta**: los documentos **no tenían ninguna privacidad** — cualquier viajero con acceso al viaje veía y descargaba los documentos de cualquier otro viajero (`GET`/`download` sin filtro por autor). Esta tarea introduce la privacidad desde cero, no solo la compartición selectiva
- [x] **Hallazgo no anticipado**: **no existía el concepto de "nota de agencia"** — Notas era una función exclusiva de viajero. Se construyó desde cero: rutas `GET/POST/PATCH/DELETE /trips/:tripId/notes` en `trips.ts` (agencia) y componente `agency-trip-notes.tsx` (back office), mirror de `agency-trip-documents.tsx`
- [x] **Hallazgo no anticipado**: el back office **sí veía** documentos propios de viajeros por `GET /trips/:tripId/documents` (sin filtro), y admin/manager podían renombrar/eliminar/descargar cualquier documento (`PATCH`/`DELETE`/`download`), no solo los de agencia. Corregido: todas las rutas de agencia filtran ahora por `uploaderRole` en `["admin","manager","agent"]`
- [x] Schema: tablas `trip_document_shares` y `trip_note_shares` (patrón `trip_day_activity_participants` de la #151: FK cascade + `unique(recurso, traveler_id)`) — migración `0024_conscious_vargas.sql`
- [x] Backend documentos (`traveler.ts`): visibilidad = agencia ∪ creador ∪ compartido conmigo, resuelta siempre en la query; bloqueo a `memberType = 'guest'` en creación; `POST`/`DELETE .../documents/:id/shares` (compartir/salir); `download` corregido para exigir ser agencia, creador o destinatario
- [x] Backend notas: mismo patrón, tanto en las nuevas rutas de agencia (`trips.ts`) como en `traveler.ts` (`GET /me/trips/:tripId/notes` deja de filtrar solo por `userId` y pasa a agencia ∪ creador ∪ compartido conmigo)
- [x] Confirmado (sin cambio necesario): `buildTripPhotoSnapshot` (#141, foto para Seguidores) no serializa documentos ni notas
- [x] `openapi.yaml` + Orval regenerados: `sharedWith` en `TripDocument`/`TripNote`, `uploaderRole` en `TripNote`, endpoints de shares (documentos y notas) y CRUD de notas de agencia
- [x] Frontend viajero (`trip-documents-tab.tsx`, `trip-notes-tab.tsx`): etiqueta "Agencia", agrupador "Mis documentos"/"Mis notas" (propio + compartido conmigo), selector de destinatarios reutilizable (`resource-share-panel.tsx`, mismo patrón Popover que el selector de participantes de la #151), acción "Salir" solo para destinatarios no creadores
- [x] `pnpm run typecheck` limpio en todo el workspace
- [x] Verificado con script transaccional contra Neon (patrón #148, `ROLLBACK` explícito, cero filas persistidas, confirmado con conteo posterior a 0): 10/10 comprobaciones superadas — destinatario ve agencia+compartido; un share `permission = 'full'` que NO es destinatario solo ve el documento/nota de agencia (documentos y notas); back office nunca ve el documento/nota propio del viajero; salir quita el acceso y el creador puede volver a añadir; restricción única rechaza duplicados; borrar el documento limpia sus filas de `trip_document_shares` (cascade)
- [ ] **No verificado manualmente en el navegador** con cuentas reales — la `DATABASE_URL` local apunta a producción y no se dispone de credenciales de prueba en este entorno (ver gotcha de `CLAUDE.md`); se verificó en su lugar con el script transaccional de arriba y con `pnpm run typecheck`/`build`. Pendiente de validar visualmente por Quique: etiquetas, agrupador, selector de destinatarios y "Salir" en Documentos/Notas (viajero) y notas de agencia (back office)
- [ ] Validar en producción tras desplegar (la migración se aplica automáticamente al arrancar el servidor)
- [ ] Bloqueo de invitados (`member_type = 'guest'`) al crear documentos/notas propias y su ausencia en el selector de destinatarios — verificado por lectura de código (usa el mismo `listTripMembers` que ya excluye guests), no probado end-to-end en el navegador

### #151 (Notion) — Actividades por libre: participantes, visibilidad y coste (2026-07-30)
- [x] **Nota de numeración**: esta es la tarjeta de Notion "#151 Actividades por libre por viajero: participantes, visibilidad y coste" — colisiona con el `#151` de `BACKLOG.md` ("Mensaje de error de registro", ver entrada siguiente), son tareas distintas. Detectado por Quique al testear: "he editado una actividad por libre pero no tengo la opción de invitar a nadie" — investigación confirmó que la tarjeta de Notion figuraba como QA pero la funcionalidad nunca se implementó (sin tabla de participantes, sin selector, sin campo de coste en el código); el estado de Notion se corrigió a Planned → In progress antes de implementar
- [x] Investigación previa (evitó trabajo duplicado): `trip_day_activities.created_by_user_id` ya existía (reutilizado como autor); `trip_day_activities.included` ya existía; `trips.owner_id` ya identifica al dueño de un viaje propio; `trip_shares.permission`/`member_type` ya existían (#141). La UI de creación de actividades libres por el viajero (`free-activity-sheet.tsx`, botón "Añadir actividad libre" en `trip-day-card.tsx`) **ya existía** — no se detectó en la investigación inicial y no hizo falta construirla
- [x] Bug encontrado y corregido de paso: `getTripDayActivityMap` (`traveler.ts`) aceptaba `currentUserId` pero lo ignoraba por completo — `canEdit` estaba hardcodeado a `true` para todas las filas y no había ningún filtro de visibilidad. Cualquier viajero con acceso a un viaje compartido veía (y en teoría podía llamar a la API para editar) todas las actividades de todos los demás
- [x] Alcance acordado con Quique tras la investigación: solo `agent` (no admin/manager) puede crear actividades por libre además del propio viajero — el rol "guía local" de la #91 no existe todavía en el enum de roles y queda fuera de esta tarea; `cost_currency` se guarda fijo a `EUR` sin selector de divisa en la UI (la app no tenía multi-divisa en ningún otro sitio), pendiente de revisar en Fase I/II
- [x] Schema: `trip_day_activities` gana `cost_amount`/`cost_currency` (coste por persona); nueva tabla `trip_day_activity_participants` (única por actividad+viajero, borrado en cascada) — migración `0023_special_nomad.sql`
- [x] Backend (`trips.ts`): nuevo `canManageActivity` — actividad incluida: solo el creador del viaje (staff de la misma agencia, o dueño del viaje propio); actividad por libre: solo quien la creó. Sustituye la regla anterior ("cualquier participante puede editar" en PATCH, y un DELETE demasiado estricto que solo dejaba borrar al mismo miembro de staff que la creó). Creación de actividad incluida restringida al creador del viaje; creación de actividad por libre restringida a `agent` o viajero sin share de solo-invitado (`member_type = 'guest'`)
- [x] Backend: `listTripMembers` (owner + invitaciones aceptadas + shares aceptados `member_type = 'member'`, excluye guests) para el selector de participantes; endpoints `POST`/`DELETE .../activities/:linkId/participants` (solo el creador de la actividad) y `GET /trips/:tripId/members`
- [x] Backend: aviso blando (no bloqueante) de colisión de horario con una actividad incluida del mismo día al crear/editar una actividad por libre
- [x] Backend: visibilidad corregida en ambas rutas de lectura — la de agencia (`GET /trips/:tripId/days/:dayId/activities`) sigue devolviendo todas las actividades por libre (con autor y participantes, de solo lectura salvo las creadas por la propia agencia); la de viajero (`getTripDayActivityMap`) ahora filtra: una actividad por libre solo se devuelve a su creador o a sus participantes. El snapshot de foto para Seguidoras (`buildTripPhotoSnapshot`, #141) hereda el mismo filtro con el id de quien comparte
- [x] `openapi.yaml` + Orval regenerados: `costAmount`, `costCurrency`, `participants`, `isMine`, `createdByName`, `warning` en `DayActivity`/`TripDayActivityItem`; endpoints de participantes y de listado de miembros
- [x] Frontend: `activity-detail-sheet.tsx` — para actividades por libre, campo "Coste por persona (€)" y selector de participantes (patrón Command+Popover de `country-select.tsx`), editable solo por el creador; participantes ven la lista en solo lectura. Badge "Mi actividad" (antes "Por libre" a secas) en `trip-day-card.tsx` cuando el viajero es creador o participante; badge "Por libre · nombre" en `day-activities-panel.tsx` (vista agencia)
- [x] `pnpm run typecheck` limpio en todo el workspace
- [x] Verificado con script transaccional contra Neon (patrón #148, `ROLLBACK` explícito, cero filas persistidas): creador ve y puede gestionar su actividad; participante la ve pero no puede editarla; un share con `permission = 'full'` que NO es participante no la ve; un ajeno tampoco — 6/6 comprobaciones superadas
- [x] Verificado end-to-end en el navegador con 3 cuentas desechables (creadas y eliminadas en esta misma sesión, sin dejar rastro en datos reales): como creador, añadir un participante desde el picker (confirmado por `POST .../participants` → `201`) y guardar un coste (`PATCH` → `200`); como participante, la actividad aparece etiquetada "Mi actividad" vía `GET /me/trips/:tripId` con `canEdit: false`, `costAmount` y la lista de participantes visibles; como viajero con share `permission: 'full'` pero sin ser participante, `GET /me/trips/:tripId` devuelve `activities: []` para ese día — la actividad privada es invisible pese al permiso de edición completo
- [x] Bug corregido durante la verificación: el selector de participantes ofrecía añadir al propio creador como participante de su propia actividad (no filtraba al usuario actual) — corregido para excluirlo
- [ ] **No verificado en el navegador el lado de agencia** (badge "Por libre · nombre" en `day-activities-panel.tsx`) — el fixture de prueba era un viaje personal (sin agencia); verificado solo por tipo y lectura de código, no por recorrido real en UI
- [ ] Validar en producción tras desplegar (aplica la migración automáticamente al arrancar el servidor)
- [ ] Reconciliar con Quique la colisión de numeración `#151` entre `BACKLOG.md` y Notion (ver nota arriba) — pendiente desde antes de esta tarea

### #151 — Mensaje de error de registro más específico (2026-07-30)
- [x] Backend ya devolvía `400 { error: "Email already in use" }` (email duplicado) y `400 { error: "Validation failed", errors: fieldErrors }` (fallo de Zod) desde `POST /auth/register` — no hizo falta ningún cambio de backend, solo el frontend ignoraba el cuerpo del error
- [x] `artifacts/lugendo-app/src/pages/login.tsx`: nuevo `getRegisterErrorMessage(err)`, usado en el `onError` de `registerMutation` (`onRegisterSubmit`) — mapea `"Email already in use"` → "Ya existe una cuenta con este email. Inicia sesión o recupera tu contraseña.", `"Validation failed"` → "Revisa los datos del formulario e inténtalo de nuevo.", y cualquier otro caso (fallo de red, 500) sigue mostrando el genérico "No se pudo crear la cuenta. Inténtalo de nuevo."
- [x] `onLoginSubmit` (login) no se tocó — fuera de alcance de esta tarea, mantiene su mensaje genérico de credenciales por diseño
- [x] `pnpm run typecheck` limpio
- [x] Verificado en el navegador contra la base real: registrar con `admin@lugendo.io` (cuenta ya existente) → toast "Error al registrarse: Ya existe una cuenta con este email. Inicia sesión o recupera tu contraseña." — confirmado por `GET /api/auth/me`/network request (`400 { error: "Email already in use" }`) y por el texto renderizado en la página. El intento no crea ninguna fila (la comprobación de email duplicado corre antes del `insert`)
- [ ] Validar en producción tras desplegar: registrar con un email nuevo sigue funcionando con normalidad (sin regresión en el camino feliz)
- [ ] Un error de validación real (p. ej. sorteando el zod del cliente) muestra el mensaje "Revisa los datos del formulario..." en vez del genérico anterior

### #152 — Aprobación de registros pendientes rota: el enlace del email daba 404 y no había fallback en el admin (2026-07-30)
- [x] Causa raíz del 404 identificada: el Worker de Cloudflare (`artifacts/lugendo-app/worker.js`) que debería proxyar `/api/*` hacia Railway nunca llegaba a ejecutarse para esas rutas. Con `assets.not_found_handling: "single-page-application"`, Cloudflare sirve el fallback SPA (`index.html`) para **cualquier** ruta que no coincida con un archivo estático — incluido `/api/auth/approve/...` — en la capa de Assets, antes de invocar el `fetch` handler del Worker. Confirmado en producción: `GET https://lugendo.io/api/auth/approve/approved/<token>` devolvía `200` pero con el bundle de la SPA (`index-*.js`/`.css`), nunca llegaba a Railway; Wouter no encontraba ruta y caía en la página 404 — coincide exactamente con el síntoma reportado
- [x] Arreglo: `artifacts/lugendo-app/wrangler.jsonc` añade `"run_worker_first": ["/api/*"]` dentro de `assets`, forzando que esas rutas pasen primero por el Worker (y su proxy a Railway) en vez de por el fallback SPA. El resto de rutas siguen sirviéndose directamente desde Assets sin invocar el Worker (sin impacto de rendimiento)
- [x] Causa raíz del hueco en el admin: nunca se construyó una pantalla de fallback (tarea #152 en `BACKLOG.md`, quedó en cola desde el fix de emails del 2026-07-29). Además el endpoint `GET /users` no exponía `status` en absoluto — la tabla de Equipo mostraba "Activo" en usuarios `pending`, indistinguible de uno realmente aprobado
- [x] `status` añadido a `User` en `openapi.yaml` (antes solo vivía en `AuthUser`) y a `serialize()` en `artifacts/api-server/src/routes/users.ts`; `UserUpdate` gana un campo `status` (`approved`/`rejected`) validado en `UserUpdateSchema` — al setearlo, `PATCH /users/:userId` también limpia `approval_token`, igual que hace el enlace de email, para que ambas vías de aprobación invaliden el token de un solo uso
- [x] Frontend (`artifacts/lugendo-app/src/pages/team.tsx`): nuevo `StatusBadge` — "Pendiente de aprobación" (ámbar) / "Rechazado" (rojo) / `ActiveBadge` normal en cualquier otro caso — sustituye al `ActiveBadge` directo en la tabla de Equipo. Fila con botones ✓/✗ siempre visibles (no ocultos tras hover, a diferencia del lápiz de editar) cuando `status === "pending"`, llaman a `useUpdateUser` con `{ status: "approved" | "rejected" }`
- [x] `pnpm --filter @workspace/api-spec run codegen` regenerado tras el cambio de `openapi.yaml`; `pnpm run typecheck` limpio en todo el workspace
- [x] Verificado end-to-end contra la base real en local: cuenta admin y viajero desechables creadas por SQL directo (sin pasar por Resend), login como admin → Equipo mostraba el viajero real `viajero2@lugendo.io` (registrado el 2026-07-30, pendiente desde entonces por este mismo bug) correctamente como "Pendiente de aprobación" con botones de acción — antes invisible. Aprobar el viajero desechable lo pasó a "Activo" al instante (columna `status` en base de datos confirmada `approved`, `approval_token` a `null`); `viajero2@lugendo.io` quedó intacto, sin tocar. Cuentas desechables eliminadas al terminar, sin dejar rastro en datos reales
- [ ] **La corrección del Worker (`run_worker_first`) no se puede probar en local** — es exclusiva de la infraestructura de Cloudflare Workers en producción, el proxy `/api/` no interviene en `pnpm run dev`. Pendiente de validar por Quique tras el deploy: pulsar "Aprobar"/"Rechazar" en el email de un registro nuevo debe llevar a la página de confirmación en vez de a un 404
- [ ] Validado por Quique: aprobar/rechazar un registro real desde Equipo (no desde el email) funciona de principio a fin, y el usuario aprobado puede iniciar sesión con normalidad
- [ ] Nota para Quique: `viajero2@lugendo.io` seguía `pending` en la base de datos tras esta sesión (no se tocó a propósito, para no interferir con tu propia prueba) — apruébalo o recházalo desde Equipo cuando quieras

### #141 (mejora) — Elegir Miembro vs Invitado al compartir un viaje propio (2026-07-30)
- [x] Detectado por Quique tras el QA de #141: al compartir un viaje solo se elegía el nivel de acceso (Solo ver/Edición), sin ninguna forma de marcar si la persona es un viajero real del grupo o solo alguien que lo consulta — no existía en ningún sitio del schema ni de la UI, no era una opción escondida
- [x] Schema: nueva columna `trip_shares.member_type` (`member`/`guest`, default `guest` — no cambia el comportamiento de shares ya existentes), migración `0022_rainy_inertia.sql`
- [x] Backend: un **Miembro** por defecto tiene edición completa (se puede bajar a "solo ver" manualmente) y se clasifica Programado/Realizado por fechas, igual que el propietario; un **Invitado** siempre queda forzado a "solo ver" (el backend ignora cualquier intento de darle edición) y se clasifica Compartido — igual que antes de esta mejora
- [x] Reclasificar Miembro↔Invitado también funciona **después** de aceptado (no solo al invitar), vía `PATCH /me/trips/{tripId}/shares/{shareId}`: promocionar a Miembro corrige la clasificación con la misma lógica de upsert-protegido del fix de #140 (nunca rebaja un Programado/Realizado ya existente); degradar a Invitado fuerza la vuelta a Compartido de forma explícita (única vía de acceso de un no-propietario a un viaje personal es este share, así que es seguro)
- [x] `artifacts/api-server/src/lib/trip-classification.ts`: nueva función `setTripClassification` (sobrescritura incondicional) — documentada para usarse solo cuando se revoca deliberadamente la membresía que justificaba la clasificación anterior
- [x] `openapi.yaml` + Orval: `memberType` añadido a `TripShare`/`ShareTripInput`/`UpdateShareInput`, regenerado
- [x] Frontend (`trip-travelers-tab.tsx`): selector "Tipo de acceso" (Miembro/Invitado) en el diálogo de compartir, con el selector de permiso bloqueado en "Solo ver" cuando se elige Invitado; mismo selector añadido a cada fila de la lista de shares ya existentes para reclasificar en cualquier momento; badge de tipo de acceso siempre visible
- [x] `pnpm run typecheck` limpio en todo el workspace
- [x] Verificado con una transacción real contra Neon con rollback explícito (cero filas persistidas): aceptar como invitado → compartido ✅; promover invitado→miembro ya aceptado (viaje futuro) → programado ✅; degradar miembro→invitado ya aceptado → vuelve a compartido ✅; aceptar directamente como miembro → programado ✅
- [ ] **No probado en vivo en el navegador** (puerto 8080 ocupado por el servidor de desarrollo de otra sesión de Claude Code en este mismo checkout) — verificado solo por typecheck y transacción real contra la base de datos
- [ ] Compartir un viaje eligiendo "Miembro" → el destinatario, al aceptar, lo ve en "Programados"/"Realizados" (no en "Compartidos")
- [ ] Compartir eligiendo "Invitado" → el selector de permiso queda bloqueado en "Solo ver" y no se puede cambiar a edición
- [ ] Reclasificar un share ya aceptado de Invitado a Miembro (o viceversa) desde la lista existente actualiza la pestaña donde aparece el viaje para el destinatario
- [ ] Validar en producción tras desplegar (aplica la migración automáticamente al arrancar el servidor)

### #141 — Compartir viaje: permisos vista/edición + foto para invitada externa (2026-07-30)
- [x] Investigación previa: el modo viajero-a-viajero (vista/edición) YA estaba completamente implementado (tabla `trip_shares` con `permission` `full`/`read`, endpoints CRUD, UI en `trip-travelers-tab.tsx`, clasificación `compartido` al aceptar ya la escribía #140) — sin trabajo nuevo en esa parte, la tarjeta de Notion asumía que faltaba
- [x] Schema: nueva tabla `trip_photo_shares` (`jsonb` con el snapshot congelado, `shareCode` público único, sin FK a destinatario) — migración `0021_many_omega_red.sql` generada y aplicada en Neon
- [x] Backend: `POST/GET/DELETE /me/trips/{tripId}/photo-shares` (crear/listar/revocar, mismo patrón de autorización `canManageShares` que `trip_shares`)
- [x] Backend: `GET /trip-photos/{code}` público sin auth (ver la foto) y `POST /trip-photos/{code}/use-as-template` (crea un viaje personal nuevo y editable a partir del snapshot, clasificado `compartido` por defecto según #140)
- [x] Snapshot: reutiliza el ensamblado de días+hoteles+actividades ya usado en `GET /me/trips/{tripId}` (`getTravelerDayHotelMap`, `getTripDayActivityMap`, `mergeItineraryFallbacks`); "usar como plantilla" resuelve hoteles/actividades por nombre contra el catálogo personal (`agencyId: null`), mismo patrón que las actividades libres del viajero (#32)
- [x] `openapi.yaml` + Orval: 5 endpoints y 8 schemas nuevos documentados y regenerados
- [x] Frontend: ruta pública `/foto/:code` (`trip-photo-view.tsx`) — vista de solo lectura, exenta del guard de auth global (`use-auth.tsx`), con CTA "Usar como plantilla" (directo si ya hay sesión de viajero, o enlaces a login/registro con el código en la URL si no)
- [x] Frontend: sección "Fotos para invitadas" en `trip-travelers-tab.tsx` (crear/copiar enlace/revocar), junto a los shares existentes
- [x] Frontend: tercera opción "Usar una foto compartida" en el wizard de alta de viaje (`traveler-trip-wizard.tsx`), con prefill automático del código si se llega desde `/foto/:code` → "Crear mi cuenta y usarla"
- [x] Naming acordado con Quique: copy visible "Invitada" para el contacto externo sin cuenta; nombre interno `tripPhotoShare`/`contacto_externo`
- [x] Bug lateral encontrado investigando #140 y corregido de paso (pedido explícito de Quique): `POST/GET/PATCH/DELETE /trips/{tripId}/invitations` no verificaban que el viaje perteneciera a la agencia del agente que llama — cualquier admin/manager/agent podía gestionar invitaciones de un viaje de otra agencia
- [x] `pnpm run typecheck` limpio en todo el workspace
- [ ] **No probado en vivo en el navegador** — el puerto 8080 (api-server) estaba ocupado por el servidor de desarrollo de otra sesión de Claude Code trabajando en este mismo checkout; verificado solo por typecheck y revisión de código, no por un recorrido real en UI
- [ ] Crear una foto de un viaje real → visitar `/foto/:code` sin sesión (se ve, solo lectura) → registrarse → "Usar como plantilla" → el nuevo viaje aparece en "Compartidos" con los días/hoteles/actividades copiados
- [ ] Revocar un enlace de foto → deja de ser accesible
- [ ] Validar en producción tras desplegar (aplica la migración automáticamente al arrancar el servidor)

### #140 (fix) — Bug: clasificación pisada por "compartido" (2026-07-30)
- [x] Root cause: `ensureTripClassification` (`trip-classification.ts`) usaba `onConflictDoNothing` para las 4 rutas de escritura (login auto-accept, registro con código, aceptar invitación, aceptar share) sobre la misma clave `(userId, tripId)` sin ninguna prioridad — si un share (`compartido`) se aceptaba antes que la invitación oficial de agencia para el mismo viaje, la invitación posterior no podía corregir el valor
- [x] Fix: `ensureTripClassificationByDates` (usada por los 3 flujos de invitación de agencia) ahora hace `onConflictDoUpdate` con `setWhere: classification = 'compartido'` — puede corregir un `compartido` heredado, pero nunca pisa un `programado`/`realizado` ya existente; el share-accept se queda con `onConflictDoNothing` (nunca rebaja una clasificación oficial)
- [x] Verificado con una transacción real contra Neon con rollback explícito (datos desechables, cero filas persistidas): compartido→programado (fecha futura) ✅, compartido→realizado (fecha pasada) ✅, programado no se rebaja por un share-accept posterior ✅
- [x] `pnpm run typecheck` limpio
- [ ] **No probado en vivo en el navegador** (mismo motivo que #141 arriba) — pendiente de que Quique repita la prueba real que detectó el bug (aceptar la invitación de agencia que le apareció como "Compartido") y confirme que ahora queda "Programado"
- [ ] Validar en producción tras desplegar

### #145 — Sistema de emails transaccionales (Resend) (2026-07-29)
- [x] Investigación previa: ya existía una integración parcial con Resend (`lib/email.ts`, fetch directo a la API, no el SDK oficial) con 5 funciones — 3 en uso (`sendInvitationEmail`, `sendDocumentUploadedEmail`, `sendApprovalRequestEmail`) y 2 código muerto (`sendWelcomeEmail`, `sendTripUpdatedEmail`); no existía `email_verificado`, invalidación de sesiones, ni ningún scheduler/cron en el repo
- [x] Alcance ajustado con Quique tras la investigación: el email de "aviso de pago/licencia" se descartó (no hay Stripe/suscripciones en el repo) y se movió como nota a #92; el recordatorio de 7/3 días usa `setInterval` in-process (mismo patrón que `travel-advisory-refresh.ts`) en vez de `node-cron`, al descubrir que el repo ya tiene ese patrón establecido sin dependencias externas
- [x] Schema: `users.email_verified` (default `true` para no invalidar cuentas existentes), `email_verification_token`/`expires_at`, `password_reset_token`/`expires_at`; tabla nueva `email_send_log` (tipo, destinatario, viaje relacionado, estado, error) — migración `0020_famous_lionheart.sql` generada y aplicada
- [x] `lib/email.ts`: template base único reutilizable con branding (Arena/Terracota/Noche/Duna) y logging de cada envío (éxito y fallo) en `email_send_log`; las 5 funciones existentes migradas a este wrapper sin cambiar su HTML donde ya tenían un layout propio (aprobación, documento subido)
- [x] Email 1/6 — Bienvenida/verificación: nueva función `sendEmailVerificationEmail`, token de 24h, endpoint `GET /api/auth/verify-email` (página HTML igual que `/auth/approve`), `POST /api/auth/resend-verification`
- [x] Guard bloqueante: `requireAuth`/`requireRoles` devuelven 403 `EmailNotVerified` si `emailVerified === false` (mismo patrón que el guard de `status` pendiente/rechazado ya existente); `emailVerified` añadido a la sesión y a `AuthUser` (openapi + codegen)
- [x] Email 3/6 — Recuperación de contraseña: `POST /api/auth/forgot-password` (siempre 204, no filtra existencia de cuenta) y `POST /api/auth/reset-password` (token 1h) — al completarse, invalida todas las demás sesiones activas del usuario (`DELETE FROM sessions WHERE sess::jsonb->>'userId' = ...`, tabla no modelada en Drizzle por ser de `connect-pg-simple`)
- [x] Email 2/6 — Notificación de cambios en el viaje: `sendTripUpdatedEmail` enganchado en `PATCH /trips/:tripId` (fechas), altas/bajas de hotel y altas/edición/bajas de actividad — solo cuando el cambio lo hace personal de agencia (no cuando un viajero edita su propio viaje personal) y el viaje tiene agencia asociada
- [x] Email 4/6 — Invitación a viaje: ya existía (`sendInvitationEmail` en `invitations.ts`), migrada al template base
- [x] Email 5/6 — Recordatorio de viaje próximo (7 y 3 días): `lib/trip-reminders.ts`, corre cada hora dentro del proceso del API server, compara `trips.start_date` (columna `text`) contra hoy+7/hoy+3, filtra `status IN ('scheduled','active')`, lista checklist/equipaje pendientes por viajero (`trip_checklist_items`/`trip_packing_items`, ya aislados por `(tripId, userId)`), idempotente vía `email_send_log` (no reenvía si ya hay un registro para ese viaje+destinatario+tipo)
- [x] Email 6/6 — Onboarding de agencia: `sendAgencyOnboardingEmail` enganchado en `POST /users` para altas de personal de agencia (no viajero); en vez de enviar la contraseña por email, reutiliza el flujo de reset de contraseña para que el nuevo usuario active su cuenta eligiendo su propia contraseña
- [x] Frontend: páginas `/verify-email`, `/forgot-password`, `/reset-password`; enlace "¿Olvidaste tu contraseña?" en login; redirección automática a `/verify-email` cuando `emailVerified === false` (mismo patrón que `/pending`)
- [x] `pnpm run typecheck` limpio en todo el workspace
- [x] Verificado end-to-end en el navegador con una cuenta de prueba desechable (creada y eliminada en esta misma sesión, sin dejar rastro en la base real): registro → email de verificación logueado (falla esperada en Resend por ser `@example.com`, error correctamente registrado) → verificación por enlace → reenvío de verificación → guard 403 `EmailNotVerified` confirmado directamente contra la API → recuperación de contraseña completa (solicitud → token → reset → sesión anterior invalidada → login con la nueva contraseña)
- [ ] **No probado con Resend en modo real** (dominio `lugendo.io` sin verificar SPF/DKIM en Resend/Cloudflare — ver nota de infraestructura pendiente abajo); todos los envíos de prueba fallan por el sandbox de Resend, aunque el flujo y el logging del error están confirmados
- [ ] Notificación de cambios en el viaje: no probada con un viajero real con invitación aceptada (verificado por código y por typecheck, no por UI)
- [ ] Recordatorio de 7/3 días: no probado con un viaje real cuya fecha de inicio caiga exactamente en el rango (verificado por código; la lógica de idempotencia y de consulta de pendientes se revisó pero no se ejecutó contra un viaje real con esas fechas)
- [ ] Onboarding de agencia: no probado en el navegador (verificado por código)
- [ ] **Pendiente de infraestructura (manual, no automatizable desde código)**: verificar el dominio `lugendo.io` en el dashboard de Resend (registros SPF/DKIM en Cloudflare DNS) — hasta entonces, todos los emails a direcciones reales seguirán usando el remitente sandbox de Resend
- [x] **Añadido tras QA (2026-07-29)**: email de invitación viajero-a-viajero (`sendTripShareInvitationEmail`, tipo `trip_share_invitation`), enganchado en `POST /me/trips/:tripId/shares` (tabla `trip_shares`, distinta de `invitations`) — antes este flujo no notificaba nada, solo devolvía el `shareCode` en la respuesta JSON. El CTA cambia según si el destinatario ya tiene cuenta (login) o no (registro); no requiere migración (el tipo nuevo se añade al enum TS-only de `email_send_log.type`, columna `text` sin `CHECK` en la base). Verificado end-to-end con dos cuentas de prueba desechables (creadas y eliminadas en la misma sesión): login del propietario → creación de viaje personal → compartir con el email del segundo usuario → `email_send_log` registra el intento con el `shareCode` correcto (falla esperada de Resend por dominio `@example.com`, no probado con dirección real)

### #150 — Etiqueta "Incluída" en actividades del viaje (2026-07-29)
- [x] Investigación previa: el campo `included: boolean` ya existía en `trip_day_activities` (`lib/db/src/schema/trips.ts:89`), ya estaba leído/escrito de punta a punta en `artifacts/api-server/src/routes/trips.ts`, y ya tenía un toggle "Incluida"/"Por libre" funcional en `activity-detail-sheet.tsx` disponible para agencia y viajero — no hizo falta ningún cambio de schema, backend ni `openapi.yaml`
- [x] Badge "Incluída" añadido en `trip-day-card.tsx` (vista viajero/Passport) cuando `activity.included === true`, junto al badge "Por libre" existente
- [x] Badge "Incluída" añadido en `day-activities-panel.tsx` (vista agencia, compartida entre viaje e itinerario), con guarda explícita `!isItinerary` para que no aparezca en itinerarios/plantillas
- [x] `pnpm run typecheck` limpio
- [ ] Verificación visual en navegador pendiente — sin credenciales de login funcionales en local (ver nota en `CLAUDE.md` sobre `admin@lugendo.io`)
- [ ] Una actividad de agencia marcada como incluida muestra la etiqueta "Incluída"
- [ ] Una actividad de agencia NO incluida no muestra la etiqueta
- [ ] Una actividad del viajero ("Por libre") que además está incluida muestra ambas etiquetas
- [ ] Una actividad del viajero no incluida solo muestra "Por libre"
- [ ] La etiqueta "Incluída" no aparece en la vista de itinerarios (plantillas sin fechas), solo en viajes
- [ ] Tanto agencia como viajero pueden alternar el estado "incluida" de una actividad (según permisos del rol) — el toggle ya existía en `activity-detail-sheet.tsx`, no se tocó su lógica
- [ ] No hay regresión en el tag de tipo de actividad (Visita/Gastronomía/Traslado/Libre) ni en la etiqueta "Por libre" existente

### #148 — Equipaje y Notas individuales por viajero (no compartidos en viajes de grupo) (2026-07-29)
- [x] Investigación previa (fase de planificación): el modelo YA es individual por viajero — `trip_checklist_items`, `trip_packing_items` y `trip_notes` tienen `tripId` + `userId` desde el inicio; no hizo falta ninguna migración de schema. Alcance de la tarea reducido de "migrar" a "verificar y blindar con tests" tras confirmarlo con Quique
- [x] Verificado con una transacción real contra la base de datos con rollback explícito (datos desechables, cero filas persistidas): un viaje con un share **aceptado y con permiso "full" (edición)** — el caso más exigente — confirma que el usuario invitado obtiene 0 items del checklist/equipaje/notas del propietario al consultar con su propio `userId`; sus propios items creados no colisionan ni exponen los del propietario
- [x] Confirmado por código: `getTripChecklistAccess` (`traveler.ts`) solo verifica que el usuario tenga acceso al viaje (dueño, invitación o share aceptados); las queries de datos de checklist/packing-list/notes siempre filtran además por `userId` de quien hace la petición — el nivel de permiso del share (`full`/`read`) es irrelevante para el aislamiento, nunca se usa para ampliar qué filas se devuelven
- [x] Confirmado por código: `ensurePackingListGenerated` se ejecuta en cada `GET /me/trips/:tripId/packing-list` para el usuario que hace la petición (dueño, invitado o share), generando una copia propia e independiente si aún no existe la suya — `BASE_ITEMS` en `packing-list-generator.ts` incluye 12 ítems fijos siempre presentes, por lo que el equipaje nunca puede quedar vacío para ningún viajero
- [x] Confirmado por código: `trip-checklist-tab.tsx`, `trip-packing-list-tab.tsx` y `trip-notes-tab.tsx` solo reciben `tripId` como prop y llaman a endpoints `/me/...` scoped al usuario autenticado — no existe selector de viajero ni vista agregada de grupo en ninguno de los tres
- [x] Confirmado por código: aceptar una invitación (`invitations.ts`) o un share (`traveler.ts` `/me/shares/:shareCode/accept`) nunca copia ni inicializa checklist/packing-list/notas de otro viajero — cada viajero parte de cero (o de la generación automática de equipaje) por su cuenta
- [ ] **No probado con 2 cuentas reales en el navegador** — la verificación de esta pasada fue a nivel de base de datos/código (transacción desechable con rollback), no un recorrido de UI con dos sesiones de viajero reales sobre un viaje compartido. Pendiente de que Quique lo valide manualmente, o de hacerlo en una próxima pasada con cuentas de prueba desechables (mismo patrón que la #140)

### #149 — Editar el día de las actividades: mover entre días y desplazar el itinerario/viaje (2026-07-29)
- [x] Investigación previa: `day_number` (en `itinerary_days`/`trip_days`) es un índice relativo, no una fecha absoluta — la fecha real de un día de viaje se calcula como `trips.start_date + (day_number - 1)`, así que cambiar la fecha de inicio de un viaje no requiere tocar ningún día (ya funciona por diseño, sin cambios)
- [x] Backend: nuevo campo `dayId` opcional en `PATCH /trips/{tripId}/days/{dayId}/activities/{linkId}` y `PATCH /itineraries/{itineraryId}/days/{dayId}/activities/{linkId}` para mover una actividad a otro día, con verificación de que el día destino pertenece al mismo viaje/itinerario (`verifyTripDayAccess` reutilizado para viajes; comprobación equivalente añadida para itinerarios)
- [x] Backend: helper `day-renumbering.ts` (`closeDayGap`, `repositionDay`) — borrar un día de en medio cierra el hueco automáticamente; reposicionar el número de un día existente desplaza los demás manteniendo la secuencia contigua. Aplicado en `itineraries.ts`, `trips.ts` y `traveler.ts` (`PATCH /me/trips/{tripId}/days/{dayId}`, que antes sobrescribía `dayNumber` sin renumerar nada)
- [x] Backend: `trip_notes.dayNumber`/`endDayNumber` se remapean junto con los días de un viaje (`shiftTripNotesForDayRemoval`, `shiftTripNotesForReposition`); una nota de un solo día anclada exactamente en el día borrado se desvincula (`dayNumber = null`) en vez de reasignarse a otro día
- [x] Frontend: selector "Día" en `ActivityDetailSheet` (mismo componente reutilizado en itinerario y viaje) para mover una actividad; al guardar con día distinto, se invalidan las queries del día de origen y del día de destino
- [x] `lib/api-spec/openapi.yaml` + Orval: `dayId` en `TripDayActivityUpdate`/`ItineraryDayActivityUpdate`, `dayNumber` en `TripDayUpdate`/`ItineraryDayUpdate`, regenerados
- [x] `pnpm run typecheck` y `pnpm run build` limpios en `api-server` y `lugendo-app` (el fallo de `mockup-sandbox` en `pnpm run build` es preexistente y no relacionado — falta la variable de entorno `PORT` en ese paquete)
- [x] Lógica SQL de renumeración (`closeDayGap`, `repositionDay`, remapeo de `trip_notes`) verificada contra la base de datos real dentro de una transacción con rollback explícito (datos de prueba desechables, sin FK a agencias/usuarios reales, cero filas persistidas) — se encontró y corrigió un bug real: el mapping de `repositionDay` puede ser un ciclo de permutación (ej. día 2→4, 3→2, 4→3), y aplicar el remapeo de notas secuencialmente por `WHERE day_number = oldNumber` corrompía datos cuando una fila ya remapeada volvía a coincidir con un paso posterior; ahora se hace un snapshot de las filas afectadas por su valor original antes de actualizar
- [x] Fix post-implementación (2026-07-29, validado por Quique): `trip-day-card.tsx` (vista de viaje del propio viajero, `traveler-trip.tsx`) llama a `ActivityDetailSheet` directamente sin pasar por `day-activities-panel.tsx` — se quedó sin el prop `days`, así que el selector "Día" no aparecía ahí. Corregido pasando `days={allDays.map(...)}` en ese call site también
- [x] Mover una actividad de un día a otro dentro de un viaje concreto y el cambio persiste — **validado por Quique** (vista del viajero, `/traveler/trips/:id`)
- [ ] Mover una actividad de un día a otro dentro del editor de itinerarios (agencia, `/itineraries/:id`) y el cambio persiste — no probado aún, pendiente credenciales de agencia (ver nota en `CLAUDE.md` sobre `admin@lugendo.io`)
- [ ] Mover una actividad de un día a otro dentro de un viaje concreto desde la vista de agencia (`/trips/:id`) y el cambio persiste — no probado aún, mismo motivo
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
- [x] Verificado de extremo a extremo — **validado por Quique (2026-07-30)**
- [x] Itinerario sin viajes vinculados: botón "Borrar" habilitado, borrado funciona tras confirmación — **validado por Quique**
- [x] Itinerario con al menos un viaje vinculado: botón "Borrar" deshabilitado con tooltip correcto (ficha y listado) — **validado por Quique**
- [x] Intentar borrar por API un itinerario con viajes vinculados (manipulando la petición) → rechazado por el backend con 409 — **validado por Quique**
- [x] Marcar un itinerario con viajes vinculados como inactivo → aparece con badge "Inactivo" en el listado y en la ficha — **validado por Quique**
- [x] Filtro "Mostrar inactivos" en el listado oculta/muestra correctamente los itinerarios inactivos — **validado por Quique**
- [x] Un itinerario inactivo no aparece como opción al crear un viaje nuevo desde catálogo (trip-wizard) — **validado por Quique**
- [x] Un viaje ya creado a partir de un itinerario ahora inactivo sigue funcionando con normalidad — **validado por Quique**
- [x] Reactivar un itinerario inactivo funciona y vuelve a aparecer en la creación de viajes — **validado por Quique**
- [x] Rol Guía local: no existe todavía en el código (tarea #91 sin empezar) — no aplica, cubierto automáticamente cuando se implemente

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

### Fix — Campo Email bloqueado en Safari de escritorio: el panel de Contactos/autocompletado no rellenaba el campo y el tecleo posterior tampoco (2026-07-29)
- [x] Causa raíz identificada: los campos Email de `/login` y `/register` eran inputs controlados (`value={field.value}` vía `{...field}` de react-hook-form). En Safari de escritorio, el panel nativo de "Contactos"/emails guardados escribe el valor en el DOM sin disparar el evento `input` que React necesita para reconciliar un campo controlado; el siguiente render de React lo revertía a `""`, y el mismo desajuste dejaba el campo sin poder recibir tecleo manual después
- [x] Ambos campos convertidos a no controlados (`defaultValue={field.value}` + `ref`/`onChange`/`onBlur` manuales, sin prop `value`), manteniendo el resto de mitigaciones ya existentes (`autoComplete="off"`, nombres de campo no estándar, `data-lpignore`, sin `autoFocus`)
- [x] Verificado en el navegador (Chromium): el campo Email de `/register` acepta texto a la primera tecla y conserva el valor tras salir y volver a entrar del campo
- [x] Verificado en el navegador (Chromium): el campo Email de `/login` acepta texto a la primera tecla y conserva el valor tras salir y volver a entrar del campo
- [ ] Validado por Quique en Safari de escritorio (macOS): el panel de Contactos/autocompletado ya no bloquea el tecleo manual, y si se elige una cuenta del panel, el valor se refleja en el campo
- [ ] Validado por Quique en Safari de iPhone/iPad: el registro y el login siguen funcionando correctamente tras este cambio (regresión sobre el fix del 2026-07-25)

### Fix — Registro rechazaba con "Email inválido" un email autorrellenado por el navegador junto con contraseña/confirmar (2026-07-29)
- [x] Causa raíz identificada: cuando el navegador rellena varios campos de golpe (selector de credenciales/Contactos, no tecleo manual), a veces escribe el valor en el DOM del campo Email sin disparar el evento `input` — react-hook-form nunca se entera del cambio y sigue creyendo que el campo está vacío, así que al enviar valida (y rechaza) ese valor obsoleto aunque el campo se vea relleno en pantalla. El `onBlur` de sincronización del fix anterior no cubre este caso porque el autorrelleno masivo no dispara un ciclo de foco/desenfoque sobre el campo Email si el usuario no vuelve a tocarlo
- [x] Arreglo: justo antes de `handleSubmit` (en el `onSubmit` de ambos `<form>`, login y registro), se sincroniza el valor real del DOM de email/contraseña/confirmar contraseña hacia el estado de react-hook-form, así el envío siempre valida lo que el usuario ve en pantalla, sin depender de qué eventos haya disparado el navegador
- [x] Verificado en el navegador: se fuerza el valor del campo Email vía el setter nativo sin disparar ningún evento (reproduce el peor caso de autorrelleno silencioso) y el registro completa con `201 Created`, enviando el email correcto (confirmado inspeccionando el payload de la petición)
- [x] Mismo caso verificado en `/login`: la petición llega al backend con el email/contraseña correctos (401 esperado por credenciales inexistentes, no bloqueo de validación en el cliente)
- [ ] Validado por Quique en Safari/Chrome de escritorio real: usar el selector nativo de credenciales para autorrellenar email+contraseña+confirmar de golpe (sin tocar manualmente el campo Email después) completa el registro correctamente

### Fix — Enlaces "Aprobar"/"Rechazar"/verificar email/resetear contraseña corruptos en el correo, rompiendo la aprobación manual de registros (2026-07-29)
- [x] Causa raíz identificada: los enlaces se construían como `?token=<64 hex>&action=...`. El tránsito Resend → Gmail corrompe la URL exactamente en el `=` de `token=` cuando la línea HTML (muy larga, llena de estilos inline) cruza un límite de wrap de quoted-printable justo ahí — confirmado con dos correos reales distintos: uno perdía literalmente `=3` de `token=3...`, el otro mostraba un carácter de reemplazo (`�`) en la misma posición exacta. Reproducible al 100% en cada envío (la posición depende del texto fijo de la plantilla, no del token aleatorio) — es decir, **ningún enlace de aprobación ha funcionado nunca**, no es un caso puntual
- [x] El `approval_token` en la base de datos seguía intacto (nunca se llegó a consumir) tras que el usuario pulsara "Aprobar", confirmando que la petición nunca llegó a ejecutarse — coincide con que el enlace corrupto no coincidía con ninguna ruta válida
- [x] Arreglo: los 4 enlaces (aprobar, rechazar, verificar email ×2, resetear contraseña) pasan de query string (`?token=...&action=...`) a segmentos de ruta (`/api/auth/approve/:action/:token`, `/api/auth/verify-email/:token`, `/reset-password/:token`), eliminando el carácter `=` de la URL — evita la clase de bug entera, no solo el caso ya observado
- [x] `artifacts/api-server/src/routes/auth.ts`: rutas `GET /auth/approve/:action/:token` y `GET /auth/verify-email/:token` (antes con query params), y construcción de las 5 URLs actualizada
- [x] Frontend: ruta `/reset-password/:token` añadida en `App.tsx` (se mantiene `/reset-password` sin token para el estado "enlace no válido"), `reset-password.tsx` lee el token con `useParams` de wouter en vez de `useSearch`
- [x] Verificado extremo a extremo contra un servidor temporal en un puerto distinto (para no interferir con el servidor de desarrollo compartido): registro → nuevo enlace con formato de ruta → `GET /api/auth/approve/approved/<token>` devuelve "Usuario aprobado" y dentro de la base de datos el usuario queda con `status = 'approved'` y `approval_token = null`
- [ ] Validado por Quique con un registro real: el email de aprobación llega con el enlace nuevo (sin `=` ni `&`) y pulsar "Aprobar"/"Rechazar" funciona a la primera
- [ ] Validado por Quique: verificación de email y recuperación de contraseña (enlaces con el mismo cambio) siguen funcionando de principio a fin
- [ ] Nota para Quique: el usuario `ebenavidesr@me.com` (registrado el 2026-07-29 antes de este fix) fue aprobado manualmente en base de datos como solución puente, ya que su enlace de aprobación original ya no es válido (formato de ruta antiguo, eliminado)

### Fix — Enlace del email de invitación a compartir un viaje llevaba a una página en blanco (hash-routing inexistente en la app) (2026-07-30)
- [x] Causa raíz identificada: el CTA del email de invitación a compartir viaje (`sendTripShareInvitationEmail`) apuntaba a `${PUBLIC_APP_URL}/#/login` o `/#/register` (formato de hash-routing), pero la app usa Wouter con rutas normales — la ruta `/` (todo lo que queda tras quitar el fragmento `#...`, que el navegador nunca envía al servidor) renderiza un `<div />` vacío. El enlace del email no llevaba a ningún sitio, ni siquiera a un error visible
- [x] Mismo patrón roto encontrado y corregido en otros 3 sitios que también usaban `/#/...`: `sendTripUpdatedEmail` y `sendDocumentUploadedEmail` (ambos en `trips.ts`, antes `/#/trips/:id[...]` — además apuntaban a la ruta de back-office en vez de a `/traveler/trips/:id`, que es donde caen estos destinatarios) y `sendTripReminderEmail` (`trip-reminders.ts`, ya apuntaba a la ruta correcta, solo le sobraba el `/#`)
- [x] Arreglo: los 4 enlaces pasan a rutas planas sin `#` (`/login`, `/register`, `/traveler/trips/:id`) — ninguno de estos 4 tipos de email había llevado nunca a la página correcta
- [x] Nota: el enlace de "documento subido" ahora lleva a la ficha del viaje del viajero en su pestaña por defecto, no directamente a la pestaña Documentos — esa vista no tiene deep-link por pestaña todavía (mejora menor, no bloqueante)
- [x] Verificado extremo a extremo contra un servidor temporal (puerto distinto, sin tocar el servidor de desarrollo compartido): viajero A crea un viaje personal → comparte con un email nuevo (`POST /me/trips/:tripId/shares`) → el destinatario se registra → aprobado (`GET /auth/approve/approved/:token`) → email verificado (`GET /auth/verify-email/:token`) → login → acepta el código (`POST /me/shares/:code/accept`, `200`) → `GET /me/trips` devuelve el viaje con `classification: "compartido"` — la cadena completa funciona de principio a fin
- [ ] Validado por Quique con la invitación real re-creada a `ebenavidesr@me.com` para el viaje "Sri Lanka": el botón del email de invitación lleva a login/registro correctamente, y tras aceptar el código en Compartidos el viaje aparece en esa pestaña
- [ ] Validado por Quique: el email de "viaje actualizado" y el de "documento subido" (agencia → viajero) llevan al viaje del viajero correctamente, no a una página en blanco ni al back-office

### Fix — Campo de email "se activa y desactiva" al escribir en Invitar viajero y en crear/editar usuario, en Safari y Chrome (2026-07-30)
- [x] Causa raíz identificada: `trip-travelers-tab.tsx` (invitar viajero) y `team.tsx` (crear/editar usuario) seguían usando el patrón `readOnly` hasta el primer `onFocus` para despistar al autocompletado — el mismo patrón ya retirado de `login.tsx` el 2026-07-25 por romper el teclado en iOS Safari. Alternar el atributo `readOnly` con el campo ya enfocado hace que el motor de autofill de Chrome/Safari reevalúe el campo en cada focus, cortando el tecleo de forma intermitente — confirmado ahora también en Safari y Chrome de escritorio, no solo en iOS
- [x] Arreglo: en los tres campos se elimina `readOnly`/`onFocus`/el estado `emailLocked`; el input pasa a ser no controlado (`defaultValue` en vez de `value`) y se relee el valor real del DOM con un `ref` justo antes de compartir/crear/guardar — mismo patrón ya validado en `login.tsx` (`defaultValue` + resync antes de enviar)
- [x] Aplicado en `trip-travelers-tab.tsx` (diálogo "Invitar viajero") y `team.tsx` (diálogos "Crear usuario" y "Editar usuario")
- [x] Como estos diálogos permanecen montados entre apertura y cierre (solo cambia el `open` de Radix, no hay remount), se limpia también `ref.current.value = ""` tras un envío/creación exitosa, para que el campo no controlado no conserve el valor anterior la próxima vez que se abra
- [x] Documentado en la memoria del proyecto (`.agents/memory/email-input-type-uneditable.md`) que el patrón `readOnly`-hasta-el-foco queda retirado de todo el código; no reintroducirlo en futuros campos de email/contraseña
- [x] `pnpm run typecheck` pasa sin errores tras el cambio
- [ ] Validado por Quique: escribir de un tirón un email en "Invitar viajero" (ficha de viaje) funciona sin cortes, tanto en Safari como en Chrome de escritorio
- [ ] Validado por Quique: mismo comportamiento en Equipo → Crear usuario y Equipo → Editar usuario, incluyendo con el gestor de contraseñas/Llavero activo
- [ ] Validado por Quique: tras invitar/crear con éxito y volver a abrir el diálogo, el campo de email aparece vacío (no conserva el valor anterior)

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
- [x] Confirmar el mismo flujo en otra máquina/checkout (Intel Mac o Linux) para descartar que algo quedó atado a este entorno concreto — **validado por Quique**

---

> Seed admin: `admin@lugendo.io` existe en la base real (agencyId=1, role=admin), pero la contraseña `admin1234` documentada históricamente ya no es válida — la base local apunta a los datos reales de producción (ver #117), no a un seed desechable.
