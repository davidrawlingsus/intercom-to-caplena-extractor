require('dotenv').config();
const CaplenaService = require('./services/caplena');
const CaplenaRowManager = require('./services/caplenaRowManager');
const logger = require('./utils/logger');

class EmptyCaplenaProject {
  constructor() {
    this.caplenaService = new CaplenaService();
    this.rowManager = new CaplenaRowManager();
  }

  async run(projectName = 'MRT - Intercom chats') {
    try {
      console.log('🗑️  Starting Caplena project cleanup...');
      logger.info('Starting project cleanup', { projectName });

      // Step 1: Find the project
      console.log(`📋 Finding project: ${projectName}`);
      const project = await this.caplenaService.findProjectByName(projectName);
      
      if (!project) {
        console.error(`❌ Project not found: ${projectName}`);
        logger.error('Project not found', { projectName });
        return;
      }

      console.log(`✅ Found project: ${projectName} (ID: ${project.id})`);

      // Step 2: Get all rows
      console.log('🔍 Fetching all rows...');
      const allRows = await this.rowManager.getAllRows(project.id);
      
      if (allRows.length === 0) {
        console.log('✅ Project is already empty');
        return;
      }

      console.log(`📊 Found ${allRows.length} rows to delete`);

      // Step 3: Delete all rows
      console.log('🗑️  Deleting all rows...');
      const results = await this.rowManager.deleteAllRows(project.id, allRows);

      // Step 4: Display results
      console.log('\n📊 Cleanup Results:');
      console.log(`   - Total Rows: ${allRows.length}`);
      console.log(`   - Successfully Deleted: ${results.successful}`);
      console.log(`   - Failed Deletions: ${results.failed || 0}`);

      if (results.errors && results.errors.length > 0) {
        console.log('\n⚠️  Errors:');
        results.errors.forEach(error => {
          console.log(`   - Row ${error.rowId}: ${error.error}`);
        });
      }

      if (results.successful === allRows.length) {
        console.log('\n✅ Project successfully emptied!');
      } else {
        console.log('\n⚠️  Some rows may not have been deleted');
      }

      logger.info('Project cleanup completed', {
        projectId: project.id,
        totalRows: allRows.length,
        successful: results.successful,
        failed: results.failed || 0
      });

    } catch (error) {
      console.error('❌ Error during cleanup:', error.message);
      logger.error('Project cleanup failed', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }
}

// Run if called directly
if (require.main === module) {
  const cleaner = new EmptyCaplenaProject();
  cleaner.run().catch(console.error);
}

module.exports = EmptyCaplenaProject; 