require('dotenv').config();
const WhatsAppService = require('./services/whatsapp');

// Simple test script to send messages to individual WhatsApp numbers
async function sendTestMessage() {
  console.log('📱 WhatsApp Message Sender Test');
  console.log('================================\n');

  // Get command line arguments
  const toNumber = process.argv[2];
  const message = process.argv[3];

  // Validate arguments
  if (!toNumber || !message) {
    console.log('❌ Usage: node test-send-message.js <phone_number> <message>');
    console.log('\nExamples:');
    console.log('  node test-send-message.js "+1234567890" "Hello World!"');
    console.log('  node test-send-message.js "whatsapp:+1234567890" "Test message"');
    console.log('  npm run test:send "+1234567890" "Hello from Twilio!"');
    console.log('\nNote: Phone number should include country code (e.g., +1234567890)');
    process.exit(1);
  }

  // Initialize WhatsApp service
  const whatsappService = new WhatsAppService();

  // Validate configuration
  console.log('🔧 Validating Twilio configuration...');
  if (!whatsappService.validateConfiguration()) {
    console.log('❌ Configuration validation failed!');
    console.log('\nRequired environment variables in .env file:');
    console.log('- TWILIO_ACCOUNT_SID=your_account_sid');
    console.log('- TWILIO_AUTH_TOKEN=your_auth_token');
    console.log('- TWILIO_WHATSAPP_FROM=whatsapp:+14155238886');
    console.log('\nMake sure to copy .env.example to .env and fill in your credentials.');
    process.exit(1);
  }
  console.log('✅ Configuration valid\n');

  // Format the phone number
  const formattedNumber = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;
  
  console.log('📤 Sending message...');
  console.log(`To: ${formattedNumber}`);
  console.log(`Message: "${message}"`);
  console.log('⏳ Please wait...\n');

  try {
    // Send the message
    const result = await whatsappService.sendMessage(formattedNumber, message);

    console.log('✅ Message sent successfully!');
    console.log('\n📊 Response Details:');
    console.log(`Message SID: ${result.messageSid}`);
    console.log(`Status: ${result.status}`);
    console.log(`To: ${result.to}`);
    
    console.log('\n💡 Tips:');
    console.log('- Check your phone for the message');
    console.log('- If using Twilio Sandbox, make sure the recipient joined your sandbox');
    console.log('- Message status will update as it\'s delivered');

  } catch (error) {
    console.log('❌ Failed to send message!');
    console.log('\n🔍 Error Details:');
    console.log(`Error: ${error.message}`);
    
    if (error.code) {
      console.log(`Twilio Error Code: ${error.code}`);
    }
    
    if (error.moreInfo) {
      console.log(`More Info: ${error.moreInfo}`);
    }

    console.log('\n🛠️ Troubleshooting:');
    console.log('1. Verify the phone number format includes country code');
    console.log('2. Ensure recipient has joined your Twilio WhatsApp sandbox');
    console.log('3. Check your Twilio account balance and credentials');
    console.log('4. Verify TWILIO_WHATSAPP_FROM number in your .env file');
    
    process.exit(1);
  }
}

// Test with a predefined message if no arguments provided
async function sendQuickTest() {
  console.log('🚀 Quick Test Mode');
  console.log('==================\n');
  
  // Check if WHATSAPP_TO_NUMBERS is configured
  const configuredNumbers = process.env.WHATSAPP_TO_NUMBERS;
  
  if (!configuredNumbers) {
    console.log('❌ No test numbers configured!');
    console.log('Add WHATSAPP_TO_NUMBERS to your .env file:');
    console.log('WHATSAPP_TO_NUMBERS=whatsapp:+1234567890,whatsapp:+0987654321');
    process.exit(1);
  }

  const numbers = configuredNumbers.split(',').map(n => n.trim());
  const testNumber = numbers[0];
  const testMessage = `🤖 Test message from WhatsApp Service\n\nTime: ${new Date().toLocaleString()}\nThis is an automated test message.`;

  console.log(`Sending test message to: ${testNumber}`);
  
  const whatsappService = new WhatsAppService();
  
  if (!whatsappService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    process.exit(1);
  }

  try {
    const result = await whatsappService.sendMessage(testNumber, testMessage);
    console.log('✅ Quick test message sent successfully!');
    console.log(`Message SID: ${result.messageSid}`);
  } catch (error) {
    console.log('❌ Quick test failed:', error.message);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // No arguments - run quick test
    sendQuickTest().catch(console.error);
  } else if (args.length >= 2) {
    // Phone number and message provided
    sendTestMessage().catch(console.error);
  } else {
    console.log('❌ Invalid arguments. Use:');
    console.log('  node test-send-message.js <phone_number> <message>');
    console.log('  or');
    console.log('  node test-send-message.js (for quick test with configured numbers)');
  }
}

module.exports = { sendTestMessage, sendQuickTest };