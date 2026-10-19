const mongoose = require('mongoose');

const bandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre de la banda es obligatorio'],
      unique: true,
      trim: true,
      minlength: [2, 'El nombre de la banda debe tener al menos 2 caracteres'],
      maxlength: [50, 'El nombre de la banda no puede pasar de 50 caracteres'],
    },
    genre: {
      type: String,
      enum: {
        values: ['rock', 'jazz', 'coral', 'otro'],
        message: 'El género debe ser rock, jazz, coral u otro',
      },
      default: 'otro',
    },
    active: {
      type: Boolean,
      default: true,
    },
    contactName: {
      type: String,
      required: [true, 'El nombre de contacto es obligatorio'],
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    id: false,
  }
);

// Músicos de la banda (no se guardan en Band, se buscan en Musician por su campo band).
// Sirve para el populate('musicians') del detalle de la banda.
bandSchema.virtual('musicians', {
  ref: 'Musician',
  localField: '_id',
  foreignField: 'band',
});

module.exports = mongoose.model('Band', bandSchema);
