"use strict";

const Mongoose = require("mongoose");
const Schema = Mongoose.Schema;

const ReplyTweetSchema = Schema({
  author: { type: Schema.Types.ObjectId, ref: "user" },
  content: String,
});

module.exports = Mongoose.model("replyTweet", ReplyTweetSchema);