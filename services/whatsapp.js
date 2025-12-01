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