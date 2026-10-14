
const router = require("express").Router();
const pool = require("../db");
const { authenticate, requireAdmin } = require("../middleware");

router.get("/", async (req, res) => {
  try {
    const [games] = await pool.query(
      `SELECT game_id, game_name, genre, platform
       FROM games
       ORDER BY game_id`
    );

    res.json({
      success: true,
      count: games.length,
      data: games
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Could not fetch games"
    });
  }
});

router.post("/", authenticate, requireAdmin, async (req, res) => {
  const { game_name, genre, platform } = req.body || {};

  if (!game_name) {
    return res.status(400).json({
      success: false,
      message: "game_name is required"
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO games (game_name, genre, platform)
       VALUES (?, ?, ?)`,
      [game_name, genre || null, platform || null]
    );

    res.status(201).json({
      success: true,
      data: {
        game_id: result.insertId,
        game_name,
        genre: genre || null,
        platform: platform || null
      }
    });
  } catch (error) {
    console.error(error.message);

    res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      success: false,
      message: "Could not create game"
    });
  }
});

module.exports = router;
