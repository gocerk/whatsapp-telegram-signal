# WhatsApp Trading Signal Bot with Advanced Charts

A Node.js application that receives TradingView webhook signals and forwards them to WhatsApp groups with advanced chart images using the chart-img.com API v2.

## Features

- **WhatsApp Integration**: Send text messages and images via Twilio WhatsApp API
- **Telegram Integration**: Send trading signals to Telegram channels/groups
- **Advanced Chart Generation**: Create professional TradingView charts with indicators and drawings
- **TradingView Session Support**: Access premium data with session authentication
- **Custom Indicators**: Support for 100+ technical indicators with customization
- **Chart Drawings**: Add trend lines, support/resistance levels, and annotations
- **Layout Charts**: Use custom TradingView layouts with community indicators
- **Signal Processing**: Automated webhook processing from TradingView alerts
- **Dual Platform Support**: Send signals to both WhatsApp and Telegram simultaneously
- **Comprehensive logging and error handling

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Twilio Setup

1. Create a [Twilio account](https://www.twilio.com/)
2. Get your Account SID and Auth Token from the Twilio Console
3. Set up WhatsApp Sandbox:
   - Go to Twilio Console > Messaging > Try it out > Send a WhatsApp message
   - Follow the instructions to join your sandbox
   - Note your sandbox WhatsApp number (e.g., `whatsapp:+14155238886`)

### 3. Telegram Bot Setup

1. Create a Telegram bot:
   - Open Telegram and search for [@BotFather](https://t.me/botfather)
   - Send `/newbot` and follow instructions
   - Save your bot token (e.g., `8559578423:AAEfQzBT9NIzloxvNhesmXE8aninuQdw_Gc`)

2. Get your Chat ID:
   - For channels: Forward a message from your channel to [@userinfobot](https://t.me/userinfobot)
   - For groups: Add [@userinfobot](https://t.me/userinfobot) to your group and send `/start`
   - The chat ID will be shown (e.g., `-1003438071390`)

### 4. Environment Configuration

Create a `.env` file in the project root with your credentials:

```env
# Twilio Configuration for WhatsApp
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# WhatsApp Recipients (comma-separated for multiple numbers)
# Can be used for both individual numbers and groups
WHATSAPP_TO_NUMBERS=whatsapp:+1234567890,whatsapp:+0987654321

# WhatsApp Groups (comma-separated list of group IDs)
# If not set, WHATSAPP_TO_NUMBERS will be used as groups
# Group IDs should be in format: whatsapp:+1234567890
WHATSAPP_GROUPS=whatsapp:+1234567890,whatsapp:+0987654321

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_telegram_chat_id_here

# Chart Image API Configuration (chart-img.com)
CHART_IMG_API_KEY=your_chart_img_api_key_here

# TradingView Session Authentication (optional - for premium data access)
# Get these from your browser cookies when logged into TradingView
TRADINGVIEW_SESSION_ID=your_tradingview_sessionid_here
TRADINGVIEW_SESSION_ID_SIGN=your_tradingview_sessionid_sign_here

# Server Configuration
PORT=3000
```

### 5. WhatsApp Sandbox Setup

For testing, recipients need to join your Twilio WhatsApp sandbox:

1. Send a WhatsApp message to your Twilio sandbox number
2. Include the join code (shown in Twilio Console)
3. Example: Send `join <your-sandbox-code>` to `+14155238886`

## Usage

### TradingView Webhook Integration

The main use case is receiving webhook signals from TradingView. When a webhook is received, the signal is automatically sent to **both WhatsApp and Telegram**:

```bash
# Start the server
npm start

# TradingView webhook URL: http://your-server.com/webhook
```

**TradingView Alert Message Format:**
```json
{
  "title": "{{strategy.order.comment}}",
  "datetime": "{{time}}",
  "action": "{{strategy.order.action}}",
  "symbol": "{{ticker}}",
  "price": "{{close}}"
}
```

**Note:** The webhook handler will attempt to send to both WhatsApp and Telegram. If one service fails, the other will still be attempted. The response will indicate which services succeeded.

### Advanced Chart Service Usage

```javascript
const ChartService = require('./services/chart');
const chartService = new ChartService();

// 1. Basic enhanced chart
const chartUrl = await chartService.getChartImageUrl('BINANCE:BTCUSDT', {
  interval: '4h',
  width: 1000,
  height: 700,
  theme: 'dark',
  studies: [
    {
      name: 'Bollinger Bands',
      input: { in_0: 20, in_1: 2 },
      override: {
        'Upper.color': 'rgb(33,150,243)',
        'Lower.color': 'rgb(33,150,243)'
      }
    }
  ]
});

// 2. Signal chart with drawings
const signalChart = chartService.createSignalChart('BINANCE:BTCUSDT', {
  action: 'BUY',
  price: 45000,
  timestamp: new Date().toISOString()
});

// 3. Layout chart (custom TradingView layout)
const layoutChart = await chartService.getLayoutChartUrl('your_layout_id', 'BINANCE:ETHUSDT', {
  interval: '1h',
  width: 800,
  height: 600
});
```

### WhatsApp Service Usage

```javascript
const WhatsAppService = require('./services/whatsapp');
const whatsapp = new WhatsAppService();

// Send a simple message
await whatsapp.sendMessage('whatsapp:+1234567890', 'Hello World!');

// Send a trading signal with chart
const signal = {
  title: 'BUY Signal Alert',
  datetime: new Date().toLocaleString(),
  action: 'BUY',
  symbol: 'BTCUSDT',
  price: '45000'
};

const chartImage = { url: 'https://chart-url.com/image.png' };
await whatsapp.sendFormattedMessage('whatsapp:+1234567890', signal, chartImage);
```

### WhatsApp Group Messaging

The service now supports sending messages to specific WhatsApp groups:

```javascript
const WhatsAppService = require('./services/whatsapp');
const whatsapp = new WhatsAppService();

// Send to a specific group
await whatsapp.sendMessageToGroup('whatsapp:+1234567890', 'Hello Group!');

// Send formatted trading signal to a group
await whatsapp.sendFormattedMessageToGroup('whatsapp:+1234567890', signal, chartImage);

// Send to multiple groups at once
const groupIds = ['whatsapp:+1234567890', 'whatsapp:+0987654321'];
await whatsapp.sendMessageToMultipleGroups(groupIds, 'Broadcast message');

// Send formatted signal to multiple groups
await whatsapp.sendFormattedMessageToMultipleGroups(groupIds, signal, chartImage);

// Get configured groups
const groups = whatsapp.getConfiguredGroups();
console.log(`Configured ${groups.length} groups`);
```

**Webhook with Group Selection:**

You can specify which group(s) to send to in the webhook payload:

```json
{
  "title": "BUY Signal",
  "action": "BUY",
  "symbol": "BTCUSDT",
  "price": "45000",
  "groupId": "whatsapp:+1234567890"
}
```

Or send to multiple groups:

```json
{
  "title": "BUY Signal",
  "action": "BUY",
  "symbol": "BTCUSDT",
  "price": "45000",
  "groupIds": ["whatsapp:+1234567890", "whatsapp:+0987654321"]
}
```

If `groupId` or `groupIds` are not provided, the service will use `WHATSAPP_GROUPS` or `WHATSAPP_TO_NUMBERS` from your `.env` file.

**API Endpoints:**

- `GET /whatsapp/groups` - List all configured WhatsApp groups
- `POST /whatsapp/send` - Send a message to a specific group
  ```json
  {
    "groupId": "whatsapp:+1234567890",
    "message": "Your message here"
  }
  ```

### Twilio Conversations API (WhatsApp Groups)

The service now supports Twilio Conversations API for creating and managing WhatsApp groups programmatically. This allows you to create actual group conversations with multiple participants.

**Creating a Group with Participants:**

```javascript
const WhatsAppService = require('./services/whatsapp');
const whatsapp = new WhatsAppService();

// Create a conversation (group) with multiple participants
const result = await whatsapp.createConversationWithParticipants(
  'Trading Group',
  ['+905541531807', '+38268580338']
);

console.log(`Group created: ${result.conversationSid}`);
console.log(`Participants added: ${result.totalAdded}`);
```

**Sending Messages to Conversations:**

```javascript
// Send a message to a conversation
await whatsapp.sendMessageToConversation(
  'CH44aad621d17e4a069282ae6ab36d2288',
  'Hello group!'
);

// Send formatted trading signal to a conversation
await whatsapp.sendFormattedMessageToConversation(
  'CH44aad621d17e4a069282ae6ab36d2288',
  signalData,
  chartImage
);
```

**Managing Conversations:**

```javascript
// List all conversations
const conversations = await whatsapp.listConversations();

// Get conversation details
const conversation = await whatsapp.getConversation('CHxxx');

// List participants in a conversation
const participants = await whatsapp.listConversationParticipants('CHxxx');

// Add a participant to a conversation
await whatsapp.addParticipantToConversation('CHxxx', '+1234567890');
```

**API Endpoints for Conversations:**

- `POST /whatsapp/conversations/create` - Create a new conversation with participants
  ```json
  {
    "friendlyName": "Trading Group",
    "phoneNumbers": ["+905541531807", "+38268580338"]
  }
  ```

- `GET /whatsapp/conversations` - List all conversations
- `GET /whatsapp/conversations/:conversationSid` - Get conversation details
- `GET /whatsapp/conversations/:conversationSid/participants` - List participants
- `POST /whatsapp/conversations/:conversationSid/participants` - Add a participant
  ```json
  {
    "phoneNumber": "+1234567890"
  }
  ```

- `POST /whatsapp/conversations/:conversationSid/messages` - Send a message
  ```json
  {
    "message": "Hello group!"
  }
  ```

**Test Script:**

```bash
# Create a group with participants
node test-create-conversation.js create "Trading Group" "+905541531807" "+38268580338"

# List all conversations
node test-create-conversation.js list

# Send a message to a conversation
node test-create-conversation.js send CHxxx "Hello group!"

# List participants
node test-create-conversation.js participants CHxxx
```

**Note:** Twilio Conversations API requires that participants have previously interacted with your WhatsApp Business number or you need to use approved message templates for the first message.

### Testing Scripts

#### List Active Contacts
```bash
npm run test:contacts
# or
node test-groups.js list
```

#### Test WhatsApp Groups
```bash
# List configured groups
npm run test:whatsapp-groups:list
# or
node test-whatsapp-groups.js list

# Send message to a specific group
node test-whatsapp-groups.js send "whatsapp:+1234567890" "Hello Group!"

# Send trading signal to a group
node test-whatsapp-groups.js signal "whatsapp:+1234567890"

# Send message to all configured groups
node test-whatsapp-groups.js multiple "Broadcast message"
```

#### Send Test Message
```bash
node test-groups.js send "whatsapp:+1234567890" "Hello World"
```

#### Send Test Trading Signal
```bash
node test-groups.js signal "whatsapp:+1234567890"
```

## Advanced Chart Features

### Supported Indicators (100+)

The service supports all major TradingView indicators including:

- **Moving Averages**: SMA, EMA, WMA, Hull MA, etc.
- **Oscillators**: RSI, MACD, Stochastic, Williams %R, etc.
- **Volume**: Volume Profile, OBV, Chaikin Money Flow, etc.
- **Volatility**: Bollinger Bands, ATR, Keltner Channels, etc.
- **Trend**: Ichimoku Cloud, Parabolic SAR, Super Trend, etc.

### Chart Drawings

Add professional annotations to your charts:

- **Lines**: Trend lines, horizontal/vertical lines
- **Shapes**: Rectangles, arrows, callouts
- **Fibonacci**: Retracement levels with custom colors
- **Positions**: Long/short position markers with P&L

### TradingView Session Authentication

To access premium data and private indicators:

1. Login to TradingView in your browser
2. Open Developer Tools (F12)
3. Go to Application/Storage > Cookies > tradingview.com
4. Copy values of `sessionid` and `sessionid_sign`
5. Add to your `.env` file:
   ```env
   TRADINGVIEW_SESSION_ID=your_sessionid_value
   TRADINGVIEW_SESSION_ID_SIGN=your_sessionid_sign_value
   ```

### Chart Layouts

Use custom TradingView layouts with community indicators:

1. Create a layout in TradingView with your preferred indicators
2. Share the layout and get the layout ID from the URL
3. Use `getLayoutChartUrl(layoutId, symbol, options)` method

## API Reference

### ChartService Methods

#### `getChartImage(symbol, options)`
Generate chart image buffer with advanced configuration.

#### `getChartImageUrl(symbol, options)`
Generate chart image URL for faster delivery.

#### `getLayoutChart(layoutId, symbol, options)`
Generate chart using custom TradingView layout.

#### `createSignalChart(symbol, signalData, options)`
Create optimized chart for trading signals with automatic coloring.

#### `buildChartConfig(symbol, options)`
Build comprehensive chart configuration with all advanced options.

#### `hasSessionAuth()`
Check if TradingView session authentication is configured.

### WhatsAppService Methods

#### `sendMessage(to, message)`
Send a text message to a WhatsApp number.

- `to`: WhatsApp number (e.g., `whatsapp:+1234567890`)
- `message`: Text message to send

#### `sendImageWithCaption(to, imageUrl, caption)`
Send an image with caption.

- `to`: WhatsApp number
- `imageUrl`: Public URL of the image
- `caption`: Caption text

#### `sendFormattedMessage(to, data, chartImage)`
Send a formatted trading signal message.

- `to`: WhatsApp number
- `data`: Signal data object with `title`, `datetime`, `action`, `symbol`, `price`
- `chartImage`: Optional image object with `url` property

#### `listActiveGroups()`
List active WhatsApp contacts based on recent message history.

Returns contacts from the last 30 days.

#### `getContactInfo(contactId)`
Get detailed information about a specific contact.

- `contactId`: WhatsApp contact ID (e.g., `whatsapp:+1234567890`)

#### `getMessageHistory(contactId, limit)`
Get message history for a contact.

- `contactId`: WhatsApp contact ID
- `limit`: Number of messages to retrieve (default: 20)

#### `validateConfiguration()`
Validate that all required environment variables are set.

### TelegramService Methods

#### `sendMessage(message, parseMode)`
Send a text message to the configured Telegram chat.

- `message`: Text message to send
- `parseMode`: Optional parse mode ('HTML' or 'Markdown', default: 'HTML')

#### `sendPhoto(photo, caption, parseMode)`
Send a photo with caption to Telegram.

- `photo`: Image buffer, URL string, or object with buffer property
- `caption`: Optional caption text
- `parseMode`: Optional parse mode

#### `sendFormattedMessage(signalData, chartImage)`
Send a formatted trading signal message.

- `signalData`: Signal data object with `title`, `datetime`, `action`, `symbol`, `price`
- `chartImage`: Optional image buffer or URL

#### `formatTradingViewMessage(data)`
Format TradingView webhook data into a readable message format.

#### `validateConfiguration()`
Validate that Telegram bot token and chat ID are configured.

## Important Notes

### Twilio WhatsApp Limitations

1. **Sandbox Mode**: For testing, use Twilio's WhatsApp Sandbox
2. **Production**: Requires WhatsApp Business API approval
3. **Media URLs**: Images must be publicly accessible URLs
4. **Message Templates**: Production may require pre-approved templates

### Contact Management

- Twilio doesn't have traditional "groups" like WhatsApp Web
- The service identifies "active contacts" based on recent message history
- Use `WHATSAPP_TO_NUMBERS` environment variable for configured recipients

### Error Handling

The service includes comprehensive error handling and logging:
- Failed messages fall back to text-only when possible
- Configuration validation before operations
- Detailed error logging with timestamps

## Troubleshooting

### Common Issues

1. **"Twilio client not initialized"**
   - Check your `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
   - Ensure credentials are correct

2. **"The number +1234567890 is not a valid WhatsApp endpoint"**
   - Recipient hasn't joined your Twilio WhatsApp sandbox
   - Number format should include country code

3. **"No active contacts found"**
   - No recent WhatsApp messages in the last 30 days
   - Recipients need to send messages to appear in active contacts

### Getting Help

- Check Twilio Console for detailed error logs
- Verify WhatsApp sandbox setup
- Ensure recipients have joined your sandbox

## License

ISC
