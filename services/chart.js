const axios = require('axios');

// Logging utility
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] CHART ${level.toUpperCase()}: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

// Chart image service using chart-img.com API v2 with advanced features
class ChartService {
  constructor() {
    this.baseURL = 'https://api.chart-img.com/v2/tradingview/advanced-chart';
    this.apiKey = process.env.CHART_IMG_API_KEY;
    this.tradingViewSessionId = process.env.TRADINGVIEW_SESSION_ID;
    this.tradingViewSessionIdSign = process.env.TRADINGVIEW_SESSION_ID_SIGN;
  }

  async getChartImage(symbol, options = {}) {
    try {
      if (!this.apiKey) {
        log('warn', 'Chart API key not configured, skipping chart image');
        return null;
      }

      // Build chart configuration with advanced options
      const chartConfig = this.buildChartConfig(symbol, options);

      log('info', `Fetching chart image for ${symbol}`, chartConfig);

      // Build headers with optional TradingView session authentication
      const headers = this.buildHeaders();

      const response = await axios.post(this.baseURL, chartConfig, {
        headers,
      });

      console.log(response.data);

      if (response.status === 200) {
        log('info', `Chart image fetched successfully for ${symbol}`, {
          size: response.data.length,
          contentType: response.headers['content-type']
        });
        
        return {
          buffer: response.data,
          contentType: response.headers['content-type'] || 'image/png'
        };
      }

      log('warn', `Unexpected response status: ${response.status}`);
      return null;

    } catch (error) {
      console.log(error);
      log('error', 'Failed to fetch chart image', {
        symbol,
        error: error.response?.data ?
          Buffer.from(error.response.data).toString() :
          error.message,
        status: error.response?.status
      });
      return null;
    }
  }

  // Get chart image buffer (primary method)
  async getChartBuffer(symbol, options = {}) {
    return this.getChartImage(symbol, options);
  }

  // Build comprehensive chart configuration
  buildChartConfig(symbol, options = {}) {
    const config = {
      symbol: symbol,
      interval: options.interval || '1h',
      width: options.width || 800,
      height: options.height || 600,
      theme: options.theme || 'dark',
      style: options.style || 'candle',
      scale: options.scale || 'regular',
      session: options.session || 'regular',
      timezone: options.timezone || 'Etc/UTC',
    };

    // Add range if specified
    if (options.range) {
      config.range = options.range;
    }
    
    // Add drawings if specified
    if (options.drawings) {
      config.drawings = options.drawings;
    }

    // Add chart positioning
    if (options.shiftLeft) {
      config.shiftLeft = options.shiftLeft;
    }
    if (options.shiftRight) {
      config.shiftRight = options.shiftRight;
    }

    // Add override settings
    if (options.override) {
      config.override = options.override;
    }

    // Add watermark if specified
    if (options.watermark) {
      config.watermark = options.watermark;
      config.watermarkSize = options.watermarkSize || 16;
      config.watermarkOpacity = options.watermarkOpacity || 1.0;
    }

    return config;
  }

  // Build request headers with optional TradingView session authentication
  buildHeaders() {
    const headers = {
      'x-api-key': this.apiKey,
    };

    // Add TradingView session authentication if available
    if (this.tradingViewSessionId && this.tradingViewSessionIdSign) {
      headers['tradingview-session-id'] = this.tradingViewSessionId;
      headers['tradingview-session-id-sign'] = this.tradingViewSessionIdSign;
      log('info', 'Using TradingView session authentication for premium data access');
    }

    console.log('Headers:', headers);

    return headers;
  }

