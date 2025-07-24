const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class CaplenaService {
  constructor() {
    this.client = axios.create({
      baseURL: config.caplena.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.caplena.apiKey}`,
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
      
      const response = await this.client.get('/api/projects');
      
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
      const projects = await this.getProjects();
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
   * Transform conversation data to Caplena format
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

    return {
      text: userText,
      metadata: {
        conversation_id: conversation.conversationId,
        created_at: conversation.createdAt,
        updated_at: conversation.updatedAt,
        subject: conversation.subject,
        user_message_count: userMessages.length,
        total_message_count: conversation.messages.length
      }
    };
  }

  /**
   * Upload conversation data to Caplena project
   */
  async uploadConversations(projectId, conversations) {
    try {
      logger.info(`Uploading ${conversations.length} conversations to Caplena project ${projectId}`);
      
      // Transform conversations to Caplena format
      const caplenaData = conversations
        .map(conversation => this.transformConversationForCaplena(conversation))
        .filter(data => data !== null);

      if (caplenaData.length === 0) {
        logger.warn('No valid conversation data to upload');
        return { success: false, message: 'No valid data to upload' };
      }

      logger.info(`Transformed ${caplenaData.length} conversations for Caplena upload`);

      // Upload data to Caplena
      const response = await this.client.post(`/api/projects/${projectId}/data`, {
        data: caplenaData
      });

      logger.info('Successfully uploaded conversations to Caplena', {
        projectId,
        uploadedCount: caplenaData.length,
        responseId: response.data?.id
      });

      return {
        success: true,
        uploadedCount: caplenaData.length,
        projectId,
        responseId: response.data?.id
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