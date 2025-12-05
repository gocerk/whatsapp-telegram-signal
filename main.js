require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const mongoose = require('mongoose');
const WhatsAppService = require('./services/whatsapp');
const TelegramService = require('./services/telegram');
const ChartService = require('./services/chart');
const newsChecker = require('./services/newsChecker');

const app = express();
const PORT = process.env.PORT || 80;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: 'text/plain', limit: '10mb' }));

// Middleware to handle raw JSON that might come without proper content-type
app.use((req, res, next) => {
  // If body is a string, try to parse it as JSON
  if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      // If parsing fails, keep it as string
      console.warn('Failed to parse body as JSON:', e.message);
    }
  }
  next();
});

// Configuration
const WHATSAPP_GROUP_ID = process.env.WHATSAPP_TO_NUMBERS;
const WHATSAPP_GROUPS = process.env.WHATSAPP_GROUPS; // Comma-separated list of group IDs

// Logging utility
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

// Initialize MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => {
    log('info', 'MongoDB connected successfully');
  }).catch((error) => {
    log('error', 'MongoDB connection error', { error: error.message });
  });

  mongoose.connection.on('error', (error) => {
    log('error', 'MongoDB connection error', { error: error.message });
  });

  mongoose.connection.on('disconnected', () => {
    log('warn', 'MongoDB disconnected');
  });
} else {
  log('warn', 'MONGODB_URI not set in environment variables');
}

// Initialize services
const whatsappService = new WhatsAppService();
const telegramService = new TelegramService();
const chartService = new ChartService();

// Handle simple text message format
async function handleTextMessage(req, res) {
  try {
    const { msg, symbol } = req.body;
    
    // Prepare simple message data
    const messageData = {
      msg: msg.trim(),
      symbol: symbol.trim(),
      timestamp: new Date().toISOString()
    };

    // Get chart image for the symbol
    let chartImage = null;
    if (messageData.symbol) {
      try {
        const formattedSymbol = chartService.formatSymbol(messageData.symbol);
        log('info', `Fetching chart for symbol: ${formattedSymbol}`);
        
        // Get chart image with basic options
        const chartOptions = {
          width: 800,
          height: 600
        };

        const { buffer: chartBuffer } = await chartService.getChartImage(formattedSymbol, chartOptions);
        if (chartBuffer) {
          chartImage = chartBuffer; // For WhatsApp and Telegram (original buffer)

          log('info', 'Chart image captured successfully', {
            sessionAuth: chartService.hasSessionAuth(),
            size: chartBuffer.buffer.length,
            contentType: chartBuffer.contentType,
            savedFile: chartBuffer.filename
          });
        }
      } catch (chartError) {
        log('warn', 'Failed to generate chart image, proceeding without chart', {
          error: chartError.message,
          symbol: messageData.symbol,
          sessionAuth: chartService.hasSessionAuth()
        });
      }
    }

    // Prepare message text
    const messageText = `${messageData.msg}\nSymbol: ${messageData.symbol}`;

    // Send results tracking
    const results = {
      whatsapp: null,
      telegram: null
    };

    // Send to WhatsApp (with chart if available)
    try {
      if (chartImage) {
        // Prepare signal data format for WhatsApp sendFormattedMessageToGroup
        const signalData = {
          title: messageData.msg,
          datetime: messageData.timestamp,
          action: '',
          symbol: messageData.symbol,
          price: ''
        };
        await whatsappService.sendFormattedMessageToGroup(WHATSAPP_GROUP_ID, signalData, chartImage);
      } else {
        await whatsappService.sendMessage(WHATSAPP_GROUP_ID, messageText);
      }
      results.whatsapp = { success: true };
      log('info', 'Text message sent to WhatsApp successfully', {
        chartIncluded: !!chartImage
      });
    } catch (whatsappError) {
      log('error', 'Failed to send text to WhatsApp', {
        error: whatsappError.message
      });
      results.whatsapp = { success: false, error: whatsappError.message };
    }

    // Send to Telegram (with chart if available)
    try {
      if (chartImage) {
        await telegramService.sendPhoto(chartImage, messageText, 'HTML');
      } else {
        await telegramService.sendMessage(messageText);
      }
      results.telegram = { success: true };
      log('info', 'Text message sent to Telegram successfully', {
        chartIncluded: !!chartImage
      });
    } catch (telegramError) {
      log('error', 'Failed to send text to Telegram', {
        error: telegramError.message
      });
      results.telegram = { success: false, error: telegramError.message };
    }

    // Check if at least one service succeeded
    const hasSuccess = results.whatsapp?.success || results.telegram?.success;
    
    if (!hasSuccess) {
      throw new Error('Failed to send text message to both WhatsApp and Telegram');
    }

    log('info', 'Text message processed successfully', {
      msg: messageData.msg,
      symbol: messageData.symbol,
      whatsapp: results.whatsapp.success,
      telegram: results.telegram.success,
    });

    res.status(200).json({
      success: true,
      message: 'Text message sent successfully',
      chartIncluded: !!chartImage,
      results: {
        whatsapp: results.whatsapp.success,
        telegram: results.telegram.success
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log('error', 'Error processing text webhook', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process text message'
    });
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'TradingView Webhook Server',
    services: {
      whatsapp: whatsappService.validateConfiguration(),
      telegram: telegramService.validateConfiguration(),
      chart: chartService.validateConfiguration()
    }
  });
});

