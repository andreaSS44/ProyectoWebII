
const Loan = require('../models/Loan');
const HttpError = require('../utils/HttpError');
const { checkId } = require('../utils/helpers');
const {
  parseListQuery,
  searchRegex,
  pageResponse,
} = require('../utils/listQuery');

// GET /api/loans
// Consultar préstamos con filtros, búsqueda y paginación.
async function getLoans(req, res) {
  const { page, limit, skip, sort } = parseListQuery(req.query, {
    sortFields: ['units', 'createdAt'],
    defaultSort: { createdAt: 1 },
  });

  const filter = {};

  // Filtrar por estado.
  if (req.query.status !== undefined) {
    if (!['prestado', 'devuelto'].includes(req.query.status)) {
      throw new HttpError(400, 'El estado no es válido');
    }
    filter.status = req.query.status;
  }

  // Filtrar por reserva.
  if (req.query.booking !== undefined) {
    checkId(req.query.booking);
    filter.booking = req.query.booking;
  }

  // Filtrar por equipo.
  if (req.query.equipment !== undefined) {
    checkId(req.query.equipment);
    filter.equipment = req.query.equipment;
  }

  // Buscar por estado sin distinguir mayúsculas.
  if (req.query.search !== undefined) {
    filter.status = {
      $regex: searchRegex(req.query.search),
    };

    // Si también se envía status, conservar ambos criterios.
    if (req.query.status !== undefined) {
      filter.$and = [
        { status: req.query.status },
        { status: { $regex: searchRegex(req.query.search) } },
      ];
      delete filter.status;
    }
  }

  const [data, total] = await Promise.all([
    Loan.find(filter)
      .populate('booking')
      .populate('equipment')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Loan.countDocuments(filter),
  ]);

  res.json(pageResponse(data, page, limit, total));
}

// GET /api/loans/:id
// Consultar un préstamo por su ID.
async function getLoanById(req, res) {
  const { id } = req.params;

  checkId(id);

  const loan = await Loan.findById(id)
    .populate('booking')
    .populate('equipment');

  if (!loan) {
    throw new HttpError(404, 'Préstamo no encontrado');
  }

  res.json(loan);
}

module.exports = {
  getLoans,
  getLoanById,
};
