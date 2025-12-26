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
   * Format number to reduce decimal places
   * @param {string|number} value - Value to format
   * @param {number} maxDecimals - Maximum number of decimal places (default: 4)
   * @returns {string} Formatted value
   */
  formatNumber(value, maxDecimals = 4) {
    if (value === null || value === undefined || value === '') {
      return value;
    }
    
    // Convert to string first
    const strValue = String(value).trim();
    
    // Check if it's a number (including decimals)
    const numMatch = strValue.match(/^-?\d+\.?\d*$/);
    if (numMatch) {
      const num = parseFloat(strValue);
      if (!isNaN(num)) {
        // Format to max 4 decimal places, remove trailing zeros
        return num.toFixed(maxDecimals).replace(/\.?0+$/, '');
      }
    }
    
    // If not a number, return as is
    return strValue;
  }

  /**
   * Format trading message for display
   * @param {Object} signal - Trading signal data
   * @returns {string} Formatted message text
   */
  formatTradingMessage(signal) {
    const { title, datetime, action, symbol, price, ...otherProps } = signal;
    
    // Format price
    const formattedPrice = this.formatNumber(price);
    
    // Build main message with title, datetime, action, symbol, price
    let message = `${title}\n${datetime || new Date().toISOString()}\n\n${action} ${symbol} ${formattedPrice}`;
    
    // Add all other properties as KEY: VALUE (preserve original order)
    const excludedKeys = ['title', 'datetime', 'action', 'symbol', 'price'];
    const additionalProps = Object.keys(otherProps)
      .filter(key => !excludedKeys.includes(key.toLowerCase()) && otherProps[key] !== undefined && otherProps[key] !== null && otherProps[key] !== '');
    
    if (additionalProps.length > 0) {
      message += '\n';
      additionalProps.forEach(key => {
        const value = otherProps[key];
        // Format value if it's a number
        const formattedValue = this.formatNumber(value);
        // Format key: uppercase and remove special characters, keep numbers
        const formattedKey = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
        message += `\n${formattedKey}: ${formattedValue}`;
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

      let cleanPhoneNumber = phoneNumber;

      // Check if this is a group number
      const isGroup = typeof cleanPhoneNumber === 'string' && cleanPhoneNumber.includes('@g.us');

      if (!isGroup) {
        // Whapi expects phone number: remove +, spaces, and any non-digit or hyphen at start/end
        cleanPhoneNumber = cleanPhoneNumber
          .replace(/[^\d\-@.]/g, '') // remove ALL non-digit, non-hyphen, non-@, non-dot
          .replace(/^[-\s]+|[-\s]+$/g, '') // trim - and spaces from start/end
          .replace(/-/g, ''); // remove all dashes

        // Some "copy-paste" numbers from WhatsApp Web contain invisible LTR/RTL marks or strange chars
        cleanPhoneNumber = cleanPhoneNumber.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');

        // Remove @... if present
        const digitsOnly = cleanPhoneNumber.replace(/@.*/, '');
        // Must be only digits and length 9-31
        if (!/^\d{9,31}$/.test(digitsOnly)) {
          throw new Error(
            `Invalid phone number format for WhatsApp API: "${digitsOnly}" from input "${phoneNumber}"`
          );
        }
        cleanPhoneNumber = digitsOnly;
      }
      // else: leave group phone number completely as is, no further cleaning

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
        phoneNumber: phoneNumber,
        cleaned: cleanPhoneNumber,
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
      // Enhance error log if 400 from server with pattern error
      let hint;
      let details;
      if (
        error.response &&
        error.response.status === 400 &&
        error.response.data &&
        error.response.data.error &&
        typeof error.response.data.error.details === 'string'
      ) {
        details = error.response.data.error.details;
        hint = '';
        if (
          /must match pattern/.test(details) &&
          /to must match pattern/.test(details)
        ) {
          hint =
            '\n⚠️ Looks like the WhatsApp number format is invalid. ' +
            'Make sure phone number contains ONLY digits, no spaces or symbols. For example: 15551234567';
        }
      }

      log('error', 'Failed to send image via Whapi API', {
        error: error.message + (hint ? hint : ''),
        phoneNumber: phoneNumber,
        imageUrl: imageUrl,
        response: error.response?.data,
        details
      });
      throw error;
    }
  }

  /**
   * Send a formatted trading message to one or multiple persons
   * @param {string|Array<string>} phoneNumbers - Phone number(s) in international format, can be:
   *   - Single phone number: "1234567890"
   *   - Comma-separated string: "1234567890,0987654321"
   *   - Array of phone numbers: ["1234567890", "0987654321"]
   * @param {Object} signalData - Trading signal data object
   * @param {string} imageUrl - Optional image URL to send with the message
   * @returns {Promise<Object>} Result object with success status and detailed results
   */
  async sendFormattedMessageToPerson(phoneNumbers, signalData, imageUrl = null) {
    try {
      const message = this.formatTradingMessage(signalData);
      
      // Handle different input formats
      let numbersArray = [];
      if (Array.isArray(phoneNumbers)) {
        numbersArray = phoneNumbers;
      } else if (typeof phoneNumbers === 'string') {
        // Check if it's comma-separated
        if (phoneNumbers.includes(',')) {
          numbersArray = phoneNumbers.split(',').map(num => num.trim()).filter(num => num);
        } else {
          numbersArray = [phoneNumbers.trim()];
        }
      } else {
        throw new Error('phoneNumbers must be a string or array');
      }

      if (numbersArray.length === 0) {
        throw new Error('No valid phone numbers provided');
      }

      // If only one number, use the original single-number logic for backward compatibility
      if (numbersArray.length === 1) {
        const singleNumber = numbersArray[0];
        if (imageUrl) {
          return await this.sendImageToPerson(singleNumber, imageUrl, message);
        } else {
          return await this.sendMessageToPerson(singleNumber, message);
        }
      }

      // Handle multiple numbers
      log('info', 'Sending formatted message to multiple numbers', {
        count: numbersArray.length,
        hasImage: !!imageUrl
      });

      const results = {
        success: false,
        total: numbersArray.length,
        succeeded: 0,
        failed: 0,
        results: []
      };

      for (const phoneNumber of numbersArray) {
        try {
          let result;
          if (imageUrl) {
            result = await this.sendImageToPerson(phoneNumber, imageUrl, message);
          } else {
            result = await this.sendMessageToPerson(phoneNumber, message);
          }
          
          results.succeeded++;
          results.results.push({
            phoneNumber: phoneNumber,
            success: true,
            messageId: result.messageId,
            response: result.response
          });
          
          log('info', 'Message sent successfully to number', {
            phoneNumber: phoneNumber,
            messageId: result.messageId
          });
        } catch (error) {
          results.failed++;
          results.results.push({
            phoneNumber: phoneNumber,
            success: false,
            error: error.message
          });
          
          log('error', 'Failed to send message to number', {
            phoneNumber: phoneNumber,
            error: error.message
          });
        }
      }

      // Consider it successful if at least one message was sent
      results.success = results.succeeded > 0;

      if (results.succeeded === 0) {
        throw new Error(`Failed to send message to all ${results.total} phone numbers`);
      }

      log('info', 'Bulk message sending completed', {
        total: results.total,
        succeeded: results.succeeded,
        failed: results.failed
      });

      return results;
    } catch (error) {
      log('error', 'Failed to send formatted message', {
        error: error.message,
        phoneNumbers: phoneNumbers
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
