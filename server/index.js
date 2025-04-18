/**
 * Sleep Olympics API Server
 */
const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const dotenv = require('dotenv'); // Import dotenv

dotenv.config(); // Ensure this is loaded early

//   Load environment variables asynchronously
async function loadEnv() {
  dotenv.config();
}

let firestore; //   Declare firestore outside

//   Initialize Firebase Admin asynchronously
async function initializeFirebaseAdmin() {
  try {
    let serviceAccount;

    if (process.env.NODE_ENV === 'production' && process.env.FIREBASE_SERVICE_ACCOUNT) {
      //   In production, use environment variable (safer for deployment)
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
      //   In development, use local file
      serviceAccount = require('./serviceAccountKey.json');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    firestore = admin.firestore(); //   Initialize firestore here!

    logger.info('Firebase Admin initialized successfully');
  } catch (error) {
    logger.error('Error initializing Firebase Admin:', error);
    process.exit(1);
  }
}

//   Import security and logging middleware (import after env loading)
const {
  configureSecurityMiddleware
} = require('./middleware/security');
const { configureLogging, logger } = require('./utils/logger');

//   Import routes (import after Firebase initialization, if they use it)
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const sleepRoutes = require('./routes/sleep');
const competitionRoutes = require('./routes/competitions');
const notificationRoutes = require('./routes/notifications');
const invitationRoutes = require('./routes/invitations');

async function startServer() {
  //   1. Load environment variables
  await loadEnv();
  logger.info('Environment variables loaded.');

  //   2. Initialize Firebase Admin
  await initializeFirebaseAdmin();

  //   Now, pass firestore to your utils and routes!
  // Initialize firestoreUtils with firestore
  const firestoreUtils = require('./utils/firestoreUtils')(firestore); 
  
  // Verify firestoreUtils has been initialized correctly
  if (!firestoreUtils || typeof firestoreUtils.queryDocuments !== 'function') {
    logger.error('firestoreUtils was not initialized correctly!', {
      methods: Object.keys(firestoreUtils || {})
    });
    process.exit(1);
  } else {
    logger.info('firestoreUtils initialized successfully with methods:', {
      methods: Object.keys(firestoreUtils)
    });
  }

  //   3. Create Express app
  const app = express();
  
  // No longer behind Nginx

  //   4. Apply middleware - note that security (including CORS) should be first
  configureSecurityMiddleware(app);
  configureLogging(app);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  
  // Additional CORS handling for debugging/troubleshooting
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, DNT, User-Agent, X-Requested-With, If-Modified-Since, Cache-Control, Range');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    
    if (req.method === 'OPTIONS') {
      logger.info(`Handling OPTIONS request from ${req.headers.origin || 'unknown origin'}`);
      return res.status(200).end();
    }
    next();
  });
  
  // Adding an explicit CORS test endpoint
  app.get('/api/cors-test', (req, res) => {
    res.status(200).json({
      status: 'ok',
      message: 'CORS is properly configured',
      origin: req.headers.origin || 'No origin header',
      timestamp: new Date().toISOString()
    });
  });

  //   5. API routes
  app.use('/api/auth', authRoutes(firestoreUtils));
  app.use('/api/users', userRoutes(firestoreUtils));
  app.use('/api/sleep', sleepRoutes(firestoreUtils));
  app.use('/api/competitions', competitionRoutes(firestoreUtils));
  app.use('/api/notifications', notificationRoutes(firestoreUtils));
  app.use('/api/invitations', invitationRoutes(firestoreUtils));

  //   6. Health check endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      message: 'Sleep Olympics API is running',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      corsOrigin: req.headers.origin || 'No origin header',
      allowedOrigins: process.env.NODE_ENV === 'production' 
        ? (process.env.ALLOWED_ORIGINS || 'https://pilves.github.io,https://api.chaidla.ee').split(',') 
        : (process.env.DEV_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5000').split(',')
    });
  });

  //   7. Global error handler
  app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const errorResponse = {
      error: err.message || 'Internal server error',
      requestId: req.id
    };

    if (process.env.NODE_ENV !== 'production') {
      errorResponse.stack = err.stack;
    }

    res.status(statusCode).json(errorResponse);
  });


  //   9. Start the server
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    logger.info(
        `Server running on port ${PORT} in ${
            process.env.NODE_ENV || 'development'
        } mode vibe`
    );
  });
}

//   Call the async startServer function
startServer();

