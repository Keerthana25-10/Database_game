
const router = require("express").Router();
const pool = require("../db");
const { authenticate, requireAdmin } = require("../middleware");

const statuses = [
  "upcoming",
  "registration_open",
  "ongoing",
  "completed",
  "cancelled"
];

const formats = [
  "single_elimination",
  "double_elimination",
  "round_robin"
];

const types = ["solo", "team"];

router.get("/", async (req, res) => {
  try {
    const { status, game_id } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      if (!statuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid tournament status"
        });
      }

      conditions.push("t.status = ?");
      params.push(status);
    }

    if (game_id !== undefined) {
      if (!Number.isInteger(Number(game_id)) || Number(game_id) < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid game_id"
        });
      }

      conditions.push("t.game_id = ?");
      params.push(Number(game_id));
    }

    const sql = `
      SELECT t.tournament_id, t.game_id, t.name, t.format,
             t.competitor_type, t.max_participants, t.prize_pool,
             t.start_date, t.end_date, t.status, t.created_by,
             g.game_name, g.genre, g.platform,
             (SELECT COUNT(*)
              FROM registrations r
              WHERE r.tournament_id = t.tournament_id
                AND r.status IN ('registered', 'confirmed'))
              AS registered_count
      FROM tournaments t
      JOIN games g ON g.game_id = t.game_id
      ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}
      ORDER BY t.start_date ASC
    `;

    const [tournaments] = await pool.execute(sql, params);

    res.json({
      success: true,
      count: tournaments.length,
      data: tournaments
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Could not fetch tournaments"
    });
  }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament ID"
    });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT t.*, g.game_name, g.genre, g.platform
       FROM tournaments t
       JOIN games g ON g.game_id = t.game_id
       WHERE t.tournament_id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found"
      });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Could not fetch tournament"
    });
  }
});

router.post("/", authenticate, requireAdmin, async (req, res) => {
  const b = req.body || {};

  if (
    !b.game_id ||
    !b.name ||
    !formats.includes(b.format) ||
    !types.includes(b.competitor_type) ||
    !Number.isInteger(Number(b.max_participants)) ||
    Number(b.max_participants) < 2 ||
    !b.start_date
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide game_id, name, valid format and competitor_type, max_participants >= 2, and start_date"
    });
  }

  if (b.status && !statuses.includes(b.status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament status"
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO tournaments
       (game_id, created_by, name, format, competitor_type,
        max_participants, prize_pool, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(b.game_id),
        req.user.user_id,
        String(b.name).trim(),
        b.format,
        b.competitor_type,
        Number(b.max_participants),
        b.prize_pool ?? 0,
        b.start_date,
        b.end_date || null,
        b.status || "registration_open"
      ]
    );

    res.status(201).json({
      success: true,
      message: "Tournament created",
      data: { tournament_id: result.insertId }
    });
  } catch (error) {
    console.error(error.message);

    res.status(400).json({
      success: false,
      message: "Could not create tournament. Check game_id and field values."
    });
  }
});

router.patch("/:id", authenticate, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};

  const allowed = [
    "game_id", "name", "format", "competitor_type",
    "max_participants", "prize_pool", "start_date",
    "end_date", "status"
  ];

  const keys = allowed.filter(key =>
    Object.prototype.hasOwnProperty.call(b, key)
  );

  if (!Number.isInteger(id) || id < 1 || !keys.length) {
    return res.status(400).json({
      success: false,
      message: "Valid tournament ID and editable fields are required"
    });
  }

  if (b.format && !formats.includes(b.format)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament format"
    });
  }

  if (b.competitor_type && !types.includes(b.competitor_type)) {
    return res.status(400).json({
      success: false,
      message: "Invalid competitor type"
    });
  }

  if (b.status && !statuses.includes(b.status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament status"
    });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE tournaments
       SET ${keys.map(key => `${key} = ?`).join(", ")}
       WHERE tournament_id = ?`,
      [...keys.map(key => b[key]), id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found"
      });
    }

    res.json({
      success: true,
      message: "Tournament updated"
    });
  } catch (error) {
    console.error(error.message);

    res.status(400).json({
      success: false,
      message: "Could not update tournament"
    });
  }
});

router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute(
      "DELETE FROM tournaments WHERE tournament_id = ?",
      [Number(req.params.id)]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found"
      });
    }

    res.json({
      success: true,
      message: "Tournament deleted"
    });
  } catch (error) {
    res.status(409).json({
      success: false,
      message: "Cannot delete a tournament that has related registrations or matches"
    });
  }
});

module.exports = router;
