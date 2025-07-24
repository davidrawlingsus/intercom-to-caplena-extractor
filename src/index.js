const IntercomService = require('./services/intercom');
const CaplenaService = require('./services/caplena');
const CSVExporter = require('./utils/csvExporter');
const config = require('./config');
const logger = require('./utils/logger');

class IntercomTranscriptExtractor {
  constructor() {
    this.intercomService = new IntercomService();
    this.caplenaService = new CaplenaService();
    this.csvExporter = new CSVExporter(config.output.csvPath);
  }

  /**
   * Main extraction and upload process
   */
  async extractAndUpload(projectName = 'MRT - Intercom chats') {
    try {
      logger.info('Starting Intercom transcript extraction and Caplena upload process');

      // Step 1: Fetch all conversations with transcripts
      logger.info('Fetching conversations from Intercom...');
      const conversations = await this.intercomService.getAllConversationsWithTranscripts();
      
      if (!conversations || conversations.length === 0) {
        logger.warn('No conversations found');
        return;
      }

      logger.info(`Found ${conversations.length} conversations`);

      // Step 2: Extract transcript data from conversations
      logger.info('Extracting transcript data...');
      const transcripts = conversations
        .map(conversation => this.intercomService.extractTranscriptData(conversation))
        .filter(transcript => transcript !== null);

      logger.info(`Extracted ${transcripts.length} valid transcripts`);

      // Step 3: Export to CSV
      logger.info('Exporting transcripts to CSV...');
      const outputPath = await this.csvExporter.exportToCSV(transcripts);

      // Step 4: Ensure Caplena project exists (create if needed)
      logger.info(`Ensuring Caplena project exists: ${projectName}`);
      const project = await this.caplenaService.ensureProjectExists(projectName, 'Intercom conversations export');
      
      if (!project) {
        logger.error(`Failed to create or find project: ${projectName}`);
        return {
          success: false,
          error: `Failed to create or find project: ${projectName}`,
          outputPath,
          stats: this.csvExporter.getExportStats(transcripts)
        };
      }

      // Step 5: Upload to Caplena
      logger.info('Uploading conversations to Caplena...');
      const uploadResult = await this.caplenaService.uploadConversations(project.id, transcripts);

      // Step 6: Log statistics
      const stats = this.csvExporter.getExportStats(transcripts);
      logger.info('Extraction and upload process completed successfully', { ...stats, uploadResult });

      return {
        success: true,
        outputPath,
        stats,
        uploadResult,
        project
      };

    } catch (error) {
      logger.error('Extraction and upload process failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Main extraction process (CSV export only)
   */
  async extractAndExport() {
    try {
      logger.info('Starting Intercom transcript extraction process');

      // Step 1: Fetch all conversations with transcripts and save incrementally
      logger.info('Fetching conversations from Intercom...');
      const conversations = await this.intercomService.getAllConversationsWithTranscripts(null, this.csvExporter);
      
      if (!conversations || conversations.length === 0) {
        logger.warn('No conversations found');
        return;
      }

      logger.info(`Found ${conversations.length} conversations`);
      console.log(`📋 Found ${conversations.length} conversations with user messages`);

      // Step 2: Log statistics (data already saved incrementally)
      const stats = this.csvExporter.getExportStats(conversations);
      logger.info('Extraction process completed successfully', stats);

      return {
        success: true,
        outputPath: this.csvExporter.outputPath,
        stats
      };

    } catch (error) {
      logger.error('Extraction process failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Test connection to Intercom API
   */
  async testConnection() {
    try {
      logger.info('Testing Intercom API connection...');
      const response = await this.intercomService.getConversations(1, 1);
      logger.info('Intercom API connection successful', {
        hasConversations: !!response.conversations,
        conversationCount: response.conversations?.length || 0
      });
      return true;
    } catch (error) {
      logger.error('Intercom API connection failed', { error: error.message });
      return false;
    }
  }

  /**
   * Upload existing CSV data to Caplena (without fetching from Intercom)
   */
  async uploadExistingDataToCaplena(projectName = 'MRT - Intercom chats') {
    try {
      logger.info('Starting Caplena upload of existing CSV data');

      // Step 1: Read existing CSV data
      logger.info('Reading existing CSV data...');
      const csvData = await this.csvExporter.readExistingCSV();
      
      if (!csvData || csvData.length === 0) {
        logger.warn('No CSV data found to upload');
        return {
          success: false,
          error: 'No CSV data found to upload'
        };
      }

      logger.info(`Found ${csvData.length} records in CSV`);

      // Step 2: Transform CSV data to conversation format
      logger.info('Transforming CSV data for Caplena...');
      const conversations = csvData.map(row => ({
        conversationId: row.conversation_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        subject: row.subject || '',
        messages: [
          {
            id: row.message_id,
            body: row.message_body,
            author: { type: row.author_type }
          }
        ]
      }));

      logger.info(`Transformed ${conversations.length} conversations`);

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

      // Step 4: Upload to Caplena
      logger.info('Uploading conversations to Caplena...');
      const uploadResult = await this.caplenaService.uploadConversations(project.id, conversations);

      logger.info('Caplena upload process completed successfully', { uploadResult });

      return {
        success: true,
        uploadResult,
        project,
        stats: {
          conversationCount: conversations.length,
          totalMessages: conversations.length
        }
      };

    } catch (error) {
      logger.error('Caplena upload process failed', { error: error.message });
      throw error;
    }
  }
}

// Main execution
async function main() {
  const extractor = new IntercomTranscriptExtractor();

  try {
    // Test Caplena connection
    let caplenaConnectionOk = false;
    try {
      caplenaConnectionOk = await extractor.caplenaService.testConnection();
      if (!caplenaConnectionOk) {
        logger.error('Cannot proceed without valid Caplena API connection');
        console.log('❌ Caplena API connection failed');
        process.exit(1);
      }
      console.log('✅ Caplena API connection successful');
    } catch (error) {
      logger.error('Caplena API connection failed', { error: error.message });
      console.log('❌ Caplena API connection failed:', error.message);
      process.exit(1);
    }

    // Fetch fresh data from Intercom and upload to Caplena
    console.log('🔄 Fetching fresh data from Intercom and uploading to Caplena...');
    const result = await extractor.extractAndUpload();
    
    if (result.success) {
      logger.info('✅ Fresh data extraction and Caplena upload completed successfully!', result.stats);
      console.log(`\n✅ Fresh data extraction and Caplena upload completed successfully!`);
      console.log(`📊 Statistics:`);
      console.log(`   - Conversations: ${result.stats.conversationCount}`);
      console.log(`   - Total Messages: ${result.stats.totalMessages}`);
      console.log(`📤 Caplena Upload:`);
      console.log(`   - Project: ${result.project?.name || 'MRT - Intercom chats'}`);
      console.log(`   - Project ID: ${result.project?.id || 'N/A'}`);
      console.log(`   - Uploaded: ${result.uploadResult.uploadedCount} conversations`);
      console.log(`   - Batches: ${result.uploadResult.batchCount}`);
      console.log(`📁 CSV Export:`);
      console.log(`   - File: ${result.outputPath}`);
    } else {
      console.log(`\n❌ Process failed: ${result.error}`);
    }

  } catch (error) {
    logger.error('❌ Process failed', { error: error.message });
    console.error('\n❌ Process failed:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = IntercomTranscriptExtractor; 