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
