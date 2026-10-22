# Parte de la persona 1: Salas y bandas

Esta parte se pega en el README general (sección Índices) y sirve de guía para la defensa.

## Índices (salas y bandas)

| Modelo | Índice | Para qué consulta sirve |
|--------|--------|-------------------------|
| Room | `name` único | Evita dos salas con el mismo nombre y acelera la búsqueda `search` por nombre en `GET /api/rooms`. |
| Band | `name` único | Evita dos bandas con el mismo nombre y acelera la búsqueda `search` por nombre en `GET /api/bands`. |

Si se repite el nombre, MongoDB devuelve el error 11000 y la API responde 409.

## Endpoints

- Salas: `POST/GET /api/rooms`, `GET/PUT/DELETE /api/rooms/:id`, `GET /api/rooms/:id/schedule?date=AAAA-MM-DD`, `GET /api/rooms/stats`.
- Bandas: `POST/GET /api/bands`, `GET/PUT/DELETE /api/bands/:id`, `GET /api/bands/:id/musicians`, `GET /api/bands/:id/bookings`.

## Borrados protegidos (409)

- Sala con reservas apartadas o confirmadas.
- Banda con reservas apartadas o confirmadas.
- Banda que todavía tiene músicos.

## Archivos de esta parte

- `src/models/Room.js`, `src/models/Band.js`
- `src/controllers/roomController.js`, `src/controllers/bandController.js`
- `src/routes/roomRoutes.js`, `src/routes/bandRoutes.js`
- Compartidos (hay que acordarlos con el grupo): `src/utils/HttpError.js`, `src/utils/helpers.js`, `src/utils/listQuery.js`, `src/middlewares/errorHandler.js`
- `postman/Cabina-Persona1.postman_collection.json`, `postman/Cabina.postman_environment.json`


# Parte de la persona 2: Músicos y equipos

Implementación basada en el reparto del PDF. Falta contrastar con `Proyecto 1 Web II.docx`: el reparto no especifica campos, enumeraciones de instrumentos/categorías ni el formato exacto de estadísticas. Se adoptan `name`, `instrument`, `band`, `active` para músicos y `name`, `category`, `totalUnits`, `availableUnits` para equipos. Instrumento y categoría son textos; categoría se normaliza a minúsculas. El nombre de equipo es único. El total admite enteros desde cero.

## Integración

Esta carpeta todavía no incluye `package.json`, conexión MongoDB ni servidor. La persona 4 debe instalar Express y Mongoose y montar las rutas, después de `express.json()` y antes de los middlewares de errores:

```js
app.use('/api/musicians', require('./routes/musicianRoutes'));
app.use('/api/equipment', require('./routes/equipmentRoutes'));
```

Las rutas siguen el estilo existente y requieren Express 5 para propagar errores de funciones async; en Express 4 se necesita un envoltorio async. El módulo de bandas existente importa `Booking`, todavía ausente. No se agregan modelos provisionales para las partes de otros integrantes.

## Endpoints y consultas

- `POST/GET /api/musicians`, `GET/PUT/DELETE /api/musicians/:id`.
- `POST/GET /api/equipment`, `GET/PUT/DELETE /api/equipment/:id`.
- `GET /api/equipment/stats`: aggregate por categoría con `equipmentCount`, `totalUnits`, `availableUnits` y `borrowedUnits`.
- Ambos listados: `search` por nombre, `page` (desde 1), `limit` (1–50) y `sort` con prefijo `-` para descendente. Respuesta: `{ data, page, limit, total, pages }`.
- Músicos: `band=<ObjectId>`, `active=true|false`; orden por `name`, `instrument`, `createdAt`.
- Equipos: `category=audio`, `available=true|false`; orden por `name`, `category`, `totalUnits`, `availableUnits`, `createdAt`. `available=false` selecciona disponibilidad cero.

La banda debe existir al crear o reasignar un músico. Los campos no permitidos se ignoran, siguiendo la convención existente. Los errores usan el middleware compartido: 400 para validación, 404 para recursos/IDs inexistentes y 409 para conflictos.

## Inventario y préstamos

Al crear equipo, `availableUnits` se inicializa con `totalUnits`; el cliente no puede editar disponibilidad directamente. Al actualizar el total, se mantiene `prestadas = total anterior - disponibles anteriores` y se calcula `disponibles nuevas = total nuevo - prestadas`. Se rechaza con 409 un total menor que las unidades prestadas. La escritura compara el inventario leído para detectar cambios concurrentes; ante 409 se debe consultar y reintentar.

El borrado comprueba atómicamente que `totalUnits === availableUnits`; si hay unidades prestadas devuelve 409. Esta regla requiere que la persona 4 descuente/reponga disponibilidad junto al préstamo mediante su transacción. No se importa un modelo Loan todavía inexistente. La integración debe probar que cualquier préstamo pendiente mantiene esa diferencia de inventario, incluso si una reserva aún no inicia.

## Índices

| Modelo | Índice | Propósito |
|--------|--------|-----------|
| Musician | `{ band: 1, active: 1 }` | Consultar músicos por banda y actividad; también sirve para consultas de la banda. |
| Equipment | `name` único | Evitar nombres repetidos (409). |
| Equipment | `{ category: 1, availableUnits: 1 }` | Filtrar equipos por categoría y disponibilidad. |

La búsqueda parcial con regex sin distinguir mayúsculas no tiene garantizado usar estos índices.

## Verificación y Postman

Importar `postman/Cabina-musicos-equipos.postman_collection.json` y el environment Cabina existente. Ejecutar en orden con la API integrada: crea recursos propios, guarda sus IDs, verifica CRUD, filtros, errores, inventario y estadísticas y limpia los registros al finalizar. Sobrescribe `bandId`, `musicianId` y `equipmentId` del environment. Requiere también el módulo Booking para cargar las rutas de bandas existentes.

Prueba de integración pendiente con persona 4: crear equipo con 4 unidades, prestar 2; verificar borrado 409 y reducción a 1 con 409; aumentar el total a 5 y comprobar disponibilidad 3; devolver el préstamo y comprobar disponibilidad 5; eliminar el equipo. También probar actualización de total simultánea con un préstamo: debe preservar el inventario o devolver 409.

Las pruebas locales de reglas se ejecutan con `node --test tests/persona2.test.js` cuando Mongoose esté instalado. No sustituyen pruebas contra MongoDB y las transacciones integradas.
