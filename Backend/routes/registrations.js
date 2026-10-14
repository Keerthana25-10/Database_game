
const router = require("express").Router();
const pool = require("../db");
const { authenticate } = require("../middleware");

router.get("/", authenticate, async (req, res) => {
  try {
    let sql = `
      SELECT r.registration_id, r.tournament_id,
             r.player_id, r.team_id, r.status, r.registered_at,
             t.name AS tournament_name,
             p.gamer_tag, tm.team_name
      FROM registrations r
      JOIN tournaments t ON t.tournament_id = r.tournament_id
      LEFT JOIN players p ON p.player_id = r.player_id
      LEFT JOIN teams tm ON tm.team_id = r.team_id
    `;

    const params = [];

    if (req.user.role !== "admin") {
      sql += `
        WHERE r.player_id = (
          SELECT player_id FROM players WHERE user_id = ?
        )
        OR r.team_id IN (
          SELECT tm2.team_id
          FROM team_members tm2
          JOIN players p2 ON p2.player_id = tm2.player_id
          WHERE p2.user_id = ?
        )
      `;

      params.push(req.user.user_id, req.user.user_id);
    }

    const [rows] = await pool.execute(sql, params);

    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      success: false,
      message: "Could not fetch registrations"
    });
  }
});

router.post("/", authenticate, async (req, res) => {
  const { tournament_id, player_id, team_id } = req.body || {};

  if (!tournament_id || (!!player_id === !!team_id)) {
    return res.status(400).json({
      success: false,
      message: "Provide tournament_id and exactly one of player_id or team_id"
    });
  }

  try {
    const [tournaments] = await pool.execute(
      "SELECT * FROM tournaments WHERE tournament_id = ?",
      [Number(tournament_id)]
    );

    if (!tournaments.length) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found"
      });
    }

    const tournament = tournaments[0];

    if (tournament.status !== "registration_open") {
      return res.status(400).json({
        success: false,
        message: "Tournament is not open for registration"
      });
    }

    if (
      (tournament.competitor_type === "solo" && (!player_id || team_id)) ||
      (tournament.competitor_type === "team" && (!team_id || player_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "Registration type does not match the tournament"
      });
    }

    if (player_id) {
      const [players] = await pool.execute(
        "SELECT player_id FROM players WHERE player_id = ? AND user_id = ?",
        [Number(player_id), req.user.user_id]
      );

      if (!players.length && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "You can register only your own player profile"
        });
      }
    } else {
      const [teams] = await pool.execute(
        `SELECT team_id FROM teams
         WHERE team_id = ?
         AND captain_id = (
           SELECT player_id FROM players WHERE user_id = ?
         )`,
        [Number(team_id), req.user.user_id]
      );

      if (!teams.length && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Only the team captain can register the team"
        });
      }
    }

    const [counts] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM registrations
       WHERE tournament_id = ?
       AND status IN ('registered', 'confirmed')`,
      [Number(tournament_id)]
    );

    if (Number(counts[0].total) >= Number(tournament.max_participants)) {
      return res.status(409).json({
        success: false,
        message: "Tournament is full"
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO registrations
       (tournament_id, player_id, team_id, status)
       VALUES (?, ?, ?, 'registered')`,
      [
        Number(tournament_id),
        player_id ? Number(player_id) : null,
        team_id ? Number(team_id) : null
      ]
    );

    res.status(201).json({
      success: true,
      message: "Registration successful",
      data: { registration_id: result.insertId }
    });
  } catch (error) {
    console.error(error.message);

    res.status(
      error.code === "ER_DUP_ENTRY" ? 409 :
      error.code === "ER_NO_REFERENCED_ROW_2" ? 404 : 500
    ).json({
      success: false,
      message: error.code === "ER_DUP_ENTRY"
        ? "Already registered"
        : "Could not register for tournament"
    });
  }
});

router.patch("/:id/status", authenticate, async (req, res) => {
  const { status } = req.body || {};
  const allowed = [
    "registered", "confirmed", "withdrawn", "disqualified"
  ];

  if (!allowed.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid registration status"
    });
  }

  try {
    let sql = "UPDATE registrations SET status = ? WHERE registration_id = ?";
    const params = [status, Number(req.params.id)];

    if (req.user.role !== "admin") {
      sql += `
        AND (
          player_id = (SELECT player_id FROM players WHERE user_id = ?)
          OR team_id IN (
            SELECT team_id FROM teams
            WHERE captain_id = (
              SELECT player_id FROM players WHERE user_id = ?
            )
          )
        )
      `;
      params.push(req.user.user_id, req.user.user_id);
    }

    const [result] = await pool.execute(sql, params);

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Registration not found or not permitted"
      });
    }

    res.json({
      success: true,
      message: "Registration status updated"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not update registration"
    });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    let sql = "DELETE FROM registrations WHERE registration_id = ?";
    const params = [Number(req.params.id)];

    if (req.user.role !== "admin") {
      sql += `
        AND (
          player_id = (SELECT player_id FROM players WHERE user_id = ?)
          OR team_id IN (
            SELECT team_id FROM teams
            WHERE captain_id = (
              SELECT player_id FROM players WHERE user_id = ?
            )
          )
        )
      `;
      params.push(req.user.user_id, req.user.user_id);
    }

    const [result] = await pool.execute(sql, params);

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Registration not found or not permitted"
      });
    }

    res.json({
      success: true,
      message: "Registration deleted"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not delete registration"
    });
  }
});

module.exports = router;
