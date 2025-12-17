const mongoose = require('mongoose');
const newsService = require('./news');
const TelegramService = require('./telegram');
const WhatsAppService = require('./whatsapp');
const SentNews = require('../models/sentNews');

// Logging utility
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] NEWS_CHECKER ${level.toUpperCase()}: ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
};

/**
 * Check if news was already sent
 */
async function isNewsAlreadySent(newsId) {
  try {
    const sentNews = await SentNews.findOne({ newsId });
    return !!sentNews;
  } catch (error) {
    log('error', 'Error checking if news was sent', { error: error.message, newsId });
    // If there's an error, assume it's not sent to avoid missing news
    return false;
  }
}

/**
 * Mark news as sent in MongoDB
 */
async function markNewsAsSent(newsItem) {
  try {
    const newsId = newsItem._id || newsItem.id;
    if (!newsId) {
      log('warn', 'Cannot mark news as sent - no ID found', { newsItem });
      return;
    }

    await SentNews.findOneAndUpdate(
      { newsId },
      {
        newsId,
        header: newsItem.header,
        tag: newsItem.tag || [],
        sentAt: new Date()
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    log('error', 'Error marking news as sent', { 
      error: error.message, 
      newsId: newsItem._id || newsItem.id 
    });
  }
}

/**
 * Get all sent news IDs (for bulk checking if needed)
 */
async function getAllSentNewsIds() {
  try {
    const sentNews = await SentNews.find({}, 'newsId').lean();
    return new Set(sentNews.map(item => item.newsId));
  } catch (error) {
    log('error', 'Error getting sent news IDs', { error: error.message });
    return new Set();
  }
}

/**
 * Format news item for Telegram
 */
function formatNewsForTelegram(newsItem) {
  const publishDate = newsItem.publishDate 
    ? new Date(newsItem.publishDate).toLocaleString('tr-TR')
    : 'Tarih bilgisi yok';
  
  let message = `📰 *${newsItem.header || 'Haber'}*\n\n`;
  
  if (newsItem.summary) {
    message += `${newsItem.summary}\n\n`;
  }
  
  message += `📅 *Tarih:* ${publishDate}\n`;
  
  return message;
}

/**
 * Format news item for WhatsApp
 */
function formatNewsForWhatsApp(newsItem) {
  const publishDate = newsItem.publishDate 
    ? new Date(newsItem.publishDate).toLocaleString('tr-TR')
    : 'Tarih bilgisi yok';
  
  let message = `📰 ${newsItem.header || 'Haber'}\n\n`;
  
  if (newsItem.summary) {
    message += `${newsItem.summary}\n\n`;
  }
  
  message += `📅 Tarih: ${publishDate}`;
  
  return message;
}

/**
 * Check for new news and send to Telegram
 */
async function checkAndSendNewNews() {
  try {
    log('info', 'Checking for new news...');
    
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      log('warn', 'MongoDB not connected, attempting to connect...');
      // MongoDB connection should be handled in main.js, but we can check here
      if (!process.env.MONGODB_URI && !mongoose.connection.host) {
        log('error', 'MongoDB connection not available');
        return {
          success: false,
          error: 'MongoDB connection not available'
        };
      }
    }
    
    // Fetch latest news for all available tags
    const allTags = newsService.AVAILABLE_TAGS;
    let newNewsCount = 0;
    
    for (const tag of allTags) {
      try {
        log('info', `Fetching news for tag: ${tag}`);
        const newsItems = await newsService.fetchLatestNews('tr', tag, 10);
        
        if (!Array.isArray(newsItems) || newsItems.length === 0) {
          log('info', `No news found for tag: ${tag}`);
          continue;
        }
        
        // Filter out already sent news and news older than 2 days
        const newNews = [];
        const now = new Date();
        const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000)); // 2 days ago
        
        for (const item of newsItems) {
          const newsId = item._id || item.id;
          if (!newsId) {
            log('warn', 'News item missing ID, skipping', { item });
            continue;
          }
          
          // Check if news is older than 2 days
          if (item.publishDate) {
            const publishDate = new Date(item.publishDate);
            if (isNaN(publishDate.getTime())) {
              log('warn', 'Invalid publishDate format, skipping date filter', {
                newsId,
                publishDate: item.publishDate
              });
            } else if (publishDate < twoDaysAgo) {
              log('info', 'News is older than 2 days, skipping', {
                newsId,
                publishDate: publishDate.toISOString(),
                daysOld: Math.floor((now - publishDate) / (24 * 60 * 60 * 1000))
              });
              continue;
            }
          } else {
            // If no publishDate, we'll include it but log a warning
            log('warn', 'News item missing publishDate, including anyway', {
              newsId,
              header: item.header?.substring(0, 50)
            });
          }
          
          const alreadySent = await isNewsAlreadySent(newsId);
          if (!alreadySent) {
            newNews.push(item);
          }
        }
        
        if (newNews.length === 0) {
          log('info', `No new news for tag: ${tag}`);
          continue;
        }
        
        log('info', `Found ${newNews.length} new news items for tag: ${tag}`);
        
        // Send each new news item to Telegram and WhatsApp
        const telegramService = new TelegramService();
        const whatsappService = new WhatsAppService();
        // Additional Telegram group ID from environment variable (optional)
        const additionalGroupId = process.env.TELEGRAM_ADDITIONAL_CHAT_ID || '-1003148217444';
        // WhatsApp phone number for news (different from default)
        const whatsappNewsPhoneNumber = process.env.WHATSAPP_NEWS_PHONE_NUMBER;
        
        for (const newsItem of newNews) {
          try {
            const newsId = newsItem._id || newsItem.id;
            const formattedTelegramMessage = formatNewsForTelegram(newsItem);
            const formattedWhatsAppMessage = formatNewsForWhatsApp(newsItem);
            
            // Send to Telegram
            if (additionalGroupId) {
              try {
                await telegramService.sendMessage(formattedTelegramMessage, 'Markdown', additionalGroupId);
                log('info', `News sent to Telegram group`, {
                  newsId,
                  chatId: additionalGroupId
                });
              } catch (error) {
                const errorCode = error.response?.data?.error_code;
                const errorDescription = error.response?.data?.description || error.message;
                
                if (errorCode === 400 && errorDescription?.includes('chat not found')) {
                  log('warn', `Bot is not in the Telegram group. Please add the bot to the group with chat ID: ${additionalGroupId}`, {
                    newsId,
                    chatId: additionalGroupId,
                    solution: 'Add the bot to the group/channel or set TELEGRAM_ADDITIONAL_CHAT_ID in environment variables'
                  });
                } else {
                  log('error', `Failed to send news to Telegram group`, {
                    newsId,
                    chatId: additionalGroupId,
                    error: errorDescription
                  });
                }
              }
            } else {
              log('warn', 'TELEGRAM_ADDITIONAL_CHAT_ID not configured, skipping news send', {
                newsId
              });
            }
            
            // Send to WhatsApp (different number)
            if (whatsappNewsPhoneNumber) {
              try {
                await whatsappService.sendMessageToPerson(whatsappNewsPhoneNumber, formattedWhatsAppMessage);
                log('info', `News sent to WhatsApp`, {
                  newsId,
                  phoneNumber: whatsappNewsPhoneNumber
                });
              } catch (error) {
                log('error', `Failed to send news to WhatsApp`, {
                  newsId,
                  phoneNumber: whatsappNewsPhoneNumber,
                  error: error.message
                });
              }
            } else {
              log('warn', 'WHATSAPP_NEWS_PHONE_NUMBER not configured, skipping WhatsApp send', {
                newsId
              });
            }
            
            // Mark as sent in MongoDB (only if at least one send succeeded)
            await markNewsAsSent(newsItem);
            newNewsCount++;
            
            log('info', `News processed successfully`, {
              newsId,
              header: newsItem.header?.substring(0, 50)
            });
            
            // Small delay between messages to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            log('error', `Failed to process news`, {
              newsId: newsItem._id || newsItem.id,
              error: error.message
            });
            // Continue with next news item even if one fails
          }
        }
        
      } catch (error) {
        log('error', `Error fetching news for tag ${tag}`, {
          error: error.message
        });
        // Continue with next tag even if one fails
      }
    }
    
    log('info', `News check completed. ${newNewsCount} new news items sent.`);
    
    return {
      success: true,
      newNewsCount,
      totalChecked: allTags.length
    };
    
  } catch (error) {
    log('error', 'Error in checkAndSendNewNews', {
      error: error.message,
      stack: error.stack
    });
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  checkAndSendNewNews,
  isNewsAlreadySent,
  markNewsAsSent,
  getAllSentNewsIds
};

