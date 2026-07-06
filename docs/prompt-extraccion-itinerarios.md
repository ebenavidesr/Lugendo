# Prompt de extracción de documentos de agencia — Lugendo

Instrucción para el motor de OCR/parsing que convierte un PDF de itinerario de agencia
(ficha técnica, dossier, folleto) en un `itinerario` estructurado de Lugendo (días,
actividades, hoteles, notas, checklist, recomendaciones).

---

## 0. Principio general

Los documentos de agencia NO tienen un formato único. La misma información (hotel,
actividad, comida) puede aparecer en tabla, en prosa, o repetida en dos sitios distintos
con matices diferentes (p. ej. hotel concreto en la tabla vs. "o similar" en el listado
de hoteles). Tu trabajo es **reconciliar**, no solo localizar. Si encuentras la misma
información en dos formatos, la tabla/lista estructurada manda sobre la prosa para datos
concretos (fechas, nombres de hotel), y la prosa manda sobre la tabla para contenido
narrativo (descripciones, actividades).

Nunca descartes un bloque de texto solo porque no encaja en ningún campo del itinerario
principal: si no es un día, ni un hotel, ni una actividad, evalúa si es una **nota** o un
**ítem de checklist** (ver secciones 5 y 6) antes de ignorarlo.

---

## 1. Detección de estructura del documento

Antes de extraer nada, identifica qué bloques existen en el PDF:

- **Tabla resumen de itinerario**: normalmente columnas tipo `DÍA | ITINERARIO/RUTA |
  ALOJAMIENTO | COMIDA` (o variantes: "HOTEL", "RÉGIMEN"). Puede llamarse "Itinerario
  previsto", "Programa día a día", "Resumen del viaje".
- **Desarrollo día a día en prosa**: bloques que empiezan con "Día N", "DÍA N.-",
  "Dia N-" (con o sin tilde, con o sin punto/guión), seguidos de una localidad o ruta y
  un párrafo descriptivo. Puede incluir una línea final tipo "Régimen de alimentación: ...".
