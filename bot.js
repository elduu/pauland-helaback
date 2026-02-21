// bot.js - Wedding Photo Bot (Local Development - No .env needed)
const { Telegraf } = require("telegraf");
const fs = require("fs");           // ← ADD THIS LINE
const path = require("path");       // ← You probably already have this
const mysql = require("mysql2/promise");
const express = require("express");

const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
// ==================== CONFIGURATION ====================
 // ← Replace with your real token from BotFather
const BOT_TOKEN ='8376491131:AAHnCYQh_F8mKgMvNdndpx7Gc2tPTWAzkfM'; // ← Replace with your real token from BotFather
 // ← Replace with your real token!

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "Admin@123",
  database: "weddinghela_db",
  waitForConnections: true,
  connectionLimit: 10,
});
// ======================================================

const bot = new Telegraf(BOT_TOKEN);

// Create uploads folder
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Auto-create table if not exists
async function createTableIfNotExists() {
  const query = `
    CREATE TABLE IF NOT EXISTS wedding_photos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      file_id VARCHAR(255) NOT NULL UNIQUE,
      file_path VARCHAR(512) NOT NULL,
      sender VARCHAR(255),
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  try {
    await pool.execute(query);
    console.log('Table "wedding_photos" ready!');
  } catch (err) {
    console.error("Error creating table:", err.message);
  }
}

createTableIfNotExists();

// Welcome command
bot.start((ctx) =>
  ctx.reply(
    "🎉 Welcome to Our Wedding Photo Bot! 📸\n\nSend your beautiful moments from the wedding day, and they'll appear instantly on our live photo gallery! 💕"
  )
);

// Handle photo messages
// Object to track processed media groups (in-memory, resets when bot restarts)
const processedGroups = new Set();

bot.on("photo", async (ctx) => {
  try {
    const message = ctx.message;
    const photos = message.photo;
    const sender = message.from.username || message.from.first_name || "Guest";
    const mediaGroupId = message.media_group_id;

    // Save the highest resolution photo
    const photo = photos[photos.length - 1];
    const fileId = photo.file_id;

    // Download and save the photo
    const file = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error("Download failed");

    const buffer = await response.arrayBuffer();
    const fileName = `${fileId}.jpg`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(buffer));

    const webPath = `/uploads/${fileName}`;
    await pool.execute(
      "INSERT IGNORE INTO wedding_photos (file_id, file_path, sender) VALUES (?, ?, ?)",
      [fileId, webPath, sender]
    );

    // === REPLY ONLY ONCE PER ALBUM ===
    if (mediaGroupId) {
      // If this group was already processed, skip replying
      if (processedGroups.has(mediaGroupId)) {
        return; // Don't send duplicate thank-you
      }
      // Mark this group as processed
      processedGroups.add(mediaGroupId);

      // Optional: auto-clear old groups after 10 seconds (in case of stragglers)
      setTimeout(() => processedGroups.delete(mediaGroupId), 10000);
    }

    // Determine photo count and message
    const photoCount = photos.length;
    const countText = photoCount > 1 ? `${photoCount} photos` : "Your photo";

    await ctx.replyWithHTML(`
      ✨ Thank you <b>${sender}</b>!
       Your photos ${photoCount > 1 ? "are" : "is"} now live on the wedding website! ❤️
    `.trim());

  } catch (error) {
    console.error("Photo save error:", error);
    // Only reply on error if not part of a processed group
    if (!ctx.message.media_group_id || !processedGroups.has(ctx.message.media_group_id)) {
      await ctx.reply("❌ Sorry, something went wrong saving your photo(s). Please try again.");
    }
  }
});
// Launch bot
module.exports = {
  startBot: async () => {
    await bot.launch();
    console.log("🤵👰 Wedding Photo Bot is LIVE!");
  },
  stopBot: (signal) => {
    bot.stop(signal);
  },
};