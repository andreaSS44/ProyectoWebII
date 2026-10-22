const express = require('express');
const controller = require('../controllers/musicianController');
const router = express.Router();
router.post('/', controller.createMusician);
router.get('/', controller.getMusicians);
router.get('/:id', controller.getMusician);
router.put('/:id', controller.updateMusician);
router.delete('/:id', controller.deleteMusician);
module.exports = router;
