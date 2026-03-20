require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const session = require('express-session');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from 'public'

// Session configuration
const sessionMiddleware = session({
    secret: 'instagram_clone_super_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 } // 24 hours
});

app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
    sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// Helper function to generate specialized User ID
function generateUserId() {
    return 'IG' + Math.floor(100000 + Math.random() * 900000).toString(); // e.g. IG123456
}

// ------ API ROUTES ------

// Register
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = generateUserId();

        // Assign default avatar randomly for demo purposes
        const avatars = ['assets/avatar1.png', 'assets/avatar2.png', 'assets/avatar3.png', 'assets/avatar4.png'];
        const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];

        db.query(`INSERT INTO users (id, username, email, password_hash, avatar) VALUES ($1, $2, $3, $4, $5)`,
            [userId, username, email, hashedPassword, randomAvatar],
            (err, result) => {
                if (err) {
                    if (err.message.includes('unique constraint') || err.message.includes('duplicate key value')) {
                        return res.status(400).json({ error: 'Username or email already exists' });
                    }
                    return res.status(500).json({ error: 'Database error' });
                }

                // Set session
                req.session.userId = userId;
                res.status(201).json({ message: 'User registered successfully', userId, username, avatar: randomAvatar });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/login', (req, res) => {
    const { email_or_id, password } = req.body;

    if (!email_or_id || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    db.query(`SELECT * FROM users WHERE email = $1 OR id = $2`, [email_or_id, email_or_id], async (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Set session
        req.session.userId = user.id;
        res.status(200).json({
            message: 'Logged in successfully',
            userId: user.id,
            username: user.username,
            avatar: user.avatar
        });
    });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out successfully' });
});

// Get Current User
app.get('/api/currentUser', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    db.query(`SELECT id, username, email, avatar FROM users WHERE id = $1`, [req.session.userId], (err, result) => {
        const user = result ? result.rows[0] : null;
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });
});

// Get List of other users to chat with
app.get('/api/users', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });

    db.query(`SELECT id, username, avatar FROM users WHERE id != $1`, [req.session.userId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(result.rows);
    });
});

// Get Chat History with a specific user
app.get('/api/messages/:otherUserId', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });

    const currentUserId = req.session.userId;
    const { otherUserId } = req.params;

    db.query(`
        SELECT * FROM messages 
        WHERE (sender_id = $1 AND receiver_id = $2) 
           OR (sender_id = $3 AND receiver_id = $4)
        ORDER BY timestamp ASC
    `, [currentUserId, otherUserId, otherUserId, currentUserId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(result.rows);
    });
});

// ------ SOCKET.IO Real-time Chat ------

const connectedUsers = new Map(); // Maps userId to socket.id

io.on('connection', (socket) => {
    const session = socket.request.session;

    if (session && session.userId) {
        const userId = session.userId;
        connectedUsers.set(userId, socket.id);
        console.log(`User ${userId} connected. Socket: ${socket.id}`);

        // Broadcast online status
        io.emit('user_status', { userId, status: 'online' });

        socket.on('send_message', (data) => {
            const { receiverId, content } = data;

            if (!receiverId || !content) return;

            // Save to database
            db.query(`INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING id`,
                [userId, receiverId, content],
                (err, result) => {
                    if (err) return console.error(err);

                    const messageDoc = {
                        id: result.rows[0].id,
                        sender_id: userId,
                        receiver_id: receiverId,
                        content: content,
                        timestamp: new Date().toISOString()
                    };

                    // Send back to sender
                    socket.emit('receive_message', messageDoc);

                    // Send to receiver if online
                    const receiverSocketId = connectedUsers.get(receiverId);
                    if (receiverSocketId) {
                        io.to(receiverSocketId).emit('receive_message', messageDoc);
                    }
                }
            );
        });

        socket.on('disconnect', () => {
            connectedUsers.delete(userId);
            console.log(`User ${userId} disconnected.`);
            io.emit('user_status', { userId, status: 'offline' });
        });
    } else {
        socket.disconnect(); // Unauthenticated socket
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
