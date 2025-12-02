require('dotenv').config();
const express = require('express');
const WhatsAppService = require('./services/whatsapp');
const TelegramService = require('./services/telegram');
const ChartService = require('./services/chart');

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

// Logging utility
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

// Initialize services
const whatsappService = new WhatsAppService();
const telegramService = new TelegramService();
const chartService = new ChartService();

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

    // Validate required fields
    const { title, datetime, action, symbol, price } = req.body;
    
    if (!title || !action || !symbol || !price) {
      log('warn', 'Invalid webhook payload - missing required fields', req.body);
      return res.status(400).json({
        error: 'Missing required fields: title, action, symbol, price'
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

      const chartBuffer = await chartService.getChartImage(formattedSymbol, chartOptions);
      if (chartBuffer) {
        chartImage = chartBuffer;
        log('info', 'Chart image captured successfully', {
          sessionAuth: chartService.hasSessionAuth(),
          size: chartBuffer.buffer.length,
          contentType: chartBuffer.contentType
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
      await whatsappService.sendFormattedMessage(WHATSAPP_GROUP_ID, signalData, chartImage);
      results.whatsapp = { success: true };
      log('info', 'Signal sent to WhatsApp successfully');
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
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('info', 'SIGINT received, shutting down gracefully');
  process.exit(0);
});