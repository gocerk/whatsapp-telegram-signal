const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Logging utility
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] CHART ${level.toUpperCase()}: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

// Chart image service using Puppeteer to capture TradingView charts
class ChartService {
  constructor() {
    this.tradingViewSessionId = process.env.TRADINGVIEW_SESSION_ID;
    this.tradingViewSessionIdSign = process.env.TRADINGVIEW_SESSION_ID_SIGN;
    this.browser = null;
    this.browserLaunchPromise = null;
    this.isShuttingDown = false;
  }

  // Get or create browser instance (reused across requests)
  async getBrowser() {
    // If browser is already launched and connected, return it
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    // If browser is launching, wait for it
    if (this.browserLaunchPromise) {
      return this.browserLaunchPromise;
    }

    // Launch new browser
    this.browserLaunchPromise = this.launchBrowser();
    
    try {
      this.browser = await this.browserLaunchPromise;
      this.browserLaunchPromise = null;
      return this.browser;
    } catch (error) {
      this.browserLaunchPromise = null;
      throw error;
    }
  }

  // Launch browser with optimized settings
  async launchBrowser() {
    log('info', 'Launching new browser instance (reused for all chart requests)');
    
    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: {
        width: 1340, 
        height: 900 
      },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Overcome limited resource problems
        '--disable-accelerated-2d-canvas',
        '--disable-gpu', // Disable GPU hardware acceleration
        '--no-first-run',
        '--no-zygote',
        '--single-process' // Run in single process mode (reduces memory usage)
      ]
    });

    // Handle browser disconnection
    browser.on('disconnected', () => {
      log('warn', 'Browser disconnected, will relaunch on next request');
      this.browser = null;
      this.browserLaunchPromise = null;
    });

    return browser;
  }

  async getChartImage(symbol, options = {}) {
    let page = null;
    
    try {
      if (!this.tradingViewSessionId || !this.tradingViewSessionIdSign) {
        log('warn', 'TradingView session credentials not configured, skipping chart image');
        return null;
      }

      if (this.isShuttingDown) {
        log('warn', 'Service is shutting down, skipping chart request');
        return null;
      }

      log('info', `Fetching chart image for ${symbol} using Puppeteer`);

      // Format symbol for TradingView URL
      const formattedSymbol = this.formatSymbol(symbol);
      
      // Build TradingView chart URL
      const chartUrl = `https://tr.tradingview.com/chart/4atOlnQu?symbol=${encodeURIComponent(formattedSymbol)}`;
      
      // Get or create browser instance (reused across requests)
      const browser = await this.getBrowser();
      
      // Create a new page for this request
      page = await browser.newPage();

      // Set cookies for TradingView authentication
      const cookies = [
        {
          name: 'sessionid',
          value: this.tradingViewSessionId,
          domain: '.tradingview.com',
          path: '/',
          httpOnly: true,
          secure: true
        },
        {
          name: 'sessionid_sign',
          value: this.tradingViewSessionIdSign,
          domain: '.tradingview.com',
          path: '/',
          httpOnly: true,
          secure: true
        }
      ];

      await page.setCookie(...cookies);

      // Navigate to chart
      await page.goto(chartUrl, { waitUntil: 'networkidle2' });

      // Wait for chart to load
      try {
        await page.waitForSelector('.chart-gui-wrapper', { timeout: 20000 });
        // Extra wait for indicators and data to fully render
        await new Promise(r => setTimeout(r, 3000));

        // --- YENİ EKLENEN KISIM: GRAFİĞİ SÜRÜKLEME ---
        log('info', 'Adjusting chart position (dragging to left)...');
        
        // Ekranın ortasını hesapla
        const viewport = page.viewport();
        const startX = viewport.width / 2;
        const startY = viewport.height / 2;

        // Fareyi ortaya getir ve tıkla
        await page.mouse.move(startX, startY);
        await page.mouse.down();

        // Fareyi sola doğru sürükle (Örn: 400 piksel sola)
        // steps: 10 hareketi daha doğal yapar ve TradingView'in algılamasını sağlar
        await page.mouse.move(startX - 2000, startY, { steps: 10 }); 
        
        // Fareyi bırak
        await page.mouse.up();
        
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        log('warn', 'Timeout waiting for chart to load, proceeding anyway');
      }

      // Take screenshot of chart area
      const element = await page.$('.layout__area--center');
      let screenshotBuffer;
      
      if (element) {
        screenshotBuffer = await element.screenshot({
          type: 'png'
        });
      } else {
        log('warn', 'Chart area not found, taking full page screenshot');
        screenshotBuffer = await page.screenshot({
          type: 'png',
          fullPage: false
        });
      }

      // Close the page (but keep browser alive for reuse)
      await page.close();

      log('info', `Chart image captured successfully for ${symbol}`, {
        size: screenshotBuffer.length,
        contentType: 'image/png',
      });
      
      return {
        buffer: screenshotBuffer,
        contentType: 'image/png',
      };

    } catch (error) {
      log('error', 'Failed to fetch chart image', {
        symbol,
        error: error.message
      });
      
      // If browser connection is lost, reset it so it can be relaunched
      if (this.browser && !this.browser.isConnected()) {
        log('warn', 'Browser connection lost, will relaunch on next request');
        this.browser = null;
        this.browserLaunchPromise = null;
      }
      
      return null;
    } finally {
      // Always close the page if it was created
      if (page && !page.isClosed()) {
        try {
          await page.close();
        } catch (closeError) {
          log('warn', 'Error closing page', { error: closeError.message });
        }
      }
    }
  }

  // Cleanup method to close browser (call on app shutdown)
  async closeBrowser() {
    this.isShuttingDown = true;
    
    if (this.browser) {
      try {
        log('info', 'Closing browser instance');
        await this.browser.close();
        this.browser = null;
        this.browserLaunchPromise = null;
      } catch (error) {
        log('error', 'Error closing browser', { error: error.message });
      }
    }
  }

  // Get chart image buffer (primary method)
  async getChartBuffer(symbol, options = {}) {
    return this.getChartImage(symbol, options);
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
    if (!this.tradingViewSessionId || !this.tradingViewSessionIdSign) {
      log('warn', 'TradingView session credentials not configured - chart images will be disabled');
      return false;
    }
    
    log('info', 'Chart service configuration validated successfully with TradingView session authentication');
    return true;
  }

  // Check if TradingView session is configured
  hasSessionAuth() {
    return !!(this.tradingViewSessionId && this.tradingViewSessionIdSign);
  }
}

module.exports = ChartService;