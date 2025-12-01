const axios = require('axios');
const News = require('../models/news');

const NEWS_API_URL = 'https://web-api.forinvestcdn.com/cloud-proxy/api/v3/news';
const TOKEN_URL = 'https://www.foreks.com/token/';

// Available tags
const AVAILABLE_TAGS = ['CURRENCY', 'GOLD', 'CRYPTO', 'PRODUCT'];

let cachedToken = null;
let tokenExpiry = null;

const getToken = async () => {
  try {
    // Check if we have a valid cached token
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
      return cachedToken;
    }

    // Fetch new token
    const response = await axios.get(TOKEN_URL);
    const { token, expire } = response.data;
    
    cachedToken = token;
    tokenExpiry = expire;
    
    return token;
  } catch (error) {
    console.error('Error fetching token:', error.message);
    throw new Error('Failed to get authentication token');
  }
};

const fetchLatestNews = async (locale = 'tr', tag = 'CURRENCY', last = 4) => {
  try {
    // Validate tag
    if (!AVAILABLE_TAGS.includes(tag)) {
      throw new Error(`Invalid tag. Available tags: ${AVAILABLE_TAGS.join(', ')}`);
    }

    const token = await getToken();
    
    const response = await axios.get(NEWS_API_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        source: 'PICNEWS',
        locale,
        tag,
        last
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching news:', error.message);
    throw error;
  }
};

const saveNews = async (newsData) => {
  try {
    const news = new News(newsData);
    return await news.save();
  } catch (error) {
    console.error('Error saving news:', error.message);
    throw error;
  }
};

const fetchNewsByTag = async (tag, locale = 'tr', last = 4) => {
  try {
    return await fetchLatestNews(locale, tag, last);
  } catch (error) {
    console.error(`Error fetching news for tag ${tag}:`, error.message);
    throw error;
  }
};

const fetchAllTagsNews = async (locale = 'tr', last = 4) => {
  try {
    const allNews = {};
    
    for (const tag of AVAILABLE_TAGS) {
      try {
        allNews[tag] = await fetchLatestNews(locale, tag, last);
      } catch (error) {
        console.error(`Failed to fetch news for tag ${tag}:`, error.message);
        allNews[tag] = [];
      }
    }
    
    return allNews;
  } catch (error) {
    console.error('Error fetching all tags news:', error.message);
    throw error;
  }
};

const getNewsByTags = async (tags = [], locale = 'tr', limit = 10) => {
  try {
    const query = {};
    
    if (tags.length > 0) {
      query.tag = { $in: tags };
    }
    
    if (locale) {
      query.locale = locale;
    }

    return await News.find(query)
      .sort({ publishDate: -1 })
      .limit(limit);
  } catch (error) {
    console.error('Error fetching news by tags:', error.message);
    throw error;
  }
};

const getNewsById = async (id) => {
  try {
    return await News.findById(id);
  } catch (error) {
    console.error('Error fetching news by ID:', error.message);
    throw error;
  }
};

const updateNews = async (id, updateData) => {
  try {
    updateData.updateDate = Date.now();
    return await News.findByIdAndUpdate(id, updateData, { new: true });
  } catch (error) {
    console.error('Error updating news:', error.message);
    throw error;
  }
};

const deleteNews = async (id) => {
  try {
    return await News.findByIdAndDelete(id);
  } catch (error) {
    console.error('Error deleting news:', error.message);
    throw error;
  }
};

module.exports = {
  fetchLatestNews,
  fetchNewsByTag,
  fetchAllTagsNews,
  saveNews,
  getNewsByTags,
  getNewsById,
  updateNews,
  deleteNews,
  AVAILABLE_TAGS
};