  // Create advanced chart configuration for trading signals
  createSignalChart(symbol, signalData, options = {}) {
    const { action, price, timestamp } = signalData;
    const isLong = action.toUpperCase() === 'BUY';
    
    const signalColor = isLong ? 'rgb(34,171,148)' : 'rgb(247,82,95)';
    const signalColorRgba = isLong ? 'rgba(34,171,148,0.2)' : 'rgba(247,82,95,0.2)';

    const chartOptions = {
      interval: options.interval || '1h',
      width: options.width || 800,
      height: options.height || 600,
      theme: options.theme || 'dark',
      style: options.style || 'candle',
      studies: [
        {
          name: 'Volume',
          forceOverlay: false,
          override: {
            'Volume.color.0': 'rgba(247,82,95,0.5)',
            'Volume.color.1': 'rgba(34,171,148,0.5)'
          }
        },
        {
          name: 'Moving Average',
          input: {
            length: 20,
            source: 'close'
          },
          override: {
            'Plot.color': signalColor
          }
        },
        {
          name: 'Relative Strength Index',
          forceOverlay: false,
          input: {
            length: 14
          },
          override: {
            'Plot.color': signalColor,
            'UpperLimit.color': 'rgb(120,123,134)',
            'LowerLimit.color': 'rgb(120,123,134)',
            'Hlines Background.color': signalColorRgba
          }
        }
      ],
      drawings: [
        {
          name: 'Horizontal Line',
          input: {
            price: parseFloat(price),
            text: `${action.toUpperCase()} Signal - $${price}`
          },
          override: {
            lineColor: signalColor,
            textColor: signalColor,
            fontSize: 14,
            lineWidth: 2,
            showPrice: true
          }
        }
      ]
    };

    // Add timestamp-based vertical line if timestamp is provided
    if (timestamp) {
      chartOptions.drawings.push({
        name: 'Vertical Line',
        input: {
          datetime: timestamp,
          text: `Signal Time`
        },
        override: {
          lineColor: signalColor,
          textColor: signalColor,
          fontSize: 12,
          lineWidth: 1,
          showTime: true
        }
      });
    }

    // Merge with any additional options
    return { ...chartOptions, ...options };
  }

  // Format symbol for TradingView (ensure proper exchange:symbol format)
  formatSymbol(symbol) {
    // If symbol already contains exchange, return as is
    if (symbol.includes(':')) {
      return symbol.toUpperCase();
    }

    // Common crypto symbols - default to Binance
    const cryptoSymbols = ['BTC', 'ETH', 'ADA', 'DOT', 'LINK', 'UNI', 'AAVE', 'SOL', 'AVAX', 'MATIC', 'ATOM', 'XRP'];
    const baseSymbol = symbol.replace(/USDT$|USD$|BUSD$|EUR$/, '');
    
    if (cryptoSymbols.some(crypto => symbol.toUpperCase().startsWith(crypto))) {
      return `BINANCE:${symbol.toUpperCase()}`;
    }

    // Stock symbols - default to NASDAQ
    if (symbol.length <= 5 && /^[A-Z]+$/.test(symbol.toUpperCase())) {
      return `NASDAQ:${symbol.toUpperCase()}`;
    }

    // Forex pairs
    if (symbol.length === 6 && /^[A-Z]{6}$/.test(symbol.toUpperCase())) {
      return `FX:${symbol.toUpperCase()}`;
    }

    // Default to BINANCE for crypto-like symbols
    return `BINANCE:${symbol.toUpperCase()}`;
  }

  // Validate configuration including session credentials
  validateConfiguration() {
    if (!this.apiKey) {
      log('warn', 'Chart API key not configured - chart images will be disabled');
      return false;
    }
    
    let configStatus = 'Chart service configuration validated successfully';
    
    if (this.tradingViewSessionId && this.tradingViewSessionIdSign) {
      configStatus += ' with TradingView session authentication';
      log('info', 'TradingView session credentials detected - premium data access enabled');
    } else {
      log('info', 'TradingView session credentials not configured - using public data only');
    }
    
    log('info', configStatus);
    return true;
  }

  // Check if TradingView session is configured
  hasSessionAuth() {
    return !!(this.tradingViewSessionId && this.tradingViewSessionIdSign);
  }
}

module.exports = ChartService;