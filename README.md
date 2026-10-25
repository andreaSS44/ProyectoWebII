# Cabina API

API backend para administrar salas de ensayo, bandas, músicos, reservas y préstamos de equipo de un centro cultural.

## Integrantes

- Andrea Salazar Salas
- Daniela Rodriguez
- Joselyn Segura
- Shauney Arguello

## Tecnologías

- Node.js y Express
- MongoDB Atlas con Mongoose
- Postman

Todas las respuestas de la API son JSON.

## Instalación

1. Clonar el repositorio.
2. Ejecutar `npm install`.
3. Copiar `.env.example` como `.env`.
4. Colocar en `MONGODB_URI` la cadena de conexión de MongoDB Atlas.
5. Ejecutar `npm run dev`.

La API queda disponible por defecto en `http://localhost:3000`. MongoDB Atlas debe utilizar una configuración que permita transacciones.

## Variables de entorno

```env
PORT=3000
MONGODB_URI=REEMPLAZAR_CON_TU_CADENA_DE_CONEXION
```

El archivo `.env` contiene la conexión real y no se incluye en Git. `.env.example` no contiene credenciales.

## Endpoints

- Salas: `POST/GET /api/rooms`, `GET/PUT/DELETE /api/rooms/:id`, `GET /api/rooms/:id/schedule`, `GET /api/rooms/stats`.
- Bandas: `POST/GET /api/bands`, `GET/PUT/DELETE /api/bands/:id`, `GET /api/bands/:id/musicians`, `GET /api/bands/:id/bookings`.
- Músicos: `POST/GET /api/musicians`, `GET/PUT/DELETE /api/musicians/:id`.
- Equipo: `POST/GET /api/equipment`, `GET/PUT/DELETE /api/equipment/:id`, `GET /api/equipment/stats`.
- Reservas: `POST/GET /api/bookings`, `GET/PUT /api/bookings/:id`, `PATCH /api/bookings/:id/cancel`, `GET /api/bookings/stats`.
- Préstamos: `GET /api/loans`, `GET /api/loans/:id`.

Los seis listados aceptan `page`, `limit`, `sort` y `search`, además de los filtros propios de cada recurso. Responden con:

```json
{
  "data": [],
  "page": 1,
  "limit": 10,
  "total": 0,
  "pages": 0
}
```

Los errores responden como `{ "error": "mensaje claro" }` usando 400 para datos inválidos, 404 para recursos inexistentes y 409 para conflictos de negocio.

## Índices

| Modelo | Índice | Consulta que favorece |
|---|---|---|
| Room | `name` único | Búsqueda y prevención de salas repetidas. |
| Band | `name` único | Búsqueda y prevención de bandas repetidas. |
| Musician | `email` único | Búsqueda y prevención de correos repetidos. |
| Musician | `{ band: 1 }` | Músicos pertenecientes a una banda. |
| Booking | `{ room: 1, date: 1, startHour: 1 }` | Horario diario de una sala y detección de traslapes. |
| Equipment | `name` único | Búsqueda y prevención de equipos repetidos. |
| Loan | `{ booking: 1 }` | Préstamos pertenecientes a una reserva. |
| Loan | `{ equipment: 1, status: 1 }` | Préstamos de un equipo filtrados por estado. |

Los índices únicos también permiten que el middleware transforme el error `11000` de MongoDB en una respuesta 409.

## Reglas de reservas

Al crear o actualizar una reserva se comprueba que la fecha sea válida, que el horario esté entre 8 y 22, que el final sea posterior al inicio y que la duración no supere tres horas. También se valida que la sala esté disponible, la banda esté activa, tenga músicos activos, que estos quepan en la sala y que no exista otra reserva activa traslapada.

Los cambios de estado permitidos son `apartada → confirmada`, `apartada → cancelada` y `confirmada → cancelada`. Una reserva cancelada no vuelve a otro estado.

## Transacción

Las transacciones están en `createBooking` y `cancelBookingById` de `src/controllers/bookingController.js`. Ambas abren una sesión mediante `mongoose.startSession()` y ejecutan los cambios dentro de `session.withTransaction()`.

Al crear una reserva, la misma transacción:

1. Comprueba las reglas y los traslapes.
2. Comprueba la existencia y disponibilidad del equipo.
3. Crea el documento `Booking`.
4. Crea los documentos `Loan` en estado `prestado`.
5. Descuenta `availableUnits` con `$inc`.

Al cancelar, la misma transacción cambia el `Booking` a `cancelada`, cambia sus préstamos pendientes a `devuelto` y devuelve las unidades con `$inc`. Si cualquier operación falla, MongoDB revierte todos los cambios, por lo que no queda una reserva sin sus préstamos ni inventario descontado sin reserva.

Para probar el conflicto 409 se crea un equipo con pocas unidades y luego se intenta reservar una cantidad mayor que `availableUnits`. La reserva, el préstamo y el descuento se revierten juntos. También se puede prestar equipo e intentar borrarlo o reducir `totalUnits` por debajo de las unidades prestadas.

## Postman

Importar la colección `postman/Cabina.postman_collection.json` y el environment `postman/Cabina.postman_environment.json`. Ejecutar las carpetas en este orden: Salas, Bandas, Músicos, Equipo, Reservas, Consultas y Errores.

El environment contiene `baseUrl`, `roomId`, `bandId`, `musicianId`, `equipmentId`, `bookingId` y `loanId`. Los requests de creación guardan automáticamente los IDs y los casos del camino feliz validan el código de respuesta.

## Pruebas

```bash
npm test
```

Las pruebas unitarias complementan, pero no sustituyen, la ejecución de la colección Postman contra MongoDB Atlas.
