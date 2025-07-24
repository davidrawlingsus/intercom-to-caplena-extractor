require('dotenv').config();

const config = {
  intercom: {
    accessToken: process.env.INTERCOM_ACCESS_TOKEN,
    baseUrl: process.env.INTERCOM_BASE_URL || 'https://api.intercom.io',
  },
  caplena: {
    apiKey: process.env.CAPLENA_API_KEY,
    baseUrl: process.env.CAPLENA_BASE_URL || 'https://app.caplena.com',
  },
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  output: {
    csvPath: process.env.CSV_OUTPUT_PATH || './exports/intercom_transcripts.csv',
  }
};

// Validate required environment variables
const requiredEnvVars = [
  'INTERCOM_ACCESS_TOKEN',
  'CAPLENA_API_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

module.exports = config; 