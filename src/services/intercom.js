const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class IntercomService {
  constructor() {
    this.client = axios.create({
      baseURL: config.intercom.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.intercom.accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Intercom API response', {
          url: response.config.url,
          status: response.status,
          dataLength: response.data ? Object.keys(response.data).length : 0
        });
        return response;
      },
      (error) => {
        logger.error('Intercom API error', {
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
   * Get conversations with pagination
   */
  async getConversations(page = 1, perPage = 50, startingAfter = null) {
    try {
      logger.info('Fetching conversations from Intercom', { page, perPage, startingAfter });
      
      const params = {
        per_page: perPage,
        sort: 'updated_at',
        order: 'desc'
      };

      // Add starting_after for cursor-based pagination
      if (startingAfter) {
        params.starting_after = startingAfter;
      }

      const response = await this.client.get('/conversations', {
        params
      });

      // Debug: Log the response structure
      logger.info('API Response structure', { 
        totalCount: response.data.total_count,
        pages: response.data.pages,
        conversationsCount: response.data.conversations?.length,
        firstConversationId: response.data.conversations?.[0]?.id
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to fetch conversations', { error: error.message });
      throw error;
    }
  }

  /**
   * Get conversations since a specific timestamp
   */
  async getConversationsSince(sinceTimestamp, limit = 1000) {
    try {
      logger.info('Fetching conversations since timestamp', { 
        sinceTimestamp, 
        sinceDate: new Date(sinceTimestamp * 1000).toISOString(),
        limit 
      });

      const conversations = [];
      let page = 1;
      let startingAfter = null;
      let hasMore = true;

      while (hasMore && conversations.length < limit) {
        const response = await this.getConversations(page, 50, startingAfter);
        
        if (!response.conversations || response.conversations.length === 0) {
          logger.info('No more conversations found');
          break;
        }

        // Filter conversations by timestamp
        const filteredConversations = response.conversations.filter(conversation => {
          const updatedAt = parseInt(conversation.updated_at);
          return updatedAt >= sinceTimestamp;
        });

        // If we find conversations older than our timestamp, we can stop
        if (filteredConversations.length < response.conversations.length) {
          logger.info('Found conversations older than timestamp, stopping pagination');
          conversations.push(...filteredConversations);
          break;
        }

        conversations.push(...filteredConversations);

        // Check if we have more pages
        if (response.pages && response.pages.next) {
          startingAfter = response.pages.next.starting_after;
          page++;
        } else {
          hasMore = false;
        }

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info(`Found ${conversations.length} conversations since timestamp`);
      return conversations;

    } catch (error) {
      logger.error('Failed to fetch conversations since timestamp', { 
        sinceTimestamp, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get a single conversation by ID with full transcript
   */
  async getConversation(conversationId) {
    try {
      logger.info('Fetching conversation details', { conversationId });
      
      const response = await this.client.get(`/conversations/${conversationId}`);
      
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch conversation', { 
        conversationId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get contact details by ID
   */
  async getContact(contactId) {
    try {
      logger.info('Fetching contact details', { contactId });
      
      const response = await this.client.get(`/contacts/${contactId}`);
      
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch contact', { 
        contactId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get conversations with full transcripts (limited to specified count)
   */
  async getAllConversationsWithTranscripts(limit = null, csvExporter = null) {
    const conversations = [];
    const processedConversationIds = new Set(); // Track processed IDs to prevent duplicates
    let startingAfter = null;
    let hasMore = true;
    let totalProcessed = 0;
    let totalSaved = 0;
    let pageCount = 0;

    logger.info(`Starting to fetch conversations with transcripts${limit ? ` (limit: ${limit})` : ' (no limit)'}`);
    console.log(`🔄 Starting full extraction from Intercom...`);

    // Initialize CSV if exporter is provided
    if (csvExporter) {
      await csvExporter.initializeCSV();
      console.log(`💾 Initialized CSV file for incremental saving`);
    }

    while (hasMore && (limit === null || conversations.length < limit)) {
      try {
        pageCount++;
        const response = await this.getConversations(pageCount, 50, startingAfter);
        
        if (!response.conversations || response.conversations.length === 0) {
          logger.info('No more conversations available');
          hasMore = false;
          break;
        }

        logger.info(`Fetched ${response.conversations.length} conversations from page ${pageCount}`);

        // Check for duplicate conversations
        const newConversations = response.conversations.filter(conv => {
          if (processedConversationIds.has(conv.id)) {
            logger.warn(`Duplicate conversation found: ${conv.id}`);
            return false;
          }
          processedConversationIds.add(conv.id);
          return true;
        });

        if (newConversations.length === 0) {
          logger.warn('No new conversations found on this page, stopping extraction');
          hasMore = false;
          break;
        }

        logger.info(`Found ${newConversations.length} new conversations on page ${pageCount}`);

        // Calculate how many conversations we still need
        const remainingNeeded = limit ? limit - conversations.length : newConversations.length;
        const conversationsToProcess = limit ? newConversations.slice(0, remainingNeeded) : newConversations;

        // Get full details for each conversation
        const conversationPromises = conversationsToProcess.map(async (conversation) => {
          try {
            const fullConversation = await this.getConversation(conversation.id);
            
            // Fetch contact details for device information if contact exists
            if (fullConversation.contacts?.contacts?.[0]?.id) {
              try {
                const contact = await this.getContact(fullConversation.contacts.contacts[0].id);
                // Merge contact data into conversation for easier access
                fullConversation.contactDetails = contact;
              } catch (contactError) {
                logger.warn('Failed to fetch contact details', { 
                  contactId: fullConversation.contacts.contacts[0].id,
                  error: contactError.message 
                });
              }
            }
            
            return fullConversation;
          } catch (error) {
            logger.warn('Failed to fetch full conversation', { 
              conversationId: conversation.id,
              error: error.message 
            });
            return conversation; // Return basic conversation data if full fetch fails
          }
        });

        const fullConversations = await Promise.all(conversationPromises);
        
        // Filter conversations to only include those with user messages
        const conversationsWithUserMessages = fullConversations.filter(conversation => 
          this.hasUserMessages(conversation)
        );
        
        totalProcessed += fullConversations.length;
        conversations.push(...conversationsWithUserMessages);
        
        logger.info(`Filtered conversations: ${fullConversations.length} total, ${conversationsWithUserMessages.length} with user messages`);
        
        // Process and save each conversation incrementally
        if (csvExporter) {
          for (const conversation of conversationsWithUserMessages) {
            const transcript = this.extractTranscriptData(conversation);
            if (transcript) {
              await csvExporter.appendTranscript(transcript);
              totalSaved++;
            }
          }
          
          // Progress reporting for incremental saving
          if (totalSaved % 100 === 0 || totalSaved === conversationsWithUserMessages.length) {
            console.log(`✅ Processed ${totalProcessed} conversations, saved ${totalSaved} to CSV`);
          }
        }
        
        // Progress reporting
        if (conversations.length % 100 === 0 || conversations.length === 1) {
          console.log(`✅ Processed ${totalProcessed} conversations, found ${conversations.length} with user messages`);
        }

        // Check if we've reached the limit
        if (limit && conversations.length >= limit) {
          logger.info(`Reached limit of ${limit} conversations`);
          break;
        }

        // Update starting_after for next page using the cursor from the response
        if (response.pages && response.pages.next && response.pages.next.starting_after) {
          startingAfter = response.pages.next.starting_after;
          logger.info(`Next page will start after cursor: ${startingAfter}`);
        } else {
          logger.info('No more pages available');
          hasMore = false;
        }

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        logger.error('Failed to fetch conversations page', { pageCount, error: error.message });
        hasMore = false;
      }
    }

    // Close CSV file if exporter was provided
    if (csvExporter) {
      await csvExporter.closeCSV();
      console.log(`💾 Closed CSV file. Total saved: ${totalSaved} conversations`);
    }

    logger.info(`Completed fetching conversations. Total: ${conversations.length}`);
    console.log(`🎉 Extraction complete! Processed ${totalProcessed} conversations, found ${conversations.length} with user messages`);
    return conversations;
  }

  /**
   * Get conversations since a timestamp with full transcript data and metadata
   */
  async getConversationsWithTranscriptsSince(sinceTimestamp, limit = 1000) {
    try {
      logger.info('Fetching conversations with transcripts since timestamp', { 
        sinceTimestamp, 
        sinceDate: new Date(sinceTimestamp * 1000).toISOString(),
        limit 
      });

      const conversations = [];
      let page = 1;
      let startingAfter = null;
      let hasMore = true;

      while (hasMore && conversations.length < limit) {
        const response = await this.getConversations(page, 50, startingAfter);
        
        if (!response.conversations || response.conversations.length === 0) {
          logger.info('No more conversations found');
          break;
        }

        // Filter conversations by timestamp
        const filteredConversations = response.conversations.filter(conversation => {
          const updatedAt = parseInt(conversation.updated_at);
          return updatedAt >= sinceTimestamp;
        });

        // If we find conversations older than our timestamp, we can stop
        if (filteredConversations.length < response.conversations.length) {
          logger.info('Found conversations older than timestamp, stopping pagination');
          
          // Fetch full details for the filtered conversations
          for (const conversation of filteredConversations) {
            try {
              const fullConversation = await this.getConversation(conversation.id);
              
              // Fetch contact details if available
              if (fullConversation.contacts?.contacts?.[0]?.id) {
                const contactId = fullConversation.contacts.contacts[0].id;
                try {
                  const contactDetails = await this.getContact(contactId);
                  fullConversation.contactDetails = contactDetails;
                } catch (contactError) {
                  logger.warn('Failed to fetch contact details', { 
                    contactId, 
                    error: contactError.message 
                  });
                }
              }
              
              conversations.push(fullConversation);
            } catch (error) {
              logger.warn('Failed to fetch full conversation details', { 
                conversationId: conversation.id, 
                error: error.message 
              });
            }
          }
          break;
        }

        // Fetch full details for all conversations in this page
        for (const conversation of filteredConversations) {
          try {
            const fullConversation = await this.getConversation(conversation.id);
            
            // Fetch contact details if available
            if (fullConversation.contacts?.contacts?.[0]?.id) {
              const contactId = fullConversation.contacts.contacts[0].id;
              try {
                const contactDetails = await this.getContact(contactId);
                fullConversation.contactDetails = contactDetails;
              } catch (contactError) {
                logger.warn('Failed to fetch contact details', { 
                  contactId, 
                  error: contactError.message 
                });
              }
            }
            
            conversations.push(fullConversation);
          } catch (error) {
            logger.warn('Failed to fetch full conversation details', { 
              conversationId: conversation.id, 
              error: error.message 
            });
          }
        }

        // Check if we have more pages
        if (response.pages && response.pages.next) {
          startingAfter = response.pages.next.starting_after;
          page++;
        } else {
          hasMore = false;
        }

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info(`Found ${conversations.length} conversations with transcripts since timestamp`);
      return conversations;

    } catch (error) {
      logger.error('Failed to fetch conversations with transcripts since timestamp', { 
        sinceTimestamp, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Check if a conversation contains user messages
   */
  hasUserMessages(conversation) {
    if (!conversation || !conversation.conversation_parts) {
      return false;
    }

    const messages = conversation.conversation_parts.conversation_parts || [];
    return messages.some(part => part.author?.type === 'user');
  }

  /**
   * Extract transcript data from a conversation
   */
  extractTranscriptData(conversation) {
    if (!conversation || !conversation.conversation_parts) {
      return null;
    }

    const messages = conversation.conversation_parts.conversation_parts || [];
    
    // Filter to only include user messages
    const userMessages = messages.filter(part => part.author?.type === 'user');
    
    if (userMessages.length === 0) {
      return null; // No user messages in this conversation
    }

    // Common stock responses to filter out
    const stockResponses = [
      'Not just yet, thank you.',
      'No, thanks.',
      'Yes, please.',
      'I have a question.',
      'It sounds great, please send it over.',
      'Thank you.',
      'Thanks.',
      'No thank you.',
      'No, thank you.', // Added the version with comma
      'Yes thank you.',
      'Please send it over.',
      'Please send it.',
      'Send it over.',
      'Send it please.',
      'I would like to receive it.',
      'I would like to receive the catalogue.',
      'I would like to receive the catalog.',
      'Please send me the catalogue.',
      'Please send me the catalog.',
      'I would be interested in receiving a catalogue.',
      'I would be interested in receiving a catalog.',
      'I would be interested in receiving a cataloque.',
      'I would be interested in receiving a cataloque. My name is',
      'I would be interested in receiving a cataloque. My name is A',
      'I would be interested in receiving a cataloque. My name is A Lawson',
      'Yes, please do that.',
      'Maybe – what\'s in it?', // Fixed: using en dash (–) instead of hyphen (-)
      'Please add these',
      'Sound great, send it over',
      'Yes, everything makes sense – thank you.',
      'Yes, I have a question.',
      'I have a question.',
      'I see, thank you.',
      'Thank you for the info.'
    ];

    // Filter out stock responses
    // console.log('DEBUG: Processing', userMessages.length, 'user messages');
    const filteredUserMessages = userMessages.filter(part => {
      const messageBody = part.body || '';
      const cleanBody = messageBody.replace(/<[^>]*>/g, '').trim(); // Remove HTML tags
      
      // Check if the message is a stock response (normalized comparison)
      const normalizedCleanBody = cleanBody
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'") // Normalize apostrophes
        .replace(/[\u201C\u201D]/g, '"') // Normalize quotes
        .replace(/\s+/g, ' ')
        .trim();
      
      const isStock = stockResponses.some(stockResponse => {
        const normalizedStockResponse = stockResponse
          .toLowerCase()
          .replace(/[\u2018\u2019]/g, "'") // Normalize apostrophes
          .replace(/[\u201C\u201D]/g, '"') // Normalize quotes
          .replace(/\s+/g, ' ')
          .trim();
        const matches = normalizedCleanBody === normalizedStockResponse;
        if (cleanBody.includes('Maybe') || cleanBody.includes('everything makes sense')) {
          // console.log('DEBUG: Message:', JSON.stringify(cleanBody));
          // console.log('DEBUG: Normalized:', JSON.stringify(normalizedCleanBody));
          // console.log('DEBUG: Stock response:', JSON.stringify(stockResponse));
          // console.log('DEBUG: Normalized stock:', JSON.stringify(normalizedStockResponse));
          // console.log('DEBUG: Matches:', matches);
          // console.log('---');
        }
        return matches;
      });
      
      return !isStock;
    });
    // console.log('DEBUG: After filtering,', filteredUserMessages.length, 'messages remain');
    
    if (filteredUserMessages.length === 0) {
      return null; // No meaningful user messages after filtering
    }

    // Extract additional metadata
    const sourceUrl = conversation.first_contact_reply?.url || '';
    const contactId = conversation.contacts?.contacts?.[0]?.id;
    
    // Extract device information and location from contact details
    const contactDetails = conversation.contactDetails || {};
    const location = contactDetails.location || {};
    const deviceInfo = {
      browser: contactDetails.browser || '',
      browserVersion: contactDetails.browser_version || '',
      browserLanguage: contactDetails.browser_language || '',
      os: contactDetails.os || '',
      referrer: contactDetails.referrer || ''
    };
    
    return {
      conversationId: conversation.id,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      subject: conversation.conversation_message?.subject || '',
      sourceUrl: sourceUrl,
      locationCity: location.city || '',
      locationRegion: location.region || '',
      locationCountry: location.country || '',
      contactId: contactId || '',
      browser: deviceInfo.browser,
      browserVersion: deviceInfo.browserVersion,
      browserLanguage: deviceInfo.browserLanguage,
      os: deviceInfo.os,
      referrer: deviceInfo.referrer,
      messages: filteredUserMessages.map(part => ({
        id: part.id,
        type: part.part_type,
        body: part.body || '',
        author: {
          type: part.author?.type || '',
          id: part.author?.id || '',
          name: part.author?.name || ''
        },
        createdAt: part.created_at
      }))
    };
  }
}

module.exports = IntercomService; 