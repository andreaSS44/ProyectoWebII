const Room = require('../models/Room');
const Booking = require('../models/Booking');
const HttpError = require('../utils/HttpError');
const { checkId, pick } = require('../utils/helpers');
const { parseListQuery, searchRegex, pageResponse } = require('../utils/listQuery');

const CAMPOS = ['name', 'capacity', 'floor', 'hasDrumKit', 'status'];
const ESTADOS_ACTIVOS = ['apartada', 'confirmada'];

// POST /api/rooms
async function createRoom(req, res) {
  const room = await Room.create(pick(req.body, CAMPOS));
  res.status(201).json(room);
}

// GET /api/rooms
async function getRooms(req, res) {
  const { page, limit, skip, sort } = parseListQuery(req.query, {
    sortFields: ['name', 'capacity', 'floor', 'createdAt'],
    defaultSort: { name: 1 },
  });

  const filter = {};
  if (req.query.search) {
    filter.name = searchRegex(req.query.search);
  }

  const [data, total] = await Promise.all([
    Room.find(filter).sort(sort).skip(skip).limit(limit),
    Room.countDocuments(filter),
  ]);

  res.json(pageResponse(data, page, limit, total));
}

// GET /api/rooms/:id
async function getRoom(req, res) {
  checkId(req.params.id);
  const room = await Room.findById(req.params.id);
  if (!room) throw new HttpError(404, 'La sala no existe');
  res.json(room);
}

// PUT /api/rooms/:id
async function updateRoom(req, res) {
  checkId(req.params.id);
  const room = await Room.findById(req.params.id);
  if (!room) throw new HttpError(404, 'La sala no existe');

  room.set(pick(req.body, CAMPOS));
  await room.save(); // save() vuelve a correr las validaciones del schema
  res.json(room);
}

// DELETE /api/rooms/:id
async function deleteRoom(req, res) {
  checkId(req.params.id);
  const room = await Room.findById(req.params.id);
  if (!room) throw new HttpError(404, 'La sala no existe');

  const reservaActiva = await Booking.exists({
    room: room._id,
    status: { $in: ESTADOS_ACTIVOS },
  });
  if (reservaActiva) {
    throw new HttpError(409, 'No se puede borrar la sala: tiene reservas apartadas o confirmadas');
  }

  await room.deleteOne();
  res.json({ message: 'Sala eliminada' });
}

// GET /api/rooms/:id/schedule?date=2026-11-02
async function getRoomSchedule(req, res) {
  checkId(req.params.id);
  const room = await Room.findById(req.params.id);
  if (!room) throw new HttpError(404, 'La sala no existe');

  const { date } = req.query;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, 'date es obligatorio y debe tener el formato AAAA-MM-DD');
  }
  const inicio = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(inicio.getTime()) || inicio.toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, 'date no es una fecha válida');
  }
  const fin = new Date(inicio);
  fin.setUTCDate(fin.getUTCDate() + 1);

  // Todas las reservas de ese día en esa sala, ordenadas por hora de inicio
  const bookings = await Booking.find({
    room: room._id,
    date: { $gte: inicio, $lt: fin },
  })
    .sort({ startHour: 1 })
    .populate('band');

  res.json(bookings);
}

// GET /api/rooms/stats
// Por cada sala, cuántas reservas activas (apartada o confirmada) tiene.
async function getRoomStats(req, res) {
  const stats = await Room.aggregate([
    {
      $lookup: {
        from: Booking.collection.name,
        localField: '_id',
        foreignField: 'room',
        pipeline: [{ $match: { status: { $in: ESTADOS_ACTIVOS } } }],
        as: 'activas',
      },
    },
    {
      $project: {
        _id: 0,
        room: '$_id',
        name: 1,
        activeBookings: { $size: '$activas' },
      },
    },
    { $sort: { name: 1 } },
  ]);

  res.json(stats);
}

module.exports = {
  createRoom,
  getRooms,
  getRoom,
  updateRoom,
  deleteRoom,
  getRoomSchedule,
  getRoomStats,
};
