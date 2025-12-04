const mongoose = require('mongoose');
const newsService = require('./news');
const TelegramService = require('./telegram');
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
  const tags = newsItem.tag && newsItem.tag.length > 0 
    ? newsItem.tag.join(', ') 
    : 'GENEL';
  
  const publishDate = newsItem.publishDate 
    ? new Date(newsItem.publishDate).toLocaleString('tr-TR')
    : 'Tarih bilgisi yok';
  
  let message = `📰 *${newsItem.header || 'Haber'}*\n\n`;
  
  if (newsItem.summary) {
    message += `${newsItem.summary}\n\n`;
  }
  
  message += `🏷️ *Etiketler:* ${tags}\n`;
  message += `📅 *Tarih:* ${publishDate}\n`;
  
  if (newsItem.content && newsItem.content.startsWith('http')) {
    message += `\n🔗 [Detaylı haber için tıklayın](${newsItem.content})`;
  }
  
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
        
        // Filter out already sent news by checking MongoDB
        const newNews = [];
        for (const item of newsItems) {
          const newsId = item._id || item.id;
          if (!newsId) {
            log('warn', 'News item missing ID, skipping', { item });
            continue;
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
        
        // Send each new news item to Telegram
        const telegramService = new TelegramService();
        const additionalGroupId = '-1003148217444'; // Additional Telegram group ID
        
        for (const newsItem of newNews) {
          try {
            const newsId = newsItem._id || newsItem.id;
            const formattedMessage = formatNewsForTelegram(newsItem);
            
            // Send to default chat (if configured)
            if (telegramService.chatId) {
              try {
                await telegramService.sendMessage(formattedMessage, 'Markdown');
                log('info', `News sent to default Telegram chat`, {
                  newsId,
                  chatId: telegramService.chatId
                });
              } catch (error) {
                log('error', `Failed to send news to default Telegram chat`, {
                  newsId,
                  error: error.message
                });
              }
            }
            
            // Send to additional group
            try {
              await telegramService.sendMessage(formattedMessage, 'Markdown', additionalGroupId);
              log('info', `News sent to additional Telegram group`, {
                newsId,
                chatId: additionalGroupId
              });
            } catch (error) {
              log('error', `Failed to send news to additional Telegram group`, {
                newsId,
                chatId: additionalGroupId,
                error: error.message
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

