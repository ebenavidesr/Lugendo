# Lugendo — Checklist de validación

Marca cada ítem a medida que lo pruebes. Actualiza este archivo cuando una feature quede validada ✅ o si encuentras un bug ❌.

---

## Sprint actual

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

### #71 — Fecha junto al número de día
- [ ] En detalle de viaje (back office): el badge del día muestra la fecha debajo en letra pequeña
- [ ] En el panel bulk de hoteles: aparece la fecha junto al número de día
- [ ] En la tarjeta del viajero (`trip-day-card`): la fecha aparece como badge en el encabezado colapsado
- [ ] En la tarjeta del viajero: al expandir el día, la fecha aparece en la zona de foto

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
