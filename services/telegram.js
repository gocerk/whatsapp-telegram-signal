const axios = require('axios');

// Logging utility
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] TELEGRAM ${level.toUpperCase()}: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

// Payload keys that hold price levels and should use the entry price precision
const PRICE_LEVEL_KEY = /^(entry|sl|stop|stoploss|tp\d*|target\d*)$/i;

// Telegram service using Telegram Bot API
class TelegramService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    // No default chats: every send must target an explicit chat ID
    // (TELEGRAM_VIP_CHAT_ID / TELEGRAM_ANALIZ_CHAT_ID / TELEGRAM_TEST_GROUP_CHAT_ID, chosen in main.js via "gonderim")
    this.chatIds = [];
    this.chatId = null;
    this.apiUrl = this.botToken
      ? `https://api.telegram.org/bot${this.botToken}`
      : null;

    this.initializeService();
  }

  initializeService() {
    if (!this.botToken) {
      log('warn', 'Telegram bot token not configured');
      return;
    }

    log('info', 'Telegram service initialized successfully', {
      vipChatId: process.env.TELEGRAM_VIP_CHAT_ID,
      analizChatId: process.env.TELEGRAM_ANALIZ_CHAT_ID,
      testChatId: process.env.TELEGRAM_TEST_GROUP_CHAT_ID,
      hasToken: !!this.botToken
    });
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
   * Decide how many decimals to show for the prices of one signal (entry, SL, TPs).
   * Uses the entry price's own precision (e.g. GBPUSD 1.33708 -> 5), with at least
   * 2 decimals and at least 6 significant digits, because JSON drops trailing zeros
   * (1.33700 arrives as 1.337). Capped at 8 decimals.
   * @param {string|number} entryPrice - Entry price as sent by TradingView
   * @returns {number} Decimal places to use
   */
  getPriceDecimals(entryPrice) {
    const strValue = String(entryPrice ?? '').trim();
    if (!/^-?\d+(\.\d+)?$/.test(strValue)) {
      return 2;
    }

    const num = Math.abs(parseFloat(strValue));
    const ownDecimals = (strValue.split('.')[1] || '').length;
    // Long computed values (e.g. 1.3368185714285716) are not instrument precision
    const instrumentDecimals = ownDecimals <= 6 ? ownDecimals : 0;
    const significantDecimals = num > 0 ? 6 - (Math.floor(Math.log10(num)) + 1) : 0;

    return Math.min(8, Math.max(2, instrumentDecimals, significantDecimals));
  }

  /**
   * Format a price with a fixed number of decimals; non-numeric values are returned as is
   */
  formatPrice(value, decimals) {
    if (value === null || value === undefined || value === '') {
      return value;
    }

    const strValue = String(value).trim();
    if (!/^-?\d+(\.\d+)?$/.test(strValue)) {
      return strValue;
    }

    return parseFloat(strValue).toFixed(decimals);
  }

  /**
   * Format TradingView webhook data into a readable message
   * Same format as WhatsApp: title, datetime, action symbol price, then KEY: VALUE for other properties
   */
  formatTradingViewMessage(data) {
    const { title, action, symbol, price, ...otherProps } = data;

    const messageTitle = title || "Yeni Islem Onerisi";
    const messageAction = (action || data.side || "").toUpperCase();
    const messageSymbol = symbol || data.ticker || "";
    const entryPrice = price || data.close || "";
    const priceDecimals = this.getPriceDecimals(entryPrice);
    const messagePrice = this.formatPrice(entryPrice, priceDecimals);

    // Build main message with title, datetime, action, symbol, price
    let message = `${messageTitle}\n\n${messageAction} ${messageSymbol} ${messagePrice}`;
    
    // Add all other properties as KEY: VALUE (preserve original order)
    const excludedKeys = ['title', 'action', 'side', 'symbol', 'ticker', 'price', 'close', 'signal', 'entry', 'whatsapp', 'telegram', 'test', 'private', 'time'];
    const additionalProps = Object.keys(otherProps)
      .filter(key => !excludedKeys.includes(key.toLowerCase()) && otherProps[key] !== undefined && otherProps[key] !== null && otherProps[key] !== '');
    
    if (additionalProps.length > 0) {
      message += '\n';
      additionalProps.forEach(key => {
        const value = otherProps[key];
        // Price levels (SL, TP1, TP2...) use the entry price precision; other numbers keep the old 2-decimal format
        const formattedValue = PRICE_LEVEL_KEY.test(key)
          ? this.formatPrice(value, priceDecimals)
          : this.formatNumber(value);
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
    const { title, action, symbol, price } = signal;
    
    const actionEmoji = action === 'BUY' ? '🟢' : action === 'SELL' ? '🔴' : '⚪';
    
    return `${actionEmoji} *${title}*

📊 *Symbol:* ${symbol}
⚡ *Action:* ${action}
💰 *Price:* $${price}

_Trading signal from TradingView_`;
  }

  /**
   * Send message to a single chat
   * @param {string} message - Message text to send
   * @param {string} parseMode - Parse mode (HTML, Markdown, etc.)
   * @param {string|number} targetChatId - Target chat ID
   */
  async sendMessageToChat(message, parseMode, targetChatId) {
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
        chatId: targetChatId,
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
   * Send message to Telegram (supports multiple chat IDs)
   * @param {string} message - Message text to send
   * @param {string} parseMode - Parse mode (HTML, Markdown, etc.)
   * @param {string|number|null} chatId - Optional specific chat ID (uses all configured chat IDs if not provided)
   */
  async sendMessage(message, parseMode = 'HTML', chatId = null) {
    if (!this.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN must be set in environment variables');
    }

    // If specific chatId provided, send only to that chat
    if (chatId) {
      return await this.sendMessageToChat(message, parseMode, chatId);
    }

    // Send to all configured chat IDs
    if (this.chatIds.length === 0) {
      throw new Error('chatId parameter is required (no default Telegram chats configured)');
    }

    const results = [];
    const errors = [];

    for (const targetChatId of this.chatIds) {
      try {
        const result = await this.sendMessageToChat(message, parseMode, targetChatId);
        results.push(result);
      } catch (error) {
        errors.push({
          chatId: targetChatId,
          error: error.message
        });
      }
    }

    // If all sends failed, throw error
    if (results.length === 0 && errors.length > 0) {
      throw new Error(`Failed to send message to all chats: ${JSON.stringify(errors)}`);
    }

    log('info', `Message sent to ${results.length}/${this.chatIds.length} chats`, {
      successful: results.length,
      failed: errors.length
    });

    return {
      success: true,
      results,
      errors: errors.length > 0 ? errors : undefined,
      totalChats: this.chatIds.length,
      successfulChats: results.length
    };
  }

  /**
   * Send photo to a single chat
   */
  async sendPhotoToChat(photo, caption, parseMode, targetChatId) {
    try {
      // Handle different photo formats
      if (Buffer.isBuffer(photo) || photo.buffer) {
        // For buffer, we need to send as multipart/form-data
        const FormData = require('form-data');
        const form = new FormData();
        form.append('chat_id', targetChatId);
        
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
          chatId: targetChatId
        });

        return {
          success: true,
          messageId: response.data.result?.message_id,
          chatId: targetChatId,
          data: response.data
        };
      } else if (typeof photo === 'string') {
        // URL or file_id
        const response = await axios.post(`${this.apiUrl}/sendPhoto`, {
          chat_id: targetChatId,
          photo: photo,
          caption: caption,
          parse_mode: parseMode
        });

        log('info', 'Photo sent successfully', {
          messageId: response.data.result?.message_id,
          chatId: targetChatId
        });

        return {
          success: true,
          messageId: response.data.result?.message_id,
          chatId: targetChatId,
          data: response.data
        };
      } else {
        throw new Error('Invalid photo format. Expected Buffer, URL string, or object with buffer property');
      }
    } catch (error) {
      log('error', 'Failed to send photo', {
        error: error.response?.data || error.message,
        status: error.response?.status,
        chatId: targetChatId
      });
      throw error;
    }
  }

  /**
   * Send photo with caption to Telegram (supports multiple chat IDs)
   * @param {Buffer|string|object} photo - Photo buffer, URL, or object with buffer property
   * @param {string} caption - Photo caption
   * @param {string} parseMode - Parse mode (HTML, Markdown, etc.)
   * @param {string|number|null} chatId - Optional specific chat ID (uses all configured chat IDs if not provided)
   */
  async sendPhoto(photo, caption = '', parseMode = 'HTML', chatId = null) {
    if (!this.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN must be set in environment variables');
    }

    // If specific chatId provided, send only to that chat
    if (chatId) {
      return await this.sendPhotoToChat(photo, caption, parseMode, chatId);
    }

    // Send to all configured chat IDs
    if (this.chatIds.length === 0) {
      throw new Error('chatId parameter is required (no default Telegram chats configured)');
    }

    const results = [];
    const errors = [];

    for (const targetChatId of this.chatIds) {
      try {
        const result = await this.sendPhotoToChat(photo, caption, parseMode, targetChatId);
        results.push(result);
      } catch (error) {
        errors.push({
          chatId: targetChatId,
          error: error.message
        });
      }
    }

    // If all sends failed, throw error
    if (results.length === 0 && errors.length > 0) {
      throw new Error(`Failed to send photo to all chats: ${JSON.stringify(errors)}`);
    }

    log('info', `Photo sent to ${results.length}/${this.chatIds.length} chats`, {
      successful: results.length,
      failed: errors.length
    });

    return {
      success: true,
      results,
      errors: errors.length > 0 ? errors : undefined,
      totalChats: this.chatIds.length,
      successfulChats: results.length
    };
  }

  /**
   * Send formatted trading message to Telegram
   * @param {object} signalData - Signal data to format and send
   * @param {Buffer|object|null} chartImage - Optional chart image
   * @param {string|number|null} chatId - Optional specific chat ID (uses all configured chat IDs if not provided)
   */
  async sendFormattedMessage(signalData, chartImage = null, chatId = null) {
    // Use the simple format as in the provided code
    const message = this.formatTradingViewMessage(signalData);
    
    if (chartImage) {
      try {
        // Try to send with chart image
        if (chartImage.buffer || Buffer.isBuffer(chartImage)) {
          return await this.sendPhoto(chartImage, message, 'HTML', chatId);
        } else if (chartImage.url) {
          return await this.sendPhoto(chartImage.url, message, 'HTML', chatId);
        } else {
          // Fallback to text only
          log('warn', 'Invalid chart image format, sending text only');
          return await this.sendMessage(message, 'HTML', chatId);
        }
      } catch (error) {
        // If sending photo fails, fallback to text message
        log('warn', 'Failed to send photo, falling back to text message', {
          error: error.message
        });
        return await this.sendMessage(message, 'HTML', chatId);
      }
    }
    
    // Send text message only
    return await this.sendMessage(message, 'HTML', chatId);
  }

  validateConfiguration() {
    const requiredEnvVars = [
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_VIP_CHAT_ID',
      'TELEGRAM_ANALIZ_CHAT_ID',
      'TELEGRAM_TEST_GROUP_CHAT_ID'
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

