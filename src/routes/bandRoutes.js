const express = require('express');
const controller = require('../controllers/bandController');

const router = express.Router();

router.post('/', controller.createBand);
router.get('/', controller.getBands);
router.get('/:id/musicians', controller.getBandMusicians);
router.get('/:id/bookings', controller.getBandBookings);
router.get('/:id', controller.getBand);
router.put('/:id', controller.updateBand);
router.delete('/:id', controller.deleteBand);

module.exports = router;
