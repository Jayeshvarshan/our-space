const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect((err) => {
    if (err) {
        console.error('Error connecting to PostgreSQL database: ', err.message);
    } else {
        console.log('Connected to the PostgreSQL database.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    // Users table
    pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            avatar TEXT DEFAULT 'assets/avatar_default.png',
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        -- Add column if it doesn't exist
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `).catch(err => console.error("Error creating users table: ", err));

    // Messages table
    pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            sender_id TEXT NOT NULL,
            receiver_id TEXT NOT NULL,
            content TEXT,
            media_url TEXT,
            media_type TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            read_status INTEGER DEFAULT 0,
            is_edited BOOLEAN DEFAULT FALSE,
            is_deleted BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (sender_id) REFERENCES users (id),
            FOREIGN KEY (receiver_id) REFERENCES users (id)
        );
        -- Add columns if they don't exist
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
    `).catch(err => console.error("Error creating messages table: ", err));

    // Add media columns to existing tables (safe migration)
    pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT`).catch(() => {});
    pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type TEXT`).catch(() => {});
    pool.query(`ALTER TABLE messages ALTER COLUMN content DROP NOT NULL`).catch(() => {});
}

module.exports = pool;
