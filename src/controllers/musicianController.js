const Musician = require('../models/Musician');
const Band = require('../models/Band');
const HttpError = require('../utils/HttpError');
const { checkId, pick } = require('../utils/helpers');
const { parseListQuery, searchRegex, pageResponse } = require('../utils/listQuery');
const { booleanFilter } = require('../utils/resourceFilters');
const CAMPOS = ['name', 'instrument', 'band', 'active'];

async function validateBand(id) {
  checkId(id);
  if (!await Band.exists({ _id: id })) throw new HttpError(404, 'La banda no existe');
}

async function createMusician(req, res) {
  const data = pick(req.body, CAMPOS);
  if (data.band !== undefined) await validateBand(data.band);
  res.status(201).json(await Musician.create(data));
}

async function getMusicians(req, res) {
  const { page, limit, skip, sort } = parseListQuery(req.query, {
    sortFields: ['name', 'instrument', 'createdAt'], defaultSort: { name: 1 },
  });
  const filter = {};
  if (req.query.search) filter.name = searchRegex(req.query.search);
  if (req.query.band !== undefined) { checkId(req.query.band); filter.band = req.query.band; }
  if (req.query.active !== undefined) filter.active = booleanFilter(req.query.active, 'active');
  const [data, total] = await Promise.all([
    Musician.find(filter).populate('band').sort(sort).skip(skip).limit(limit),
    Musician.countDocuments(filter),
  ]);
  res.json(pageResponse(data, page, limit, total));
}

async function findMusician(id) {
  checkId(id);
  const musician = await Musician.findById(id);
  if (!musician) throw new HttpError(404, 'El músico no existe');
  return musician;
}

async function getMusician(req, res) {
  const musician = await findMusician(req.params.id);
  await musician.populate('band');
  res.json(musician);
}

async function updateMusician(req, res) {
  const musician = await findMusician(req.params.id);
  const data = pick(req.body, CAMPOS);
  if (data.band !== undefined) await validateBand(data.band);
  musician.set(data);
  await musician.save();
  res.json(musician);
}

async function deleteMusician(req, res) {
  const musician = await findMusician(req.params.id);
  await musician.deleteOne();
  res.json({ message: 'Músico eliminado' });
}

module.exports = { createMusician, getMusicians, getMusician, updateMusician, deleteMusician };
