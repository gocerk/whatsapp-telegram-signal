require('dotenv').config();
const WhatsAppService = require('./services/whatsapp');

/**
 * Test script for creating Twilio Conversations (WhatsApp groups)
 * 
 * Usage:
 *   node test-create-conversation.js create <groupName> <phone1> <phone2> ...
 *   node test-create-conversation.js list
 *   node test-create-conversation.js send <conversationSid> <message>
 *   node test-create-conversation.js participants <conversationSid>
 */

async function createGroup(groupName, phoneNumbers) {
  console.log('📱 Creating WhatsApp Group (Conversation)');
  console.log('==========================================\n');

  const whatsappService = new WhatsAppService();
  
  if (!whatsappService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    process.exit(1);
  }

  if (!groupName || !phoneNumbers || phoneNumbers.length === 0) {
    console.log('❌ Usage: node test-create-conversation.js create <groupName> <phone1> <phone2> ...');
    console.log('Example: node test-create-conversation.js create "Trading Group" "+1234567890" "+0987654321"');
    process.exit(1);
  }

  console.log(`Group Name: ${groupName}`);
  console.log(`Participants: ${phoneNumbers.join(', ')}\n`);
  console.log('⏳ Creating conversation and adding participants...\n');

  try {
    const result = await whatsappService.createConversationWithParticipants(groupName, phoneNumbers);
    
    if (result.success) {
      console.log('✅ Group created successfully!');
      console.log('\n📊 Group Details:');
      console.log(`Conversation SID: ${result.conversationSid}`);
      console.log(`Group Name: ${result.friendlyName}`);
      console.log(`Participants Added: ${result.totalAdded}/${result.totalRequested}`);
      
      if (result.participants.length > 0) {
        console.log('\n✅ Added Participants:');
        result.participants.forEach((part, index) => {
          console.log(`  ${index + 1}. ${part.phoneNumber} (SID: ${part.participantSid})`);
        });
      }
      
      if (result.errors.length > 0) {
        console.log('\n⚠️  Failed to Add:');
        result.errors.forEach((err, index) => {
          console.log(`  ${index + 1}. ${err.phoneNumber}: ${err.error}`);
        });
      }
      
      console.log('\n💡 Next Steps:');
      console.log(`- Send a message: node test-create-conversation.js send ${result.conversationSid} "Hello!"`);
      console.log(`- View participants: node test-create-conversation.js participants ${result.conversationSid}`);
    } else {
      console.log('❌ Failed to create group');
      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach(err => {
          console.log(`  - ${err.phoneNumber}: ${err.error}`);
        });
      }
    }
  } catch (error) {
    console.log('❌ Failed to create group!');
    console.log(`Error: ${error.message}`);
    if (error.code) {
      console.log(`Twilio Error Code: ${error.code}`);
    }
    if (error.moreInfo) {
      console.log(`More Info: ${error.moreInfo}`);
    }
    process.exit(1);
  }
}

