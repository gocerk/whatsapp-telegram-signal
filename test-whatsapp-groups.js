require('dotenv').config();
const WhatsAppService = require('./services/whatsapp');

/**
 * Test script for sending messages to specific WhatsApp groups
 * 
 * Usage:
 *   node test-whatsapp-groups.js list                    # List configured groups
 *   node test-whatsapp-groups.js send <groupId> <message> # Send to single group
 *   node test-whatsapp-groups.js signal <groupId>         # Send trading signal to group
 *   node test-whatsapp-groups.js multiple <message>       # Send to all configured groups
 */

async function listGroups() {
  console.log('📋 Listing Configured WhatsApp Groups');
  console.log('====================================\n');

  const whatsappService = new WhatsAppService();
  
  if (!whatsappService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    process.exit(1);
  }

  const groups = whatsappService.getConfiguredGroups();
  
  if (groups.length === 0) {
    console.log('⚠️  No groups configured');
    console.log('\nTo configure groups, add to your .env file:');
    console.log('WHATSAPP_GROUPS=whatsapp:+1234567890,whatsapp:+0987654321');
    console.log('\nOr use WHATSAPP_TO_NUMBERS (will be treated as groups):');
    console.log('WHATSAPP_TO_NUMBERS=whatsapp:+1234567890');
    return;
  }

  console.log(`✅ Found ${groups.length} configured group(s):\n`);
  groups.forEach((group, index) => {
    console.log(`${index + 1}. ${group.name}`);
    console.log(`   ID: ${group.id}`);
    console.log(`   Type: ${group.type}\n`);
  });
}

async function sendToGroup(groupId, message) {
  console.log('📤 Sending Message to WhatsApp Group');
  console.log('=====================================\n');

  const whatsappService = new WhatsAppService();
  
  if (!whatsappService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    process.exit(1);
  }

  // Format group ID
  const formattedGroupId = groupId.startsWith('whatsapp:') ? groupId : `whatsapp:${groupId}`;

  console.log(`Group ID: ${formattedGroupId}`);
  console.log(`Message: "${message}"\n`);
  console.log('⏳ Sending...\n');

  try {
    const result = await whatsappService.sendMessageToGroup(formattedGroupId, message);
    
    console.log('✅ Message sent successfully!');
    console.log('\n📊 Response Details:');
    console.log(`Message SID: ${result.messageSid}`);
    console.log(`Status: ${result.status}`);
    console.log(`To: ${result.to}`);
  } catch (error) {
    console.log('❌ Failed to send message!');
    console.log(`Error: ${error.message}`);
    if (error.code) {
      console.log(`Twilio Error Code: ${error.code}`);
    }
    process.exit(1);
  }
}

async function sendTradingSignal(groupId) {
  console.log('📊 Sending Trading Signal to WhatsApp Group');
  console.log('===========================================\n');

  const whatsappService = new WhatsAppService();
  
  if (!whatsappService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    process.exit(1);
  }

  // Format group ID
  const formattedGroupId = groupId.startsWith('whatsapp:') ? groupId : `whatsapp:${groupId}`;

  const sampleSignal = {
    title: 'BUY Signal Alert',
    datetime: new Date().toISOString(),
    action: 'BUY',
    symbol: 'AAPL',
    price: '150.25'
  };

  console.log(`Group ID: ${formattedGroupId}`);
  console.log('Signal Data:', JSON.stringify(sampleSignal, null, 2));
  console.log('\n⏳ Sending...\n');

  try {
    const result = await whatsappService.sendFormattedMessageToGroup(
      formattedGroupId, 
      sampleSignal
    );
    
    console.log('✅ Trading signal sent successfully!');
    console.log('\n📊 Response Details:');
    console.log(`Message SID: ${result.messageSid}`);
    console.log(`Status: ${result.status}`);
    console.log(`To: ${result.to}`);
  } catch (error) {
    console.log('❌ Failed to send trading signal!');
    console.log(`Error: ${error.message}`);
    if (error.code) {
      console.log(`Twilio Error Code: ${error.code}`);
    }
    process.exit(1);
  }
}

