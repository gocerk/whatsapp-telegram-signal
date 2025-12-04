const twilio = require('twilio');

// Logging utility
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] WHATSAPP ${level.toUpperCase()}: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

// WhatsApp service using Twilio API
class WhatsAppService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_WHATSAPP_FROM; // e.g., 'whatsapp:+14155238886'
    this.client = null;
    
    this.initializeClient();
  }

  initializeClient() {
    try {
      if (!this.accountSid || !this.authToken) {
        log('error', 'Missing Twilio credentials');
        return;
      }
      
      this.client = twilio(this.accountSid, this.authToken);
      log('info', 'Twilio client initialized successfully');
    } catch (error) {
      log('error', 'Failed to initialize Twilio client', { error: error.message });
    }
  }

  async sendMessage(to, message) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      // Ensure the 'to' number has the whatsapp: prefix
      const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

      const messageResponse = await this.client.messages.create({
        from: this.fromNumber,
        to: toNumber,
        body: message
      });

      log('info', 'Message sent successfully', {
        messageSid: messageResponse.sid,
        to: toNumber,
        status: messageResponse.status
      });

      return {
        success: true,
        messageSid: messageResponse.sid,
        status: messageResponse.status,
        to: toNumber
      };
    } catch (error) {
      log('error', 'Failed to send message', {
        error: error.message,
        to: to
      });
      throw error;
    }
  }

  async sendImageWithCaption(to, imageUrl, caption) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      // Ensure the 'to' number has the whatsapp: prefix
      const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

      const messageResponse = await this.client.messages.create({
        from: this.fromNumber,
        to: toNumber,
        body: caption,
        mediaUrl: [imageUrl]
      });

      log('info', 'Image with caption sent successfully', {
        messageSid: messageResponse.sid,
        to: toNumber,
        status: messageResponse.status,
        mediaUrl: imageUrl
      });

      return {
        success: true,
        messageSid: messageResponse.sid,
        status: messageResponse.status,
        to: toNumber
      };
    } catch (error) {
      log('error', 'Failed to send image with caption', {
        error: error.message,
        to: to,
        imageUrl: imageUrl
      });
      
      // Fallback to text message
      log('info', 'Falling back to text message only');
      return await this.sendMessage(to, caption);
    }
  }

  async sendImageFromUrl(to, imageUrl, caption) {
    // This is the same as sendImageWithCaption for Twilio
    return await this.sendImageWithCaption(to, imageUrl, caption);
  }

  async sendFormattedMessage(to, data, chartImage = null) {
    const message = this.formatTradingMessage(data);
    
    if (chartImage) {
      if (chartImage.url) {
        // Send image from URL
        return await this.sendImageFromUrl(to, chartImage.url, message);
      } else if (chartImage.buffer) {
        // For buffer, we'd need to upload it somewhere first
        // This is a limitation - Twilio requires a public URL for media
        log('warn', 'Buffer images not directly supported with Twilio, sending text only');
        return await this.sendMessage(to, message);
      }
    }
    
    // Send text message only
    return await this.sendMessage(to, message);
  }

  formatTradingMessage(signal) {
    const { title, datetime, action, symbol, price } = signal;
    
    const actionEmoji = action === 'BUY' ? '🟢' : action === 'SELL' ? '🔴' : '⚪';
    
    return `${actionEmoji} *${title}*

📊 *Symbol:* ${symbol}
⚡ *Action:* ${action}
💰 *Price:* $${price}
🕐 *Time:* ${datetime}

_Trading signal from TradingView_`;
  }

  async listActiveGroups() {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      // Get recent messages to identify active conversations
      const messages = await this.client.messages.list({
        limit: 100,
        dateSentAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
      });

      // Extract unique WhatsApp numbers/groups from recent messages
      const activeContacts = new Map();
      
      messages.forEach(message => {
        if (message.from && message.from.startsWith('whatsapp:')) {
          const contact = message.from;
          if (!activeContacts.has(contact)) {
            activeContacts.set(contact, {
              id: contact,
              name: contact.replace('whatsapp:', ''),
              lastMessageDate: message.dateSent,
              messageCount: 1
            });
          } else {
            const existing = activeContacts.get(contact);
            existing.messageCount++;
            if (message.dateSent > existing.lastMessageDate) {
              existing.lastMessageDate = message.dateSent;
            }
          }
        }
      });

      const groups = Array.from(activeContacts.values()).sort((a, b) => 
        new Date(b.lastMessageDate) - new Date(a.lastMessageDate)
      );

      log('info', 'Active contacts retrieved successfully', {
        contactCount: groups.length
      });

      return {
        success: true,
        groups: groups,
        count: groups.length
      };
    } catch (error) {
      log('error', 'Failed to retrieve active contacts', {
        error: error.message
      });

      // Fallback: return configured numbers if available
      const configuredNumbers = this.getConfiguredNumbers();
      if (configuredNumbers.length > 0) {
        log('info', 'Returning configured numbers as fallback');
        return {
          success: false,
          fallback: true,
          groups: configuredNumbers,
          count: configuredNumbers.length,
          error: error.message
        };
      }

      return {
        success: false,
        groups: [],
        count: 0,
        error: error.message
      };
    }
  }

  getConfiguredNumbers() {
    const numbers = [];
    
    // Check for configured WhatsApp numbers in environment
    if (process.env.WHATSAPP_TO_NUMBERS) {
      const toNumbers = process.env.WHATSAPP_TO_NUMBERS.split(',');
      toNumbers.forEach(number => {
        numbers.push({
          id: number.trim(),
          name: `Configured: ${number.trim()}`,
          type: 'configured'
        });
      });
    }

    return numbers;
  }

  /**
   * Get configured WhatsApp groups from environment variables
   * Supports WHATSAPP_GROUPS (comma-separated) or WHATSAPP_TO_NUMBERS
   * @returns {Array} Array of group objects with id, name, and type
   */
  getConfiguredGroups() {
    const groups = [];
    
    // Check for configured WhatsApp groups in environment
    if (process.env.WHATSAPP_GROUPS) {
      const groupIds = process.env.WHATSAPP_GROUPS.split(',');
      groupIds.forEach(groupId => {
        const trimmedId = groupId.trim();
        groups.push({
          id: trimmedId.startsWith('whatsapp:') ? trimmedId : `whatsapp:${trimmedId}`,
          name: `Group: ${trimmedId.replace('whatsapp:', '')}`,
          type: 'group'
        });
      });
    }
    
    // Also include WHATSAPP_TO_NUMBERS as groups if WHATSAPP_GROUPS is not set
    if (groups.length === 0 && process.env.WHATSAPP_TO_NUMBERS) {
      const toNumbers = process.env.WHATSAPP_TO_NUMBERS.split(',');
      toNumbers.forEach(number => {
        const trimmedNumber = number.trim();
        groups.push({
          id: trimmedNumber.startsWith('whatsapp:') ? trimmedNumber : `whatsapp:${trimmedNumber}`,
          name: `Group: ${trimmedNumber.replace('whatsapp:', '')}`,
          type: 'group'
        });
      });
    }

    return groups;
  }

  /**
   * Send a message to a specific WhatsApp group
   * @param {string} groupId - WhatsApp group ID (e.g., 'whatsapp:+1234567890' or '+1234567890')
   * @param {string} message - Message text to send
   * @returns {Promise<Object>} Result object with success status and message details
   */
  async sendMessageToGroup(groupId, message) {
    try {
      log('info', 'Sending message to WhatsApp group', { groupId });
      return await this.sendMessage(groupId, message);
    } catch (error) {
      log('error', 'Failed to send message to WhatsApp group', {
        error: error.message,
        groupId: groupId
      });
      throw error;
    }
  }

  /**
   * Send a formatted trading message to a specific WhatsApp group
   * @param {string} groupId - WhatsApp group ID
   * @param {Object} signalData - Trading signal data object
   * @param {Object} chartImage - Optional chart image object
   * @returns {Promise<Object>} Result object with success status
   */
  async sendFormattedMessageToGroup(groupId, signalData, chartImage = null) {
    try {
      log('info', 'Sending formatted message to WhatsApp group', { groupId });
      return await this.sendFormattedMessage(groupId, signalData, chartImage);
    } catch (error) {
      log('error', 'Failed to send formatted message to WhatsApp group', {
        error: error.message,
        groupId: groupId
      });
      throw error;
    }
  }

  /**
   * Send a message to multiple WhatsApp groups
   * @param {Array<string>} groupIds - Array of WhatsApp group IDs
   * @param {string} message - Message text to send
   * @returns {Promise<Object>} Result object with success status and results per group
   */
  async sendMessageToMultipleGroups(groupIds, message) {
    const results = {
      success: true,
      total: groupIds.length,
      succeeded: 0,
      failed: 0,
      groups: []
    };

    log('info', 'Sending message to multiple WhatsApp groups', {
      groupCount: groupIds.length
    });

    // Send messages to all groups in parallel
    const promises = groupIds.map(async (groupId) => {
      const formattedGroupId = groupId.startsWith('whatsapp:') ? groupId : `whatsapp:${groupId}`;
      
      try {
        const result = await this.sendMessage(formattedGroupId, message);
        results.succeeded++;
        results.groups.push({
          groupId: formattedGroupId,
          success: true,
          messageSid: result.messageSid,
          status: result.status
        });
        return result;
      } catch (error) {
        results.failed++;
        results.success = false;
        results.groups.push({
          groupId: formattedGroupId,
          success: false,
          error: error.message
        });
        log('error', `Failed to send to group ${formattedGroupId}`, {
          error: error.message
        });
        return null;
      }
    });

    await Promise.all(promises);

    log('info', 'Finished sending messages to multiple groups', {
      total: results.total,
      succeeded: results.succeeded,
      failed: results.failed
    });

    return results;
  }

  /**
   * Send a formatted trading message to multiple WhatsApp groups
   * @param {Array<string>} groupIds - Array of WhatsApp group IDs
   * @param {Object} signalData - Trading signal data object
   * @param {Object} chartImage - Optional chart image object
   * @returns {Promise<Object>} Result object with success status and results per group
   */
  async sendFormattedMessageToMultipleGroups(groupIds, signalData, chartImage = null) {
    const results = {
      success: true,
      total: groupIds.length,
      succeeded: 0,
      failed: 0,
      groups: []
    };

    log('info', 'Sending formatted message to multiple WhatsApp groups', {
      groupCount: groupIds.length
    });

    // Send messages to all groups in parallel
    const promises = groupIds.map(async (groupId) => {
      const formattedGroupId = groupId.startsWith('whatsapp:') ? groupId : `whatsapp:${groupId}`;
      
      try {
        const result = await this.sendFormattedMessage(formattedGroupId, signalData, chartImage);
        results.succeeded++;
        results.groups.push({
          groupId: formattedGroupId,
          success: true,
          messageSid: result.messageSid,
          status: result.status
        });
        return result;
      } catch (error) {
        results.failed++;
        results.success = false;
        results.groups.push({
          groupId: formattedGroupId,
          success: false,
          error: error.message
        });
        log('error', `Failed to send formatted message to group ${formattedGroupId}`, {
          error: error.message
        });
        return null;
      }
    });

    await Promise.all(promises);

    log('info', 'Finished sending formatted messages to multiple groups', {
      total: results.total,
      succeeded: results.succeeded,
      failed: results.failed
    });

    return results;
  }

  async getContactInfo(contactId) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      // Get recent messages for this contact
      const messages = await this.client.messages.list({
        from: contactId,
        limit: 10
      });

      const sentMessages = await this.client.messages.list({
        to: contactId,
        limit: 10
      });

      const allMessages = [...messages, ...sentMessages].sort((a, b) => 
        new Date(b.dateSent) - new Date(a.dateSent)
      );

      log('info', 'Contact information retrieved successfully', {
        contactId: contactId,
        messageCount: allMessages.length
      });

      return {
        success: true,
        contact: {
          id: contactId,
          name: contactId.replace('whatsapp:', ''),
          messageCount: allMessages.length,
          lastMessage: allMessages[0] ? {
            body: allMessages[0].body,
            date: allMessages[0].dateSent,
            direction: allMessages[0].from === contactId ? 'received' : 'sent'
          } : null
        }
      };
    } catch (error) {
      log('error', 'Failed to retrieve contact information', {
        error: error.message,
        contactId: contactId
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  async getMessageHistory(contactId, limit = 20) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      const receivedMessages = await this.client.messages.list({
        from: contactId,
        limit: Math.ceil(limit / 2)
      });

      const sentMessages = await this.client.messages.list({
        to: contactId,
        limit: Math.ceil(limit / 2)
      });

      const allMessages = [...receivedMessages, ...sentMessages]
        .sort((a, b) => new Date(b.dateSent) - new Date(a.dateSent))
        .slice(0, limit);

      log('info', 'Message history retrieved successfully', {
        contactId: contactId,
        messageCount: allMessages.length
      });

      return {
        success: true,
        messages: allMessages.map(msg => ({
          sid: msg.sid,
          body: msg.body,
          from: msg.from,
          to: msg.to,
          dateSent: msg.dateSent,
          status: msg.status,
          direction: msg.from === contactId ? 'received' : 'sent'
        }))
      };
    } catch (error) {
      log('error', 'Failed to retrieve message history', {
        error: error.message,
        contactId: contactId
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a Twilio Conversation (group)
   * @param {string} friendlyName - Name for the conversation
   * @returns {Promise<Object>} Conversation object with SID and details
   */
  async createConversation(friendlyName) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      const conversation = await this.client.conversations.v1.conversations.create({
        friendlyName: friendlyName
      });

      log('info', 'Conversation created successfully', {
        conversationSid: conversation.sid,
        friendlyName: conversation.friendlyName
      });

      return {
        success: true,
        conversationSid: conversation.sid,
        friendlyName: conversation.friendlyName,
        dateCreated: conversation.dateCreated,
        dateUpdated: conversation.dateUpdated
      };
    } catch (error) {
      log('error', 'Failed to create conversation', {
        error: error.message,
        friendlyName: friendlyName
      });
      throw error;
    }
  }

  /**
   * Add a participant to a conversation
   * @param {string} conversationSid - Conversation SID
   * @param {string} phoneNumber - WhatsApp phone number (with or without whatsapp: prefix)
   * @returns {Promise<Object>} Participant object with SID
   */
  async addParticipantToConversation(conversationSid, phoneNumber) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      // Ensure phone number has whatsapp: prefix
      const formattedNumber = phoneNumber.startsWith('whatsapp:') 
        ? phoneNumber 
        : `whatsapp:${phoneNumber}`;

      // Ensure proxy address (Twilio WhatsApp number) has whatsapp: prefix
      const proxyAddress = this.fromNumber.startsWith('whatsapp:')
        ? this.fromNumber
        : `whatsapp:${this.fromNumber}`;

      const participant = await this.client.conversations.v1
        .conversations(conversationSid)
        .participants
        .create({
          'messagingBinding.address': 'whatsapp:+38268580338',
          'messagingBinding.proxyAddress': 'whatsapp:+15418593460'
        });

      log('info', 'Participant added to conversation', {
        conversationSid: conversationSid,
        participantSid: participant.sid,
        phoneNumber: formattedNumber
      });

      return {
        success: true,
        participantSid: participant.sid,
        conversationSid: conversationSid,
        phoneNumber: formattedNumber
      };
    } catch (error) {
      log('error', 'Failed to add participant to conversation', {
        error: error.message,
        conversationSid: conversationSid,
        phoneNumber: phoneNumber
      });
      throw error;
    }
  }

  /**
   * Create a conversation and add multiple participants
   * @param {string} friendlyName - Name for the conversation
   * @param {Array<string>} phoneNumbers - Array of WhatsApp phone numbers
   * @returns {Promise<Object>} Conversation object with participants
   */
  async createConversationWithParticipants(friendlyName, phoneNumbers) {
    try {
      if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
        throw new Error('phoneNumbers must be a non-empty array');
      }

      // Create conversation
      const conversation = await this.createConversation(friendlyName);
      const conversationSid = conversation.conversationSid;

      // Add all participants
      const participants = [];
      const errors = [];

      for (const phoneNumber of phoneNumbers) {
        try {
          const participant = await this.addParticipantToConversation(conversationSid, phoneNumber);
          participants.push(participant);
        } catch (error) {
          errors.push({
            phoneNumber: phoneNumber,
            error: error.message
          });
          log('warn', `Failed to add participant ${phoneNumber}`, { error: error.message });
        }
      }

      log('info', 'Conversation created with participants', {
        conversationSid: conversationSid,
        totalParticipants: phoneNumbers.length,
        added: participants.length,
        failed: errors.length
      });

      return {
        success: participants.length > 0,
        conversationSid: conversationSid,
        friendlyName: friendlyName,
        participants: participants,
        errors: errors,
        totalRequested: phoneNumbers.length,
        totalAdded: participants.length,
        totalFailed: errors.length
      };
    } catch (error) {
      log('error', 'Failed to create conversation with participants', {
        error: error.message,
        friendlyName: friendlyName
      });
      throw error;
    }
  }

  /**
   * Send a message to a conversation
   * @param {string} conversationSid - Conversation SID
   * @param {string} message - Message text to send
   * @returns {Promise<Object>} Message object with SID
   */
  async sendMessageToConversation(conversationSid, message) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      // Ensure author (Twilio WhatsApp number) has whatsapp: prefix
      const author = this.fromNumber.startsWith('whatsapp:')
        ? this.fromNumber
        : `whatsapp:${this.fromNumber}`;

      const messageResponse = await this.client.conversations.v1
        .conversations(conversationSid)
        .messages
        .create({
          author: author,
          body: message
        });

      log('info', 'Message sent to conversation', {
        conversationSid: conversationSid,
        messageSid: messageResponse.sid,
        status: messageResponse.status
      });

      return {
        success: true,
        messageSid: messageResponse.sid,
        conversationSid: conversationSid,
        status: messageResponse.status,
        dateCreated: messageResponse.dateCreated
      };
    } catch (error) {
      log('error', 'Failed to send message to conversation', {
        error: error.message,
        conversationSid: conversationSid
      });
      throw error;
    }
  }

  /**
   * Send a formatted trading message to a conversation
   * @param {string} conversationSid - Conversation SID
   * @param {Object} signalData - Trading signal data object
   * @param {Object} chartImage - Optional chart image object
   * @returns {Promise<Object>} Message object with SID
   */
  async sendFormattedMessageToConversation(conversationSid, signalData, chartImage = null) {
    try {
      const message = this.formatTradingMessage(signalData);
      
      // For conversations, we can only send text messages
      // Media would need to be handled differently (via Media API)
      if (chartImage) {
        log('warn', 'Chart images not yet supported in Conversations API, sending text only');
      }

      return await this.sendMessageToConversation(conversationSid, message);
    } catch (error) {
      log('error', 'Failed to send formatted message to conversation', {
        error: error.message,
        conversationSid: conversationSid
      });
      throw error;
    }
  }

  /**
   * List all conversations
   * @param {number} limit - Maximum number of conversations to return
   * @returns {Promise<Object>} Array of conversations
   */
  async listConversations(limit = 50) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      const conversations = await this.client.conversations.v1.conversations.list({
        limit: limit
      });

      const conversationList = conversations.map(conv => ({
        sid: conv.sid,
        friendlyName: conv.friendlyName,
        dateCreated: conv.dateCreated,
        dateUpdated: conv.dateUpdated,
        state: conv.state
      }));

      log('info', 'Conversations retrieved successfully', {
        count: conversationList.length
      });

      return {
        success: true,
        conversations: conversationList,
        count: conversationList.length
      };
    } catch (error) {
      log('error', 'Failed to list conversations', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get conversation details
   * @param {string} conversationSid - Conversation SID
   * @returns {Promise<Object>} Conversation details
   */
  async getConversation(conversationSid) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      const conversation = await this.client.conversations.v1
        .conversations(conversationSid)
        .fetch();

      log('info', 'Conversation retrieved successfully', {
        conversationSid: conversationSid
      });

      return {
        success: true,
        conversation: {
          sid: conversation.sid,
          friendlyName: conversation.friendlyName,
          dateCreated: conversation.dateCreated,
          dateUpdated: conversation.dateUpdated,
          state: conversation.state,
          uniqueName: conversation.uniqueName
        }
      };
    } catch (error) {
      log('error', 'Failed to get conversation', {
        error: error.message,
        conversationSid: conversationSid
      });
      throw error;
    }
  }

  /**
   * List participants in a conversation
   * @param {string} conversationSid - Conversation SID
   * @returns {Promise<Object>} Array of participants
   */
  async listConversationParticipants(conversationSid) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      const participants = await this.client.conversations.v1
        .conversations(conversationSid)
        .participants
        .list();

      const participantList = participants.map(part => ({
        sid: part.sid,
        identity: part.identity,
        attributes: part.attributes,
        dateCreated: part.dateCreated,
        dateUpdated: part.dateUpdated,
        messagingBinding: part.messagingBinding
      }));

      log('info', 'Conversation participants retrieved successfully', {
        conversationSid: conversationSid,
        count: participantList.length
      });

      return {
        success: true,
        participants: participantList,
        count: participantList.length
      };
    } catch (error) {
      log('error', 'Failed to list conversation participants', {
        error: error.message,
        conversationSid: conversationSid
      });
      throw error;
    }
  }

  validateConfiguration() {
    const requiredEnvVars = [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_WHATSAPP_FROM'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      log('warn', 'Missing required environment variables', { missingVars });
      return false;
    }
    
    log('info', 'Twilio WhatsApp configuration validated successfully');
    return true;
  }
}

module.exports = WhatsAppService;