const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class CaplenaService {
  constructor() {
    this.client = axios.create({
      baseURL: config.caplena.baseUrl,
      headers: {
        'Caplena-API-Key': config.caplena.apiKey,
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
   * Get projects list
   */
  async getProjects() {
    try {
      logger.info('Fetching Caplena projects...');
      
      const response = await this.client.get('/v2/projects');
      
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch Caplena projects', { error: error.message });
      throw error;
    }
  }

  /**
   * Find project by name
   */
  async findProjectByName(projectName) {
    try {
      const response = await this.getProjects();
      const projects = response.results || response; // Handle both response formats
      const project = projects.find(p => p.name === projectName);
      
      if (!project) {
        logger.warn(`Project not found: ${projectName}`);
        return null;
      }
      
      logger.info(`Found project: ${projectName} (ID: ${project.id})`);
      return project;
    } catch (error) {
      logger.error('Failed to find project', { projectName, error: error.message });
      throw error;
    }
  }

  /**
   * Create a new project in Caplena
   */
  async createProject(projectName, description = '') {
    try {
      logger.info('Creating new Caplena project', { projectName, description });
      
      const projectData = {
        name: projectName,
        description: description || `Intercom conversations export - ${new Date().toISOString().split('T')[0]}`,
        language: 'en', // Required field
        columns: [
          {
            name: 'text',
            type: 'text_to_analyze'
          },
          {
            name: 'conversation_id',
            type: 'text'
          },
          {
            name: 'created_at',
            type: 'text'
          },
          {
            name: 'updated_at',
            type: 'text'
          },
          {
            name: 'subject',
            type: 'text'
          },
          {
            name: 'source_url',
            type: 'text'
          },
          {
            name: 'location_city',
            type: 'text'
          },
          {
            name: 'location_region',
            type: 'text'
          },
          {
            name: 'location_country',
            type: 'text'
          },
          {
            name: 'contact_id',
            type: 'text'
          },
          {
            name: 'browser',
            type: 'text'
          },
          {
            name: 'browser_version',
            type: 'text'
          },
          {
            name: 'browser_language',
            type: 'text'
          },
          {
            name: 'os',
            type: 'text'
          },
          {
            name: 'referrer',
            type: 'text'
          },
          {
            name: 'user_message_count',
            type: 'numerical'
          },
          {
            name: 'total_message_count',
            type: 'numerical'
          }
        ]
      };

      const response = await this.client.post('/v2/projects', projectData);
      
      logger.info('Successfully created Caplena project', {
        projectId: response.data.id,
        projectName: response.data.name
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to create Caplena project', { 
        projectName, 
        error: error.message,
        response: error.response?.data 
      });
      throw error;
    }
  }

  /**
   * Delete a project in Caplena
   */
  async deleteProject(projectId) {
    try {
      logger.info('Deleting Caplena project', { projectId });
      
      const response = await this.client.delete(`/v2/projects/${projectId}`);
      
      logger.info('Successfully deleted Caplena project', {
        projectId: projectId
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to delete Caplena project', { 
        projectId, 
        error: error.message,
        response: error.response?.data 
      });
      throw error;
    }
  }

  /**
   * Create project if it doesn't exist, or return existing project
   */
  async ensureProjectExists(projectName, description = '') {
    try {
      // First try to find existing project
      const existingProject = await this.findProjectByName(projectName);
      
      if (existingProject) {
        logger.info('Using existing project', {
          projectId: existingProject.id,
          projectName: existingProject.name
        });
        return existingProject;
      }

      // Create new project if it doesn't exist
      logger.info('Project not found, creating new project', { projectName });
      return await this.createProject(projectName, description);
      
    } catch (error) {
      logger.error('Failed to ensure project exists', { projectName, error: error.message });
      throw error;
    }
  }

  /**
   * Transform conversation data to Caplena bulk rows format
   */
  transformConversationForCaplena(conversation) {
    if (!conversation || !conversation.messages) {
      return null;
    }

    // Extract user messages only
    const userMessages = conversation.messages.filter(message => 
      message.author?.type === 'user'
    );

    if (userMessages.length === 0) {
      return null;
    }

    // Create a single text entry combining all user messages
    const userText = userMessages
      .map(message => message.body)
      .filter(body => body && body.trim())
      .join('\n\n');

    if (!userText.trim()) {
      return null;
    }

    // Format for Caplena bulk rows API
    return {
      columns: [
        {
          ref: 'text',
          value: userText,
          was_reviewed: false
        },
        {
          ref: 'conversation_id',
          value: conversation.conversationId || ''
        },
        {
          ref: 'created_at',
          value: String(conversation.createdAt || '')
        },
        {
          ref: 'updated_at',
          value: String(conversation.updatedAt || '')
        },
        {
          ref: 'subject',
          value: conversation.subject || ''
        },
        {
          ref: 'source_url',
          value: conversation.sourceUrl || ''
        },
        {
          ref: 'location_city',
          value: conversation.locationCity || ''
        },
        {
          ref: 'location_region',
          value: conversation.locationRegion || ''
        },
        {
          ref: 'location_country',
          value: conversation.locationCountry || ''
        },
        {
          ref: 'contact_id',
          value: conversation.contactId || ''
        },
        {
          ref: 'browser',
          value: conversation.browser || ''
        },
        {
          ref: 'browser_version',
          value: conversation.browserVersion || ''
        },
        {
          ref: 'browser_language',
          value: conversation.browserLanguage || ''
        },
        {
          ref: 'os',
          value: conversation.os || ''
        },
        {
          ref: 'referrer',
          value: conversation.referrer || ''
        },
        {
          ref: 'user_message_count',
          value: userMessages.length
        },
        {
          ref: 'total_message_count',
          value: conversation.messages.length
        }
      ]
    };
  }

  /**
   * Upload conversation data to Caplena project using bulk rows API
   */
  async uploadConversations(projectId, conversations) {
    try {
      logger.info(`Uploading ${conversations.length} conversations to Caplena project ${projectId}`);
      
      // Transform conversations to Caplena format
      const caplenaRows = conversations
        .map(conversation => this.transformConversationForCaplena(conversation))
        .filter(data => data !== null);

      if (caplenaRows.length === 0) {
        logger.warn('No valid conversation data to upload');
        return { success: false, message: 'No valid data to upload' };
      }

      logger.info(`Transformed ${caplenaRows.length} conversations for Caplena upload`);

      // Upload data in batches of 20 (API limit)
      const batchSize = 20;
      const batches = [];
      for (let i = 0; i < caplenaRows.length; i += batchSize) {
        batches.push(caplenaRows.slice(i, i + batchSize));
      }

      logger.info(`Uploading ${caplenaRows.length} rows in ${batches.length} batches`);

      const uploadResults = [];
      let totalUploaded = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        logger.info(`Uploading batch ${i + 1}/${batches.length} with ${batch.length} rows`);

        try {
          const response = await this.client.post(`/v2/projects/${projectId}/rows/bulk`, batch);
          
          logger.info(`Successfully uploaded batch ${i + 1}`, {
            status: response.data.status,
            taskId: response.data.task_id,
            queuedRowsCount: response.data.queued_rows_count,
            estimatedMinutes: response.data.estimated_minutes,
            resultsCount: response.data.results?.length || 0
          });

          uploadResults.push(response.data);
          totalUploaded += response.data.queued_rows_count;

          // Rate limiting: wait 100ms between requests (10 requests per second limit)
          if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (error) {
          logger.error(`Failed to upload batch ${i + 1}`, { 
            batchIndex: i,
            error: error.message,
            response: error.response?.data 
          });
          throw error;
        }
      }

      logger.info('Successfully uploaded all conversations to Caplena', {
        projectId,
        totalUploaded,
        batchCount: batches.length,
        uploadResults: uploadResults.length
      });

      return {
        success: true,
        uploadedCount: totalUploaded,
        projectId,
        batchCount: batches.length,
        uploadResults
      };

    } catch (error) {
      logger.error('Failed to upload conversations to Caplena', { 
        projectId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Test connection to Caplena API
   */
  async testConnection() {
    try {
      logger.info('Testing Caplena API connection...');
      const response = await this.getProjects();
      logger.info('Caplena API connection successful', {
        projectCount: response.length || 0
      });
      return true;
    } catch (error) {
      logger.error('Caplena API connection failed', { error: error.message });
      return false;
    }
  }
}

module.exports = CaplenaService; 