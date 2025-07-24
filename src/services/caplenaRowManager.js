require('dotenv').config();
const axios = require('axios');
const logger = require('../utils/logger');

class CaplenaRowManager {
  constructor() {
    this.client = axios.create({
      baseURL: process.env.CAPLENA_BASE_URL || 'https://api.caplena.com',
      headers: {
        'Caplena-API-Key': process.env.CAPLENA_API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Caplena API response', {
          url: response.config.url,
          status: response.status,
          dataLength: response.data ? Object.keys(response.data).length : 0
        });
        return response;
      },
      (error) => {
        logger.error('Caplena API error', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get all rows from a Caplena project
   */
  async getAllRows(projectId) {
    try {
      logger.info(`Fetching all rows from project ${projectId}`);
      
      const allRows = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get(`/v2/projects/${projectId}/rows`, {
          params: {
            page: page,
            limit: 50 // Maximum per page according to API docs
          }
        });

        const rows = response.data.results || response.data;
        allRows.push(...rows);

        logger.info(`Fetched page ${page}, got ${rows.length} rows. Total so far: ${allRows.length} of ${response.data.count || 'unknown'}`);
        logger.debug('API Response structure', {
          hasResults: !!response.data.results,
          hasNextPage: !!response.data.next_url,
          totalCount: response.data.total_count,
          count: response.data.count,
          responseKeys: Object.keys(response.data)
        });

        // Check if there are more pages
        if (response.data.next_url && response.data.next_url !== null) {
          page++;
        } else {
          hasMore = false;
        }

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info(`Total rows fetched: ${allRows.length}`);
      return allRows;
    } catch (error) {
      logger.error('Failed to fetch rows from Caplena', { 
        projectId, 
        error: error.message,
        response: error.response?.data 
      });
      throw error;
    }
  }

  /**
   * Identify duplicate rows based on conversation_id and text content
   */
  identifyDuplicates(rows) {
    logger.info(`Analyzing ${rows.length} rows for duplicates`);

    const duplicates = [];
    const seen = new Map();

    rows.forEach(row => {
      // Create a unique key based on conversation_id and text content
      const conversationId = this.extractConversationId(row);
      const text = this.extractText(row);
      
      if (!conversationId || !text) {
        logger.warn('Row missing conversation_id or text, skipping', { rowId: row.id });
        return;
      }

      const key = `${conversationId}|${text}`;
      
      if (seen.has(key)) {
        // Found a duplicate
        const originalRow = seen.get(key);
        duplicates.push({
          original: originalRow,
          duplicate: row,
          key: key
        });
        logger.info(`Found duplicate: ${row.id} duplicates ${originalRow.id}`);
      } else {
        seen.set(key, row);
      }
    });

    logger.info(`Found ${duplicates.length} duplicate pairs`);
    return duplicates;
  }

  /**
   * Extract conversation_id from row data
   */
  extractConversationId(row) {
    try {
      const conversationIdColumn = row.columns?.find(col => col.ref === 'conversation_id');
      return conversationIdColumn?.value || null;
    } catch (error) {
      logger.warn('Failed to extract conversation_id', { rowId: row.id, error: error.message });
      return null;
    }
  }

  /**
   * Extract text content from row data
   */
  extractText(row) {
    try {
      const textColumn = row.columns?.find(col => col.ref === 'text');
      return textColumn?.value || null;
    } catch (error) {
      logger.warn('Failed to extract text', { rowId: row.id, error: error.message });
      return null;
    }
  }

  /**
   * Delete a row from Caplena
   */
  async deleteRow(projectId, rowId) {
    try {
      logger.info(`Deleting row ${rowId} from project ${projectId}`);
      
      const response = await this.client.delete(`/v2/projects/${projectId}/rows/${rowId}`);
      
      logger.info(`Successfully deleted row ${rowId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to delete row', { 
        projectId, 
        rowId, 
        error: error.message,
        response: error.response?.data 
      });
      throw error;
    }
  }

  /**
   * Delete all duplicate rows, keeping the original
   */
  async deleteDuplicates(projectId, duplicates) {
    logger.info(`Starting deletion of ${duplicates.length} duplicate rows`);

    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    // If no duplicates, return early
    if (!duplicates || duplicates.length === 0) {
      logger.info('No duplicates to delete');
      return results;
    }

    for (let i = 0; i < duplicates.length; i++) {
      const duplicate = duplicates[i];
      
      try {
        // Delete the duplicate row (keep the original)
        await this.deleteRow(projectId, duplicate.duplicate.id);
        results.successful++;
        
        logger.info(`Deleted duplicate ${i + 1}/${duplicates.length}: ${duplicate.duplicate.id}`);
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        results.failed++;
        results.errors.push({
          rowId: duplicate.duplicate.id,
          error: error.message
        });
        
        logger.error(`Failed to delete duplicate ${i + 1}/${duplicates.length}`, {
          rowId: duplicate.duplicate.id,
          error: error.message
        });
      }
    }

    logger.info(`Duplicate deletion completed`, results);
    return results;
  }

  /**
   * Delete all rows from a project
   */
  async deleteAllRows(projectId, rows) {
    logger.info(`Starting deletion of all ${rows.length} rows from project ${projectId}`);

    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    if (!rows || rows.length === 0) {
      logger.info('No rows to delete');
      return results;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        // Delete the row
        await this.deleteRow(projectId, row.id);
        results.successful++;
        
        logger.info(`Deleted row ${i + 1}/${rows.length}: ${row.id}`);
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.failed++;
        results.errors.push({
          rowId: row.id,
          error: error.message
        });
        
        logger.error(`Failed to delete row ${row.id}`, { 
          error: error.message,
          rowId: row.id 
        });
      }
    }

    logger.info(`Row deletion completed`, {
      successful: results.successful,
      failed: results.failed,
      total: rows.length
    });

    return results;
  }

  /**
   * Main function to deduplicate a project
   */
  async deduplicateProject(projectId) {
    try {
      logger.info(`Starting deduplication process for project ${projectId}`);

      // Step 1: Get all rows
      const rows = await this.getAllRows(projectId);
      
      if (rows.length === 0) {
        logger.info('No rows found in project');
        return { totalRows: 0, duplicates: 0, deleted: 0 };
      }

      // Step 2: Identify duplicates
      const duplicates = this.identifyDuplicates(rows);
      
      if (duplicates.length === 0) {
        logger.info('No duplicates found');
        return { totalRows: rows.length, duplicates: 0, deleted: 0 };
      }

      // Step 3: Delete duplicates
      const deletionResults = await this.deleteDuplicates(projectId, duplicates);

      const summary = {
        totalRows: rows.length,
        duplicates: duplicates.length,
        deleted: deletionResults.successful,
        failed: deletionResults.failed,
        errors: deletionResults.errors
      };

      logger.info('Deduplication completed', summary);
      return summary;

    } catch (error) {
      logger.error('Deduplication failed', { projectId, error: error.message });
      throw error;
    }
  }
}

module.exports = CaplenaRowManager; 