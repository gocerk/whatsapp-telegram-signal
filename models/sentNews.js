const mongoose = require('mongoose');

const sentNewsSchema = new mongoose.Schema({
  newsId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  sentAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  header: { 
    type: String 
  },
  tag: [{ 
    type: String 
  }]
}, {
  timestamps: false
});

// Index for faster lookups
sentNewsSchema.index({ newsId: 1 });
sentNewsSchema.index({ sentAt: -1 });

const SentNews = mongoose.model('SentNews', sentNewsSchema);

module.exports = SentNews;