async function sendToMultipleGroups(message) {
  console.log('📤 Sending Message to Multiple WhatsApp Groups');
  console.log('===============================================\n');

  const whatsappService = new WhatsAppService();
  
  if (!whatsappService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    process.exit(1);
  }

  const groups = whatsappService.getConfiguredGroups();
  
  if (groups.length === 0) {
    console.log('❌ No groups configured');
    console.log('\nTo configure groups, add to your .env file:');
    console.log('WHATSAPP_GROUPS=whatsapp:+1234567890,whatsapp:+0987654321');
    process.exit(1);
  }

  const groupIds = groups.map(g => g.id);
  
  console.log(`Sending to ${groupIds.length} group(s):`);
  groupIds.forEach((id, index) => {
    console.log(`  ${index + 1}. ${id}`);
  });
  console.log(`\nMessage: "${message}"`);
  console.log('\n⏳ Sending...\n');

  try {
    const result = await whatsappService.sendMessageToMultipleGroups(groupIds, message);
    
    console.log('✅ Finished sending messages!');
    console.log('\n📊 Results:');
    console.log(`Total: ${result.total}`);
    console.log(`Succeeded: ${result.succeeded}`);
    console.log(`Failed: ${result.failed}`);
    
    if (result.groups.length > 0) {
      console.log('\n📋 Per-Group Results:');
      result.groups.forEach((groupResult, index) => {
        console.log(`\n${index + 1}. ${groupResult.groupId}`);
        if (groupResult.success) {
          console.log(`   ✅ Success - Message SID: ${groupResult.messageSid}`);
          console.log(`   Status: ${groupResult.status}`);
        } else {
          console.log(`   ❌ Failed - Error: ${groupResult.error}`);
        }
      });
    }
  } catch (error) {
    console.log('❌ Failed to send messages!');
    console.log(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  const command = process.argv[2];
  const param1 = process.argv[3];
  const param2 = process.argv[4];

  switch (command) {
    case 'list':
      listGroups().catch(console.error);
      break;
      
    case 'send':
      if (!param1 || !param2) {
        console.log('❌ Usage: node test-whatsapp-groups.js send <groupId> <message>');
        console.log('Example: node test-whatsapp-groups.js send "whatsapp:+1234567890" "Hello Group!"');
        process.exit(1);
      }
      sendToGroup(param1, param2).catch(console.error);
      break;
      
    case 'signal':
      if (!param1) {
        console.log('❌ Usage: node test-whatsapp-groups.js signal <groupId>');
        console.log('Example: node test-whatsapp-groups.js signal "whatsapp:+1234567890"');
        process.exit(1);
      }
      sendTradingSignal(param1).catch(console.error);
      break;
      
    case 'multiple':
      if (!param1) {
        console.log('❌ Usage: node test-whatsapp-groups.js multiple <message>');
        console.log('Example: node test-whatsapp-groups.js multiple "Hello all groups!"');
        process.exit(1);
      }
      sendToMultipleGroups(param1).catch(console.error);
      break;
      
    default:
      console.log('📱 WhatsApp Groups Test Script');
      console.log('==============================\n');
      console.log('Usage:');
      console.log('  node test-whatsapp-groups.js list                    # List configured groups');
      console.log('  node test-whatsapp-groups.js send <groupId> <message> # Send to single group');
      console.log('  node test-whatsapp-groups.js signal <groupId>         # Send trading signal');
      console.log('  node test-whatsapp-groups.js multiple <message>      # Send to all groups\n');
      console.log('Examples:');
      console.log('  node test-whatsapp-groups.js list');
      console.log('  node test-whatsapp-groups.js send "whatsapp:+1234567890" "Hello!"');
      console.log('  node test-whatsapp-groups.js signal "whatsapp:+1234567890"');
      console.log('  node test-whatsapp-groups.js multiple "Broadcast message"');
      break;
  }
}

module.exports = {
  listGroups,
  sendToGroup,
  sendTradingSignal,
  sendToMultipleGroups
};

