const axios = require('axios');

// Logging utility
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] TELEGRAM ${level.toUpperCase()}: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

// Telegram service using Telegram Bot API
class TelegramService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.apiUrl = this.botToken 
      ? `https://api.telegram.org/bot${this.botToken}`
      : null;
    
    this.initializeService();
  }

  initializeService() {
    if (!this.botToken || !this.chatId) {
      log('warn', 'Telegram bot token or chat ID not configured');
      return;
    }
    
    log('info', 'Telegram service initialized successfully', {
      chatId: this.chatId,
      hasToken: !!this.botToken
    });
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
   * Format TradingView webhook data into a readable message
   * Same format as WhatsApp: title, datetime, action symbol price, then KEY: VALUE for other properties
   */
  formatTradingViewMessage(data) {
    const { title, datetime, action, symbol, price, ...otherProps } = data;
    
    const messageTitle = title || "Yeni Islem Onerisi";
    const messageDatetime = datetime || new Date().toISOString();
    const messageAction = (action || data.side || "").toUpperCase();
    const messageSymbol = symbol || data.ticker || "";
    const messagePrice = this.formatNumber(price || data.close || "");

    // Build main message with title, datetime, action, symbol, price
    let message = `${messageTitle}\n${messageDatetime}\n\n${messageAction} ${messageSymbol} ${messagePrice}`;
    
    // Add all other properties as KEY: VALUE (preserve original order)
    const excludedKeys = ['title', 'datetime', 'action', 'side', 'symbol', 'ticker', 'price', 'close'];
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
   * Format trading message with emojis (alternative format)
   */
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

  /**
   * Send message to Telegram
   * @param {string} message - Message text to send
   * @param {string} parseMode - Parse mode (HTML, Markdown, etc.)
   * @param {string|number} chatId - Optional chat ID (uses default if not provided)
   */
  async sendMessage(message, parseMode = 'HTML', chatId = null) {
    if (!this.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN must be set in environment variables');
    }

    const targetChatId = chatId || this.chatId;
    if (!targetChatId) {
      throw new Error('TELEGRAM_CHAT_ID must be set in environment variables or provided as parameter');
    }

    try {
      const response = await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: targetChatId,
        text: message,
        parse_mode: parseMode
      });

      log('info', 'Message sent successfully', {
        messageId: response.data.result?.message_id,
        chatId: targetChatId
      });

      return {
        success: true,
        messageId: response.data.result?.message_id,
        data: response.data
      };
    } catch (error) {
      const errorData = error.response?.data || {};
      const errorCode = errorData.error_code;
      const errorDescription = errorData.description || error.message;
      
      // Provide more helpful error messages for common issues
      if (errorCode === 400 && errorDescription?.includes('chat not found')) {
        log('warn', 'Chat not found - Bot may not be added to the group/channel', {
          chatId: targetChatId,
          solution: 'Ensure the bot is added to the group/channel and the chat ID is correct. For groups, add @userinfobot to get the chat ID.'
        });
      } else if (errorCode === 403 && errorDescription?.includes('bot was blocked')) {
        log('warn', 'Bot was blocked by the user', {
          chatId: targetChatId
        });
      } else if (errorCode === 400 && errorDescription?.includes('message is too long')) {
        log('warn', 'Message is too long for Telegram (max 4096 characters)', {
          chatId: targetChatId,
          messageLength: message?.length
        });
      } else {
        log('error', 'Failed to send message', {
          error: errorDescription,
          errorCode: errorCode,
          status: error.response?.status,
          chatId: targetChatId
        });
      }
      
      throw error;
    }
  }

  /**
   * Send photo with caption to Telegram
   */
  async sendPhoto(photo, caption = '', parseMode = 'HTML') {
    if (!this.botToken || !this.chatId) {
      throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in environment variables');
    }

    try {
      // Handle different photo formats
      if (Buffer.isBuffer(photo) || photo.buffer) {
        // For buffer, we need to send as multipart/form-data
        const FormData = require('form-data');
        const form = new FormData();
        form.append('chat_id', this.chatId);
        
        // Handle buffer correctly - extract the actual buffer
        const actualBuffer = Buffer.isBuffer(photo) ? photo : photo.buffer;
        form.append('photo', actualBuffer, {
          filename: 'chart.png',
          contentType: 'image/png'
        });
        if (caption) {
          form.append('caption', caption);
          form.append('parse_mode', parseMode);
        }

        const response = await axios.post(`${this.apiUrl}/sendPhoto`, form, {
          headers: form.getHeaders()
        });

        log('info', 'Photo sent successfully', {
          messageId: response.data.result?.message_id,
          chatId: this.chatId
        });

        return {
          success: true,
          messageId: response.data.result?.message_id,
          data: response.data
        };
      } else if (typeof photo === 'string') {
        // URL or file_id
        const response = await axios.post(`${this.apiUrl}/sendPhoto`, {
          chat_id: this.chatId,
          photo: photo,
          caption: caption,
          parse_mode: parseMode
        });

        log('info', 'Photo sent successfully', {
          messageId: response.data.result?.message_id,
          chatId: this.chatId
        });

        return {
          success: true,
          messageId: response.data.result?.message_id,
          data: response.data
        };
      } else {
        throw new Error('Invalid photo format. Expected Buffer, URL string, or object with buffer property');
      }
    } catch (error) {
      log('error', 'Failed to send photo', {
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      throw error;
    }
  }

  /**
   * Send formatted trading message to Telegram
   */
  async sendFormattedMessage(signalData, chartImage = null) {
    // Use the simple format as in the provided code
    const message = this.formatTradingViewMessage(signalData);
    
    if (chartImage) {
      try {
        // Try to send with chart image
        if (chartImage.buffer || Buffer.isBuffer(chartImage)) {
          return await this.sendPhoto(chartImage, message);
        } else if (chartImage.url) {
          return await this.sendPhoto(chartImage.url, message);
        } else {
          // Fallback to text only
          log('warn', 'Invalid chart image format, sending text only');
          return await this.sendMessage(message);
        }
      } catch (error) {
        // If sending photo fails, fallback to text message
        log('warn', 'Failed to send photo, falling back to text message', {
          error: error.message
        });
        return await this.sendMessage(message);
      }
    }
    
    // Send text message only
    return await this.sendMessage(message);
  }

  validateConfiguration() {
    const requiredEnvVars = [
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      log('warn', 'Missing required environment variables', { missingVars });
      return false;
    }
    
    log('info', 'Telegram configuration validated successfully');
    return true;
  }
}

module.exports = TelegramService;

