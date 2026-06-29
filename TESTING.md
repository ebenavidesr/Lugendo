# Lugendo — Checklist de validación

Marca cada ítem a medida que lo pruebes. Actualiza este archivo cuando una feature quede validada ✅ o si encuentras un bug ❌.

---

## Sprint actual

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
