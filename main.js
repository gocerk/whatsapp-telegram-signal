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

// Chart images directory
const CHARTS_DIR = path.join(__dirname, 'uploads', 'charts');
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

// Logging utility
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

// Ensure charts directory exists
if (!fs.existsSync(CHARTS_DIR)) {
  fs.mkdirSync(CHARTS_DIR, { recursive: true });
  log('info', 'Created charts directory', { path: CHARTS_DIR });
}

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


// Initialize MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI).then(() => {
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

        const chartResult = await chartService.getChartImage(formattedSymbol, chartOptions);
        if (chartResult && chartResult.buffer) {
          chartImage = chartResult; // For WhatsApp and Telegram (original buffer)

          log('info', 'Chart image captured successfully', {
            sessionAuth: chartService.hasSessionAuth(),
            size: chartResult.buffer.length,
            contentType: chartResult.contentType,
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

    // Send to WhatsApp (with chart image if available)
    try {
      // Prepare signal data format for WhatsApp sendFormattedMessageToPerson
      const signalData = {
        title: messageData.msg,
        datetime: messageData.timestamp,
        action: '',
        symbol: messageData.symbol,
        price: '',
        // Include all other properties from the request body
        ...Object.keys(req.body).reduce((acc, key) => {
          const lowerKey = key.toLowerCase();
          // Exclude already processed keys
          if (!['msg', 'symbol', 'phonenumber', 'phonenumbers', 'groupid', 'groupids'].includes(lowerKey)) {
            acc[key] = req.body[key];
          }
          return acc;
        }, {})
      };
      
      // Save chart image and get URL if available
      let chartImageUrl = null;
      if (chartImage) {
        chartImageUrl = await saveChartImage(chartImage, messageData.symbol);
        if (chartImageUrl) {
          log('info', 'Chart image URL generated', { url: chartImageUrl });
        }
      }
      
      // Send to configured phone number(s)
      const targetNumbers = WHATSAPP_GROUPS || WHATSAPP_GROUP_ID;
      
      if (targetNumbers) {
        const phoneNumbers = targetNumbers.split(',').map(num => num.trim());
        let successCount = 0;
        
        for (const phoneNumber of phoneNumbers) {
          try {
            await whatsappService.sendFormattedMessageToPerson(phoneNumber, signalData, chartImageUrl);
            successCount++;
            log('info', 'Message sent to WhatsApp successfully', {
              phoneNumber: phoneNumber,
              hasImage: !!chartImageUrl
            });
          } catch (err) {
            log('error', `Failed to send to ${phoneNumber}`, { error: err.message });
          }
        }
        
        if (successCount === 0) {
          throw new Error('Failed to send to all phone numbers');
        }
        
        results.whatsapp = { success: true, sentTo: successCount, total: phoneNumbers.length };
      } else {
        throw new Error('No WhatsApp phone number configured');
      }
    } catch (whatsappError) {
      log('error', 'Failed to send to WhatsApp', {
        error: whatsappError.message
      });
      results.whatsapp = { success: false, error: whatsappError.message };
    }

    // Send to Telegram (with chart if available)
    try {
      await telegramService.sendFormattedMessage(signalData, chartImage);
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

// Serve chart images
app.get('/charts/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(CHARTS_DIR, filename);
  
  // Security: prevent directory traversal
  if (!path.normalize(filePath).startsWith(path.normalize(CHARTS_DIR))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Chart not found' });
  }
});

// Helper function to save chart image and return URL
async function saveChartImage(chartBuffer, symbol) {
  try {
    if (!chartBuffer || !chartBuffer.buffer) {
      return null;
    }

    // Generate unique filename
    const timestamp = Date.now();
    const safeSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '_');
    const extension = chartBuffer.contentType === 'image/png' ? 'png' : 'jpg';
    const filename = `${safeSymbol}_${timestamp}.${extension}`;
    const filePath = path.join(CHARTS_DIR, filename);

    // Write buffer to file
    fs.writeFileSync(filePath, chartBuffer.buffer);
    log('info', 'Chart image saved', { filename, path: filePath });

    // Generate public URL
    const imageUrl = `http://104.247.166.151/charts/${filename}`;
    
    return imageUrl;
  } catch (error) {
    log('error', 'Failed to save chart image', { error: error.message });
    return null;
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

    // Prepare signal data - include all properties from request body
    const signalData = {
      title,
      datetime: datetime || new Date().toISOString(),
      action: action.toUpperCase(),
      symbol,
      price,
      // Include all other properties from the request body
      ...Object.keys(req.body).reduce((acc, key) => {
        const lowerKey = key.toLowerCase();
        // Exclude already processed keys and common webhook fields
        if (!['title', 'datetime', 'action', 'symbol', 'price', 'phonenumber', 'phonenumbers', 'groupid', 'groupids'].includes(lowerKey)) {
          acc[key] = req.body[key];
        }
        return acc;
      }, {})
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

      const chartResult = await chartService.getChartImage(formattedSymbol, chartOptions);
      if (chartResult && chartResult.buffer) {
        chartImage = chartResult; // For WhatsApp (original buffer)

        log('info', 'Chart image captured successfully', {
          sessionAuth: chartService.hasSessionAuth(),
          size: chartResult.buffer.length,
          contentType: chartResult.contentType,
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
      // Save chart image and get URL if available
      let chartImageUrl = null;
      if (chartImage) {
        chartImageUrl = await saveChartImage(chartImage, symbol);
        if (chartImageUrl) {
          log('info', 'Chart image URL generated', { url: chartImageUrl });
        }
      }

      // Check if specific phone number(s) are requested in the webhook payload
      const targetNumbers = WHATSAPP_GROUPS || WHATSAPP_GROUP_ID;
      
      if (Array.isArray(targetNumbers) || (typeof targetNumbers === 'string' && targetNumbers.includes(','))) {
        // Multiple phone numbers specified
        const phoneNumbers = Array.isArray(targetNumbers) 
          ? targetNumbers 
          : targetNumbers.split(',').map(num => num.trim());
        
        log('info', 'Sending to multiple WhatsApp numbers', { count: phoneNumbers.length });
        
        const sendResults = {
          total: phoneNumbers.length,
          succeeded: 0,
          failed: 0,
          numbers: []
        };

        for (const phoneNumber of phoneNumbers) {
          try {
            await whatsappService.sendFormattedMessageToPerson(phoneNumber, signalData, chartImageUrl);
            sendResults.succeeded++;
            sendResults.numbers.push({
              phoneNumber: phoneNumber,
              success: true
            });
          } catch (err) {
            sendResults.failed++;
            sendResults.numbers.push({
              phoneNumber: phoneNumber,
              success: false,
              error: err.message
            });
            log('error', `Failed to send to ${phoneNumber}`, { error: err.message });
          }
        }

        results.whatsapp = {
          success: sendResults.succeeded > 0,
          total: sendResults.total,
          succeeded: sendResults.succeeded,
          failed: sendResults.failed,
          numbers: sendResults.numbers
        };
        log('info', 'Signal sent to WhatsApp numbers', {
          total: sendResults.total,
          succeeded: sendResults.succeeded,
          failed: sendResults.failed
        });
      } else if (targetNumbers) {
        // Single phone number specified
        const phoneNumber = typeof targetNumbers === 'string' ? targetNumbers.trim() : targetNumbers;
        log('info', 'Sending to single WhatsApp number', { phoneNumber });
        await whatsappService.sendFormattedMessageToPerson(phoneNumber, signalData, chartImageUrl);
        results.whatsapp = { success: true, phoneNumber };
        log('info', 'Signal sent to WhatsApp number successfully');
      } else {
        throw new Error('No WhatsApp phone number configured or provided');
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
  
  // Pre-launch browser for chart service if configured
  if (chartValid) {
    log('info', 'Pre-launching browser for chart service...');
    chartService.getBrowser().then(() => {
      log('info', 'Browser pre-launched successfully and ready for chart requests');
    }).catch((error) => {
      log('error', 'Failed to pre-launch browser', { error: error.message });
    });
  }
  
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