# Lugendo — Checklist de validación

Marca cada ítem a medida que lo pruebes. Actualiza este archivo cuando una feature quede validada ✅ o si encuentras un bug ❌.

---

## Sprint actual

### #118 — Toggle Incluida/Por libre al crear itinerario
- [x] En el paso 3 del asistente de creación de itinerarios, cada actividad añadida a un día (vinculada desde catálogo o creada nueva) muestra un selector "Incluida / Por libre" con el mismo estilo visual que en `ActivityDetailSheet`
- [x] Por defecto las actividades quedan marcadas como "Incluida", y se puede cambiar a "Por libre" antes de finalizar la creación
- [x] Al pulsar "Crear", el itinerario se guarda con el valor `included` correcto por cada actividad de cada día
- [x] La fila resumen de cada actividad añadida en el día refleja visualmente si es "Incluida" o "Por libre" (colores igual que en el panel de edición)
- [x] El valor persistido se refleja correctamente en la vista de edición del itinerario tras crearlo

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
- [ ] En detalle de viaje (back office): el badge del día muestra la fecha debajo en letra pequeña
- [ ] En el panel bulk de hoteles: aparece la fecha junto al número de día
- [ ] En la tarjeta del viajero (`trip-day-card`): la fecha aparece como badge en el encabezado colapsado
- [ ] En la tarjeta del viajero: al expandir el día, la fecha aparece en la zona de foto

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
- [ ] Botón "Añadir hotel" abre un campo de búsqueda (no va directo al formulario de creación)
- [ ] Al escribir, filtra hoteles del catálogo por nombre o ciudad
- [ ] Al hacer clic en un resultado se asigna el hotel al día
- [ ] El enlace "Crear hotel nuevo" al fondo lleva al formulario completo

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

---

> Seed admin para pruebas: `admin@lugendo.io` / `admin1234`
