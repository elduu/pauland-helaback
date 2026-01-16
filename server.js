require("dotenv").config(); // Load .env variables

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const path = require("path");
const { startBot, stopBot } = require("./bot");

const app = express();
app.use(cors());
app.use(express.json());

// =========================
// MySQL Connection Pool
// =========================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
});

// =========================
// Database Initialization
// =========================
async function initDatabase() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS rsvps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        attending BOOLEAN DEFAULT NULL,
        wish TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS wedding_photos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_path VARCHAR(255) NOT NULL,
        sender VARCHAR(255),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Database tables verified / created successfully");
  } catch (err) {
    console.error("Database initialization failed:", err.message);
    process.exit(1);
  }
}

// =========================
// Test DB Connection
// =========================
async function testDbConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("MySQL Connected Successfully");
    connection.release();
  } catch (err) {
    console.error("MySQL Connection Failed:", err.message);
    process.exit(1);
  }
}

// =========================
// Routes
// =========================

// Root route
app.get("/", (req, res) => {
  res.send("Wedding Server is running – RSVP & Photos Ready!");
});

// POST RSVP
app.post("/rsvp", async (req, res) => {
  const { name, attending, wish } = req.body;

  if (!name || !wish) {
    return res.status(400).json({
      message: "Name and wish are required",
    });
  }

  try {
    const sql =
      "INSERT INTO rsvps (name, attending, wish) VALUES (?, ?, ?)";
    await pool.execute(sql, [name, attending ?? null, wish]);

    res.json({
      message: "RSVP submitted successfully!",
    });
  } catch (err) {
    console.error("RSVP Error:", err);
    res.status(500).json({
      message: "Database error",
    });
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
    res.status(500).json({
      message: "Database error",
    });
  }
});

// Serve uploaded photos statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// GET Wedding Photos
app.get("/api/wedding-photos", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT 
         file_path AS url,
         sender,
         timestamp
       FROM wedding_photos
       ORDER BY timestamp DESC`
    );

    res.json(rows);
  } catch (error) {
    console.error("DB Error fetching photos:", error);
    res.status(500).json({
      error: "Failed to load photos",
    });
  }
});

// =========================
// Server Startup
// =========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);

  await testDbConnection();
  await initDatabase();

  try {
    await startBot();
  } catch (err) {
    console.error("Failed to start Telegram bot:", err);
  }
});

// =========================
// Graceful Shutdown
// =========================
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
