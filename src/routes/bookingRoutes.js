const express = require('express');
const controller = require('../controllers/bookingController');

const router = express.Router();

router.post('/', controller.createBooking);
router.get('/', controller.getBookings);
router.get('/:id', controller.getBooking);
router.put('/:id', controller.updateBooking);

module.exports = router;
