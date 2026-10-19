const HttpError = require('./HttpError');

// Lee page, limit y sort del query string y los valida.
// sortFields: campos permitidos. defaultSort: orden si no mandan sort.
function parseListQuery(query, { sortFields, defaultSort }) {
  let page = 1;
  if (query.page !== undefined) {
    page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) {
      throw new HttpError(400, 'page debe ser un entero mayor o igual a 1');
    }
  }

  let limit = 10;
  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new HttpError(400, 'limit debe ser un entero entre 1 y 50');
    }
  }

  let sort = defaultSort;
  if (query.sort !== undefined) {
    if (typeof query.sort !== 'string') {
      throw new HttpError(400, 'sort no es válido');
    }
    const descending = query.sort.startsWith('-');
    const field = descending ? query.sort.slice(1) : query.sort;
    if (!sortFields.includes(field)) {
      throw new HttpError(
        400,
        `sort solo acepta: ${sortFields.join(', ')} (con - para orden descendente)`
      );
    }
    sort = { [field]: descending ? -1 : 1 };
  }

  return { page, limit, skip: (page - 1) * limit, sort };
}

// Convierte el texto de search en una expresión regular sin distinguir mayúsculas.
// Se escapan los caracteres especiales para que "a.b" se busque tal cual.
function searchRegex(text) {
  const escaped = String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
}

// Arma la respuesta de un listado.
function pageResponse(data, page, limit, total) {
  return { data, page, limit, total, pages: Math.ceil(total / limit) };
}

module.exports = { parseListQuery, searchRegex, pageResponse };
