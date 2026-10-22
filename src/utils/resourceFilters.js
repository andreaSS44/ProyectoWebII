const HttpError = require('./HttpError');

function booleanFilter(value, field) {
  if (value !== 'true' && value !== 'false') {
    throw new HttpError(400, `${field} debe ser true o false`);
  }
  return value === 'true';
}

module.exports = { booleanFilter };
