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

// Rate limiting: keep total daily news volume between ~5-15 spread across the day.
// MAX_NEWS_PER_RUN caps a single check; MAX_NEWS_PER_DAY caps the calendar day.
const MAX_NEWS_PER_RUN = parseInt(process.env.MAX_NEWS_PER_RUN, 10) || 2;
const MAX_NEWS_PER_DAY = parseInt(process.env.MAX_NEWS_PER_DAY, 10) || 15;

/**
 * Count how many news items were already sent today (local calendar day).
 */
async function countNewsSentToday() {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return await SentNews.countDocuments({ sentAt: { $gte: startOfDay } });
  } catch (error) {
    log('error', 'Error counting news sent today', { error: error.message });
    // On error, assume the cap is reached to avoid flooding
    return MAX_NEWS_PER_DAY;
  }
}

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
  let message = `📰 *${newsItem.header || 'Haber'}*\n\n`;
  
  if (newsItem.summary) {
    message += `${newsItem.summary}\n\n`;
  }
  
  return message;
}

/**
 * Format news item for WhatsApp
 */
function formatNewsForWhatsApp(newsItem) {
  let message = `📰 ${newsItem.header || 'Haber'}\n\n`;
  
  if (newsItem.summary) {
    message += `${newsItem.summary}\n\n`;
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

    // Respect the daily cap before doing any work
    const alreadySentToday = await countNewsSentToday();
    let remainingToday = MAX_NEWS_PER_DAY - alreadySentToday;
    // Per-run cap is the smaller of the run limit and what's left for today
    let remainingThisRun = Math.min(MAX_NEWS_PER_RUN, remainingToday);

    if (remainingThisRun <= 0) {
      log('info', 'Daily/per-run news cap reached, skipping this check', {
        alreadySentToday,
        maxPerDay: MAX_NEWS_PER_DAY,
        maxPerRun: MAX_NEWS_PER_RUN
      });
      return { success: true, newNewsCount: 0, totalChecked: allTags.length, capReached: true };
    }

    for (const tag of allTags) {
      if (remainingThisRun <= 0) break;
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
        
        // Only send up to what's left in this run's budget
        const newsToSend = newNews.slice(0, remainingThisRun);
        log('info', `Found ${newNews.length} new news items for tag: ${tag}, sending ${newsToSend.length} (budget left: ${remainingThisRun})`);

        // Send each new news item to Telegram and WhatsApp
        const telegramService = new TelegramService();
        const whatsappService = new WhatsAppService();
        // Additional Telegram group ID from environment variable (optional)
        const additionalGroupId = process.env.TELEGRAM_ADDITIONAL_CHAT_ID;
        // WhatsApp phone number for news (different from default)
        const whatsappNewsPhoneNumber = process.env.WHATSAPP_NEWS_PHONE_NUMBER;
        
        for (const newsItem of newsToSend) {
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
            remainingThisRun--;

            log('info', `News processed successfully`, {
              newsId,
              header: newsItem.header?.substring(0, 50)
            });

            // Stop once this run's budget is exhausted
            if (remainingThisRun <= 0) break;

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

