const Equipment = require('../models/Equipment');
const HttpError = require('../utils/HttpError');
const { checkId, pick } = require('../utils/helpers');
const { parseListQuery, searchRegex, pageResponse } = require('../utils/listQuery');
const { booleanFilter } = require('../utils/resourceFilters');
const CAMPOS = ['name', 'category', 'totalUnits'];

async function createEquipment(req, res) {
  // La disponibilidad inicial es el total. Solo préstamos modifica disponibilidad.
  res.status(201).json(await Equipment.create(pick(req.body, CAMPOS)));
}

async function getEquipmentList(req, res) {
  const { page, limit, skip, sort } = parseListQuery(req.query, {
    sortFields: ['name', 'availableUnits', 'createdAt'],
    defaultSort: { name: 1 },
  });
  const filter = {};
  if (req.query.search) filter.name = searchRegex(req.query.search);
  if (req.query.category !== undefined) {
    if (typeof req.query.category !== 'string' || !req.query.category.trim()) {
      throw new HttpError(400, 'category debe ser texto no vacío');
    }
    filter.category = req.query.category.trim().toLowerCase();
  }
  if (req.query.available !== undefined) {
    filter.availableUnits = booleanFilter(req.query.available, 'available') ? { $gt: 0 } : 0;
  }
  const [data, total] = await Promise.all([
    Equipment.find(filter).sort(sort).skip(skip).limit(limit), Equipment.countDocuments(filter),
  ]);
  res.json(pageResponse(data, page, limit, total));
}

async function findEquipment(id) {
  checkId(id);
  const equipment = await Equipment.findById(id);
  if (!equipment) throw new HttpError(404, 'El equipo no existe');
  return equipment;
}

async function getEquipment(req, res) { res.json(await findEquipment(req.params.id)); }

async function updateEquipment(req, res) {
  const equipment = await findEquipment(req.params.id);
  const data = pick(req.body, CAMPOS);
  const previousTotal = equipment.totalUnits;
  const previousAvailable = equipment.availableUnits;
  equipment.set(data);
  if (data.totalUnits !== undefined) {
    const borrowed = previousTotal - previousAvailable;
    if (equipment.totalUnits < borrowed) {
      throw new HttpError(409, 'totalUnits no puede ser menor que las unidades prestadas');
    }
    equipment.availableUnits = equipment.totalUnits - borrowed;
  }
  await equipment.validate();
  // Compara inventario en la misma escritura para detectar préstamos concurrentes.
  const updated = await Equipment.findOneAndUpdate({
    _id: equipment._id, totalUnits: previousTotal, availableUnits: previousAvailable,
  }, { $set: { ...pick(equipment, CAMPOS), availableUnits: equipment.availableUnits } }, { new: true });
  if (!updated) throw new HttpError(409, 'El inventario cambió; vuelva a intentar');
  res.json(updated);
}

async function deleteEquipment(req, res) {
  const equipment = await findEquipment(req.params.id);
  // Un préstamo pendiente se representa por totalUnits > availableUnits.
  const deleted = await Equipment.findOneAndDelete({
    _id: equipment._id, $expr: { $eq: ['$totalUnits', '$availableUnits'] },
  });
  if (!deleted) throw new HttpError(409, 'No se puede borrar equipo prestado o cuyo inventario cambió');
  res.json({ message: 'Equipo eliminado' });
}

async function getEquipmentStats(req, res) {
  res.json(await Equipment.aggregate([
    { $group: {
      _id: '$category', equipmentCount: { $sum: 1 },
      totalUnits: { $sum: '$totalUnits' }, availableUnits: { $sum: '$availableUnits' },
      borrowedUnits: { $sum: { $subtract: ['$totalUnits', '$availableUnits'] } },
    } },
    { $project: { _id: 0, category: '$_id', equipmentCount: 1, totalUnits: 1, availableUnits: 1, borrowedUnits: 1 } },
    { $sort: { category: 1 } },
  ]));
}

module.exports = { createEquipment, getEquipmentList, getEquipment, updateEquipment, deleteEquipment, getEquipmentStats };
