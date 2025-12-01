require('dotenv').config();
const WhatsAppService = require('./services/whatsapp');

// Example usage of WhatsApp service for sending messages to individual numbers
async function exampleUsage() {
  console.log('📱 WhatsApp Service Usage Example');
  console.log('=================================\n');

  // Initialize the service
  const whatsapp = new WhatsAppService();

  // Validate configuration
  if (!whatsapp.validateConfiguration()) {
    console.log('❌ Please configure your .env file with Twilio credentials');
    return;
  }

  // Example phone number (replace with actual number)
  const phoneNumber = 'whatsapp:+905541531807'; // Replace with actual number
  
  try {
    console.log('1️⃣ Sending a simple text message...');
    
    // Send a simple message
    const result1 = await whatsapp.sendMessage(phoneNumber, 'Hello! This is a test message from the WhatsApp service.');
    console.log(`✅ Message sent! SID: ${result1.messageSid}\n`);

    // Wait a moment between messages
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('2️⃣ Sending a formatted trading signal...');
    
    // Send a trading signal
    const tradingSignal = {
      title: 'BUY Signal Alert',
      datetime: new Date().toLocaleString(),
      action: 'BUY',
      symbol: 'AAPL',
      price: '150.25'
    };

    const result2 = await whatsapp.sendFormattedMessage(phoneNumber, tradingSignal);
    console.log(`✅ Trading signal sent! SID: ${result2.messageSid}\n`);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('3️⃣ Sending an image with caption...');
    
    // Send an image (requires a public URL)
    const imageUrl = 'https://via.placeholder.com/400x300/0066cc/ffffff?text=Sample+Chart';
    const caption = '📊 Sample trading chart\n\nThis is an example of sending an image with a caption.';
    
    const result3 = await whatsapp.sendImageWithCaption(phoneNumber, imageUrl, caption);
    console.log(`✅ Image sent! SID: ${result3.messageSid}\n`);

    console.log('🎉 All examples completed successfully!');
    console.log('\n💡 Tips:');
    console.log('- Replace the phone number with your actual WhatsApp number');
    console.log('- Make sure the recipient has joined your Twilio WhatsApp sandbox');
    console.log('- Check your phone for the received messages');

  } catch (error) {
    console.log('❌ Error occurred:', error.message);
    
    if (error.code) {
      console.log(`Twilio Error Code: ${error.code}`);
    }
    
    console.log('\n🛠️ Common solutions:');
    console.log('- Verify phone number format (+1234567890)');
    console.log('- Ensure recipient joined Twilio WhatsApp sandbox');
    console.log('- Check Twilio account balance and credentials');
  }
}

// Function to send message to multiple numbers
async function sendToMultipleNumbers() {
  console.log('📱 Sending to Multiple Numbers');
  console.log('==============================\n');

  const whatsapp = new WhatsAppService();

  if (!whatsapp.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    return;
  }

  // Get numbers from environment variable
  const numbersEnv = process.env.WHATSAPP_TO_NUMBERS;
  if (!numbersEnv) {
    console.log('❌ No WHATSAPP_TO_NUMBERS configured in .env file');
    return;
  }

  const numbers = numbersEnv.split(',').map(n => n.trim());
  const message = `🤖 Broadcast message\n\nTime: ${new Date().toLocaleString()}\n\nThis message was sent to multiple recipients using the WhatsApp service.`;

  console.log(`Sending message to ${numbers.length} numbers...`);

  for (let i = 0; i < numbers.length; i++) {
    const number = numbers[i];
    try {
      console.log(`📤 Sending to ${number}...`);
      const result = await whatsapp.sendMessage(number, message);
      console.log(`✅ Sent to ${number} - SID: ${result.messageSid}`);
      
      // Wait between messages to avoid rate limiting
      if (i < numbers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.log(`❌ Failed to send to ${number}: ${error.message}`);
    }
  }

  console.log('\n🏁 Broadcast completed!');
}

// Main execution
if (require.main === module) {
  const mode = process.argv[2];

  switch (mode) {
    case 'broadcast':
      sendToMultipleNumbers().catch(console.error);
      break;
    case 'example':
    default:
      console.log('⚠️  IMPORTANT: Update the phone number in this script before running!');
      console.log('Edit example-usage.js and replace +1234567890 with your actual number.\n');
      
      // Uncomment the line below after updating the phone number
      // exampleUsage().catch(console.error);
      
      console.log('Available modes:');
      console.log('  node example-usage.js example   - Run usage examples');
      console.log('  node example-usage.js broadcast - Send to all configured numbers');
      break;
  }
}

module.exports = { exampleUsage, sendToMultipleNumbers };