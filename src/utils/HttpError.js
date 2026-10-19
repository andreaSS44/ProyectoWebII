// Error con código HTTP. Lo usamos para responder 400, 404 y 409.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = HttpError;
