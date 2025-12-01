require('dotenv').config();
const ChartService = require('./services/chart');

// Example usage of the enhanced Chart Service with advanced API v2 features
const chartService = new ChartService();

async function demonstrateAdvancedFeatures() {
  console.log('=== Advanced Chart API v2 Demo ===\n');

  // 1. Basic chart with enhanced configuration
  console.log('1. Creating basic enhanced chart...');
  try {
    const basicChart = await chartService.getChartImage('BINANCE:BTCUSDT', {
      interval: '4h',
      width: 1000,
      height: 700,
      theme: 'dark',
      style: 'candle',
    });
    
    if (basicChart) {
      console.log('✅ Basic chart URL:', basicChart);
    } else {
      console.log('❌ Failed to generate basic chart');
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }

  // 2. Session authentication status
  console.log('\n5. Session authentication status...');
  console.log('Session Auth Configured:', chartService.hasSessionAuth());
  if (chartService.hasSessionAuth()) {
    console.log('✅ TradingView session authentication is configured - premium data access enabled');
  } else {
    console.log('ℹ️  TradingView session authentication not configured - using public data only');
    console.log('   To enable premium data access:');
    console.log('   1. Login to TradingView in your browser');
    console.log('   2. Open browser developer tools');
    console.log('   3. Go to Application/Storage > Cookies > tradingview.com');
    console.log('   4. Copy the values of "sessionid" and "sessionid_sign"');
    console.log('   5. Add them to your .env file as TRADINGVIEW_SESSION_ID and TRADINGVIEW_SESSION_ID_SIGN');
  }

  console.log('\n=== Demo Complete ===');
}

// Run the demo
if (require.main === module) {
  demonstrateAdvancedFeatures().catch(console.error);
}

module.exports = { demonstrateAdvancedFeatures };