require('dotenv').config();
const DailySync = require('./dailySync');
const logger = require('./utils/logger');

async function main() {
  const dailySync = new DailySync();

  try {
    console.log('🔄 Starting daily sync process...');
    
    // Check command line arguments
    const args = process.argv.slice(2);
    const isTest = args.includes('--test');
    const hoursBack = args.find(arg => arg.startsWith('--hours='))?.split('=')[1] || 24;

    if (isTest) {
      console.log(`🧪 Running test sync for last ${hoursBack} hours...`);
      const result = await dailySync.testSync(parseInt(hoursBack));
      
      if (result.success) {
        console.log('✅ Test sync completed successfully!');
        console.log(`📊 Statistics:`);
        console.log(`   - Conversations: ${result.stats.conversationCount}`);
        console.log(`   - Total Messages: ${result.stats.totalMessages}`);
        console.log(`   - Message: ${result.message}`);
        
        if (result.transcripts && result.transcripts.length > 0) {
          console.log('\n📝 Sample transcripts:');
          result.transcripts.forEach((transcript, index) => {
            console.log(`   ${index + 1}. ${transcript.conversationId} - ${transcript.messages?.length || 0} messages`);
          });
        }
      } else {
        console.log('❌ Test sync failed:', result.error);
      }
    } else {
      console.log('📤 Running daily sync for new conversations...');
      const result = await dailySync.syncNewConversations();
      
      if (result.success) {
        console.log('✅ Daily sync completed successfully!');
        console.log(`📊 Statistics:`);
        console.log(`   - Conversations: ${result.stats.conversationCount}`);
        console.log(`   - Total Messages: ${result.stats.totalMessages}`);
        console.log(`   - Message: ${result.message}`);
        
        if (result.uploadResult) {
          console.log(`📤 Caplena Upload:`);
          console.log(`   - Project: ${result.project?.name || 'MRT - Intercom chats'}`);
          console.log(`   - Project ID: ${result.project?.id || 'N/A'}`);
          console.log(`   - Uploaded: ${result.uploadResult.uploadedCount} conversations`);
          console.log(`   - Batches: ${result.uploadResult.batchCount}`);
        }
      } else {
        console.log('❌ Daily sync failed:', result.error);
        process.exit(1);
      }
    }

  } catch (error) {
    logger.error('Daily sync CLI failed', { error: error.message });
    console.error('❌ Daily sync failed:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = { main }; 