const Room = require('../models/Room');
const Band = require('../models/Band');
const Musician = require('../models/Musician');
const Booking = require('../models/Booking');
const HttpError = require('./HttpError');
const { checkId } = require('./helpers');

const ESTADOS_ACTIVOS = ['apartada', 'confirmada'];
const DURACION_MAXIMA = 3;

// Estados a los que puede pasar cada estado. cancelada no pasa a ninguno.
const TRANSICIONES = {
  apartada: ['confirmada', 'cancelada'],
  confirmada: ['cancelada'],
  cancelada: [],
};

// Convierte "2026-11-02" (o un Date ya guardado) a medianoche UTC de ese día.
function parseBookingDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, 'date es obligatorio y debe tener el formato AAAA-MM-DD');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  // new Date acepta "2026-02-31" y lo pasa a marzo; así se detecta.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, 'date no es una fecha válida');
  }
  return date;
}

// Fecha de hoy como "AAAA-MM-DD" según la hora local del servidor.
function todayString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// La fecha es hoy o un día posterior. Se comparan textos AAAA-MM-DD, que ordenan igual que las fechas.
function checkDateNotPast(date) {
  if (date.toISOString().slice(0, 10) < todayString()) {
    throw new HttpError(400, 'La fecha de la reserva debe ser hoy o un día posterior');
  }
}

// Horas enteras dentro del horario, fin mayor que inicio y máximo 3 horas.
function checkHours(startHour, endHour) {
  if (!Number.isInteger(startHour) || startHour < 8 || startHour > 21) {
    throw new HttpError(400, 'startHour debe ser un entero entre 8 y 21');
  }
  if (!Number.isInteger(endHour) || endHour < 9 || endHour > 22) {
    throw new HttpError(400, 'endHour debe ser un entero entre 9 y 22');
  }
  if (endHour <= startHour) {
    throw new HttpError(400, 'endHour debe ser mayor que startHour');
  }
  if (endHour - startHour > DURACION_MAXIMA) {
    throw new HttpError(400, `La reserva dura como máximo ${DURACION_MAXIMA} horas`);
  }
}

// Revisa todas las reglas de una reserva al crearla o al actualizarla.
// data: { room, band, date, startHour, endHour }
// excludeId: id de la reserva que se edita, para que no choque consigo misma.
// session: sesión de la transacción; así las lecturas ven lo mismo que la transacción.
// checkDate: false al editar sin cambiar la fecha (una reserva de hoy sigue siendo válida mañana).
// Devuelve la sala, la banda y la fecha normalizada para reutilizarlas.
async function checkBookingRules(data, { excludeId = null, session = null, checkDate = true } = {}) {
  const date = parseBookingDate(data.date);
  if (checkDate) checkDateNotPast(date);
  checkHours(data.startHour, data.endHour);

  // La sala existe y está disponible
  checkId(data.room);
  const room = await Room.findById(data.room).session(session);
  if (!room) throw new HttpError(404, 'La sala no existe');
  if (room.status !== 'disponible') {
    throw new HttpError(409, 'La sala está en mantenimiento');
  }

  // La banda existe y está activa
  checkId(data.band);
  const band = await Band.findById(data.band).session(session);
  if (!band) throw new HttpError(404, 'La banda no existe');
  if (!band.active) {
    throw new HttpError(409, 'La banda no está activa');
  }

  // Al menos un músico activo, y que todos los activos quepan en la sala
  const activeMusicians = await Musician.countDocuments({ band: band._id, active: true })
    .session(session);
  if (activeMusicians === 0) {
    throw new HttpError(409, 'La banda no tiene músicos activos');
  }
  if (activeMusicians > room.capacity) {
    throw new HttpError(
      409,
      `La banda tiene ${activeMusicians} músicos activos y la sala admite ${room.capacity}`
    );
  }

  // Traslape: otra reserva activa de la misma sala y fecha cuyas horas se cruzan.
  // Se cruzan si el inicio pedido es menor que el fin de la otra
  // y el fin pedido es mayor que el inicio de la otra (16-18 no choca con 18-20).
  const filter = {
    room: room._id,
    date,
    status: { $in: ESTADOS_ACTIVOS },
    startHour: { $lt: data.endHour },
    endHour: { $gt: data.startHour },
  };
  if (excludeId) filter._id = { $ne: excludeId };

  const overlap = await Booking.exists(filter).session(session);
  if (overlap) {
    throw new HttpError(409, 'La sala ya tiene una reserva que se cruza con ese horario');
  }

  return { room, band, date };
}

// Solo se permiten los cambios de TRANSICIONES. Si no mandan estado o es el mismo, no hay cambio.
function checkStatusChange(from, to) {
  if (to === undefined || from === to) return;
  if (!TRANSICIONES[to]) {
    throw new HttpError(400, 'El estado debe ser apartada, confirmada o cancelada');
  }
  if (!TRANSICIONES[from].includes(to)) {
    throw new HttpError(409, `No se puede pasar una reserva de ${from} a ${to}`);
  }
}

// Formato de las líneas de equipo del body: [{ equipmentId, units }].
// Puede ir vacío. No se repite un equipo. El inventario disponible se revisa en la transacción.
function checkEquipmentLines(equipment) {
  if (equipment === undefined) return [];
  if (!Array.isArray(equipment)) {
    throw new HttpError(400, 'equipment debe ser una lista');
  }

  const vistos = new Set();
  for (const line of equipment) {
    if (!line || typeof line !== 'object') {
      throw new HttpError(400, 'Cada línea de equipment debe tener equipmentId y units');
    }
    checkId(line.equipmentId);
    if (!Number.isInteger(line.units) || line.units < 1) {
      throw new HttpError(400, 'units debe ser un entero mayor que 0');
    }
    const key = String(line.equipmentId);
    if (vistos.has(key)) {
      throw new HttpError(400, 'No se puede pedir dos líneas del mismo equipo');
    }
    vistos.add(key);
  }

  return equipment.map((line) => ({ equipmentId: line.equipmentId, units: line.units }));
}

module.exports = {
  ESTADOS_ACTIVOS,
  TRANSICIONES,
  parseBookingDate,
  checkBookingRules,
  checkStatusChange,
  checkEquipmentLines,
};
