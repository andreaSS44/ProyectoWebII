const express = require('express');
const controller = require('../controllers/roomController');

const router = express.Router();

// /stats y /:id/schedule van antes de /:id para que "stats" no se tome como un id
router.get('/stats', controller.getRoomStats);

router.post('/', controller.createRoom);
router.get('/', controller.getRooms);
router.get('/:id/schedule', controller.getRoomSchedule);
router.get('/:id', controller.getRoom);
router.put('/:id', controller.updateRoom);
router.delete('/:id', controller.deleteRoom);

module.exports = router;
