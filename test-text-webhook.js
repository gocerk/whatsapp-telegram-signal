const axios = require('axios');

// Test the text-only format on the main webhook endpoint
async function testTextWebhook() {
  const webhookUrl = 'http://localhost:3000/webhook'; // Change port if different
  
  const testMessage = {
    "msg": "Bitcoin is showing strong bullish momentum",
    "symbol": "BTCUSD"
  };

  try {
    console.log('Testing main webhook with text format payload:', testMessage);
    
    const response = await axios.post(webhookUrl, testMessage, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Success! Response:', response.data);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// Run the test
testTextWebhook();