# Lugendo — Checklist de validación

Marca cada ítem a medida que lo pruebes. Actualiza este archivo cuando una feature quede validada ✅ o si encuentras un bug ❌.

---

## Sprint actual

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

---

> Seed admin para pruebas: `admin@lugendo.io` / `admin1234`
