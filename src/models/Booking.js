const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: [true, 'La sala es obligatoria'],
    },
    band: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Band',
      required: [true, 'La banda es obligatoria'],
    },
    // Se guarda a medianoche UTC (2026-11-02T00:00:00.000Z) para que el horario
    // de la sala y la búsqueda de traslapes comparen el mismo día exacto.
    date: {
      type: Date,
      required: [true, 'La fecha es obligatoria'],
    },
    startHour: {
      type: Number,
      required: [true, 'La hora de inicio es obligatoria'],
      min: [8, 'La hora de inicio mínima es 8'],
      max: [21, 'La hora de inicio máxima es 21'],
      validate: {
        validator: Number.isInteger,
        message: 'La hora de inicio debe ser un número entero',
      },
    },
    endHour: {
      type: Number,
      required: [true, 'La hora de fin es obligatoria'],
      min: [9, 'La hora de fin mínima es 9'],
      max: [22, 'La hora de fin máxima es 22'],
      validate: {
        validator: Number.isInteger,
        message: 'La hora de fin debe ser un número entero',
      },
    },
    status: {
      type: String,
      enum: {
        values: ['apartada', 'confirmada', 'cancelada'],
        message: 'El estado debe ser apartada, confirmada o cancelada',
      },
      default: 'apartada',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [200, 'Las notas no pueden pasar de 200 caracteres'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    id: false,
  }
);

// Horario del día de una sala y búsqueda de traslapes: filtran por room y date
// y comparan/ordenan por startHour.
bookingSchema.index({ room: 1, date: 1, startHour: 1 });

// Duración calculada, no se guarda en la base de datos.
bookingSchema.virtual('durationHours').get(function () {
  return this.endHour - this.startHour;
});

// Préstamos de la reserva (no se guardan en Booking, se buscan en Loan por su campo booking).
// Sirve para el populate('loans') del detalle de la reserva.
bookingSchema.virtual('loans', {
  ref: 'Loan',
  localField: '_id',
  foreignField: 'booking',
});

module.exports = mongoose.model('Booking', bookingSchema);
