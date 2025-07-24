const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class CSVExporter {
  constructor(outputPath) {
    this.outputPath = outputPath;
    this.headersWritten = false;
    this.fileHandle = null;
    this.initialized = false;
  }

  /**
   * Initialize CSV file with headers
   */
  async initializeCSV() {
    // Prevent multiple initializations
    if (this.initialized) {
      logger.warn('CSV already initialized, skipping re-initialization');
      return true;
    }

    try {
      await this.ensureOutputDirectory();
      
      // Check if file already exists and has content
      let fileExists = false;
      try {
        const stats = await fs.stat(this.outputPath);
        if (stats.size > 0) {
          logger.info('CSV file already exists, will append to it');
          this.headersWritten = true;
          fileExists = true;
        }
      } catch (error) {
        // File doesn't exist, will create new
        logger.info('CSV file does not exist, will create new file');
      }

      // Close existing file handle if open
      if (this.fileHandle) {
        await this.fileHandle.close();
        this.fileHandle = null;
      }

      // Open file for appending (this will create the file if it doesn't exist)
      this.fileHandle = await fs.open(this.outputPath, 'a');
      
      // Write headers only if this is a new file
      if (!this.headersWritten) {
        const headers = [
          'conversation_id',
          'created_at',
          'updated_at',
          'subject',
          'message_id',
          'message_type',
          'message_body',
          'author_type',
          'author_id',
          'author_name',
          'message_created_at'
        ];
        await this.fileHandle.write(headers.join(',') + '\n');
        this.headersWritten = true;
        logger.info('Initialized CSV file with headers');
      } else {
        logger.info('Appending to existing CSV file');
      }

      this.initialized = true;
      return true;
    } catch (error) {
      logger.error('Failed to initialize CSV file', { 
        filePath: this.outputPath, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Append a single transcript to CSV
   */
  async appendTranscript(transcript) {
    if (!this.fileHandle) {
      throw new Error('CSV file not initialized. Call initializeCSV() first.');
    }

    if (!transcript || !transcript.messages) {
      return;
    }

    try {
      const rows = [];
      transcript.messages.forEach(message => {
        const row = [
          `"${transcript.conversationId || ''}"`,
          `"${transcript.createdAt || ''}"`,
          `"${transcript.updatedAt || ''}"`,
          `"${this.escapeCSV(transcript.subject || '')}"`,
          `"${message.id || ''}"`,
          `"${message.type || ''}"`,
          `"${this.escapeCSV(message.body || '')}"`,
          `"${message.author?.type || ''}"`,
          `"${message.author?.id || ''}"`,
          `"${this.escapeCSV(message.author?.name || '')}"`,
          `"${message.createdAt || ''}"`
        ];
        rows.push(row.join(','));
      });

      if (rows.length > 0) {
        // Ensure we're appending, not overwriting
        await this.fileHandle.write(rows.join('\n') + '\n');
        logger.debug('Appended transcript to CSV', { 
          conversationId: transcript.conversationId,
          messageCount: transcript.messages.length 
        });
      }
    } catch (error) {
      logger.error('Failed to append transcript to CSV', { 
        conversationId: transcript.conversationId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Close the CSV file
   */
  async closeCSV() {
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
      this.initialized = false; // Reset so it can be reused
      logger.info('Closed CSV file');
    }
  }

  /**
   * Convert transcript data to CSV format (legacy method)
   */
  convertToCSV(transcripts) {
    if (!transcripts || transcripts.length === 0) {
      return '';
    }

    // Define CSV headers
    const headers = [
      'conversation_id',
      'created_at',
      'updated_at',
      'subject',
      'message_id',
      'message_type',
      'message_body',
      'author_type',
      'author_id',
      'author_name',
      'message_created_at'
    ];

    // Create CSV content
    let csvContent = headers.join(',') + '\n';

    transcripts.forEach(transcript => {
      if (!transcript || !transcript.messages) {
        return;
      }

      transcript.messages.forEach(message => {
        const row = [
          `"${transcript.conversationId || ''}"`,
          `"${transcript.createdAt || ''}"`,
          `"${transcript.updatedAt || ''}"`,
          `"${this.escapeCSV(transcript.subject || '')}"`,
          `"${message.id || ''}"`,
          `"${message.type || ''}"`,
          `"${this.escapeCSV(message.body || '')}"`,
          `"${message.author?.type || ''}"`,
          `"${message.author?.id || ''}"`,
          `"${this.escapeCSV(message.author?.name || '')}"`,
          `"${message.createdAt || ''}"`
        ];
        csvContent += row.join(',') + '\n';
      });
    });

    return csvContent;
  }

  /**
   * Escape special characters in CSV
   */
  escapeCSV(text) {
    if (!text) return '';
    return text.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, ' ');
  }

  /**
   * Ensure output directory exists
   */
  async ensureOutputDirectory() {
    const dir = path.dirname(this.outputPath);
    try {
      await fs.access(dir);
    } catch (error) {
      await fs.mkdir(dir, { recursive: true });
      logger.info('Created output directory', { path: dir });
    }
  }

  /**
   * Export transcripts to CSV file (legacy method)
   */
  async exportToCSV(transcripts) {
    try {
      await this.ensureOutputDirectory();

      const csvContent = this.convertToCSV(transcripts);
      
      if (!csvContent.trim()) {
        logger.warn('No transcript data to export');
        return;
      }

      await fs.writeFile(this.outputPath, csvContent, 'utf8');
      
      logger.info('Successfully exported transcripts to CSV', {
        filePath: this.outputPath,
        transcriptCount: transcripts.length,
        totalMessages: transcripts.reduce((sum, t) => sum + (t.messages?.length || 0), 0)
      });

      return this.outputPath;
    } catch (error) {
      logger.error('Failed to export CSV', { 
        filePath: this.outputPath, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get export statistics
   */
  getExportStats(transcripts) {
    if (!transcripts || transcripts.length === 0) {
      return {
        conversationCount: 0,
        totalMessages: 0,
        filePath: this.outputPath
      };
    }

    const totalMessages = transcripts.reduce((sum, transcript) => {
      return sum + (transcript.messages?.length || 0);
    }, 0);

    return {
      conversationCount: transcripts.length,
      totalMessages,
      filePath: this.outputPath
    };
  }

  /**
   * Read existing CSV file and parse into data objects
   */
  async readExistingCSV() {
    try {
      // Check if file exists
      try {
        await fs.access(this.outputPath);
      } catch (error) {
        logger.warn('CSV file does not exist', { filePath: this.outputPath });
        return [];
      }

      // Read the file
      const fileContent = await fs.readFile(this.outputPath, 'utf8');
      const lines = fileContent.trim().split('\n');
      
      if (lines.length <= 1) {
        logger.warn('CSV file is empty or only contains headers');
        return [];
      }

      // Parse headers
      const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
      
      // Parse data rows
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const values = this.parseCSVLine(line);
        
        if (values.length === headers.length) {
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index].replace(/"/g, '');
          });
          data.push(row);
        }
      }

      logger.info(`Successfully read ${data.length} records from CSV`);
      return data;
    } catch (error) {
      logger.error('Failed to read existing CSV file', { 
        filePath: this.outputPath, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Parse a CSV line, handling quoted values
   */
  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current);
    return values;
  }
}

module.exports = CSVExporter; 