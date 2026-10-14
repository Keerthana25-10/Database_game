
const router = require("express").Router();
const pool = require("../db");
const { authenticate, requireAdmin } = require("../middleware");

router.get("/", async (req, res) => {
  const conditions = [];
  const params = [];

  if (req.query.tournament_id) {
    conditions.push("m.tournament_id = ?");
    params.push(Number(req.query.tournament_id));
  }

  const allowedStatuses = [
    "scheduled", "live", "completed", "cancelled"
  ];

  if (req.query.status) {
    if (!allowedStatuses.includes(req.query.status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid match status"
      });
    }

    conditions.push("m.status = ?");
    params.push(req.query.status);
  }

  try {
    const sql = `
      SELECT m.match_id, m.tournament_id, m.round_number,
             m.competitor1_id, m.competitor2_id,
             m.scheduled_at, m.status,
             t.name AS tournament_name,
             r1.player_id AS player1_id,
             r1.team_id AS team1_id,
             p1.gamer_tag AS player1_gamer_tag,
             tm1.team_name AS team1_name,
             r2.player_id AS player2_id,
             r2.team_id AS team2_id,
             p2.gamer_tag AS player2_gamer_tag,
             tm2.team_name AS team2_name,
             z.winner_registration, z.score1, z.score2
      FROM matches m
      JOIN tournaments t ON t.tournament_id = m.tournament_id
      JOIN registrations r1 ON r1.registration_id = m.competitor1_id
      LEFT JOIN players p1 ON p1.player_id = r1.player_id
      LEFT JOIN teams tm1 ON tm1.team_id = r1.team_id
      LEFT JOIN registrations r2 ON r2.registration_id = m.competitor2_id
      LEFT JOIN players p2 ON p2.player_id = r2.player_id
      LEFT JOIN teams tm2 ON tm2.team_id = r2.team_id
      LEFT JOIN results z ON z.match_id = m.match_id
      ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}
      ORDER BY m.tournament_id, m.round_number, m.match_id
    `;

    const [matches] = await pool.execute(sql, params);

    res.json({
      success: true,
      count: matches.length,
      data: matches
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Could not fetch matches"
    });
  }
});

router.post("/", authenticate, requireAdmin, async (req, res) => {
  const {
    tournament_id,
    round_number,
    competitor1_id,
    competitor2_id,
    scheduled_at
  } = req.body || {};

  if (
    !tournament_id ||
    !Number.isInteger(Number(round_number)) ||
    Number(round_number) < 1 ||
    !competitor1_id
  ) {
    return res.status(400).json({
      success: false,
      message: "tournament_id, round_number >= 1 and competitor1_id are required"
    });
  }

  if (
    competitor2_id &&
    Number(competitor1_id) === Number(competitor2_id)
  ) {
    return res.status(400).json({
      success: false,
      message: "Competitors must be different"
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO matches
       (tournament_id, round_number, competitor1_id,
        competitor2_id, scheduled_at, status)
       VALUES (?, ?, ?, ?, ?, 'scheduled')`,
      [
        Number(tournament_id),
        Number(round_number),
        Number(competitor1_id),
        competitor2_id ? Number(competitor2_id) : null,
        scheduled_at || null
      ]
    );

    res.status(201).json({
      success: true,
      message: "Match created",
      data: { match_id: result.insertId }
    });
  } catch (error) {
    console.error(error.message);

    res.status(400).json({
      success: false,
      message: "Could not create match. Check tournament and registration IDs."
    });
  }
});

router.patch("/:id/status", authenticate, requireAdmin, async (req, res) => {
  const { status } = req.body || {};

  if (!["scheduled", "live", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid match status"
    });
  }

  try {
    const [result] = await pool.execute(
      "UPDATE matches SET status = ? WHERE match_id = ?",
      [status, Number(req.params.id)]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Match not found"
      });
    }

    res.json({
      success: true,
      message: "Match status updated"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not update match status"
    });
  }
});

router.post("/:id/result", authenticate, requireAdmin, async (req, res) => {
  const { winner_registration, score1, score2 } = req.body || {};

  if (
    !Number.isInteger(Number(score1)) || Number(score1) < 0 ||
    !Number.isInteger(Number(score2)) || Number(score2) < 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Scores must be non-negative integers"
    });
  }

  try {
    const [matches] = await pool.execute(
      "SELECT * FROM matches WHERE match_id = ?",
      [Number(req.params.id)]
    );

    if (!matches.length) {
      return res.status(404).json({
        success: false,
        message: "Match not found"
      });
    }

    const match = matches[0];

    if (
      winner_registration != null &&
      ![
        Number(match.competitor1_id),
        Number(match.competitor2_id)
      ].includes(Number(winner_registration))
    ) {
      return res.status(400).json({
        success: false,
        message: "Winner must be one of this match's competitors"
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.execute(
        `INSERT INTO results
         (match_id, winner_registration, score1, score2, recorded_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         winner_registration = VALUES(winner_registration),
         score1 = VALUES(score1),
         score2 = VALUES(score2),
         recorded_by = VALUES(recorded_by),
         recorded_at = CURRENT_TIMESTAMP`,
        [
          Number(req.params.id),
          winner_registration == null ? null : Number(winner_registration),
          Number(score1),
          Number(score2),
          req.user.user_id
        ]
      );

      await connection.execute(
        "UPDATE matches SET status = 'completed' WHERE match_id = ?",
        [Number(req.params.id)]
      );

      await connection.commit();

      res.json({
        success: true,
        message: "Match result saved"
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Could not save match result"
    });
  }
});

module.exports = router;
