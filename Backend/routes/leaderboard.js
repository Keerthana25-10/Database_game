
const router = require("express").Router();
const pool = require("../db");
const { authenticate, requireAdmin } = require("../middleware");

router.get("/", async (req, res) => {
  const tournamentId = Number(req.query.tournament_id);

  if (!Number.isInteger(tournamentId) || tournamentId < 1) {
    return res.status(400).json({
      success: false,
      message: "A valid tournament_id query parameter is required"
    });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT l.leaderboard_id, l.tournament_id,
              l.registration_id, l.matches_played, l.wins,
              l.losses, l.draws, l.points, l.rank_position,
              r.player_id, r.team_id,
              p.gamer_tag, p.full_name, t.team_name
       FROM leaderboard l
       JOIN registrations r ON r.registration_id = l.registration_id
       LEFT JOIN players p ON p.player_id = r.player_id
       LEFT JOIN teams t ON t.team_id = r.team_id
       WHERE l.tournament_id = ?
       ORDER BY l.rank_position IS NULL,
                l.rank_position, l.points DESC, l.wins DESC`,
      [tournamentId]
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Could not fetch leaderboard"
    });
  }
});

router.put("/", authenticate, requireAdmin, async (req, res) => {
  const {
    tournament_id,
    registration_id,
    matches_played = 0,
    wins = 0,
    losses = 0,
    draws = 0,
    points = 0,
    rank_position = null
  } = req.body || {};

  const stats = [
    matches_played, wins, losses, draws, points
  ];

  if (
    !tournament_id ||
    !registration_id ||
    stats.some(value =>
      !Number.isInteger(Number(value)) || Number(value) < 0
    ) ||
    (
      rank_position != null &&
      (!Number.isInteger(Number(rank_position)) || Number(rank_position) < 1)
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide valid IDs and non-negative integer statistics"
    });
  }

  try {
    await pool.execute(
      `INSERT INTO leaderboard
       (tournament_id, registration_id, matches_played,
        wins, losses, draws, points, rank_position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       matches_played = VALUES(matches_played),
       wins = VALUES(wins),
       losses = VALUES(losses),
       draws = VALUES(draws),
       points = VALUES(points),
       rank_position = VALUES(rank_position)`,
      [
        Number(tournament_id),
        Number(registration_id),
        Number(matches_played),
        Number(wins),
        Number(losses),
        Number(draws),
        Number(points),
        rank_position == null ? null : Number(rank_position)
      ]
    );

    res.json({
      success: true,
      message: "Leaderboard entry saved"
    });
  } catch (error) {
    console.error(error.message);

    res.status(400).json({
      success: false,
      message: "Could not save leaderboard entry. Check tournament and registration IDs."
    });
  }
});

module.exports = router;
