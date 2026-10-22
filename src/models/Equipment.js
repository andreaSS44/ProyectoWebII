const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 80 },
  category: { type: String, required: true, trim: true, lowercase: true, maxlength: 50 },
  totalUnits: { type: Number, required: true, min: 0, validate: Number.isInteger },
  availableUnits: {
    type: Number,
    default: function () { return this.totalUnits; },
    min: 0,
    validate: [
      { validator: Number.isInteger, message: 'availableUnits debe ser entero' },
      { validator: function (value) { return value <= this.totalUnits; },
        message: 'availableUnits no puede superar totalUnits' },
    ],
  },
}, { timestamps: true });

equipmentSchema.index({ category: 1, availableUnits: 1 });
module.exports = mongoose.model('Equipment', equipmentSchema);
