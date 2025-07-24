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

      // Step 4: Find Caplena project
      logger.info(`Looking for Caplena project: ${projectName}`);
      const project = await this.caplenaService.findProjectByName(projectName);
      
      if (!project) {
        logger.error(`Project not found: ${projectName}`);
        return {
          success: false,
          error: `Project not found: ${projectName}`,
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
        uploadResult
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
}

// Main execution
async function main() {
  const extractor = new IntercomTranscriptExtractor();

  try {
    // Test connections first
    const intercomConnectionOk = await extractor.testConnection();
    if (!intercomConnectionOk) {
      logger.error('Cannot proceed without valid Intercom API connection');
      process.exit(1);
    }

    // Test Caplena connection (optional for now)
    let caplenaConnectionOk = false;
    try {
      caplenaConnectionOk = await extractor.caplenaService.testConnection();
      if (!caplenaConnectionOk) {
        logger.warn('Caplena API connection failed - will proceed with CSV export only');
      }
    } catch (error) {
      logger.warn('Caplena API connection failed - will proceed with CSV export only', { error: error.message });
    }

    // Run extraction and upload (or just extraction if Caplena is not available)
    let result;
    if (caplenaConnectionOk) {
      result = await extractor.extractAndUpload();
    } else {
      // Fallback to just extraction
      result = await extractor.extractAndExport();
    }
    
    if (result.success) {
      logger.info('✅ Extraction completed successfully!', result.stats);
      console.log(`\n📁 Transcripts exported to: ${result.outputPath}`);
      console.log(`📊 Statistics:`);
      console.log(`   - Conversations: ${result.stats.conversationCount}`);
      console.log(`   - Total Messages: ${result.stats.totalMessages}`);
      
      if (result.uploadResult) {
        console.log(`📤 Caplena Upload:`);
        console.log(`   - Project: MRT - Intercom chats`);
        console.log(`   - Uploaded: ${result.uploadResult.uploadedCount} conversations`);
      } else {
        console.log(`📤 Caplena Upload: Skipped (API connection failed)`);
      }
    } else {
      console.log(`\n❌ Process failed: ${result.error}`);
    }

  } catch (error) {
    logger.error('❌ Extraction failed', { error: error.message });
    console.error('\n❌ Extraction failed:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = IntercomTranscriptExtractor; 