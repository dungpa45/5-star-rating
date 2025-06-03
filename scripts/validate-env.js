const Joi = require('joi');
require('dotenv').config();

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  AI_API_URL: Joi.string().uri().required(),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX: Joi.number().default(100), // 100 requests per window
  CORS_ORIGIN: Joi.alternatives().try(
    Joi.string().uri(),
    Joi.string().valid('*'),
    Joi.array().items(Joi.string().uri()),
  ).default((parent) => {
    // Set default based on environment
    if (parent.NODE_ENV === 'development') {
      return 'http://localhost:3000';
    }
    return '*';
  }),
}).unknown();

const { error, value } = envSchema.validate(process.env);

if (error) {
  console.error(
    'Environment validation failed:',
    error.details.map((detail) => detail.message).join(', '),
  );
  process.exit(1);
}

console.log('Environment validation successful');
module.exports = value; 