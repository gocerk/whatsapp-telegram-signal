const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  createdBy: { type: String, required: true },
  createDate: { type: Number, required: true },
  updatedBy: { type: String, required: true },
  updateDate: { type: Number, required: true },
  publishedBy: { type: String, required: true },
  publishDate: { type: Number, required: true },
  source: { type: String, required: true },
  locale: { type: String, required: true },
  sourceId: { type: String, required: true },
  mimeType: { type: String, required: true },
  sender: { type: mongoose.Schema.Types.Mixed, default: {} },
  tag: [{ type: String }],
  header: { type: String, required: true },
  summary: { type: String, required: true },
  content: { type: String, required: true },
  attachments: [{ type: String }]
}, {
  _id: false, // Disable automatic _id generation since we're providing our own
  timestamps: false // Disable automatic timestamps since we have custom date fields
});

const News = mongoose.model('News', newsSchema);

module.exports = News;