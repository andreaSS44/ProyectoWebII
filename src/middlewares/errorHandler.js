const HttpError = require('../utils/HttpError');

// Ruta que no existe
function notFound(req, res, next) {
  next(new HttpError(404, 'Ruta no encontrada'));
}

// Todos los errores salen como { "error": "mensaje" }
function errorHandler(err, req, res, next) {
  // JSON mal formado en el body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El JSON enviado está mal formado' });
  }

  // Error de validación de Mongoose
  if (err.name === 'ValidationError') {
    const mensajes = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: mensajes.join('. ') });
  }

  // Valor con tipo incorrecto
  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Valor inválido en ${err.path}` });
  }

  // Valor repetido en un campo único
  if (err.code === 11000) {
    const campo = Object.keys(err.keyValue || {})[0] || 'campo';
    return res.status(409).json({ error: `Ya existe un registro con ese ${campo}` });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = { notFound, errorHandler };
