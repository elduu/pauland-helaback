const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise"); // Use promise version for async/await
const path = require("path");
const { Telegraf } = require("telegraf");
const { startBot, stopBot } = require("./bot");

const app = express();
app.use(cors());
app.use(express.json());

// MySQL connection pool (better than single connection)
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "Admin@123",
  database: "wedding_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool
  .getConnection()
  .then((connection) => {
    console.log("MySQL Connected Successfully");
    connection.release();
  })
  .catch((err) => {
    console.error("MySQL Connection Failed:", err.message);
  });

// Root route
app.get("/", (req, res) => {
  res.send("Wedding Server is running – RSVP & Photos Ready! 💒");
});

// POST RSVP
app.post("/rsvp", async (req, res) => {
  const { name, attending, wish } = req.body;

  if (!name || !wish) {
    return res.status(400).json({ message: "Name and wish are required" });
  }

  try {
    const sql = "INSERT INTO rsvps (name, attending, wish) VALUES (?, ?, ?)";
    await pool.execute(sql, [name, attending || null, wish]);
    res.json({ message: "RSVP submitted successfully!" });
  } catch (err) {
    console.error("RSVP Error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// GET RSVPs
app.get("/rsvp", async (req, res) => {
  try {
    const [results] = await pool.execute(
      "SELECT name, wish FROM rsvps ORDER BY created_at DESC"
    );
    res.json(results);
  } catch (err) {
    console.error("Fetch RSVPs Error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// Serve uploaded photos statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// GET Wedding Photos for frontend
app.get("/api/wedding-photos", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT file_path AS url, sender, timestamp FROM wedding_photos ORDER BY timestamp DESC"
    );
    res.json(rows);
  } catch (error) {
    console.error("DB Error fetching photos:", error);
    res.status(500).json({ error: "Failed to load photos" });
  }
});

const PORT = 5000;

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);

  try {
    await startBot();
  } catch (err) {
    console.error("Failed to start Telegram bot:", err);
  }
});
process.once("SIGINT", () => {
  console.log("Shutting down gracefully (SIGINT)...");
  stopBot("SIGINT");
  process.exit(0);
});

process.once("SIGTERM", () => {
  console.log("Shutting down gracefully (SIGTERM)...");
  stopBot("SIGTERM");
  process.exit(0);
});