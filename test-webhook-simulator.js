require('dotenv').config();
const axios = require('axios');

// Simple webhook simulator to test the /webhook endpoint
async function testWebhookEndpoint() {
  console.log('🚀 Webhook Endpoint Test');
  console.log('========================\n');

  // Configuration
  const PORT = process.env.PORT || 80;
  const baseUrl = `http://104.247.166.151:${PORT}`;
  const webhookUrl = `${baseUrl}/webhook`;

  // Sample trading signal data
  const signalData = {
    title: "Yeni İşlem Önerisi",
    datetime: new Date().toLocaleString('tr-TR'),
    action: "BUY",
    symbol: "EURUSD",
    price: "1.11621"
  };

  console.log('📊 Testing webhook endpoint:', webhookUrl);
  console.log('📝 Signal data:', JSON.stringify(signalData, null, 2));
  console.log('\n⏳ Sending webhook request...\n');

  try {
    const response = await axios.post(webhookUrl, signalData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    console.log('✅ Webhook request successful!');
    console.log('📈 Response status:', response.status);
    console.log('📋 Response data:', JSON.stringify(response.data, null, 2));

    if (response.data.success) {
      console.log('\n🎉 Signal processed successfully!');
      console.log('📊 Chart included:', response.data.chartIncluded ? 'Yes' : 'No');
      console.log('📱 WhatsApp sent:', response.data.results?.whatsapp ? 'Yes' : 'No');
      console.log('📨 Telegram sent:', response.data.results?.telegram ? 'Yes' : 'No');
    } else {
      console.log('\n⚠️ Signal processing failed');
    }

  } catch (error) {
    console.log('❌ Webhook request failed!');
    
    if (error.response) {
      console.log('📈 Response status:', error.response.status);
      console.log('📋 Response data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.log('🔌 No response received - server might not be running');
      console.log('💡 Make sure to start the server first: node main.js');
    } else {
      console.log('⚠️ Request setup error:', error.message);
    }
  }
}

// Run the test
if (require.main === module) {
  testWebhookEndpoint().catch(console.error);
}

module.exports = { testWebhookEndpoint };