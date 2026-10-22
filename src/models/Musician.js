const mongoose = require('mongoose');

const musicianSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  instrument: { type: String, required: true, trim: true, maxlength: 60 },
  band: { type: mongoose.Schema.Types.ObjectId, ref: 'Band', required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

musicianSchema.index({ band: 1, active: 1 });
module.exports = mongoose.model('Musician', musicianSchema);
