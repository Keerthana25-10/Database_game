CREATE DATABASE gaming_tournament_db;
USE gaming_tournament_db;

CREATE TABLE IF NOT EXISTS users (
    user_id        INT AUTO_INCREMENT PRIMARY KEY,
    username       VARCHAR(50)  NOT NULL UNIQUE,
    email          VARCHAR(100) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           ENUM('player','admin') NOT NULL DEFAULT 'player',
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
); 

CREATE TABLE IF NOT EXISTS players (
    player_id   INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL UNIQUE,
    gamer_tag   VARCHAR(50) NOT NULL UNIQUE,
    full_name   VARCHAR(100) NOT NULL,
    country     VARCHAR(50),
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_players_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS games (
    game_id    INT AUTO_INCREMENT PRIMARY KEY,
    game_name  VARCHAR(100) NOT NULL UNIQUE,
    genre      VARCHAR(50),
    platform   VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS tournaments (
    tournament_id    INT AUTO_INCREMENT PRIMARY KEY,
    game_id          INT NOT NULL,
    created_by       INT NOT NULL,
    name             VARCHAR(150) NOT NULL,
    format           ENUM('single_elimination','double_elimination','round_robin') NOT NULL DEFAULT 'single_elimination',
    competitor_type  ENUM('solo','team') NOT NULL,
    max_participants INT NOT NULL,
    prize_pool       DECIMAL(10,2) NOT NULL DEFAULT 0,
    start_date       DATE NOT NULL,
    end_date         DATE NOT NULL,
    status           ENUM('upcoming','registration_open','ongoing','completed','cancelled') NOT NULL DEFAULT 'upcoming',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tournaments_game  FOREIGN KEY (game_id)    REFERENCES games(game_id),
    CONSTRAINT fk_tournaments_admin FOREIGN KEY (created_by) REFERENCES users(user_id),
    CONSTRAINT chk_tournament_capacity CHECK (max_participants >= 2),
    CONSTRAINT chk_tournament_dates    CHECK (end_date >= start_date),
    CONSTRAINT chk_tournament_prize    CHECK (prize_pool >= 0),
    INDEX idx_tournaments_status (status)
);

CREATE TABLE IF NOT EXISTS teams (
    team_id     INT AUTO_INCREMENT PRIMARY KEY,
    team_name   VARCHAR(100) NOT NULL UNIQUE,
    captain_id  INT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_teams_captain FOREIGN KEY (captain_id) REFERENCES players(player_id)
);

CREATE TABLE IF NOT EXISTS team_members (
    team_id    INT NOT NULL,
    player_id  INT NOT NULL,
    joined_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (team_id, player_id),
    CONSTRAINT fk_tm_team   FOREIGN KEY (team_id)   REFERENCES teams(team_id)     ON DELETE CASCADE,
    CONSTRAINT fk_tm_player FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS registrations (
    registration_id  INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id    INT NOT NULL,
    player_id        INT NULL,
    team_id          INT NULL,
    status           ENUM('registered','confirmed','withdrawn','disqualified') NOT NULL DEFAULT 'registered',
    registered_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reg_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id),
    CONSTRAINT fk_reg_player     FOREIGN KEY (player_id)     REFERENCES players(player_id),
    CONSTRAINT fk_reg_team       FOREIGN KEY (team_id)       REFERENCES teams(team_id),
    CONSTRAINT chk_reg_one_competitor CHECK (
        (player_id IS NOT NULL AND team_id IS NULL) OR
        (player_id IS NULL AND team_id IS NOT NULL)
    ),
    UNIQUE KEY uq_reg_player (tournament_id, player_id),
    UNIQUE KEY uq_reg_team   (tournament_id, team_id),
    UNIQUE KEY uq_reg_in_tournament (registration_id, tournament_id)
);

CREATE TABLE IF NOT EXISTS matches (
    match_id        INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id   INT NOT NULL,
    round_number    INT NOT NULL DEFAULT 1,
    competitor1_id  INT NOT NULL,
    competitor2_id  INT NULL,
    scheduled_at    DATETIME NOT NULL,
    status          ENUM('scheduled','live','completed','cancelled') NOT NULL DEFAULT 'scheduled',
    CONSTRAINT fk_match_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id),
    CONSTRAINT fk_match_comp1 FOREIGN KEY (competitor1_id, tournament_id)
        REFERENCES registrations(registration_id, tournament_id),
    CONSTRAINT fk_match_comp2 FOREIGN KEY (competitor2_id, tournament_id)
        REFERENCES registrations(registration_id, tournament_id),
    CONSTRAINT chk_match_different CHECK (competitor1_id <> competitor2_id),
    CONSTRAINT chk_match_round     CHECK (round_number >= 1),
    INDEX idx_matches_schedule (tournament_id, scheduled_at)
);

CREATE TABLE IF NOT EXISTS results (
    result_id            INT AUTO_INCREMENT PRIMARY KEY,
    match_id             INT NOT NULL UNIQUE,
    winner_registration  INT NULL,
    score1               INT NOT NULL DEFAULT 0,
    score2               INT NOT NULL DEFAULT 0,
    recorded_by          INT NOT NULL,
    recorded_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_result_match  FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
    CONSTRAINT fk_result_winner FOREIGN KEY (winner_registration) REFERENCES registrations(registration_id),
    CONSTRAINT fk_result_admin  FOREIGN KEY (recorded_by) REFERENCES users(user_id),
    CONSTRAINT chk_result_scores CHECK (score1 >= 0 AND score2 >= 0)
);

CREATE TABLE IF NOT EXISTS leaderboard (
    leaderboard_id   INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id    INT NOT NULL,
    registration_id  INT NOT NULL,
    matches_played   INT NOT NULL DEFAULT 0,
    wins             INT NOT NULL DEFAULT 0,
    losses           INT NOT NULL DEFAULT 0,
    draws            INT NOT NULL DEFAULT 0,
    points           INT NOT NULL DEFAULT 0,
    rank_position    INT NULL,
    CONSTRAINT fk_lb_registration FOREIGN KEY (registration_id, tournament_id)
        REFERENCES registrations(registration_id, tournament_id),
    UNIQUE KEY uq_lb_entry (tournament_id, registration_id),
    CONSTRAINT chk_lb_values CHECK (matches_played >= 0 AND wins >= 0 AND losses >= 0 AND draws >= 0 AND points >= 0),
    INDEX idx_lb_ranking (tournament_id, points DESC)
);

INSERT IGNORE INTO games (game_name, genre, platform) VALUES
    ('Valorant',     'FPS',           'PC'),
    ('BGMI',         'Battle Royale', 'Mobile'),
    ('EA SPORTS FC', 'Sports',        'PC/Console'),
    ('Chess',        'Strategy',      'Online');





