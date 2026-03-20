document.addEventListener("DOMContentLoaded", async () => {
    let currentUser = null;
    let activeChatUserId = null;
    let activeChatAvatar = null;
    let activeChatUsername = null;
    let socket = null;
    let allUsers = [];

    const mainApp = document.getElementById("main-app");
    const chatList = document.getElementById("chat-list");
    const chatMessages = document.getElementById("chat-messages");
    const activeChatArea = document.getElementById("active-chat-area");
    const noChatSelectedArea = document.getElementById("no-chat-selected");

    // Auth Check
    try {
        const res = await fetch('/api/currentUser');
        if (!res.ok) throw new Error('Not logged in');
        currentUser = await res.json();

        mainApp.style.display = 'flex';
        document.getElementById('sidebar-username').textContent = currentUser.username;
        document.getElementById('current-user-name').textContent = currentUser.username;
        document.getElementById('current-user-avatar').src = currentUser.avatar;

        initApp();
    } catch (err) {
        window.location.href = '/login.html';
    }

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    });

    async function initApp() {
        // Init Socket
        socket = io();

        socket.on('receive_message', (msg) => {
            // Check if message belongs to active chat
            if ((msg.sender_id === activeChatUserId && msg.receiver_id === currentUser.id) ||
                (msg.sender_id === currentUser.id && msg.receiver_id === activeChatUserId)) {

                appendMessage(msg,
                    msg.sender_id === currentUser.id ? true : false,
                    msg.sender_id === currentUser.id ? currentUser.avatar : activeChatAvatar
                );
                scrollToBottom();
            }

            // Update sidebar preview
            const otherId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
            updateChatPreview(otherId, msg.content, msg.sender_id === currentUser.id);
        });

        socket.on('user_status', ({ userId, status }) => {
            const dot = document.getElementById(`status-${userId}`);
            if (dot) {
                if (status === 'online') dot.classList.remove('offline');
                else dot.classList.add('offline');
            }
        });

        // Load Users
        await loadUsers();
    }

    async function loadUsers() {
        try {
            const res = await fetch('/api/users');
            allUsers = await res.json();

            chatList.innerHTML = '';

            if (allUsers.length === 0) {
                chatList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No other users found.</div>';
                return;
            }

            allUsers.forEach(user => {
                const chatItem = document.createElement('div');
                chatItem.className = 'chat-item';
                chatItem.id = `chat-item-${user.id}`;
                chatItem.setAttribute('data-user-id', user.id);
                chatItem.setAttribute('data-username', user.username);
                chatItem.setAttribute('data-avatar', user.avatar);

                chatItem.innerHTML = `
                    <img src="${user.avatar}" alt="${user.username}" class="avatar">
                    <div class="chat-info">
                        <span class="chat-name">${user.username} <span style="color:var(--text-secondary); font-size: 11px; font-weight:normal;">(${user.id})</span></span>
                        <span class="chat-preview" id="preview-${user.id}">Tap to chat</span>
                    </div>
                    <div class="status-dot offline" id="status-${user.id}"></div>
                `;

                chatItem.addEventListener('click', () => selectChat(user.id, user.username, user.avatar));
                chatList.appendChild(chatItem);
            });
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    async function selectChat(userId, username, avatar) {
        // Active handling
        document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active-chat'));
        document.getElementById(`chat-item-${userId}`).classList.add('active-chat');

        activeChatUserId = userId;
        activeChatUsername = username;
        activeChatAvatar = avatar;

        noChatSelectedArea.style.display = 'none';
        activeChatArea.style.display = 'flex';

        // Update header
        document.getElementById('header-name').textContent = username;
        document.getElementById('header-avatar').src = avatar;

        // Fetch messages
        chatMessages.innerHTML = '<div style="text-align:center; margin-top: 20px;">Loading messages...</div>';
        try {
            const res = await fetch(`/api/messages/${userId}`);
            const messages = await res.json();

            chatMessages.innerHTML = '';

            if (messages.length === 0) {
                const timestamp = document.createElement("div");
                timestamp.className = "message-timestamp";
                timestamp.textContent = "Start of a new conversation";
                chatMessages.appendChild(timestamp);
            } else {
                messages.forEach(msg => {
                    const isSent = msg.sender_id === currentUser.id;
                    const msgAvatar = isSent ? currentUser.avatar : activeChatAvatar;
                    appendMessage(msg, isSent, msgAvatar);
                });
                scrollToBottom();
            }
        } catch (error) {
            chatMessages.innerHTML = '<div style="text-align:center; color:red; margin-top:20px;">Error loading messages</div>';
        }
    }

    function appendMessage(msg, isSent, avatarSrc) {
        const messageWrapper = document.createElement("div");
        messageWrapper.className = `message ${isSent ? 'sent' : 'received'}`;

        // Only show avatar for received messages to match Instagram style
        const avatarHtml = !isSent ? `<img src="${avatarSrc}" alt="User" class="avatar-tiny message-avatar">` : '';

        messageWrapper.innerHTML = `
            ${avatarHtml}
            <div class="message-bubble">${msg.content}</div>
        `;

        chatMessages.appendChild(messageWrapper);
    }

    function updateChatPreview(userId, text, isYou) {
        const previewEl = document.getElementById(`preview-${userId}`);
        const chatItem = document.getElementById(`chat-item-${userId}`);
        if (previewEl && chatItem) {
            previewEl.textContent = isYou ? `You: ${text}` : text;
            previewEl.style.fontWeight = isYou ? 'normal' : '600';
            previewEl.style.color = isYou ? 'var(--text-secondary)' : 'var(--text-primary)';

            // Move item to top
            chatList.insertBefore(chatItem, chatList.firstChild);
        }
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Search Logic
    const searchInput = document.getElementById("user-search-input");
    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        const chatItems = document.querySelectorAll(".chat-item");

        chatItems.forEach(item => {
            const username = item.getAttribute("data-username").toLowerCase();
            const userId = item.getAttribute("data-user-id").toLowerCase();

            if (username.includes(query) || userId.includes(query)) {
                item.style.display = "flex";
            } else {
                item.style.display = "none";
            }
        });
    });

    // Sending Logic
    const messageInput = document.getElementById("message-input");
    const sendBtn = document.getElementById("send-btn");
    const inputActions = document.querySelector(".input-actions");

    messageInput.addEventListener("input", (e) => {
        if (e.target.value.trim().length > 0) {
            sendBtn.classList.remove("hidden");
            inputActions.classList.add("hidden");
        } else {
            sendBtn.classList.add("hidden");
            inputActions.classList.remove("hidden");
        }
    });

    function handleSendMessage() {
        const content = messageInput.value.trim();
        if (content === "" || !activeChatUserId) return;

        socket.emit('send_message', {
            receiverId: activeChatUserId,
            content: content
        });

        messageInput.value = "";
        sendBtn.classList.add("hidden");
        inputActions.classList.remove("hidden");
    }

    sendBtn.addEventListener("click", handleSendMessage);
    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleSendMessage();
    });
});
