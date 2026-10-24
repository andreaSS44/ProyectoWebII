
const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'La reserva es obligatoria'],
    },
    equipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Equipment',
      required: [true, 'El equipo es obligatorio'],
    },
    units: {
      type: Number,
      required: [true, 'La cantidad de unidades es obligatoria'],
      min: [1, 'La cantidad debe ser mayor que cero'],
      validate: {
        validator: Number.isInteger,
        message: 'La cantidad debe ser un número entero',
      },
    },
    status: {
      type: String,
      enum: {
        values: ['prestado', 'devuelto'],
        message: 'El estado debe ser prestado o devuelto',
      },
      default: 'prestado',
    },
  },
  {
    timestamps: true,
  }
);

// Buscar los préstamos de una reserva.
loanSchema.index({ booking: 1 });

// Buscar préstamos por equipo y estado.
loanSchema.index({ equipment: 1, status: 1 });

module.exports = mongoose.model('Loan', loanSchema);
