// Link WhatsApp (Baileys) once: shows a QR code, or a pairing code if
// WHATSAPP_PAIR_NUMBER is set. Stop the main server before running this.
//   npm run wa:login
//   WHATSAPP_PAIR_NUMBER=905xxxxxxxxx npm run wa:login
require('dotenv').config();
const whatsappClient = require('../services/whatsappClient');

(async () => {
  whatsappClient.connect();

  try {
    // Give enough time to scan the QR / type the pairing code
    await whatsappClient.getSocket(5 * 60 * 1000);
    const groups = await whatsappClient.refreshGroupCache();

    console.log('\nWhatsApp linked as:', whatsappClient.getStatus().user);
    console.log('Session saved to:', whatsappClient.AUTH_DIR);
    console.log(`\nGroups (${Object.keys(groups).length}) - use these ids in WHATSAPP_GROUPS:`);
    for (const group of Object.values(groups)) {
      console.log(`  ${group.id}  ${group.subject}`);
    }

    // Let pending creds writes finish before exit
    setTimeout(async () => {
      await whatsappClient.close();
      process.exit(0);
    }, 3000);
  } catch (error) {
    console.error('Login failed:', error.message);
    await whatsappClient.close();
    process.exit(1);
  }
})();
