
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const Equipment = require('../models/Equipment');
const Loan = require('../models/Loan');
const HttpError = require('../utils/HttpError');
const { checkId, pick } = require('../utils/helpers');
const { parseListQuery, searchRegex, pageResponse } = require('../utils/listQuery');

const {
  ESTADOS_ACTIVOS,
  TRANSICIONES,
  parseBookingDate,
  checkBookingRules,
  checkStatusChange,
  checkEquipmentLines,
} = require('../utils/bookingRules');

const CAMPOS = ['room', 'band', 'date', 'startHour', 'endHour', 'notes'];
const CAMPOS_HORARIO = ['room', 'band', 'date', 'startHour', 'endHour'];
const ESTADOS = Object.keys(TRANSICIONES);

// Construir el rango de fechas
function dateRange(query) {
  if (query.from === undefined && query.to === undefined) return null;

  const range = {};

  if (query.from !== undefined) {
    range.$gte = parseBookingDate(query.from);
  }

  if (query.to !== undefined) {
    range.$lte = parseBookingDate(query.to);
  }

  if (range.$gte && range.$lte && range.$gte > range.$lte) {
    throw new HttpError(400, 'from no puede ser posterior a to');
  }

  return range;
}

// Crear reserva y registrar préstamos
async function createBookingWithSession(data, equipment, session) {
  const { date } = await checkBookingRules(data, { session });

  const [booking] = await Booking.create(
    [{ ...data, date }],
    { session }
  );

  // Descontar equipos disponibles
  for (const item of equipment) {
    const existingEquipment = await Equipment.findById(item.equipmentId).session(session);
    if (!existingEquipment) {
      throw new HttpError(404, 'El equipo no existe');
    }

    const updatedEquipment = await Equipment.findOneAndUpdate(
      {
        _id: item.equipmentId,
        availableUnits: { $gte: item.units },
      },
      {
        $inc: { availableUnits: -item.units },
      },
      {
        new: true,
        session,
        runValidators: true,
      }
    );

    if (!updatedEquipment) {
      throw new HttpError(
        409,
        'El equipo no tiene suficientes unidades disponibles'
      );
    }

    // Guardar el préstamo
    await Loan.create(
      [{
        booking: booking._id,
        equipment: item.equipmentId,
        units: item.units,
        status: 'prestado',
      }],
      { session }
    );
  }

  return booking;
}

