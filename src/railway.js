require('dotenv').config();
const Scheduler = require('./scheduler');
const logger = require('./utils/logger');

async function main() {
  try {
    logger.info('Starting Railway scheduler service');
    
    const scheduler = new Scheduler();
    const port = process.env.PORT || 3000;
    
    scheduler.start(port);
    
    logger.info('Railway scheduler service started successfully');
    
  } catch (error) {
    logger.error('Failed to start Railway scheduler service', { error: error.message });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Run the scheduler
main(); 