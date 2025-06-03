const express = require('express');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
const { URL } = require('url');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const winston = require('winston');
const env = require('./scripts/validate-env');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Input validation middleware
const validateMapUrl = [
  body('mapUrl')
    .isURL()
    .withMessage('Invalid URL format')
    .custom((value) => {
      if (!value.includes('maps.google.com') && !value.includes('maps.app.goo.gl')) {
        throw new Error('URL must be a Google Maps URL');
      }
      return true;
    }),
  body('prompt')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Prompt must be between 10 and 1000 characters')
];

// Helper function to extract place information from Google Maps URL
function extractPlaceInfoFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    let placeName = null;
    let coordinates = null;
    let placeId = null;

    // Handle different Google Maps URL formats
    if (url.includes('maps.app.goo.gl')) {
      // Short URL format - we'll need to follow the redirect to get the actual URL
      // For now, we'll just extract what we can from the short URL
      const pathParts = parsedUrl.pathname.split('/');
      placeId = pathParts[pathParts.length - 1];
    } else if (url.includes('google.com/maps')) {
      // Regular Google Maps URL
      const searchParams = parsedUrl.searchParams;

      // Try to get place name from the URL path
      const pathParts = parsedUrl.pathname.split('/');
      if (pathParts.includes('place')) {
        const placeIndex = pathParts.indexOf('place');
        if (placeIndex !== -1 && pathParts[placeIndex + 1]) {
          // Decode the place name from the URL
          placeName = decodeURIComponent(pathParts[placeIndex + 1].replace(/\+/g, ' '));
        }
      }

      // Try to get coordinates
      const query = searchParams.get('q');
      if (query) {
        // Check if query contains coordinates
        const coordMatch = query.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
        if (coordMatch) {
          coordinates = {
            lat: parseFloat(coordMatch[1]),
            lng: parseFloat(coordMatch[2])
          };
        } else {
          // If not coordinates, it might be the place name
          placeName = decodeURIComponent(query.replace(/\+/g, ' '));
        }
      }

      // Try to get place ID
      placeId = searchParams.get('cid') || searchParams.get('entry');
    }

    logger.debug('URL parsing results', {
      originalUrl: url,
      placeName,
      coordinates,
      placeId
    });

    return {
      name: placeName,
      coordinates,
      placeId
    };
  } catch (error) {
    logger.error('Error parsing URL:', { error: error.message, url });
    throw new Error('Invalid Google Maps URL format');
  }
}

// Standard error response format
const errorResponse = (res, status, message, details = null) => {
  const response = {
    error: true,
    message,
    ...(details && { details })
  };
  return res.status(status).json(response);
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API Documentation
/**
 * @api {post} /api/generate-review Generate a review
 * @apiName GenerateReview
 * @apiGroup Reviews
 * @apiVersion 1.0.0
 *
 * @apiParam {String} mapUrl Google Maps URL of the place
 * @apiParam {String} prompt Review generation prompt
 *
 * @apiSuccess {String} review Generated review text
 * @apiSuccess {Object} placeInfo Information about the place
 *
 * @apiError (400) {Object} error Invalid input parameters
 * @apiError (429) {Object} error Too many requests
 * @apiError (500) {Object} error Server error
 */
app.post('/api/generate-review', validateMapUrl, async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, 'Validation failed', errors.array());
    }

    const { prompt, mapUrl } = req.body;

    // Extract place info
    let placeInfo;
    try {
      placeInfo = extractPlaceInfoFromUrl(mapUrl);
    } catch (error) {
      return errorResponse(res, 400, error.message);
    }

    // If this is just a place info extraction request
    if (prompt === "extract_place_info") {
      return res.json({
        error: false,
        placeInfo
      });
    }

    // Enhance the prompt with place information
    const enhancedPrompt = placeInfo ?
      `${prompt}\n\nPlace Information:\nName: ${placeInfo.name}\nLocation: ${placeInfo.coordinates ? `${placeInfo.coordinates.lat}, ${placeInfo.coordinates.lng}` : 'Not available'}\nURL: ${mapUrl}` :
      prompt;

    // Call AI API
    const response = await fetch(env.AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that generates authentic, natural-sounding reviews for Google Maps. Use the provided place information to create detailed, specific reviews that sound like they were written by real customers who have visited the location."
          },
          {
            role: "user",
            content: enhancedPrompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API responded with status: ${response.status}`);
    }

    const data = await response.json();
    logger.debug('AI API Response:', { data });

    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response format from API');
    }

    const review = data.choices[0].message.content;
    res.json({
      error: false,
      review,
      placeInfo: placeInfo || null
    });
  } catch (error) {
    logger.error('Error generating review:', {
      error: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    return errorResponse(res, 500, 'Failed to generate review', error.message);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  return errorResponse(res, 500, 'Internal server error');
});

// Start server
const server = app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = app; // For testing