const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Booking = require('../src/models/Booking');
const Room = require('../src/models/Room');
const Band = require('../src/models/Band');
const Musician = require('../src/models/Musician');
const Loan = require('../src/models/Loan');
const controller = require('../src/controllers/bookingController');
const {
  parseBookingDate,
  checkBookingRules,
  checkStatusChange,
  checkEquipmentLines,
} = require('../src/utils/bookingRules');

const ROOM_ID = '507f1f77bcf86cd799439012';
const BAND_ID = '507f1f77bcf86cd799439013';
const BOOKING_ID = '507f1f77bcf86cd799439011';
const FUTURE = '2099-11-02';

const status = (code) => (error) => error.status === code;

// Imita findById(...).session(...): las reglas leen siempre con la sesión de la transacción.
const withSession = (value) => ({ session: async () => value });

// Simula sala, banda, músicos y traslapes. Devuelve el filtro usado para buscar traslapes.
function mockRules(t, { room = {}, band = {}, musicians = 2, overlap = null } = {}) {
  const calls = {};
  t.mock.method(Room, 'findById', () =>
    withSession(room && { _id: ROOM_ID, status: 'disponible', capacity: 5, ...room }));
  t.mock.method(Band, 'findById', () => withSession(band && { _id: BAND_ID, active: true, ...band }));
  t.mock.method(Musician, 'countDocuments', () => withSession(musicians));
  t.mock.method(Booking, 'exists', (filter) => {
    calls.overlapFilter = filter;
    return withSession(overlap);
  });
  return calls;
}

const bookingData = (extra = {}) => ({
  room: ROOM_ID, band: BAND_ID, date: FUTURE, startHour: 10, endHour: 12, ...extra,
});

test('modelo Booking: validaciones, estado por defecto y durationHours', async () => {
  const booking = new Booking({ ...bookingData(), date: parseBookingDate(FUTURE) });
  await booking.validate();
  assert.equal(booking.status, 'apartada');
  assert.equal(booking.durationHours, 2);
  assert.equal(booking.toJSON().durationHours, 2);

  for (const cambio of [{ startHour: 7 }, { endHour: 23 }, { startHour: 10.5 }, { status: 'pendiente' }]) {
    await assert.rejects(new Booking({ ...booking.toObject(), ...cambio }).validate());
  }
});

test('parseBookingDate normaliza a medianoche UTC y rechaza fechas inválidas', () => {
  assert.equal(parseBookingDate('2026-11-02').toISOString(), '2026-11-02T00:00:00.000Z');
  assert.equal(
    parseBookingDate(new Date('2026-11-02T15:30:00Z')).toISOString(),
    '2026-11-02T00:00:00.000Z'
  );
  for (const value of [undefined, '', '02-11-2026', '2026-2-1', '2026-02-31', 20261102]) {
    assert.throws(() => parseBookingDate(value), status(400));
  }
});

test('checkStatusChange solo permite las transiciones definidas', () => {
  checkStatusChange('apartada', 'confirmada');
  checkStatusChange('apartada', 'cancelada');
  checkStatusChange('confirmada', 'cancelada');
  checkStatusChange('confirmada', undefined);
  checkStatusChange('confirmada', 'confirmada');
  assert.throws(() => checkStatusChange('confirmada', 'apartada'), status(409));
  assert.throws(() => checkStatusChange('cancelada', 'apartada'), status(409));
  assert.throws(() => checkStatusChange('apartada', 'pendiente'), status(400));
});

test('checkEquipmentLines valida formato, unidades y equipos repetidos', () => {
  const id = '507f1f77bcf86cd799439014';
  assert.deepEqual(checkEquipmentLines(undefined), []);
  assert.deepEqual(checkEquipmentLines([{ equipmentId: id, units: 2, extra: 'x' }]), [
    { equipmentId: id, units: 2 },
  ]);
  assert.throws(() => checkEquipmentLines('amplificador'), status(400));
  assert.throws(() => checkEquipmentLines([null]), status(400));
  assert.throws(() => checkEquipmentLines([{ equipmentId: id, units: 0 }]), status(400));
  assert.throws(() => checkEquipmentLines([{ equipmentId: id, units: 1.5 }]), status(400));
  assert.throws(() => checkEquipmentLines([{ equipmentId: 'abc', units: 1 }]), status(404));
  assert.throws(
    () => checkEquipmentLines([{ equipmentId: id, units: 1 }, { equipmentId: id, units: 2 }]),
    status(400)
  );
});

