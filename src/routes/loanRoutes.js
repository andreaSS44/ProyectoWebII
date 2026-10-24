
const express = require('express');
const {
  getLoans,
  getLoanById,
} = require('../controllers/loanController');

const router = express.Router();

// Consultar todos los préstamos.
router.get('/', getLoans);

// Consultar un préstamo por ID.
router.get('/:id', getLoanById);

module.exports = router;
