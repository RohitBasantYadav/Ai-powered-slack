const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const http = require('http');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/database');
const { errorHandler, AppError } = require('./middleware/errorHandler');
const { initializeSocket } = require('./services/socketService');

// Import routes
const authRoutes = require('./routes/authRoutes');
const channelRoutes = require('./routes/channelRoutes');
const messageRoutes = require('./routes/messageRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const fileRoutes = require('./routes/fileRoutes');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 4040;

// Connect to MongoDB
connectDB();

// No need to create uploads directory anymore as we're using system temp dir

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

// Base route for testing
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to Slack Clone API',
    version: '1.0.0'
  });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/files', fileRoutes);

// Test error route
app.get('/api/test-error', (req, res, next) => {
  next(new AppError('This is a test error', 400));
});

// Handle 404 routes
app.all('*', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

// Global error handling middleware
app.use(errorHandler);

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocket(server);

// Store io instance on app for use in routes
app.set('io', io);

// Start server with error handling for port conflicts
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is busy, trying alternative port ${PORT + 1}`);
    server.listen(PORT + 1, () => {
      console.log(`Server running on alternative port ${PORT + 1}`);
    });
  } else {
    console.error('Server error:', err);
  }
});
