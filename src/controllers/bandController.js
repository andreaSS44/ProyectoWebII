const Band = require('../models/Band');
const Musician = require('../models/Musician');
const Booking = require('../models/Booking');
const HttpError = require('../utils/HttpError');
const { checkId, pick } = require('../utils/helpers');
const { parseListQuery, searchRegex, pageResponse } = require('../utils/listQuery');

const CAMPOS = ['name', 'genre', 'active', 'contactName'];
const ESTADOS_ACTIVOS = ['apartada', 'confirmada'];

// Busca la banda o responde 404
async function findBandOr404(id) {
  checkId(id);
  const band = await Band.findById(id);
  if (!band) throw new HttpError(404, 'La banda no existe');
  return band;
}

// POST /api/bands
async function createBand(req, res) {
  const band = await Band.create(pick(req.body, CAMPOS));
  res.status(201).json(band);
}

// GET /api/bands
async function getBands(req, res) {
  const { page, limit, skip, sort } = parseListQuery(req.query, {
    sortFields: ['name', 'createdAt'],
    defaultSort: { name: 1 },
  });

  const filter = {};
  if (req.query.search) {
    filter.name = searchRegex(req.query.search);
  }

  const [data, total] = await Promise.all([
    Band.find(filter).sort(sort).skip(skip).limit(limit),
    Band.countDocuments(filter),
  ]);

  res.json(pageResponse(data, page, limit, total));
}

// GET /api/bands/:id  (incluye sus músicos con populate)
async function getBand(req, res) {
  checkId(req.params.id);
  const band = await Band.findById(req.params.id).populate('musicians');
  if (!band) throw new HttpError(404, 'La banda no existe');
  res.json(band);
}

// PUT /api/bands/:id
async function updateBand(req, res) {
  const band = await findBandOr404(req.params.id);
  band.set(pick(req.body, CAMPOS));
  await band.save();
  res.json(band);
}

// DELETE /api/bands/:id
async function deleteBand(req, res) {
  const band = await findBandOr404(req.params.id);

  const reservaActiva = await Booking.exists({
    band: band._id,
    status: { $in: ESTADOS_ACTIVOS },
  });
  if (reservaActiva) {
    throw new HttpError(409, 'No se puede borrar la banda: tiene reservas apartadas o confirmadas');
  }

  const tieneMusicos = await Musician.exists({ band: band._id });
  if (tieneMusicos) {
    throw new HttpError(409, 'No se puede borrar la banda: todavía tiene músicos');
  }

  await band.deleteOne();
  res.json({ message: 'Banda eliminada' });
}

// GET /api/bands/:id/musicians
async function getBandMusicians(req, res) {
  const band = await findBandOr404(req.params.id);
  const musicians = await Musician.find({ band: band._id }).sort({ name: 1 });
  res.json(musicians);
}

// GET /api/bands/:id/bookings  (cada reserva trae su sala)
async function getBandBookings(req, res) {
  const band = await findBandOr404(req.params.id);
  const bookings = await Booking.find({ band: band._id })
    .sort({ date: 1, startHour: 1 })
    .populate('room');
  res.json(bookings);
}

module.exports = {
  createBand,
  getBands,
  getBand,
  updateBand,
  deleteBand,
  getBandMusicians,
  getBandBookings,
};
