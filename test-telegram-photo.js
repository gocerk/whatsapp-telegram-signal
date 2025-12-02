require('dotenv').config();
const TelegramService = require('./services/telegram');
const fs = require('fs');
const path = require('path');

// Test script to test Telegram send photo functionality
async function testTelegramPhoto() {
  console.log('📸 Telegram Photo Sender Test');
  console.log('=============================\n');

  // Get command line arguments
  const photoPath = process.argv[2];
  const caption = process.argv[3] || '';

  // Initialize Telegram service
  const telegramService = new TelegramService();

  // Validate configuration
  console.log('🔧 Validating Telegram configuration...');
  if (!telegramService.validateConfiguration()) {
    console.log('❌ Configuration validation failed!');
    console.log('\nRequired environment variables in .env file:');
    console.log('- TELEGRAM_BOT_TOKEN=your_bot_token');
    console.log('- TELEGRAM_CHAT_ID=your_chat_id');
    console.log('\nMake sure to add these to your .env file.');
    process.exit(1);
  }
  console.log('✅ Configuration valid\n');

  // Test different photo sending methods
  const tests = [];

  // Test 1: Send photo from file path (if provided)
  if (photoPath) {
    tests.push({
      name: 'File Path Photo',
      test: () => testPhotoFromPath(telegramService, photoPath, caption)
    });
  }

  // Test 2: Send photo from buffer (using existing tradingview_grafik.png)
  const defaultImagePath = './tradingview_grafik.png';
  if (fs.existsSync(defaultImagePath)) {
    tests.push({
      name: 'Buffer Photo (tradingview_grafik.png)',
      test: () => testPhotoFromBuffer(telegramService, defaultImagePath, caption || 'Test photo from buffer')
    });
  }

  // Test 3: Send photo from URL
  tests.push({
    name: 'URL Photo',
    test: () => testPhotoFromURL(telegramService, 'https://via.placeholder.com/400x300.png?text=Test+Image', caption || 'Test photo from URL')
  });

  // Test 4: Send formatted trading message with photo
  tests.push({
    name: 'Formatted Trading Message with Photo',
    test: () => testFormattedMessageWithPhoto(telegramService)
  });

  // Run all tests
  let passedTests = 0;
  let totalTests = tests.length;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n🧪 Test ${i + 1}/${totalTests}: ${test.name}`);
    console.log('─'.repeat(50));
    
    try {
      await test.test();
      console.log(`✅ Test ${i + 1} passed: ${test.name}`);
      passedTests++;
      
      // Wait between tests to avoid rate limiting
      if (i < tests.length - 1) {
        console.log('⏳ Waiting 2 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.log(`❌ Test ${i + 1} failed: ${test.name}`);
      console.log(`Error: ${error.message}`);
    }
  }

  // Summary
  console.log('\n📊 Test Summary');
  console.log('================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! Telegram photo functionality is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Check the error messages above for details.');
  }
}

// Test sending photo from file path
async function testPhotoFromPath(telegramService, photoPath, caption) {
  if (!fs.existsSync(photoPath)) {
    throw new Error(`Photo file not found: ${photoPath}`);
  }

  console.log(`📁 Sending photo from path: ${photoPath}`);
  console.log(`📝 Caption: "${caption}"`);
  
  const result = await telegramService.sendPhoto(photoPath, caption);
  
  console.log(`✅ Photo sent successfully!`);
  console.log(`Message ID: ${result.messageId}`);
  console.log(`Chat ID: ${telegramService.chatId}`);
}

// Test sending photo from buffer
async function testPhotoFromBuffer(telegramService, imagePath, caption) {
  console.log(`📦 Reading image as buffer: ${imagePath}`);
  
  const imageBuffer = fs.readFileSync(imagePath);
  const photoData = {
    buffer: imageBuffer,
    contentType: 'image/png'
  };
  
  console.log(`📝 Caption: "${caption}"`);
  console.log(`📏 Buffer size: ${imageBuffer.length} bytes`);
  
  const result = await telegramService.sendPhoto(photoData, caption);
  
  console.log(`✅ Photo sent successfully!`);
  console.log(`Message ID: ${result.messageId}`);
  console.log(`Chat ID: ${telegramService.chatId}`);
}

// Test sending photo from URL
async function testPhotoFromURL(telegramService, imageUrl, caption) {
  console.log(`🌐 Sending photo from URL: ${imageUrl}`);
  console.log(`📝 Caption: "${caption}"`);
  
  const result = await telegramService.sendPhoto(imageUrl, caption);
  
  console.log(`✅ Photo sent successfully!`);
  console.log(`Message ID: ${result.messageId}`);
  console.log(`Chat ID: ${telegramService.chatId}`);
}

// Test formatted trading message with photo
async function testFormattedMessageWithPhoto(telegramService) {
  console.log(`📈 Testing formatted trading message with photo`);
  
  // Sample trading signal data
  const signalData = {
    title: "Yeni İşlem Önerisi",
    datetime: new Date().toLocaleString('tr-TR'),
    action: "BUY",
    symbol: "EURUSD",
    price: "1.11646"
  };

  // Use the existing tradingview_grafik.png if available
  const imagePath = './tradingview_grafik.png';
  let chartImage = null;
  
  if (fs.existsSync(imagePath)) {
    const imageBuffer = fs.readFileSync(imagePath);
    chartImage = {
      buffer: imageBuffer,
      contentType: 'image/png'
    };
    console.log(`📊 Using chart image: ${imagePath}`);
  } else {
    console.log(`📊 No chart image found, sending text only`);
  }
  
  console.log(`📝 Signal data:`, signalData);
  
  const result = await telegramService.sendFormattedMessage(signalData, chartImage);
  
  console.log(`✅ Formatted message sent successfully!`);
  console.log(`Message ID: ${result.messageId}`);
  console.log(`Chat ID: ${telegramService.chatId}`);
}

// Quick test function for predefined scenarios
async function runQuickTest() {
  console.log('🚀 Quick Photo Test Mode');
  console.log('========================\n');
  
  const telegramService = new TelegramService();
  
  if (!telegramService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    process.exit(1);
  }

  try {
    // Test with the existing tradingview_grafik.png
    const imagePath = './tradingview_grafik.png';
    if (fs.existsSync(imagePath)) {
      console.log('📸 Sending quick test photo...');
      const testCaption = `🤖 Test photo from Telegram Service\n\nTime: ${new Date().toLocaleString()}\nThis is an automated test photo.`;
      
      const imageBuffer = fs.readFileSync(imagePath);
      const photoData = {
        buffer: imageBuffer,
        contentType: 'image/png'
      };
      
      const result = await telegramService.sendPhoto(photoData, testCaption);
      console.log('✅ Quick test photo sent successfully!');
      console.log(`Message ID: ${result.messageId}`);
    } else {
      // Fallback to URL test
      console.log('📸 Sending test photo from URL...');
      const testCaption = `🤖 Test photo from URL\n\nTime: ${new Date().toLocaleString()}`;
      const result = await telegramService.sendPhoto('https://via.placeholder.com/400x300.png?text=Quick+Test', testCaption);
      console.log('✅ Quick test photo sent successfully!');
      console.log(`Message ID: ${result.messageId}`);
    }
  } catch (error) {
    console.log('❌ Quick test failed:', error.message);
    process.exit(1);
  }
}

// Usage information
function showUsage() {
  console.log('📸 Telegram Photo Test Usage');
  console.log('============================\n');
  console.log('Usage options:');
  console.log('  node test-telegram-photo.js                           # Run all tests with default image');
  console.log('  node test-telegram-photo.js <image_path>              # Test with specific image');
  console.log('  node test-telegram-photo.js <image_path> <caption>    # Test with specific image and caption');
  console.log('  node test-telegram-photo.js --quick                   # Run quick test');
  console.log('\nExamples:');
  console.log('  node test-telegram-photo.js ./tradingview_grafik.png "Trading Chart"');
  console.log('  node test-telegram-photo.js ./my-image.jpg "Test Caption"');
  console.log('  node test-telegram-photo.js --quick');
  console.log('\nSupported image formats: PNG, JPG, JPEG, GIF, WebP');
  console.log('Maximum file size: 10MB (Telegram limit)');
  console.log('\nMake sure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set in your .env file.');
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // No arguments - run full test suite
    testTelegramPhoto().catch(console.error);
  } else if (args[0] === '--help' || args[0] === '-h') {
    showUsage();
  } else if (args[0] === '--quick') {
    runQuickTest().catch(console.error);
  } else {
    // Custom photo path and caption provided
    testTelegramPhoto().catch(console.error);
  }
}

module.exports = { testTelegramPhoto, runQuickTest, testPhotoFromPath, testPhotoFromBuffer, testPhotoFromURL };