const axios = require('axios');

// Logging utility
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] WHATSAPP ${level.toUpperCase()}: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

// WhatsApp service using Whapi API
class WhatsAppService {
  constructor() {
    // Whapi API configuration
    this.whapiToken = process.env.WHAPI_TOKEN;
    this.whapiBaseUrl = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';
    
    if (!this.whapiToken) {
      log('warn', 'WHAPI_TOKEN not set in environment variables');
    } else {
      log('info', 'Whapi API configured successfully');
    }
  }

  /**
   * List all WhatsApp groups using Whapi API
   * @returns {Promise<Object>} Result object with groups array and count
   */
  async listGroups() {
    try {
      if (!this.whapiToken) {
        throw new Error('WHAPI_TOKEN not configured');
      }

      const url = `${this.whapiBaseUrl}/groups`;
      const headers = {
        'accept': 'application/json',
        'Authorization': `Bearer ${this.whapiToken}`
      };

      log('info', 'Fetching WhatsApp groups from Whapi API');

      const response = await axios.get(url, {
        headers: headers,
        params: {
          token: this.whapiToken
        }
      });

      if (response.status === 200 && response.data) {
        const groups = Array.isArray(response.data) ? response.data : [];
        
        log('info', 'Groups retrieved successfully', {
          count: groups.length
        });

        return {
          success: true,
          groups: groups,
          count: groups.length
        };
      } else {
        throw new Error('Unexpected response format from Whapi API');
      }
    } catch (error) {
      log('error', 'Failed to retrieve groups from Whapi API', {
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        groups: [],
        count: 0,
        error: error.message
      };
    }
  }

  /**
   * Send a message to a specific person using Whapi API
   * @param {string} phoneNumber - Phone number in international format without + (e.g., '15056482143')
   * @param {string} message - Message text to send
   * @returns {Promise<Object>} Result object with success status and message details
   */
  async sendMessageToPerson(phoneNumber, message) {
    try {
      if (!this.whapiToken) {
        throw new Error('WHAPI_TOKEN not configured');
      }

      if (!phoneNumber || !message) {
        throw new Error('phoneNumber and message are required');
      }

      // Remove + and any spaces from phone number
      const cleanPhoneNumber = phoneNumber.replace(/[\s+]/g, '');

      const url = `${this.whapiBaseUrl}/messages/text`;
      const headers = {
        'accept': 'application/json',
        'content-type': 'application/json',
        'Authorization': `Bearer ${this.whapiToken}`
      };

      const data = {
        to: cleanPhoneNumber,
        body: message
      };

      log('info', 'Sending message to person via Whapi API', {
        phoneNumber: cleanPhoneNumber
      });

      const response = await axios.post(url, data, {
        headers: headers,
        params: {
          token: this.whapiToken
        }
      });

      if (response.status === 200) {
        log('info', 'Message sent successfully', {
          phoneNumber: cleanPhoneNumber,
          response: response.data
        });

        return {
          success: true,
          phoneNumber: cleanPhoneNumber,
          messageId: response.data?.id || response.data?.message_id,
          response: response.data
        };
      } else {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
    } catch (error) {
      log('error', 'Failed to send message via Whapi API', {
        error: error.message,
        phoneNumber: phoneNumber,
        response: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Format trading message for display
   * @param {Object} signal - Trading signal data
   * @returns {string} Formatted message text
   */
  formatTradingMessage(signal) {
    const { title, datetime, action, symbol, price, ...otherProps } = signal;
    
    // Build main message with title, datetime, action, symbol, price
    let message = `${title}\n${datetime || new Date().toISOString()}\n\n${action} ${symbol} ${price}`;
    
    // Add all other properties as KEY: VALUE (preserve original order)
    const excludedKeys = ['title', 'datetime', 'action', 'symbol', 'price'];
    const additionalProps = Object.keys(otherProps)
      .filter(key => !excludedKeys.includes(key.toLowerCase()) && otherProps[key] !== undefined && otherProps[key] !== null && otherProps[key] !== '');
    
    if (additionalProps.length > 0) {
      message += '\n';
      additionalProps.forEach(key => {
        const value = otherProps[key];
        // Format key: uppercase and remove special characters, keep numbers
        const formattedKey = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
        message += `\n${formattedKey}: ${value}`;
      });
    }
    
    return message;
  }

  /**
   * Send an image with caption to a specific person using Whapi API
   * @param {string} phoneNumber - Phone number in international format without + (e.g., '15056482143')
   * @param {string} imageUrl - Public URL of the image
   * @param {string} caption - Caption text for the image
   * @returns {Promise<Object>} Result object with success status and message details
   */
  async sendImageToPerson(phoneNumber, imageUrl, caption = '') {
    try {
      if (!this.whapiToken) {
        throw new Error('WHAPI_TOKEN not configured');
      }

      if (!phoneNumber || !imageUrl) {
        throw new Error('phoneNumber and imageUrl are required');
      }

      // Remove + and any spaces from phone number
      const cleanPhoneNumber = phoneNumber.replace(/[\s+]/g, '');

      const url = `${this.whapiBaseUrl}/messages/image`;
      const headers = {
        'accept': 'application/json',
        'content-type': 'application/json',
        'Authorization': `Bearer ${this.whapiToken}`
      };

      const data = {
        to: cleanPhoneNumber,
        media: imageUrl,
        caption: caption || ''
      };

      log('info', 'Sending image to person via Whapi API', {
        phoneNumber: cleanPhoneNumber,
        imageUrl: imageUrl
      });

      const response = await axios.post(url, data, {
        headers: headers,
        params: {
          token: this.whapiToken
        }
      });

      if (response.status === 200) {
        log('info', 'Image sent successfully', {
          phoneNumber: cleanPhoneNumber,
          response: response.data
        });

        return {
          success: true,
          phoneNumber: cleanPhoneNumber,
          messageId: response.data?.id || response.data?.message_id,
          response: response.data
        };
      } else {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
    } catch (error) {
      log('error', 'Failed to send image via Whapi API', {
        error: error.message,
        phoneNumber: phoneNumber,
        imageUrl: imageUrl,
        response: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Send a formatted trading message to a specific person
   * @param {string} phoneNumber - Phone number in international format
   * @param {Object} signalData - Trading signal data object
   * @param {string} imageUrl - Optional image URL to send with the message
   * @returns {Promise<Object>} Result object with success status
   */
  async sendFormattedMessageToPerson(phoneNumber, signalData, imageUrl = null) {
    try {
      const message = this.formatTradingMessage(signalData);
      
      if (imageUrl) {
        // Send image with caption
        return await this.sendImageToPerson(phoneNumber, imageUrl, message);
      } else {
        // Send text only
        return await this.sendMessageToPerson(phoneNumber, message);
      }
    } catch (error) {
      log('error', 'Failed to send formatted message to person', {
        error: error.message,
        phoneNumber: phoneNumber
      });
      throw error;
    }
  }

  validateConfiguration() {
    const requiredEnvVars = ['WHAPI_TOKEN'];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      log('warn', 'Missing required environment variables', { missingVars });
      return false;
    }
    
    log('info', 'Whapi WhatsApp configuration validated successfully');
    return true;
  }
}

module.exports = WhatsAppService;
