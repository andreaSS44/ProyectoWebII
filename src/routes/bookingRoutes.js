const express = require('express');
const controller = require('../controllers/bookingController');

const router = express.Router();

// /stats va antes de /:id para que "stats" no se tome como un id
router.get('/stats', controller.getBookingStats);

router.post('/', controller.createBooking);
router.get('/', controller.getBookings);
router.get('/:id', controller.getBooking);
router.put('/:id', controller.updateBooking);

module.exports = router;
