require('dotenv').config();
const express = require('express');
const DailySync = require('./dailySync');
const logger = require('./utils/logger');

class Scheduler {
  constructor() {
    this.dailySync = new DailySync();
    this.app = express();
    this.setupRoutes();
    this.setupScheduler();
  }

  setupRoutes() {
    // Health check endpoint for Railway
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'intercom-to-caplena-sync'
      });
    });

    // Manual trigger endpoint
    this.app.get('/sync', async (req, res) => {
      try {
        logger.info('Manual sync triggered via HTTP endpoint');
        const result = await this.dailySync.syncNewConversations();
        res.json(result);
      } catch (error) {
        logger.error('Manual sync failed', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Test endpoint
    this.app.get('/test', async (req, res) => {
      try {
        const hours = parseInt(req.query.hours) || 24;
        logger.info(`Test sync triggered via HTTP endpoint for last ${hours} hours`);
        const result = await this.dailySync.testSync(hours);
        res.json(result);
      } catch (error) {
        logger.error('Test sync failed', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });
  }

  setupScheduler() {
    // Run sync every 24 hours (at 9 AM UTC)
    const runSync = async () => {
      try {
        logger.info('Starting scheduled daily sync');
        const result = await this.dailySync.syncNewConversations();
        logger.info('Scheduled daily sync completed', result);
      } catch (error) {
        logger.error('Scheduled daily sync failed', { error: error.message });
      }
    };

    // Calculate time until next 9 AM UTC
    const getTimeUntilNextRun = () => {
      const now = new Date();
      const nextRun = new Date();
      nextRun.setUTCHours(9, 0, 0, 0);
      
      // If it's past 9 AM today, schedule for tomorrow
      if (now.getUTCHours() >= 9) {
        nextRun.setUTCDate(nextRun.getUTCDate() + 1);
      }
      
      return nextRun.getTime() - now.getTime();
    };

    // Initial delay
    const initialDelay = getTimeUntilNextRun();
    logger.info(`Scheduling first sync in ${Math.round(initialDelay / 1000 / 60)} minutes`);

    setTimeout(() => {
      runSync();
      // Then run every 24 hours
      setInterval(runSync, 24 * 60 * 60 * 1000);
    }, initialDelay);
  }

  start(port = process.env.PORT || 3000) {
    this.app.listen(port, () => {
      logger.info(`Scheduler started on port ${port}`);
      logger.info('Available endpoints:');
      logger.info('  GET /health - Health check');
      logger.info('  GET /sync - Manual sync trigger');
      logger.info('  GET /test?hours=24 - Test sync');
    });
  }
}

module.exports = Scheduler; 