// POST /api/bookings
async function createBooking(req, res) {
  const data = pick(req.body, CAMPOS);
  const equipment = checkEquipmentLines(req.body.equipment);

  const session = await mongoose.startSession();
  let booking;

  try {
    // Ejecutar la creación como transacción
    await session.withTransaction(async () => {
      booking = await createBookingWithSession(
        data,
        equipment,
        session
      );
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json(booking);
}

// GET /api/bookings
async function getBookings(req, res) {
  const { page, limit, skip, sort } = parseListQuery(req.query, {
    sortFields: ['date', 'startHour', 'createdAt'],
    defaultSort: { date: 1, startHour: 1 },
  });

  const filter = {};

  if (req.query.search) {
    filter.notes = searchRegex(req.query.search);
  }

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
      throw new HttpError(
        400,
        'status debe ser apartada, confirmada o cancelada'
      );
    }

    filter.status = req.query.status;
  }

  if (req.query.date !== undefined) {
    filter.date = parseBookingDate(req.query.date);
  } else {
    const range = dateRange(req.query);
    if (range) filter.date = range;
  }

  const [data, total] = await Promise.all([
    Booking.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('room band'),
    Booking.countDocuments(filter),
  ]);

  res.json(pageResponse(data, page, limit, total));
}

// GET /api/bookings/:id
async function getBooking(req, res) {
  checkId(req.params.id);

  const booking = await Booking.findById(req.params.id)
    .populate({ path: 'room', select: 'name capacity status' })
    .populate({
      path: 'band',
      select: 'name genre',
      populate: {
        path: 'musicians',
        match: { active: true },
        select: 'name instrument email active',
      },
    })
    .populate({
      path: 'loans',
      populate: { path: 'equipment' },
    });

  if (!booking) {
    throw new HttpError(404, 'La reserva no existe');
  }

  res.json(booking);
}

// Cancelar reserva y devolver equipos
async function cancelBooking(booking, session) {
  checkStatusChange(booking.status, 'cancelada');

  if (booking.status === 'cancelada') {
    throw new HttpError(409, 'La reserva ya está cancelada');
  }

  // Buscar préstamos pendientes
  const loans = await Loan.find({
    booking: booking._id,
    status: 'prestado',
  }).session(session);

  for (const loan of loans) {
    // Devolver unidades al inventario
    const equipment = await Equipment.findOneAndUpdate(
      {
        _id: loan.equipment,
        $expr: {
          $lte: [
            { $add: ['$availableUnits', loan.units] },
            '$totalUnits',
          ],
        },
      },
      {
        $inc: { availableUnits: loan.units },
      },
      {
        new: true,
        session,
        runValidators: true,
      }
    );

    if (!equipment) {
      throw new HttpError(
        409,
        'No se pudo devolver el equipo al inventario'
      );
    }

    // Marcar préstamo como devuelto
    loan.status = 'devuelto';
    await loan.save({ session });
  }

  booking.status = 'cancelada';
  await booking.save({ session });

  return booking;
}

// PATCH /api/bookings/:id/cancel
async function cancelBookingById(req, res) {
  checkId(req.params.id);

  const session = await mongoose.startSession();
  let booking;

  try {
    await session.withTransaction(async () => {
      booking = await Booking.findById(req.params.id)
        .session(session);

      if (!booking) {
        throw new HttpError(404, 'La reserva no existe');
      }

      booking = await cancelBooking(booking, session);
    });
  } finally {
    await session.endSession();
  }

  res.json(booking);
}

// PUT /api/bookings/:id
async function updateBooking(req, res) {
  checkId(req.params.id);

  const { status } = req.body;
  const data = pick(req.body, CAMPOS);

  // Cancelar dentro de una transacción
  if (status === 'cancelada') {
    const session = await mongoose.startSession();
    let booking;

    try {
      await session.withTransaction(async () => {
        booking = await Booking.findById(req.params.id)
          .session(session);

        if (!booking) {
          throw new HttpError(404, 'La reserva no existe');
        }

        if (data.notes !== undefined) {
          booking.notes = data.notes;
        }

        booking = await cancelBooking(booking, session);
      });
    } finally {
      await session.endSession();
    }

    return res.json(booking);
  }

  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    throw new HttpError(404, 'La reserva no existe');
  }

  if (booking.status === 'cancelada') {
    throw new HttpError(409, 'No se puede editar una reserva cancelada');
  }

  checkStatusChange(booking.status, status);

  // Toda actualización vuelve a comprobar las reglas de la reserva.
  const merged = {};
  for (const campo of CAMPOS_HORARIO) {
    merged[campo] = data[campo] !== undefined ? data[campo] : booking[campo];
  }
  const { date } = await checkBookingRules(merged, {
    excludeId: booking._id,
    checkDate: data.date !== undefined,
  });
  if (data.date !== undefined) {
    data.date = date;
  }

  booking.set(data);

  if (status !== undefined) {
    booking.status = status;
  }

  await booking.save();
  res.json(booking);
}

// GET /api/bookings/stats
async function getBookingStats(req, res) {
  const match = {};
  const range = dateRange(req.query);

  if (range) match.date = range;

  const horas = {
    $subtract: ['$endHour', '$startHour'],
  };

  const [stats] = await Booking.aggregate([
    { $match: match },
    {
      $facet: {
        byStatus: [
          {
            $group: {
              _id: '$status',
              bookings: { $sum: 1 },
              totalHours: { $sum: horas },
            },
          },
          {
            $project: {
              _id: 0,
              status: '$_id',
              bookings: 1,
              totalHours: 1,
            },
          },
          { $sort: { status: 1 } },
        ],
        byRoom: [
          {
            $match: {
              status: { $in: ESTADOS_ACTIVOS },
            },
          },
          {
            $group: {
              _id: '$room',
              bookings: { $sum: 1 },
              totalHours: { $sum: horas },
            },
          },
          {
            $lookup: {
              from: Room.collection.name,
              localField: '_id',
              foreignField: '_id',
              as: 'room',
            },
          },
          { $unwind: '$room' },
          {
            $project: {
              _id: 0,
              room: '$_id',
              name: '$room.name',
              bookings: 1,
              totalHours: 1,
            },
          },
          { $sort: { bookings: -1, name: 1 } },
        ],
      },
    },
  ]);

  res.json(stats);
}

module.exports = {
  createBookingWithSession,
  createBooking,
  getBookings,
  getBooking,
  cancelBooking,
  cancelBookingById,
  updateBooking,
  getBookingStats,
};
