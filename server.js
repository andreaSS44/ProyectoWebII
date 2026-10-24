
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');

const roomRoutes = require('./src/routes/roomRoutes');
const bandRoutes = require('./src/routes/bandRoutes');
const musicianRoutes = require('./src/routes/musicianRoutes');
const equipmentRoutes = require('./src/routes/equipmentRoutes');
const bookingRoutes = require('./src/routes/bookingRoutes');
const loanRoutes = require('./src/routes/loanRoutes');

const {
  notFound,
  errorHandler,
} = require('./src/middlewares/errorHandler');

const app = express();

app.use(express.json());

// Rutas de la API
app.use('/api/rooms', roomRoutes);
app.use('/api/bands', bandRoutes);
app.use('/api/musicians', musicianRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/loans', loanRoutes);

// Manejo de errores
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB conectado correctamente');

    app.listen(PORT, () => {
      console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Error al conectar MongoDB:', error.message);
    process.exit(1);
  }
}

startServer();
