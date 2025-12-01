require('dotenv').config();
const WhatsAppService = require('./services/whatsapp');

// Test script to list active WhatsApp contacts using Twilio
async function testListActiveGroups() {
  console.log('🚀 Starting Twilio WhatsApp Contacts Test Script');
  console.log('===============================================\n');

  // Initialize WhatsApp service
  const whatsappService = new WhatsAppService();

  // Validate configuration first
  console.log('📋 Validating Twilio WhatsApp configuration...');
  const isConfigValid = whatsappService.validateConfiguration();
  
  if (!isConfigValid) {
    console.log('❌ Configuration validation failed. Please check your .env file.');
    console.log('Required environment variables:');
    console.log('- TWILIO_ACCOUNT_SID');
    console.log('- TWILIO_AUTH_TOKEN');
    console.log('- TWILIO_WHATSAPP_FROM');
    console.log('\nOptional:');
    console.log('- WHATSAPP_TO_NUMBERS (comma-separated list of recipients)');
    process.exit(1);
  }
  
  console.log('✅ Configuration validated successfully\n');

  try {
    console.log('📱 Attempting to list active WhatsApp contacts...');
    console.log('⏳ This may take a few seconds...\n');

    // Test the listActiveGroups function (now lists active contacts)
    const result = await whatsappService.listActiveGroups();

    console.log('📊 Results:');
    console.log('===========');
    console.log(`Success: ${result.success}`);
    console.log(`Contacts found: ${result.count}`);
    
    if (result.fallback) {
      console.log('⚠️  Using fallback mode (API call failed, showing configured numbers)');
    }

    if (result.groups && result.groups.length > 0) {
      console.log('\n📋 Contact Details:');
      result.groups.forEach((contact, index) => {
        console.log(`\n${index + 1}. Contact Information:`);
        console.log(`   ID: ${contact.id}`);
        console.log(`   Name: ${contact.name || 'Unknown'}`);
        console.log(`   Type: ${contact.type || 'active'}`);
        if (contact.messageCount) {
          console.log(`   Messages: ${contact.messageCount}`);
        }
        if (contact.lastMessageDate) {
          console.log(`   Last Message: ${new Date(contact.lastMessageDate).toLocaleString()}`);
        }
      });
    } else {
      console.log('\n📭 No active contacts found');
      console.log('💡 This could mean:');
      console.log('   - No recent WhatsApp messages in the last 30 days');
      console.log('   - Twilio sandbox needs to be set up');
      console.log('   - Recipients need to join your Twilio WhatsApp sandbox');
    }

    if (result.error) {
      console.log('\n⚠️  Error Details:');
      console.log(result.error);
    }

    // Test getContactInfo if we have contacts
    if (result.groups && result.groups.length > 0) {
      const firstContact = result.groups[0];
      console.log(`\n🔍 Testing getContactInfo with: ${firstContact.id}...`);
      
      const contactInfo = await whatsappService.getContactInfo(firstContact.id);
      
      console.log('\n📋 Contact Info Details:');
      console.log(`Success: ${contactInfo.success}`);
      
      if (contactInfo.success && contactInfo.contact) {
        console.log('Contact Details:');
        console.log(`  ID: ${contactInfo.contact.id}`);
        console.log(`  Name: ${contactInfo.contact.name}`);
        console.log(`  Message Count: ${contactInfo.contact.messageCount}`);
        
        if (contactInfo.contact.lastMessage) {
          console.log('  Last Message:');
          console.log(`    Body: ${contactInfo.contact.lastMessage.body?.substring(0, 100)}...`);
          console.log(`    Date: ${new Date(contactInfo.contact.lastMessage.date).toLocaleString()}`);
          console.log(`    Direction: ${contactInfo.contact.lastMessage.direction}`);
        }
      } else if (contactInfo.error) {
        console.log('Error:', contactInfo.error);
      }

      // Test message history
      console.log(`\n📜 Testing message history for: ${firstContact.id}...`);
      const history = await whatsappService.getMessageHistory(firstContact.id, 5);
      
      if (history.success && history.messages.length > 0) {
        console.log(`\n📨 Recent Messages (${history.messages.length}):`);
        history.messages.forEach((msg, index) => {
          console.log(`\n${index + 1}. ${msg.direction.toUpperCase()}`);
          console.log(`   Date: ${new Date(msg.dateSent).toLocaleString()}`);
          console.log(`   Body: ${msg.body?.substring(0, 100)}${msg.body?.length > 100 ? '...' : ''}`);
          console.log(`   Status: ${msg.status}`);
        });
      }
    }

  } catch (error) {
    console.log('❌ Test failed with error:');
    console.error(error.message);
    
    if (error.code) {
      console.log(`\nTwilio Error Code: ${error.code}`);
    }
    
    if (error.moreInfo) {
      console.log(`More Info: ${error.moreInfo}`);
    }
  }

  console.log('\n🏁 Test completed');
}

// Test sending a message to a specific number
async function testSendMessage(to, message) {
  console.log(`\n📤 Testing message send to: ${to}`);
  console.log('=====================================');

  const whatsappService = new WhatsAppService();
  
  if (!whatsappService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    return;
  }

  try {
    const result = await whatsappService.sendMessage(to, message);
    console.log('✅ Message sent successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('❌ Failed to send message:');
    console.log('Error:', error.message);
    if (error.code) {
      console.log(`Twilio Error Code: ${error.code}`);
    }
  }
}

// Test sending a trading signal
async function testTradingSignal(to) {
  console.log(`\n📊 Testing trading signal to: ${to}`);
  console.log('=====================================');

  const whatsappService = new WhatsAppService();
  
  if (!whatsappService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    return;
  }

  const sampleSignal = {
    title: 'BUY Signal Alert',
    datetime: new Date().toLocaleString(),
    action: 'BUY',
    symbol: 'AAPL',
    price: '150.25'
  };

  try {
    const result = await whatsappService.sendFormattedMessage(to, sampleSignal);
    console.log('✅ Trading signal sent successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('❌ Failed to send trading signal:');
    console.log('Error:', error.message);
  }
}

// Main execution
if (require.main === module) {
  const command = process.argv[2];
  const param1 = process.argv[3];
  const param2 = process.argv[4];
  
  switch (command) {
    case 'send':
      if (!param1 || !param2) {
        console.log('Usage: node test-groups.js send <to_number> <message>');
        console.log('Example: node test-groups.js send "whatsapp:+1234567890" "Hello World"');
        process.exit(1);
      }
      testSendMessage(param1, param2).catch(console.error);
      break;
      
    case 'signal':
      if (!param1) {
        console.log('Usage: node test-groups.js signal <to_number>');
        console.log('Example: node test-groups.js signal "whatsapp:+1234567890"');
        process.exit(1);
      }
      testTradingSignal(param1).catch(console.error);
      break;
      
    case 'list':
    default:
      testListActiveGroups().catch(console.error);
      break;
  }
}

module.exports = {
  testListActiveGroups,
  testSendMessage,
  testTradingSignal
};