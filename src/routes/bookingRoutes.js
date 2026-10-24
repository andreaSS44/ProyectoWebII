
const express = require('express');
const controller = require('../controllers/bookingController');

const router = express.Router();

// Estadísticas de reservas
router.get('/stats', controller.getBookingStats);

// Crear una reserva
router.post('/', controller.createBooking);

// Consultar todas las reservas
router.get('/', controller.getBookings);

// Consultar una reserva por ID
router.get('/:id', controller.getBooking);

// Actualizar una reserva
router.put('/:id', controller.updateBooking);

// Cancelar una reserva
router.patch('/:id/cancel', controller.cancelBookingById);

module.exports = router;
