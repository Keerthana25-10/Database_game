
const router = require("express").Router();
const pool = require("../db");
const { authenticate } = require("../middleware");

router.get("/", async (req, res) => {
  try {
    const [teams] = await pool.query(`
      SELECT t.team_id, t.team_name, t.captain_id,
             p.gamer_tag AS captain_gamer_tag,
             COUNT(tm.player_id) AS member_count
      FROM teams t
      JOIN players p ON p.player_id = t.captain_id
      LEFT JOIN team_members tm ON tm.team_id = t.team_id
      GROUP BY t.team_id, t.team_name, t.captain_id, p.gamer_tag
      ORDER BY t.team_name
    `);

    res.json({
      success: true,
      count: teams.length,
      data: teams
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      success: false,
      message: "Could not fetch teams"
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [teams] = await pool.execute(
      `SELECT team_id, team_name, captain_id, created_at
       FROM teams WHERE team_id = ?`,
      [id]
    );

    if (!teams.length) {
      return res.status(404).json({
        success: false,
        message: "Team not found"
      });
    }

    const [members] = await pool.execute(
      `SELECT p.player_id, p.gamer_tag, p.full_name, p.country
       FROM team_members tm
       JOIN players p ON p.player_id = tm.player_id
       WHERE tm.team_id = ?
       ORDER BY p.gamer_tag`,
      [id]
    );

    res.json({
      success: true,
      data: { ...teams[0], members }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not fetch team"
    });
  }
});

router.post("/", authenticate, async (req, res) => {
  const { team_name } = req.body || {};

  if (!team_name || !String(team_name).trim()) {
    return res.status(400).json({
      success: false,
      message: "team_name is required"
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [players] = await connection.execute(
      "SELECT player_id FROM players WHERE user_id = ?",
      [req.user.user_id]
    );

    if (!players.length) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: "A player profile is required to create a team"
      });
    }

    const [result] = await connection.execute(
      "INSERT INTO teams (team_name, captain_id) VALUES (?, ?)",
      [String(team_name).trim(), players[0].player_id]
    );

    await connection.execute(
      "INSERT INTO team_members (team_id, player_id) VALUES (?, ?)",
      [result.insertId, players[0].player_id]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Team created",
      data: {
        team_id: result.insertId,
        team_name: String(team_name).trim()
      }
    });
  } catch (error) {
    await connection.rollback();

    res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      success: false,
      message: error.code === "ER_DUP_ENTRY"
        ? "Team name already exists"
        : "Could not create team"
    });
  } finally {
    connection.release();
  }
});

router.post("/:id/members", authenticate, async (req, res) => {
  const teamId = Number(req.params.id);
  const playerId = Number(req.body?.player_id);

  if (!Number.isInteger(teamId) || teamId < 1 ||
      !Number.isInteger(playerId) || playerId < 1) {
    return res.status(400).json({
      success: false,
      message: "Valid team ID and player_id are required"
    });
  }

  try {
    const [teams] = await pool.execute(
      `SELECT team_id FROM teams
       WHERE team_id = ?
       AND captain_id = (
         SELECT player_id FROM players WHERE user_id = ?
       )`,
      [teamId, req.user.user_id]
    );

    if (!teams.length) {
      return res.status(403).json({
        success: false,
        message: "Only the team captain can add members"
      });
    }

    await pool.execute(
      "INSERT INTO team_members (team_id, player_id) VALUES (?, ?)",
      [teamId, playerId]
    );

    res.status(201).json({
      success: true,
      message: "Team member added"
    });
  } catch (error) {
    res.status(
      error.code === "ER_DUP_ENTRY" ? 409 :
      error.code === "ER_NO_REFERENCED_ROW_2" ? 404 : 500
    ).json({
      success: false,
      message: error.code === "ER_DUP_ENTRY"
        ? "Player is already on this team"
        : "Could not add member; check the player and team IDs"
    });
  }
});

module.exports = router;
