
require("dotenv").config({
  path: require("path").join(__dirname, ".env")
});

const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      message: "Backend and database are connected"
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Database connection failed"
    });
  }
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/games", require("./routes/games"));
app.use("/api/tournaments", require("./routes/tournaments"));
app.use("/api/players", require("./routes/players"));
app.use("/api/teams", require("./routes/teams"));
app.use("/api/registrations", require("./routes/registrations"));
app.use("/api/matches", require("./routes/matches"));
app.use("/api/leaderboard", require("./routes/leaderboard"));

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found"
  });
});

app.use((error, req, res, next) => {
  console.error(error.message);

  res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Gaming Tournament backend running at http://localhost:${PORT}`
  );
});