// Get configured WhatsApp groups
app.get('/whatsapp/groups', (req, res) => {
  try {
    const groups = whatsappService.getConfiguredGroups();
    res.json({
      success: true,
      groups: groups,
      count: groups.length
    });
  } catch (error) {
    log('error', 'Failed to retrieve WhatsApp groups', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send message to specific WhatsApp group
app.post('/whatsapp/send', async (req, res) => {
  try {
    const { groupId, message } = req.body;
    
    if (!groupId || !message) {
      return res.status(400).json({
        error: 'Missing required fields: groupId, message'
      });
    }

    const result = await whatsappService.sendMessageToGroup(groupId, message);
    
    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    log('error', 'Failed to send message to WhatsApp group', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Twilio Conversations API endpoints

// Create a new conversation (group)
app.post('/whatsapp/conversations/create', async (req, res) => {
  try {
    const { friendlyName, phoneNumbers } = req.body;
    
    if (!friendlyName || !phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: friendlyName (string), phoneNumbers (array)'
      });
    }

    const result = await whatsappService.createConversationWithParticipants(friendlyName, phoneNumbers);
    
    res.json({
      success: result.success,
      conversation: {
        conversationSid: result.conversationSid,
        friendlyName: result.friendlyName,
        participants: result.participants,
        errors: result.errors,
        totalRequested: result.totalRequested,
        totalAdded: result.totalAdded,
        totalFailed: result.totalFailed
      }
    });
  } catch (error) {
    log('error', 'Failed to create conversation', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// List all conversations
app.get('/whatsapp/conversations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await whatsappService.listConversations(limit);
    
    res.json({
      success: result.success,
      conversations: result.conversations,
      count: result.count
    });
  } catch (error) {
    log('error', 'Failed to list conversations', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get conversation details
app.get('/whatsapp/conversations/:conversationSid', async (req, res) => {
  try {
    const { conversationSid } = req.params;
    const result = await whatsappService.getConversation(conversationSid);
    
    res.json(result);
  } catch (error) {
    log('error', 'Failed to get conversation', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// List participants in a conversation
app.get('/whatsapp/conversations/:conversationSid/participants', async (req, res) => {
  try {
    const { conversationSid } = req.params;
    const result = await whatsappService.listConversationParticipants(conversationSid);
    
    res.json(result);
  } catch (error) {
    log('error', 'Failed to list conversation participants', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add participant to conversation
app.post('/whatsapp/conversations/:conversationSid/participants', async (req, res) => {
  try {
    const { conversationSid } = req.params;
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({
        error: 'Missing required field: phoneNumber'
      });
    }

    const result = await whatsappService.addParticipantToConversation(conversationSid, phoneNumber);
    
    res.json({
      success: result.success,
      participant: result
    });
  } catch (error) {
    log('error', 'Failed to add participant to conversation', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send message to conversation
app.post('/whatsapp/conversations/:conversationSid/messages', async (req, res) => {
  try {
    const { conversationSid } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        error: 'Missing required field: message'
      });
    }

    const result = await whatsappService.sendMessageToConversation(conversationSid, message);
    
    res.json({
      success: result.success,
      message: result
    });
  } catch (error) {
    log('error', 'Failed to send message to conversation', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Main webhook endpoint for TradingView signals
app.post('/webhook', async (req, res) => {
  try {
    log('info', 'Received webhook payload', req.body);

    // Check if this is a simple text message format
    if (req.body.msg && req.body.symbol) {
      return await handleTextMessage(req, res);
    }

    // Validate required fields for trading signal format
    const { title, datetime, action, symbol, price } = req.body;
    
    if (!title || !action || !symbol || !price) {
      log('warn', 'Invalid webhook payload - missing required fields', req.body);
      return res.status(400).json({
        error: 'Missing required fields: title, action, symbol, price (or use msg + symbol for text format)'
      });
    }

    // Validate action
    if (!['BUY', 'SELL'].includes(action.toUpperCase())) {
      log('warn', 'Invalid action in webhook payload', { action });
      return res.status(400).json({
        error: 'Action must be either BUY or SELL'
      });
    }

    // Prepare signal data
    const signalData = {
      title,
      datetime: datetime || new Date().toISOString(),
      action: action.toUpperCase(),
      symbol,
      price
    };

    // Get chart image for the symbol
    let chartImage = null;
    try {
      const formattedSymbol = chartService.formatSymbol(symbol);
      log('info', `Fetching chart for symbol: ${formattedSymbol}`);
      
      // Get chart image with basic options
      const chartOptions = {
        width: 800,
        height: 600
      };

      const { buffer: chartBuffer } = await chartService.getChartImage(formattedSymbol, chartOptions);
      if (chartBuffer) {
        chartImage = chartBuffer; // For WhatsApp (original buffer)

        log('info', 'Chart image captured successfully', {
          sessionAuth: chartService.hasSessionAuth(),
          size: chartBuffer.buffer.length,
          contentType: chartBuffer.contentType,
          savedFile: chartBuffer.filename
        });
      }
    } catch (chartError) {
      log('warn', 'Failed to generate chart image, proceeding without chart', {
        error: chartError.message,
        symbol: symbol,
        sessionAuth: chartService.hasSessionAuth()
      });
    }

    // Send message to WhatsApp group with chart image
    const results = {
      whatsapp: null,
      telegram: null
    };

    // Send to WhatsApp
    try {
      // Check if specific group(s) are requested in the webhook payload
      const targetGroups = req.body.groupId || req.body.groupIds || WHATSAPP_GROUPS || WHATSAPP_GROUP_ID;
      
      if (Array.isArray(targetGroups) || (typeof targetGroups === 'string' && targetGroups.includes(','))) {
        // Multiple groups specified
        const groupIds = Array.isArray(targetGroups) 
          ? targetGroups 
          : targetGroups.split(',').map(g => g.trim());
        
        log('info', 'Sending to multiple WhatsApp groups', { groupCount: groupIds.length });
        const groupResults = await whatsappService.sendFormattedMessageToMultipleGroups(
          groupIds, 
          signalData, 
          chartImage
        );
        results.whatsapp = {
          success: groupResults.success,
          total: groupResults.total,
          succeeded: groupResults.succeeded,
          failed: groupResults.failed,
          groups: groupResults.groups
        };
        log('info', 'Signal sent to WhatsApp groups', {
          total: groupResults.total,
          succeeded: groupResults.succeeded,
          failed: groupResults.failed
        });
      } else if (targetGroups) {
        // Single group specified
        const groupId = typeof targetGroups === 'string' ? targetGroups.trim() : targetGroups;
        log('info', 'Sending to single WhatsApp group', { groupId });
        await whatsappService.sendFormattedMessageToGroup(groupId, signalData, chartImage);
        results.whatsapp = { success: true, groupId };
        log('info', 'Signal sent to WhatsApp group successfully');
      } else {
        throw new Error('No WhatsApp group ID configured or provided');
      }
    } catch (whatsappError) {
      log('error', 'Failed to send to WhatsApp', {
        error: whatsappError.message
      });
      results.whatsapp = { success: false, error: whatsappError.message };
    }

    // Send to Telegram
    try {
      await telegramService.sendFormattedMessage(signalData, chartImage);
      results.telegram = { success: true };
      log('info', 'Signal sent to Telegram successfully');
    } catch (telegramError) {
      log('error', 'Failed to send to Telegram', {
        error: telegramError.message
      });
      results.telegram = { success: false, error: telegramError.message };
    }

    // Check if at least one service succeeded
    const hasSuccess = results.whatsapp?.success || results.telegram?.success;
    
    if (!hasSuccess) {
      throw new Error('Failed to send signal to both WhatsApp and Telegram');
    }

    log('info', 'Trading signal processed successfully', {
      symbol,
      action: signalData.action,
      price,
      chartIncluded: !!chartImage,
      whatsapp: results.whatsapp.success,
      telegram: results.telegram.success
    });

    res.status(200).json({
      success: true,
      message: 'Signal sent successfully',
      chartIncluded: !!chartImage,
      results: {
        whatsapp: results.whatsapp.success,
        telegram: results.telegram.success
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    log('error', 'Error processing webhook', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process trading signal'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  log('error', 'Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  log('warn', '404 - Route not found', {
    url: req.url,
    method: req.method
  });

  res.status(404).json({
    error: 'Route not found'
  });
});

// Start server
app.listen(PORT, () => {
  log('info', `Server started on port ${PORT}`);
  
  if (PORT === 80 || PORT === '80') {
    log('info', 'Server running on HTTP standard port 80');
    log('info', 'Available endpoints:', {
      health: `http://your-server-ip/health`,
      webhook: `http://your-server-ip/webhook`
    });
    log('info', 'Note: Port 80 requires sudo privileges. Run with: sudo node main.js');
  } else {
    log('info', 'Available endpoints:', {
      health: `http://localhost:${PORT}/health`,
      webhook: `http://localhost:${PORT}/webhook`
    });
  }

  // Validate service configurations
  const whatsappValid = whatsappService.validateConfiguration();
  const telegramValid = telegramService.validateConfiguration();
  const chartValid = chartService.validateConfiguration();
  
  const servicesStatus = {
    whatsapp: whatsappValid,
    telegram: telegramValid,
    chart: chartValid
  };
  
  log('info', 'Service configuration status', servicesStatus);
  
  if (whatsappValid && telegramValid && chartValid) {
    log('info', 'All services configured and ready');
  } else if (whatsappValid && telegramValid) {
    log('info', 'WhatsApp and Telegram services ready, chart service disabled');
  } else if (whatsappValid || telegramValid) {
    log('warn', 'Some services not properly configured', servicesStatus);
  } else {
    log('error', 'No messaging services properly configured');
  }

  // Setup news checker cron job (every 30 minutes)
  if (telegramValid) {
    log('info', 'Setting up news checker cron job (every 30 minutes)');
    
    // Run immediately on startup - wait a bit for MongoDB to be fully ready
    setTimeout(async () => {
      log('info', 'Running initial news check on server startup...');
      try {
        const result = await newsChecker.checkAndSendNewNews();
        if (result.success) {
          log('info', 'Initial news check completed', {
            newNewsCount: result.newNewsCount,
            totalChecked: result.totalChecked
          });
        } else {
          log('error', 'Initial news check failed', { error: result.error });
        }
      } catch (error) {
        log('error', 'Error in initial news check', {
          error: error.message,
          stack: error.stack
        });
      }
    }, 2000); // Wait 2 seconds for MongoDB connection to stabilize
    
    // Schedule cron job to run every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
      log('info', 'Running scheduled news check...');
      try {
        const result = await newsChecker.checkAndSendNewNews();
        if (result.success) {
          log('info', 'Scheduled news check completed', {
            newNewsCount: result.newNewsCount,
            totalChecked: result.totalChecked
          });
        } else {
          log('error', 'Scheduled news check failed', { error: result.error });
        }
      } catch (error) {
        log('error', 'Error in scheduled news check', {
          error: error.message,
          stack: error.stack
        });
      }
    });
    
    log('info', 'News checker cron job scheduled successfully (runs every 30 minutes)');
  } else {
    log('warn', 'News checker cron job not started - Telegram service not configured');
  }
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  log('info', `${signal} received, shutting down gracefully`);
  
  // Close browser instance to free resources
  try {
    await chartService.closeBrowser();
  } catch (error) {
    log('error', 'Error during browser cleanup', { error: error.message });
  }
  
  // Close MongoDB connection
  if (mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.close();
      log('info', 'MongoDB connection closed');
    } catch (error) {
      log('error', 'Error closing MongoDB connection', { error: error.message });
    }
  }
  
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));