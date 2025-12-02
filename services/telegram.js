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
   * Format TradingView webhook data into a readable message
   */
  formatTradingViewMessage(data) {
    const title = data.title || "Yeni Islem Onerisi";
    const datetime = data.datetime || "";
    const action = (data.action || data.side || "").toUpperCase();
    const symbol = data.symbol || data.ticker || "";
    const price = data.price || data.close || "";

    // Compose message as requested
    // Example:
    // Yeni Islem Onerisi
    //
    // 18.09.2024 21:30
    //
    // SELL EURUSD 1.11646
    let message = `${title}\n\n`;
    
    if (datetime) {
      message += `${datetime}\n\n`;
    }
    
    message += `${action} ${symbol} ${price}`.trim();
    
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
   */
  async sendMessage(message, parseMode = 'HTML') {
    if (!this.botToken || !this.chatId) {
      throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in environment variables');
    }

    try {
      const response = await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: this.chatId,
        text: message,
        parse_mode: parseMode
      });

      log('info', 'Message sent successfully', {
        messageId: response.data.result?.message_id,
        chatId: this.chatId
      });

      return {
        success: true,
        messageId: response.data.result?.message_id,
        data: response.data
      };
    } catch (error) {
      log('error', 'Failed to send message', {
        error: error.response?.data || error.message,
        status: error.response?.status
      });
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
      let photoData;
      if (Buffer.isBuffer(photo) || photo.buffer) {
        // For buffer, we need to send as multipart/form-data
        const FormData = require('form-data');
        const form = new FormData();
        form.append('chat_id', this.chatId);
        form.append('photo', photo.buffer || photo, {
          filename: 'chart.png',
          contentType: photo.contentType || 'image/png'
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

