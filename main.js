require('dotenv').config();
const express = require('express');
const WhatsAppService = require('./services/whatsapp');
const ChartService = require('./services/chart');

const app = express();
const PORT = process.env.PORT || 80;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
const chartService = new ChartService();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'TradingView WhatsApp Webhook'
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
      
      // Create advanced chart configuration using the new method
      const chartOptions = chartService.createSignalChart(formattedSymbol, {
        action,
        price,
        timestamp: datetime
      }, {
        interval: '1h',
        width: 800,
        height: 600,
        theme: 'dark',
        style: 'candle'
      });

      log('info', 'Using enhanced chart configuration with signal indicators');

      // Get chart image buffer directly
      const chartBuffer = await chartService.getChartImage(formattedSymbol, chartOptions);
      if (chartBuffer) {
        chartImage = chartBuffer;
        log('info', 'Chart image buffer generated successfully', {
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
    await whatsappService.sendFormattedMessage(WHATSAPP_GROUP_ID, signalData, chartImage);

    log('info', 'Trading signal processed successfully', {
      symbol,
      action: signalData.action,
      price,
      chartIncluded: !!chartImage
    });

    res.status(200).json({
      success: true,
      message: 'Signal sent to WhatsApp group',
      chartIncluded: !!chartImage,
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
  const chartValid = chartService.validateConfiguration();
  
  if (whatsappValid && chartValid) {
    log('info', 'All services configured and ready');
  } else if (whatsappValid) {
    log('info', 'WhatsApp service ready, chart service disabled');
  } else {
    log('warn', 'WhatsApp service not properly configured');
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