const whatsappClient = require('./whatsappClient');

// Logging utility
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] WHATSAPP ${level.toUpperCase()}: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

// Delay between messages when sending to multiple chats (reduces ban risk)
const MULTI_SEND_DELAY_MS = parseInt(process.env.WHATSAPP_SEND_DELAY_MS || '1500', 10);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// WhatsApp service using Baileys (linked device, WhatsApp Web protocol)
class WhatsAppService {
  constructor() {
    // Shared connection: safe to create many WhatsAppService instances
    whatsappClient.connect();
  }

  /**
   * Convert phone number or group id to a WhatsApp JID
   * - "905xxxxxxxxx" / "+90 5xx xxx xx xx" -> "905xxxxxxxxx@s.whatsapp.net"
   * - "1203634...@g.us" (group) / any value containing "@" -> kept as is
   */
  toJid(phoneNumber) {
    if (typeof phoneNumber !== 'string' || !phoneNumber.trim()) {
      throw new Error('phoneNumber is required');
    }

    const value = phoneNumber.trim();
    if (value.includes('@')) {
      return value;
    }

    // Strip invisible LTR/RTL marks from copy-pasted numbers, then keep digits only
    const digitsOnly = value
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/\D/g, '');

    if (!/^\d{9,15}$/.test(digitsOnly)) {
      throw new Error(`Invalid phone number format for WhatsApp: "${digitsOnly}" from input "${phoneNumber}"`);
    }

    return `${digitsOnly}@s.whatsapp.net`;
  }

  /**
   * Connection status (for health checks)
   */
  getStatus() {
    return whatsappClient.getStatus();
  }

  /**
   * Check if current time is within restricted hours (00:00 - 06:00 Turkish time)
   * @returns {boolean} True if within restricted hours, false otherwise
   */
  isWithinRestrictedHours() {
    const now = new Date();

    // Get hour in Turkish time (Europe/Istanbul timezone)
    const turkishTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const hour = turkishTime.getHours();

    // Check if hour is between 00:00 (0) and 06:00 (6) Turkish time
    if (hour >= 0 && hour < 6) {
      log('warn', 'Message sending blocked - within restricted hours (00:00 - 06:00 Turkish time)', {
        currentHour: hour,
        turkishTime: turkishTime.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }),
        utcTime: now.toISOString()
      });
      return true;
    }

    return false;
  }

  /**
   * List all WhatsApp groups the linked account is a member of
   * @returns {Promise<Object>} Result object with groups array and count
   */
  async listGroups() {
    try {
      await whatsappClient.getSocket();
      log('info', 'Fetching WhatsApp groups');

      const groupsById = await whatsappClient.refreshGroupCache();
      const groups = Object.values(groupsById).map(group => ({
        id: group.id,
        name: group.subject,
        participants: group.participants?.length || 0
      }));

      log('info', 'Groups retrieved successfully', { count: groups.length });

      return {
        success: true,
        groups: groups,
        count: groups.length
      };
    } catch (error) {
      log('error', 'Failed to retrieve WhatsApp groups', { error: error.message });

      return {
        success: false,
        groups: [],
        count: 0,
        error: error.message
      };
    }
  }

  /**
   * Send a text message to a person or group
   * @param {string} phoneNumber - Phone number in international format (e.g., '905xxxxxxxxx') or group id ('...@g.us')
   * @param {string} message - Message text to send
   * @returns {Promise<Object>} Result object with success status and message details
   */
  async sendMessageToPerson(phoneNumber, message) {
    try {
      // Check if within restricted hours
      if (this.isWithinRestrictedHours()) {
        throw new Error('Message sending is not allowed between 00:00 and 06:00');
      }

      if (!phoneNumber || !message) {
        throw new Error('phoneNumber and message are required');
      }

      const jid = this.toJid(phoneNumber);
      const sock = await whatsappClient.getSocket();

      log('info', 'Sending message via WhatsApp', { to: jid });

      const sent = await sock.sendMessage(jid, { text: message });

      log('info', 'Message sent successfully', { to: jid, messageId: sent?.key?.id });

      return {
        success: true,
        phoneNumber: jid,
        messageId: sent?.key?.id
      };
    } catch (error) {
      log('error', 'Failed to send WhatsApp message', {
        error: error.message,
        phoneNumber: phoneNumber
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
  formatNumber(value, maxDecimals = 2) {
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
    const { title, action, symbol, price, ...otherProps } = signal;

    // Format price
    const formattedPrice = this.formatNumber(price);

    // Build main message with title, datetime, action, symbol, price
    const messageTitle = title || "Yeni İşlem Önerisi";
    let message = `${messageTitle}\n\n${action} ${symbol} ${formattedPrice}`;

    // Add all other properties as KEY: VALUE (preserve original order)
    const excludedKeys = ['title', 'action', 'symbol', 'price', 'side', 'ticker', 'close', 'signal', 'entry', 'whatsapp', 'telegram', 'test', 'private', 'time'];
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
   * Send an image with caption to a person or group
   * @param {string} phoneNumber - Phone number in international format (e.g., '905xxxxxxxxx') or group id ('...@g.us')
   * @param {string|Buffer} image - Public URL / local file path of the image, or image Buffer
   * @param {string} caption - Caption text for the image
   * @returns {Promise<Object>} Result object with success status and message details
   */
  async sendImageToPerson(phoneNumber, image, caption = '') {
    try {
      // Check if within restricted hours
      if (this.isWithinRestrictedHours()) {
        throw new Error('Message sending is not allowed between 00:00 and 06:00');
      }

      if (!phoneNumber || !image) {
        throw new Error('phoneNumber and image are required');
      }

      const jid = this.toJid(phoneNumber);
      const sock = await whatsappClient.getSocket();

      log('info', 'Sending image via WhatsApp', {
        to: jid,
        image: Buffer.isBuffer(image) ? `<buffer ${image.length} bytes>` : image
      });

      const sent = await sock.sendMessage(jid, {
        image: Buffer.isBuffer(image) ? image : { url: image },
        caption: caption || ''
      });

      log('info', 'Image sent successfully', { to: jid, messageId: sent?.key?.id });

      return {
        success: true,
        phoneNumber: jid,
        messageId: sent?.key?.id
      };
    } catch (error) {
      log('error', 'Failed to send WhatsApp image', {
        error: error.message,
        phoneNumber: phoneNumber,
        image: Buffer.isBuffer(image) ? '<buffer>' : image
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

      for (const [index, phoneNumber] of numbersArray.entries()) {
        if (index > 0 && MULTI_SEND_DELAY_MS > 0) {
          await sleep(MULTI_SEND_DELAY_MS);
        }
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
            messageId: result.messageId
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

  /**
   * Baileys needs no API keys; the service is usable once the device is linked.
   * Returns true when configured (a session exists or linking is in progress).
   */
  validateConfiguration() {
    const status = whatsappClient.getStatus();

    if (status.status === 'logged_out') {
      log('warn', 'WhatsApp session logged out, link the device again (npm run wa:login)');
      return false;
    }

    log('info', 'Baileys WhatsApp configuration validated', { status: status.status });
    return true;
  }
}

module.exports = WhatsAppService;
