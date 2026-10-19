const mongoose = require('mongoose');
const HttpError = require('./HttpError');

// Si el id no tiene formato de ObjectId, tampoco puede existir: 404.
function checkId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(404, 'No se encontró el recurso con ese id');
  }
}

// Deja pasar solo los campos permitidos del body.
function pick(body, fields) {
  const result = {};
  if (!body || typeof body !== 'object') return result;
  for (const field of fields) {
    if (body[field] !== undefined) result[field] = body[field];
  }
  return result;
}

module.exports = { checkId, pick };
