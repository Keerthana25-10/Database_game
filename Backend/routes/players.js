
const router = require("express").Router();
const pool = require("../db");
const { authenticate } = require("../middleware");

router.get("/", async (req, res) => {
  try {
    const [players] = await pool.query(
      `SELECT player_id, gamer_tag, full_name, country, created_at
       FROM players ORDER BY gamer_tag`
    );

    res.json({
      success: true,
      count: players.length,
      data: players
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      success: false,
      message: "Could not fetch players"
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [players] = await pool.execute(
      `SELECT player_id, gamer_tag, full_name, country, created_at
       FROM players WHERE player_id = ?`,
      [Number(req.params.id)]
    );

    if (!players.length) {
      return res.status(404).json({
        success: false,
        message: "Player not found"
      });
    }

    res.json({ success: true, data: players[0] });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not fetch player"
    });
  }
});

router.patch("/me", authenticate, async (req, res) => {
  const body = req.body || {};
  const allowed = ["gamer_tag", "full_name", "country"];
  const keys = allowed.filter(key =>
    Object.prototype.hasOwnProperty.call(body, key)
  );

  if (!keys.length) {
    return res.status(400).json({
      success: false,
      message: "Provide gamer_tag, full_name or country"
    });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE players
       SET ${keys.map(key => `${key} = ?`).join(", ")}
       WHERE user_id = ?`,
      [
        ...keys.map(key => body[key] === "" ? null : body[key]),
        req.user.user_id
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Player profile not found"
      });
    }

    res.json({
      success: true,
      message: "Profile updated"
    });
  } catch (error) {
    res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      success: false,
      message: error.code === "ER_DUP_ENTRY"
        ? "Gamer tag already exists"
        : "Could not update profile"
    });
  }
});

module.exports = router;