test('checkBookingRules acepta una reserva válida y arma bien la búsqueda de traslapes', async (t) => {
  const calls = mockRules(t);
  const { date } = await checkBookingRules(bookingData(), { excludeId: BOOKING_ID });
  assert.equal(date.toISOString(), `${FUTURE}T00:00:00.000Z`);

  const filter = calls.overlapFilter;
  assert.deepEqual(filter.status, { $in: ['apartada', 'confirmada'] });
  assert.deepEqual(filter.startHour, { $lt: 12 });
  assert.deepEqual(filter.endHour, { $gt: 10 });
  assert.deepEqual(filter._id, { $ne: BOOKING_ID });
});

test('checkBookingRules rechaza fecha, horario y duración inválidos', async (t) => {
  mockRules(t);
  const casos = [
    { date: '2020-01-01' },
    { startHour: 7 },
    { endHour: 23 },
    { startHour: 12, endHour: 12 },
    { startHour: 14, endHour: 12 },
    { startHour: 10, endHour: 14 },
  ];
  for (const cambio of casos) {
    await assert.rejects(checkBookingRules(bookingData(cambio)), status(400));
  }
  // Al editar sin cambiar la fecha, una reserva de un día pasado no se rechaza por la fecha.
  await checkBookingRules(bookingData({ date: '2020-01-01' }), { checkDate: false });
});

test('checkBookingRules revisa sala, banda, músicos, capacidad y traslapes', async (t) => {
  const casos = [
    [{ room: null }, 404],
    [{ room: { status: 'mantenimiento' } }, 409],
    [{ band: null }, 404],
    [{ band: { active: false } }, 409],
    [{ musicians: 0 }, 409],
    [{ room: { capacity: 3 }, musicians: 4 }, 409],
    [{ overlap: { _id: BOOKING_ID } }, 409],
  ];
  for (const [mock, code] of casos) {
    mockRules(t, mock);
    await assert.rejects(checkBookingRules(bookingData()), status(code));
    t.mock.restoreAll();
  }
  await assert.rejects(checkBookingRules(bookingData({ room: 'abc' })), status(404));
});

test('updateBooking: cancelada no se edita, cancelar solo aplica status y notes', async (t) => {
  let current;
  const query = (value) => ({
    session: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  });
  t.mock.method(Booking, 'findById', () => query(current));
  t.mock.method(Loan, 'find', () => ({ session: async () => [] }));
  t.mock.method(mongoose, 'startSession', async () => ({
    async withTransaction(callback) { await callback(); },
    async endSession() {},
  }));
  const load = (estado) => {
    current = new Booking({ ...bookingData(), date: parseBookingDate(FUTURE), status: estado });
    current.save = async function () { await this.validate(); return this; };
  };
  let response;
  const res = { json(value) { response = value; } };
  const req = (body) => ({ params: { id: BOOKING_ID }, body });

  load('cancelada');
  await assert.rejects(controller.updateBooking(req({ notes: 'x' }), res), status(409));

  load('confirmada');
  await assert.rejects(controller.updateBooking(req({ status: 'apartada' }), res), status(409));

  load('confirmada');
  await controller.updateBooking(req({ status: 'cancelada', startHour: 8, notes: 'Se canceló' }), res);
  assert.equal(response.status, 'cancelada');
  assert.equal(response.startHour, 10);
  assert.equal(response.notes, 'Se canceló');

  load('apartada');
  const calls = mockRules(t);
  await controller.updateBooking(req({ endHour: 13 }), res);
  assert.equal(response.durationHours, 3);
  assert.deepEqual(calls.overlapFilter._id, { $ne: current._id });
});

test('getBookingStats filtra por rango de fechas y valida from/to', async (t) => {
  let pipeline;
  t.mock.method(Booking, 'aggregate', async (value) => {
    pipeline = value;
    return [{ byStatus: [], byRoom: [] }];
  });
  let response;
  const res = { json(value) { response = value; } };

  await controller.getBookingStats({ query: { from: '2026-11-01', to: '2026-11-30' } }, res);
  assert.deepEqual(pipeline[0].$match.date, {
    $gte: new Date('2026-11-01T00:00:00.000Z'),
    $lte: new Date('2026-11-30T00:00:00.000Z'),
  });
  assert.deepEqual(Object.keys(pipeline[1].$facet), ['byStatus', 'byRoom']);
  assert.deepEqual(response, { byStatus: [], byRoom: [] });

  await assert.rejects(
    controller.getBookingStats({ query: { from: '2026-12-01', to: '2026-11-01' } }, res),
    status(400)
  );
});