async function listConversations() {
  console.log('📋 Listing All Conversations');
  console.log('=============================\n');

  const whatsappService = new WhatsAppService();
  
  if (!whatsappService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    process.exit(1);
  }

  try {
    const result = await whatsappService.listConversations();
    
    if (result.success && result.conversations.length > 0) {
      console.log(`✅ Found ${result.count} conversation(s):\n`);
      result.conversations.forEach((conv, index) => {
        console.log(`${index + 1}. ${conv.friendlyName || 'Unnamed'}`);
        console.log(`   SID: ${conv.sid}`);
        console.log(`   State: ${conv.state}`);
        console.log(`   Created: ${new Date(conv.dateCreated).toLocaleString()}\n`);
      });
    } else {
      console.log('📭 No conversations found');
      console.log('\n💡 Create a new conversation:');
      console.log('   node test-create-conversation.js create "My Group" "+1234567890" "+0987654321"');
    }
  } catch (error) {
    console.log('❌ Failed to list conversations!');
    console.log(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function sendToConversation(conversationSid, message) {
  console.log('📤 Sending Message to Conversation');
  console.log('====================================\n');

  const whatsappService = new WhatsAppService();
  
  if (!whatsappService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    process.exit(1);
  }

  if (!conversationSid || !message) {
    console.log('❌ Usage: node test-create-conversation.js send <conversationSid> <message>');
    process.exit(1);
  }

  console.log(`Conversation SID: ${conversationSid}`);
  console.log(`Message: "${message}"\n`);
  console.log('⏳ Sending...\n');

  try {
    const result = await whatsappService.sendMessageToConversation(conversationSid, message);
    
    console.log('✅ Message sent successfully!');
    console.log('\n📊 Response Details:');
    console.log(`Message SID: ${result.messageSid}`);
    console.log(`Status: ${result.status}`);
    console.log(`Conversation SID: ${result.conversationSid}`);
  } catch (error) {
    console.log('❌ Failed to send message!');
    console.log(`Error: ${error.message}`);
    if (error.code) {
      console.log(`Twilio Error Code: ${error.code}`);
    }
    process.exit(1);
  }
}

async function listParticipants(conversationSid) {
  console.log('👥 Listing Conversation Participants');
  console.log('=====================================\n');

  const whatsappService = new WhatsAppService();
  
  if (!whatsappService.validateConfiguration()) {
    console.log('❌ Configuration invalid');
    process.exit(1);
  }

  if (!conversationSid) {
    console.log('❌ Usage: node test-create-conversation.js participants <conversationSid>');
    process.exit(1);
  }

  console.log(`Conversation SID: ${conversationSid}\n`);
  console.log('⏳ Fetching participants...\n');

  try {
    const result = await whatsappService.listConversationParticipants(conversationSid);
    
    if (result.success && result.participants.length > 0) {
      console.log(`✅ Found ${result.count} participant(s):\n`);
      result.participants.forEach((part, index) => {
        console.log(`${index + 1}. Participant SID: ${part.sid}`);
        if (part.messagingBinding && part.messagingBinding.address) {
          console.log(`   WhatsApp: ${part.messagingBinding.address}`);
        }
        if (part.identity) {
          console.log(`   Identity: ${part.identity}`);
        }
        console.log(`   Created: ${new Date(part.dateCreated).toLocaleString()}\n`);
      });
    } else {
      console.log('📭 No participants found in this conversation');
    }
  } catch (error) {
    console.log('❌ Failed to list participants!');
    console.log(`Error: ${error.message}`);
    if (error.code) {
      console.log(`Twilio Error Code: ${error.code}`);
    }
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'create':
      if (args.length < 2) {
        console.log('❌ Usage: node test-create-conversation.js create <groupName> <phone1> <phone2> ...');
        console.log('Example: node test-create-conversation.js create "Trading Group" "+1234567890" "+0987654321"');
        process.exit(1);
      }
      const groupName = args[0];
      const phoneNumbers = args.slice(1);
      createGroup(groupName, phoneNumbers).catch(console.error);
      break;
      
    case 'list':
      listConversations().catch(console.error);
      break;
      
    case 'send':
      if (args.length < 2) {
        console.log('❌ Usage: node test-create-conversation.js send <conversationSid> <message>');
        process.exit(1);
      }
      sendToConversation(args[0], args.slice(1).join(' ')).catch(console.error);
      break;
      
    case 'participants':
      if (args.length < 1) {
        console.log('❌ Usage: node test-create-conversation.js participants <conversationSid>');
        process.exit(1);
      }
      listParticipants(args[0]).catch(console.error);
      break;
      
    default:
      console.log('📱 Twilio Conversations Test Script');
      console.log('===================================\n');
      console.log('Usage:');
      console.log('  node test-create-conversation.js create <groupName> <phone1> <phone2> ...');
      console.log('  node test-create-conversation.js list');
      console.log('  node test-create-conversation.js send <conversationSid> <message>');
      console.log('  node test-create-conversation.js participants <conversationSid>\n');
      console.log('Examples:');
      console.log('  node test-create-conversation.js create "Trading Group" "+905541531807" "+38268580338"');
      console.log('  node test-create-conversation.js list');
      console.log('  node test-create-conversation.js send CHxxx "Hello group!"');
      console.log('  node test-create-conversation.js participants CHxxx');
      break;
  }
}

module.exports = {
  createGroup,
  listConversations,
  sendToConversation,
  listParticipants
};

