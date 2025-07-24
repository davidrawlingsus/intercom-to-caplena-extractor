require('dotenv').config();
const CaplenaService = require('./services/caplena');
const CaplenaRowManager = require('./services/caplenaRowManager');
const logger = require('./utils/logger');

class DeduplicateCLI {
  constructor() {
    this.caplenaService = new CaplenaService();
    this.rowManager = new CaplenaRowManager();
  }

  async run(projectName = 'MRT - Intercom chats') {
    try {
      console.log('🧹 Starting Caplena deduplication process...');
      logger.info('Starting deduplication process', { projectName });

      // Step 1: Find the project
      console.log(`📋 Finding project: ${projectName}`);
      const project = await this.caplenaService.findProjectByName(projectName);
      
      if (!project) {
        console.error(`❌ Project not found: ${projectName}`);
        logger.error('Project not found', { projectName });
        process.exit(1);
      }

      console.log(`✅ Found project: ${project.name} (ID: ${project.id})`);

      // Step 2: Run deduplication
      console.log('🔍 Analyzing rows for duplicates...');
      const result = await this.rowManager.deduplicateProject(project.id);

      // Step 3: Display results
      console.log('\n📊 Deduplication Results:');
      console.log(`   - Total Rows: ${result.totalRows}`);
      console.log(`   - Duplicates Found: ${result.duplicates}`);
      console.log(`   - Successfully Deleted: ${result.deleted}`);
      console.log(`   - Failed Deletions: ${result.failed || 0}`);

      if (result.errors && result.errors.length > 0) {
        console.log('\n⚠️  Errors:');
        result.errors.forEach(error => {
          console.log(`   - Row ${error.rowId}: ${error.error}`);
        });
      }

      if (result.duplicates > 0) {
        console.log(`\n✅ Successfully removed ${result.deleted} duplicate rows!`);
      } else {
        console.log('\n✅ No duplicates found - data is clean!');
      }

      logger.info('Deduplication completed', result);
      return result;

    } catch (error) {
      console.error('❌ Deduplication failed:', error.message);
      logger.error('Deduplication failed', { error: error.message });
      process.exit(1);
    }
  }

  async dryRun(projectName = 'MRT - Intercom chats') {
    try {
      console.log('🔍 Starting DRY RUN - analyzing duplicates without deleting...');
      logger.info('Starting dry run deduplication', { projectName });

      // Step 1: Find the project
      console.log(`📋 Finding project: ${projectName}`);
      const project = await this.caplenaService.findProjectByName(projectName);
      
      if (!project) {
        console.error(`❌ Project not found: ${projectName}`);
        logger.error('Project not found', { projectName });
        process.exit(1);
      }

      console.log(`✅ Found project: ${project.name} (ID: ${project.id})`);

      // Step 2: Get all rows and identify duplicates (without deleting)
      console.log('🔍 Analyzing rows for duplicates...');
      const rows = await this.rowManager.getAllRows(project.id);
      const duplicates = this.rowManager.identifyDuplicates(rows);

      // Step 3: Display results
      console.log('\n📊 Dry Run Results:');
      console.log(`   - Total Rows: ${rows.length}`);
      console.log(`   - Duplicates Found: ${duplicates.length}`);

      if (duplicates.length > 0) {
        console.log('\n🔍 Duplicate Details:');
        duplicates.forEach((dup, index) => {
          console.log(`   ${index + 1}. Row ${dup.duplicate.id} duplicates ${dup.original.id}`);
          console.log(`      Key: ${dup.key}`);
        });
        
        console.log(`\n💡 Run without --dry-run to delete ${duplicates.length} duplicate rows`);
      } else {
        console.log('\n✅ No duplicates found - data is clean!');
      }

      logger.info('Dry run completed', { totalRows: rows.length, duplicates: duplicates.length });
      return { totalRows: rows.length, duplicates: duplicates.length };

    } catch (error) {
      console.error('❌ Dry run failed:', error.message);
      logger.error('Dry run failed', { error: error.message });
      process.exit(1);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const projectName = args.find(arg => arg.startsWith('--project='))?.split('=')[1] || 'MRT - Intercom chats';
  const isDryRun = args.includes('--dry-run');

  const cli = new DeduplicateCLI();

  if (isDryRun) {
    await cli.dryRun(projectName);
  } else {
    await cli.run(projectName);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ CLI failed:', error.message);
    process.exit(1);
  });
}

module.exports = DeduplicateCLI; 