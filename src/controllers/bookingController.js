const Booking = require('../models/Booking');
const HttpError = require('../utils/HttpError');
const { checkId, pick } = require('../utils/helpers');
const { parseListQuery, pageResponse } = require('../utils/listQuery');
const {
  TRANSICIONES,
  parseBookingDate,
  checkBookingRules,
  checkStatusChange,
  checkEquipmentLines,
} = require('../utils/bookingRules');

const CAMPOS = ['room', 'band', 'date', 'startHour', 'endHour', 'notes'];
// Campos que cambian el horario: si llega alguno se vuelven a revisar las reglas.
const CAMPOS_HORARIO = ['room', 'band', 'date', 'startHour', 'endHour'];
const ESTADOS = Object.keys(TRANSICIONES);

// Revisa las reglas y guarda la reserva usando la sesión que le pasen.
// La persona 4 la envuelve en withTransaction y crea aquí los préstamos de equipment.
async function createBookingWithSession(data, equipment, session = null) {
  const { date } = await checkBookingRules(data, { session });
  const [booking] = await Booking.create([{ ...data, date }], { session });
  return booking;
}

// POST /api/bookings
async function createBooking(req, res) {
  const data = pick(req.body, CAMPOS);
  const equipment = checkEquipmentLines(req.body.equipment);

  const booking = await createBookingWithSession(data, equipment);
  res.status(201).json(booking);
}

// GET /api/bookings
// Filtros: room, band, status, date (un día) o from/to (rango de días).
async function getBookings(req, res) {
  const { page, limit, skip, sort } = parseListQuery(req.query, {
    sortFields: ['date', 'startHour', 'status', 'createdAt'],
    defaultSort: { date: 1, startHour: 1 },
  });

  const filter = {};
  if (req.query.room !== undefined) {
    checkId(req.query.room);
    filter.room = req.query.room;
  }
  if (req.query.band !== undefined) {
    checkId(req.query.band);
    filter.band = req.query.band;
  }
  if (req.query.status !== undefined) {
    if (!ESTADOS.includes(req.query.status)) {
      throw new HttpError(400, 'status debe ser apartada, confirmada o cancelada');
    }
    filter.status = req.query.status;
  }

  if (req.query.date !== undefined) {
    filter.date = parseBookingDate(req.query.date);
  } else if (req.query.from !== undefined || req.query.to !== undefined) {
    filter.date = {};
    if (req.query.from !== undefined) filter.date.$gte = parseBookingDate(req.query.from);
    if (req.query.to !== undefined) filter.date.$lte = parseBookingDate(req.query.to);
    if (filter.date.$gte && filter.date.$lte && filter.date.$gte > filter.date.$lte) {
      throw new HttpError(400, 'from no puede ser posterior a to');
    }
  }

  const [data, total] = await Promise.all([
    Booking.find(filter).sort(sort).skip(skip).limit(limit).populate('room band'),
    Booking.countDocuments(filter),
  ]);

  res.json(pageResponse(data, page, limit, total));
}

// GET /api/bookings/:id
// Cuando exista el modelo Loan se agrega 'loans' al populate.
async function getBooking(req, res) {
  checkId(req.params.id);
  const booking = await Booking.findById(req.params.id).populate('room band');
  if (!booking) throw new HttpError(404, 'La reserva no existe');
  res.json(booking);
}

// Pasa la reserva a cancelada usando la sesión que le pasen.
// La persona 4 la envuelve en withTransaction y devuelve aquí los préstamos ($inc de availableUnits).
async function cancelBooking(booking, session = null) {
  booking.status = 'cancelada';
  await booking.save({ session });
  return booking;
}

// PUT /api/bookings/:id
// Con status: 'cancelada' se cancela la reserva; en ese caso solo se aplican status y notes.
async function updateBooking(req, res) {
  checkId(req.params.id);
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new HttpError(404, 'La reserva no existe');

  if (booking.status === 'cancelada') {
    throw new HttpError(409, 'No se puede editar una reserva cancelada');
  }

  const { status } = req.body;
  checkStatusChange(booking.status, status);
  const data = pick(req.body, CAMPOS);

  if (status === 'cancelada') {
    if (data.notes !== undefined) booking.notes = data.notes;
    await cancelBooking(booking);
    return res.json(booking);
  }

  if (CAMPOS_HORARIO.some((campo) => data[campo] !== undefined)) {
    // Los campos que no mandan se toman de la reserva guardada.
    const merged = {};
    for (const campo of CAMPOS_HORARIO) {
      merged[campo] = data[campo] !== undefined ? data[campo] : booking[campo];
    }
    const { date } = await checkBookingRules(merged, {
      excludeId: booking._id,
      checkDate: data.date !== undefined,
    });
    if (data.date !== undefined) data.date = date;
  }

  booking.set(data);
  if (status !== undefined) booking.status = status;
  await booking.save();
  res.json(booking);
}

module.exports = {
  createBookingWithSession,
  createBooking,
  getBookings,
  getBooking,
  cancelBooking,
  updateBooking,
};
