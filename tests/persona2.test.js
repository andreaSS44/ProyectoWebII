const { test } = require('node:test');
const assert = require('node:assert/strict');
const Equipment = require('../src/models/Equipment');
const Musician = require('../src/models/Musician');
const controller = require('../src/controllers/equipmentController');
const { booleanFilter } = require('../src/utils/resourceFilters');

test('validaciones de modelos y disponibilidad inicial', async () => {
  const equipment = new Equipment({ name: 'Amplificador', category: ' AUDIO ', totalUnits: 4 });
  await equipment.validate();
  assert.equal(equipment.availableUnits, 4);
  assert.equal(equipment.category, 'audio');
  equipment.totalUnits = 1.5;
  await assert.rejects(equipment.validate());
  equipment.totalUnits = 2;
  await assert.rejects(equipment.validate());
  await assert.rejects(new Musician({ name: 'Ana', instrument: 'guitarra' }).validate());
});

test('filtros booleanos rechazan valores ambiguos', () => {
  assert.equal(booleanFilter('false', 'active'), false);
  assert.equal(booleanFilter('true', 'available'), true);
  for (const value of ['si', '', ['true'], {}]) {
    assert.throws(() => booleanFilter(value, 'active'), error => error.status === 400);
  }
});

test('inventario conserva préstamos y rechaza reducción, colisión y borrado', async () => {
  const original = { findById: Equipment.findById, update: Equipment.findOneAndUpdate, delete: Equipment.findOneAndDelete };
  const id = '507f1f77bcf86cd799439011';
  const req = totalUnits => ({ params: { id }, body: { totalUnits, availableUnits: 999 } });
  let response;
  const res = { json(value) { response = value; } };
  try {
    Equipment.findById = async () => new Equipment({ _id: id, name: 'Amplificador', category: 'audio', totalUnits: 4, availableUnits: 2 });
    Equipment.findOneAndUpdate = async (filter, update) => {
      assert.equal(filter.totalUnits, 4);
      assert.equal(filter.availableUnits, 2);
      assert.equal(update.$set.totalUnits, 5);
      assert.equal(update.$set.availableUnits, 3);
      return update.$set;
    };
    await controller.updateEquipment(req(5), res);
    assert.equal(response.availableUnits, 3);
    await assert.rejects(controller.updateEquipment(req(1), res), error => error.status === 409);
    Equipment.findOneAndUpdate = async () => null;
    await assert.rejects(controller.updateEquipment(req(5), res), error => error.status === 409);
    Equipment.findOneAndDelete = async filter => {
      assert.deepEqual(filter.$expr, { $eq: ['$totalUnits', '$availableUnits'] });
      return null;
    };
    await assert.rejects(controller.deleteEquipment(req(5), res), error => error.status === 409);
  } finally {
    Equipment.findById = original.findById;
    Equipment.findOneAndUpdate = original.update;
    Equipment.findOneAndDelete = original.delete;
  }
});
