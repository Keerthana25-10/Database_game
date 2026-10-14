
const router = require("express").Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { authenticate } = require("../middleware");

router.post("/register", async (req, res) => {
  const {
    username,
    email,
    password,
    gamer_tag,
    full_name,
    country
  } = req.body || {};

  if (!username || !email || !password || !gamer_tag || !full_name) {
    return res.status(400).json({
      success: false,
      message: "username, email, password, gamer_tag and full_name are required"
    });
  }

  if (String(password).length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters"
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const passwordHash = await bcrypt.hash(String(password), 12);

    const [userResult] = await connection.execute(
      `INSERT INTO users
       (username, email, password_hash, role)
       VALUES (?, ?, ?, 'player')`,
      [
        String(username).trim(),
        String(email).trim().toLowerCase(),
        passwordHash
      ]
    );

    const [playerResult] = await connection.execute(
      `INSERT INTO players
       (user_id, gamer_tag, full_name, country)
       VALUES (?, ?, ?, ?)`,
      [
        userResult.insertId,
        String(gamer_tag).trim(),
        String(full_name).trim(),
        country || null
      ]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      data: {
        user_id: userResult.insertId,
        player_id: playerResult.insertId,
        username,
        email,
        role: "player"
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error(error.message);

    res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
      success: false,
      message: error.code === "ER_DUP_ENTRY"
        ? "Username, email or gamer tag already exists"
        : "Could not register account"
    });
  } finally {
    connection.release();
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required"
    });
  }

  try {
    const [users] = await pool.execute(
      `SELECT user_id, username, email, password_hash, role
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [String(email).trim().toLowerCase()]
    );

    if (
      !users.length ||
      !(await bcrypt.compare(String(password), users[0].password_hash))
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const user = users[0];

    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      data: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Could not log in"
    });
  }
});

router.get("/me", authenticate, async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT u.user_id, u.username, u.email, u.role,
              u.created_at, p.player_id, p.gamer_tag,
              p.full_name, p.country
       FROM users u
       LEFT JOIN players p ON p.user_id = u.user_id
       WHERE u.user_id = ?`,
      [req.user.user_id]
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({ success: true, data: users[0] });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Could not load profile"
    });
  }
});

module.exports = router;
