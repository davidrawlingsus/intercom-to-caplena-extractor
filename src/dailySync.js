const IntercomService = require('./services/intercom');
const CaplenaService = require('./services/caplena');
const CSVExporter = require('./utils/csvExporter');
const config = require('./config');
const logger = require('./utils/logger');

class DailySync {
  constructor() {
    this.intercomService = new IntercomService();
    this.caplenaService = new CaplenaService();
    this.csvExporter = new CSVExporter(config.output.csvPath);
  }

  /**
   * Daily sync process - fetch new conversations and upload to Caplena
   */
  async syncNewConversations(projectName = 'MRT - Intercom chats') {
    try {
      logger.info('Starting daily sync process');

      // Step 1: Get conversations from the last 24 hours
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const startTime = Math.floor(yesterday.getTime() / 1000);

      logger.info(`Fetching conversations since ${new Date(startTime * 1000).toISOString()}`);
      
      const conversations = await this.intercomService.getConversationsSince(startTime);
      
      if (!conversations || conversations.length === 0) {
        logger.info('No new conversations found in the last 24 hours');
        return {
          success: true,
          message: 'No new conversations found',
          stats: {
            conversationCount: 0,
            totalMessages: 0
          }
        };
      }

      logger.info(`Found ${conversations.length} new conversations`);

      // Step 2: Extract transcript data and filter for user messages
      logger.info('Extracting transcript data from new conversations...');
      const transcripts = conversations
        .map(conversation => this.intercomService.extractTranscriptData(conversation))
        .filter(transcript => transcript !== null);

      logger.info(`Extracted ${transcripts.length} valid transcripts with user messages`);

      if (transcripts.length === 0) {
        logger.info('No valid transcripts with user messages found');
        return {
          success: true,
          message: 'No valid transcripts with user messages found',
          stats: {
            conversationCount: 0,
            totalMessages: 0
          }
        };
      }

      // Step 3: Ensure Caplena project exists
      logger.info(`Ensuring Caplena project exists: ${projectName}`);
      const project = await this.caplenaService.ensureProjectExists(projectName, 'Intercom conversations export');
      
      if (!project) {
        logger.error(`Failed to create or find project: ${projectName}`);
        return {
          success: false,
          error: `Failed to create or find project: ${projectName}`
        };
      }

      // Step 4: Upload new conversations to Caplena
      logger.info('Uploading new conversations to Caplena...');
      const uploadResult = await this.caplenaService.uploadConversations(project.id, transcripts);

      // Step 5: Log statistics
      const stats = {
        conversationCount: transcripts.length,
        totalMessages: transcripts.reduce((sum, t) => sum + (t.messages?.length || 0), 0)
      };

      logger.info('Daily sync process completed successfully', { ...stats, uploadResult });

      return {
        success: true,
        message: `Successfully synced ${transcripts.length} new conversations`,
        stats,
        uploadResult,
        project
      };

    } catch (error) {
      logger.error('Daily sync process failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Test the daily sync process with a smaller time window
   */
  async testSync(hoursBack = 24) {
    try {
      logger.info(`Testing daily sync process for last ${hoursBack} hours`);

      const testTime = new Date();
      testTime.setHours(testTime.getHours() - hoursBack);
      const startTime = Math.floor(testTime.getTime() / 1000);

      logger.info(`Fetching conversations since ${new Date(startTime * 1000).toISOString()}`);
      
      const conversations = await this.intercomService.getConversationsSince(startTime);
      
      if (!conversations || conversations.length === 0) {
        logger.info(`No conversations found in the last ${hoursBack} hours`);
        return {
          success: true,
          message: `No conversations found in the last ${hoursBack} hours`,
          stats: {
            conversationCount: 0,
            totalMessages: 0
          }
        };
      }

      logger.info(`Found ${conversations.length} conversations in test period`);

      // Extract and filter transcripts
      const transcripts = conversations
        .map(conversation => this.intercomService.extractTranscriptData(conversation))
        .filter(transcript => transcript !== null);

      logger.info(`Extracted ${transcripts.length} valid transcripts with user messages`);

      return {
        success: true,
        message: `Test completed - found ${transcripts.length} valid transcripts`,
        stats: {
          conversationCount: transcripts.length,
          totalMessages: transcripts.reduce((sum, t) => sum + (t.messages?.length || 0), 0)
        },
        transcripts: transcripts.slice(0, 3) // Return first 3 for inspection
      };

    } catch (error) {
      logger.error('Test sync process failed', { error: error.message });
      throw error;
    }
  }
}

module.exports = DailySync; 