- **Listado de hoteles por destino/ciudad**: normalmente un bloque tipo "HOTELES
  SELECCIONADOS", "ALOJAMIENTOS PREVISTOS", listado como `CIUDAD: Hotel A, Hotel B o
  similar`. No está indexado por día — hay que cruzarlo con la tabla o con el desarrollo
  día a día usando el nombre de la ciudad/localidad como clave de unión.
- **Bloques de logística/legal** (no van al itinerario, pero sí a notas/checklist si
  procede): visado, vacunas, moneda, clima, seguro, condiciones de reserva, contrato,
  protección de datos, tasas.
- **Bloque de equipaje/material recomendado**: suele titularse "Equipo personal",
  "Qué llevar", "Equipaje recomendado" — es una lista de ítems sueltos.
- **Puntos fuertes / highlights**: lista corta al principio o al final, del tipo
  "1.- Guía de agencia 2.- Grupos reducidos...". Va a recomendaciones, no a actividades.

Si un documento no tiene alguno de estos bloques, no falles: extrae lo que exista y deja
vacíos los campos correspondientes, no inventes contenido.

---

## 2. Extracción de días

Un "día" del itinerario se identifica por **cualquiera** de estos patrones (no exigir
que coincidan todos):

- Fila de tabla con un número de día en la primera columna.
- Encabezado de párrafo que matchee `(?i)d[ií]a\s*\d+` seguido de separador (`.`, `-`,
  `:`, espacio) y texto de localidad/ruta.

Reglas:

- El número de día es la clave de unión entre la tabla resumen y el desarrollo en
  prosa. Si ambos existen, fusiona la información de ambos en el mismo día — no crees
  dos días duplicados.
- El título del día puede incluir varias localidades separadas por guión
  (ej. "GIRITALE-POLONNARUWA-SAFARI P.N.MINNERIYA-SIGIRIYA"). No trunques al primer
  guión: guarda el título completo y, por separado, extrae cada localidad mencionada
  como posible referencia geográfica para el día (útil para mapas/fotos).
- Si el documento numera días de vuelo/llegada sin actividades propias (ej. "Día 1.-
  VUELOS ESPAÑA-COLOMBO", "Día 17.- LLEGADA A ESPAÑA"), sigue creando el día, pero con
  actividades vacías o una única actividad tipo "Vuelo" — no los omitas ni los fusiones
  con el día siguiente.

---

## 3. Extracción de hoteles

Este es el punto que más falla. Sigue este orden de prioridad:

1. **Fuente primaria**: la columna de alojamiento en la tabla resumen (si existe). Es
   el hotel "oficial" asignado a ese día concreto.
2. **Fuente secundaria de validación/alternativas**: el listado de hoteles por ciudad
   (ej. "ANURADHAPURA: Hotel Heritage, Monaara Resort o similar"). Cruza por nombre de
   ciudad/localidad con el día correspondiente:
   - Si el hotel de la tabla coincide con uno de los nombres del listado → confirma y
     añade el resto como alternativas (`alternativas: [...]`), no como hotel principal.
   - Si el hotel de la tabla NO aparece en el listado (mismatch, error de imprenta, o
     el listado usa un nombre distinto) → conserva el de la tabla como principal y
     añade el listado completo como alternativas, marcando el registro con
     `revisar_manualmente: true` para que un humano lo confirme.
3. **Si solo existe uno de los dos bloques**, usa el que haya, no lo dejes vacío por
   falta del otro.
4. **Frases como "o similar", "o de igual categoría"** indican que el hotel NO está
   garantizado. Guarda esta información en un campo `garantizado: false` en vez de
   descartarla — es información relevante para el viajero, no ruido.
5. Un hotel puede repetirse en días consecutivos (misma ciudad, varias noches). No lo
   trates como error: es normal. Vincúlalo a cada día que corresponda según la tabla.
6. Ignora como "hotel" cualquier mención genérica sin nombre propio ("Hotel",
   "Alojamiento en categoría turista") — eso va a notas/descripción, no al campo hotel.

---

## 4. Extracción de actividades por día

La mayoría de folletos NO listan actividades en viñetas: están dentro de un párrafo
narrativo. Debes:

1. Tomar el párrafo descriptivo de cada día (de la sección "desarrollo día a día", no
   solo del resumen de tabla, que suele ser demasiado corto).
2. Descomponerlo en actividades discretas usando como señales:
   - Verbos de acción en primera persona del plural o futuro ("Visitaremos...",
     "Hoy visitamos...", "Recorreremos...", "Haremos un safari...").
   - Nombres propios de lugares/monumentos/parques en mayúscula o negrita (Templo del
     Diente de Buda, Parque Nacional Minneriya, Roca del León).
   - Conectores de secuencia ("por la mañana", "al atardecer", "por la tarde") como
     pistas de orden dentro del día, no como actividades en sí.
3. Cada actividad extraída debe tener: `titulo` (corto, ej. "Safari en Jeep – Parque
   Nacional Minneriya"), `descripcion` (frase o dos del original, reescrita de forma
   concisa), y si el texto lo indica, un momento del día (mañana/tarde/noche) — dejar
   `null` si no se especifica, no inventar un horario.
4. No generes una actividad por cada frase del párrafo: agrupa frases que describen la
   misma visita/parada en una sola actividad. Ejemplo: "Visitaremos Polonnaruwa... entre
   otras los budas gigantes de Gal Vihara" es UNA actividad (visita a Polonnaruwa), no
   dos.
5. Traslados puros ("Traslado a Sigiriya", "Traslado al aeropuerto") son actividades de
   tipo `traslado`, distintas de `visita`/`actividad`. Clasifícalas así si el schema de
   Lugendo distingue tipos (Visita, Gastronomía, Traslado, Libre, según el rediseño de
   UI ya definido).
6. Si el día es "libre" (ej. "Día libre para disfrutar del mar..."), créalo como una
   única actividad de tipo `libre`, no lo dejes sin actividades.

---

## 5. Régimen de comidas

Normaliza cualquiera de estos formatos al mismo campo `comidas`:

| Formato en el documento | Normalizar a |
|---|---|
| `D` | Desayuno |
| `CE` (o `C`) | Cena |
| `D, CE` | Desayuno y cena |
| "Régimen de alimentación: Desayuno y cena." | Desayuno y cena |
| "Régimen de alimentación: Desayuno, (pic nic) y cena." | Desayuno, pícnic y cena |
| Sin mención | No especificado (no asumir "todo incluido" ni "nada incluido") |

Si la tabla y la prosa dan información distinta para el mismo día, prioriza la prosa
(suele ser más completa, como en el caso del "pic nic").

---

## 6. Notas

Cualquier texto que cumpla lo siguiente va al campo `notas` del viaje o del día
correspondiente (no se descarta):

- Empieza literalmente con "NOTA:", "IMPORTANTE:", "MUY IMPORTANTE:".
- Advierte de variabilidad del itinerario (cambios de orden, disponibilidad de
  hoteles/trenes/plazas, condiciones climáticas).
- Restricciones operativas relevantes para el viajero (ej. "el trayecto de tren está
  sujeto a disponibilidad").

Distingue el nivel:
- `nota_dia`: aplica a un día concreto (ligar al número de día correspondiente).
- `nota_viaje`: aplica a todo el itinerario (van al nivel del viaje/itinerario, no de un
  día).

No mezcles esto con cláusulas puramente legales/contractuales (condiciones de
cancelación, protección de datos, responsabilidad civil) — esas NO van a notas de
itinerario; si se quieren capturar, deben ir a un campo separado `condiciones_legales`
o descartarse según se decida en el modelo de datos.

---

## 7. Checklist (equipaje / preparativos)

Cuando el documento tenga una sección de equipaje recomendado, vacunas, documentación a
llevar, etc. (títulos típicos: "Equipo personal", "Qué llevar", "Documentación
necesaria", "Vacunas"), extrae cada ítem de la lista como una entrada de checklist:

- `item`: texto corto y accionable (ej. "Repelente antimosquitos DEET 50%+", "Pasaporte
  con vigencia mínima 6 meses", "Visado electrónico Sri Lanka").
- `categoria`: agrupar por tipo si es posible (Equipaje, Documentación, Salud/Vacunas,
  Dinero/Divisa) — usa el título de la sección original como categoría si no hay una
  categoría estándar mejor.
- No fusiones ítems distintos en una sola entrada aunque estén en la misma línea del
  documento (ej. "Sombrero, gafas de sol, bañador, toalla y pañuelo" → 5 ítems, no 1).

---

## 8. Recomendaciones

Van aquí (campo `recomendaciones`, no `actividades` ni `notas`):

- Secciones tipo "Puntos fuertes" / "Highlights" (lista corta al principio del
  documento).
- Consejos prácticos sueltos que no son obligatorios ni de itinerario: sugerencias de
  cambio de dinero, propinas, cómo compartir habitación, mejor época para reservar,
  etc.
- Explicaciones temáticas ampliadas de una parada ya extraída como actividad (ej. el
  bloque largo de "LAS PLANTACIONES DE TÉ" que amplía lo que ya se mencionó como
  actividad en el día correspondiente) — enlázala a la actividad relacionada por
  nombre de lugar si es posible, en vez de crear una recomendación huérfana.

---

## 9. Formato de salida esperado (ejemplo con 2 días de una muestra real)

```json
{
  "itinerario": {
    "titulo": "Sri Lanka 17 días",
    "duracion_dias": 17,
    "notas_viaje": [
      "El itinerario puede variar en el orden de las visitas por causas climatológicas, logísticas o técnicas.",
      "El alojamiento de los días de playa podrá ser en Mirissa o en otra zona de la costa cercana por disponibilidad limitada."
    ],
    "recomendaciones": [
      "Guía de Ambarviajes acompañante en grupos de más de 10 personas.",
      "Grupos reducidos, máximo 16 viajeros.",
      "Se recomienda llevar euros y cambiarlos por rupias en el aeropuerto a la llegada."
    ],
    "checklist": [
      {"item": "Repelente antimosquitos DEET mínimo 50%", "categoria": "Salud"},
      {"item": "Pasaporte con vigencia mínima de 6 meses", "categoria": "Documentación"},
      {"item": "Visado electrónico de Sri Lanka (ETA)", "categoria": "Documentación"},
      {"item": "Jersey o forro polar para zona de montaña", "categoria": "Equipaje"}
    ],
    "dias": [
      {
        "numero": 5,
        "titulo": "Giritale - Polonnaruwa - Parque Nacional Minneriya - Sigiriya",
        "localidades": ["Giritale", "Polonnaruwa", "Parque Nacional Minneriya", "Sigiriya"],
        "comidas": "Desayuno y cena",
        "hotel": {
          "nombre": "Sigiriya Village",
          "garantizado": false,
          "alternativas": ["Camelia Resort & Spa"],
          "fuente": "tabla+listado_ciudad",
          "revisar_manualmente": false
        },
        "actividades": [
          {
            "titulo": "Visita a Polonnaruwa",
            "descripcion": "Antigua capital de los cingaleses; incluye los budas gigantes de Gal Vihara.",
            "tipo": "Visita",
            "momento": "mañana"
          },
          {
            "titulo": "Safari en jeep - Parque Nacional Minneriya",
            "descripcion": "Famoso por manadas de elefantes salvajes y gran variedad de aves.",
            "tipo": "Visita",
            "momento": "tarde"
          },
          {
            "titulo": "Traslado a Sigiriya",
            "descripcion": null,
            "tipo": "Traslado",
            "momento": null
          }
        ],
        "notas_dia": []
      },
      {
        "numero": 14,
        "titulo": "Playas de Mirissa",
        "localidades": ["Mirissa"],
        "comidas": "Desayuno y cena",
        "hotel": {
          "nombre": "Paradise Beach Club",
          "garantizado": false,
          "alternativas": ["Mandara Resort"],
          "fuente": "tabla+listado_ciudad",
          "revisar_manualmente": false
        },
        "actividades": [
          {
            "titulo": "Día libre en Mirissa",
            "descripcion": "Día libre para disfrutar del mar, la música reggae o el pescado fresco.",
            "tipo": "Libre",
            "momento": null
          }
        ],
        "notas_dia": [
          "El alojamiento en Mirissa es limitado; puede reubicarse en costa cercana."
        ]
      }
    ]
  }
}
```

---

## 10. Checklist de validación tras la extracción (para el propio agente)

Antes de dar la extracción por buena, el agente debe verificar:

- [ ] ¿El número de días extraídos coincide con la duración declarada del viaje
      (ej. "17 DÍAS" en el título)?
- [ ] ¿Todos los días tienen al menos un hotel O una nota explicando por qué no lo
      tienen (ej. día de vuelo)?
- [ ] ¿Todos los días con desarrollo narrativo tienen al menos una actividad extraída?
- [ ] ¿Se han capturado por separado el listado de hoteles por ciudad y la tabla
      resumen, y se han cruzado (no solo copiado uno de los dos)?
- [ ] ¿Hay contenido de checklist/notas capturado, o se ha decidido explícitamente que
      el documento no lo tenía?
- [ ] ¿Ninguna cláusula legal/contractual se ha colado en `notas` o `recomendaciones`?
