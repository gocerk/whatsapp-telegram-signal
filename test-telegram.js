require('dotenv').config();
const TelegramService = require('./services/telegram');
const ChartService = require('./services/chart');

// Simple test script to send messages via Telegram bot
async function sendTestMessage() {
  console.log('📱 Telegram Message Sender Test');
  console.log('================================\n');

  // Get command line arguments
  const message = process.argv[2];

  // Initialize Telegram service
  const telegramService = new TelegramService();

  // Validate configuration
  console.log('🔧 Validating Telegram configuration...');
  if (!telegramService.validateConfiguration()) {
    console.log('❌ Configuration validation failed!');
    console.log('\nRequired environment variables in .env file:');
    console.log('- TELEGRAM_BOT_TOKEN=your_bot_token');
    console.log('- TELEGRAM_CHAT_ID=your_chat_id');
    console.log('\nMake sure to copy .env.example to .env and fill in your credentials.');
    process.exit(1);
  }
  console.log('✅ Configuration valid\n');

  const testMessage = message || `🤖 Test message from Telegram Bot\n\nTime: ${new Date().toLocaleString()}\nThis is an automated test message.`;
  
  console.log('📤 Sending message...');
  console.log(`Message: "${testMessage}"`);
  console.log('⏳ Please wait...\n');

  try {
    // Send the message
    const result = await telegramService.sendMessage(testMessage);

    console.log('✅ Message sent successfully!');
    console.log('\n📊 Response Details:');
    console.log(`Message ID: ${result.messageId}`);
    console.log(`Chat ID: ${process.env.TELEGRAM_CHAT_ID}`);
    
    console.log('\n💡 Tips:');
    console.log('- Check your Telegram chat for the message');
    console.log('- Make sure your bot is added to the chat/channel');
    console.log('- Verify TELEGRAM_CHAT_ID is correct');

  } catch (error) {
    console.log('❌ Failed to send message!');
    console.log('\n🔍 Error Details:');
    console.log(`Error: ${error.message}`);
    
    if (error.response?.data) {
      console.log(`Telegram API Error: ${JSON.stringify(error.response.data, null, 2)}`);
    }

    console.log('\n🛠️ Troubleshooting:');
    console.log('1. Verify TELEGRAM_BOT_TOKEN is correct');
    console.log('2. Ensure TELEGRAM_CHAT_ID is correct (use @userinfobot to get your chat ID)');
    console.log('3. Make sure the bot is added to the chat/channel');
    console.log('4. Check that the bot has permission to send messages');
    
    process.exit(1);
  }
}

// Test with formatted trading signal message
async function sendFormattedTest() {
  console.log('📊 Formatted Trading Signal Test');
  console.log('=================================\n');

  const telegramService = new TelegramService();
  const chartService = new ChartService();

  // Validate configurations
  console.log('🔧 Validating configurations...');
  if (!telegramService.validateConfiguration()) {
    console.log('❌ Telegram configuration invalid');
    process.exit(1);
  }
  console.log('✅ Telegram configuration valid');

  if (!chartService.validateConfiguration()) {
    console.log('⚠️  Chart service not configured (will send text only)');
  } else {
    console.log('✅ Chart service configured');
  }
  console.log('');

  // Create test signal data
  const testSignal = {
    title: 'Yeni Islem Onerisi',
    datetime: new Date().toLocaleString('tr-TR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    }),
    action: 'BUY',
    symbol: 'BTCUSDT',
    price: '45000.00'
  };

  console.log('📤 Sending formatted trading signal...');
  console.log(`Symbol: ${testSignal.symbol}`);
  console.log(`Action: ${testSignal.action}`);
  console.log(`Price: $${testSignal.price}`);
  console.log('⏳ Please wait...\n');

  try {
    // Get chart image if chart service is configured
    let chartImage = null;
    if (chartService.validateConfiguration()) {
      try {
        console.log('📈 Fetching chart image...');
        const formattedSymbol = chartService.formatSymbol(testSignal.symbol);
        const chartOptions = {
          width: 800,
          height: 600
        };
        chartImage = await chartService.getChartImage(formattedSymbol, chartOptions);
        if (chartImage) {
          console.log('✅ Chart image captured');
        }
      } catch (chartError) {
        console.log('⚠️  Failed to get chart image, sending text only');
        console.log(`   Error: ${chartError.message}`);
      }
    }

    // Send formatted message with chart
    const result = await telegramService.sendFormattedMessage(testSignal, chartImage);

    console.log('✅ Formatted message sent successfully!');
    console.log('\n📊 Response Details:');
    console.log(`Message ID: ${result.messageId || result.data?.result?.message_id}`);
    console.log(`Chart included: ${!!chartImage}`);
    
    console.log('\n💡 Tips:');
    console.log('- Check your Telegram chat for the formatted message');
    console.log('- If chart was included, it should appear as a photo with caption');

  } catch (error) {
    console.log('❌ Failed to send formatted message!');
    console.log('\n🔍 Error Details:');
    console.log(`Error: ${error.message}`);
    
    if (error.response?.data) {
      console.log(`Telegram API Error: ${JSON.stringify(error.response.data, null, 2)}`);
    }

    console.log('\n🛠️ Troubleshooting:');
    console.log('1. Verify TELEGRAM_BOT_TOKEN is correct');
    console.log('2. Ensure TELEGRAM_CHAT_ID is correct');
    console.log('3. Make sure the bot is added to the chat/channel');
    console.log('4. Check that the bot has permission to send messages and photos');
    
    process.exit(1);
  }
}

// Test with simple message (quick test)
async function sendQuickTest() {
  console.log('🚀 Quick Test Mode');
  console.log('==================\n');
  
  const telegramService = new TelegramService();
  
  if (!telegramService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    process.exit(1);
  }

  const testMessage = `🤖 Quick test message from Telegram Bot\n\nTime: ${new Date().toLocaleString()}\nThis is an automated test message.`;

  console.log(`Sending test message...`);
  
  try {
    const result = await telegramService.sendMessage(testMessage);
    console.log('✅ Quick test message sent successfully!');
    console.log(`Message ID: ${result.messageId}`);
  } catch (error) {
    console.log('❌ Quick test failed:', error.message);
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'formatted' || command === 'signal') {
    // Send formatted trading signal
    sendFormattedTest().catch(console.error);
  } else if (command === 'quick' || args.length === 0) {
    // Quick test with default message
    sendQuickTest().catch(console.error);
  } else {
    // Custom message provided
    sendTestMessage().catch(console.error);
  }
}

module.exports = { sendTestMessage, sendFormattedTest, sendQuickTest };

