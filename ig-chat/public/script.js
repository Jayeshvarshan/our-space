document.addEventListener("DOMContentLoaded", async () => {
    let currentUser = null;
    let activeChatUserId = null;
    let activeChatAvatar = null;
    let activeChatUsername = null;
    let socket = null;
    let allUsers = [];
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;

    const mainApp = document.getElementById("main-app");
    const chatList = document.getElementById("chat-list");
    const chatMessages = document.getElementById("chat-messages");
    const viewChatList = document.getElementById("view-chat-list");
    const viewActiveChat = document.getElementById("view-active-chat");
    const bottomNav = document.getElementById("bottom-nav");

    // Auth Check
    try {
        const res = await fetch('/api/currentUser');
        if (!res.ok) throw new Error('Not logged in');
        currentUser = await res.json();

        mainApp.style.display = 'flex';
        document.getElementById('sidebar-username').textContent = currentUser.username;
        document.getElementById('current-user-name').src = currentUser.avatar;
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
        socket = io();

        socket.on('receive_message', (msg) => {
            if ((msg.sender_id === activeChatUserId && msg.receiver_id === currentUser.id) ||
                (msg.sender_id === currentUser.id && msg.receiver_id === activeChatUserId)) {
                appendMessage(msg, msg.sender_id === currentUser.id, msg.sender_id === currentUser.id ? currentUser.avatar : activeChatAvatar);
                scrollToBottom();
            }
            const otherId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
            updateChatPreview(otherId, msg.content || '📎 Media', msg.sender_id === currentUser.id);
        });

        socket.on('user_status', ({ userId, status }) => {
            const dot = document.getElementById(`status-${userId}`);
            if (dot) {
                if (status === 'online') dot.classList.remove('offline');
                else dot.classList.add('offline');
            }
        });

        await loadUsers();
    }

    async function loadUsers() {
        try {
            const res = await fetch('/api/users');
            allUsers = await res.json();
            chatList.innerHTML = '';
            if (allUsers.length === 0) {
                chatList.innerHTML = '<div class="loading-text">No other users yet.</div>';
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
                        <span class="chat-name">${user.username}</span>
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

    // Back button
    document.getElementById('back-btn').addEventListener('click', () => {
        viewActiveChat.classList.add('hidden');
        viewChatList.classList.remove('hidden');
        bottomNav.style.display = 'flex';
    });

    async function selectChat(userId, username, avatar) {
        document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active-chat'));
        document.getElementById(`chat-item-${userId}`).classList.add('active-chat');

        activeChatUserId = userId;
        activeChatUsername = username;
        activeChatAvatar = avatar;

        viewChatList.classList.add('hidden');
        viewActiveChat.classList.remove('hidden');
        bottomNav.style.display = 'none';

        document.getElementById('header-name').textContent = username;
        document.getElementById('header-avatar').src = avatar;

        chatMessages.innerHTML = '<div class="loading-text">Loading messages...</div>';
        try {
            const res = await fetch(`/api/messages/${userId}`);
            const messages = await res.json();
            chatMessages.innerHTML = '';
            if (messages.length === 0) {
                const ts = document.createElement("div");
                ts.className = "message-timestamp";
                ts.textContent = "Start of a new conversation";
                chatMessages.appendChild(ts);
            } else {
                messages.forEach(msg => {
                    const isSent = msg.sender_id === currentUser.id;
                    appendMessage(msg, isSent, isSent ? currentUser.avatar : activeChatAvatar);
                });
                scrollToBottom();
            }
        } catch (error) {
            chatMessages.innerHTML = '<div class="loading-text" style="color:red;">Error loading messages</div>';
        }
    }

    function appendMessage(msg, isSent, avatarSrc) {
        const wrapper = document.createElement("div");
        wrapper.className = `message ${isSent ? 'sent' : 'received'}`;

        const avatarHtml = !isSent ? `<img src="${avatarSrc}" alt="User" class="avatar-tiny">` : '';
        let contentHtml = '';

        if (msg.media_url) {
            const type = msg.media_type || '';
            if (type.startsWith('image')) {
                contentHtml = `<img src="${msg.media_url}" class="media-img" onclick="window.open('${msg.media_url}')">`;
            } else if (type.startsWith('video')) {
                contentHtml = `<video src="${msg.media_url}" class="media-video" controls playsinline></video>`;
            } else if (type.startsWith('audio')) {
                contentHtml = `<audio src="${msg.media_url}" controls class="media-audio"></audio>`;
            } else {
                contentHtml = `<a href="${msg.media_url}" target="_blank" class="media-link">📎 View file</a>`;
            }
        }

        if (msg.content) {
            contentHtml += `<div class="message-text">${msg.content}</div>`;
        }

        wrapper.innerHTML = `${avatarHtml}<div class="message-bubble">${contentHtml}</div>`;
        chatMessages.appendChild(wrapper);
    }

    function updateChatPreview(userId, text, isYou) {
        const previewEl = document.getElementById(`preview-${userId}`);
        const chatItem = document.getElementById(`chat-item-${userId}`);
        if (previewEl && chatItem) {
            previewEl.textContent = isYou ? `You: ${text}` : text;
            chatList.insertBefore(chatItem, chatList.firstChild);
        }
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Search
    document.getElementById("user-search-input").addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        document.querySelectorAll(".chat-item").forEach(item => {
            const username = item.getAttribute("data-username").toLowerCase();
            item.style.display = username.includes(query) ? "flex" : "none";
        });
    });

    // ====== SEND TEXT ======
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
        socket.emit('send_message', { receiverId: activeChatUserId, content });
        messageInput.value = "";
        sendBtn.classList.add("hidden");
        inputActions.classList.remove("hidden");
    }

    sendBtn.addEventListener("click", handleSendMessage);
    messageInput.addEventListener("keypress", (e) => { if (e.key === "Enter") handleSendMessage(); });

    // ====== SEND IMAGE / VIDEO ======
    const mediaInput = document.getElementById("media-input");
    document.getElementById("btn-image").addEventListener("click", () => {
        mediaInput.accept = "image/*,video/*";
        mediaInput.click();
    });

    mediaInput.addEventListener("change", async () => {
        const file = mediaInput.files[0];
        if (!file || !activeChatUserId) return;

        const formData = new FormData();
        formData.append("media", file);

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.url) {
                socket.emit('send_message', {
                    receiverId: activeChatUserId,
                    media_url: data.url,
                    media_type: data.type
                });
            }
        } catch (err) {
            console.error("Upload failed:", err);
        }
        mediaInput.value = "";
    });

    // ====== VOICE RECORDING ======
    const voiceBtn = document.getElementById("btn-voice");

    voiceBtn.addEventListener("click", async () => {
        if (!isRecording) {
            // Start recording
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

                mediaRecorder.onstop = async () => {
                    const blob = new Blob(audioChunks, { type: 'audio/webm' });
                    const formData = new FormData();
                    formData.append("media", blob, "voice.webm");

                    try {
                        const res = await fetch('/api/upload', { method: 'POST', body: formData });
                        const data = await res.json();
                        if (data.url) {
                            socket.emit('send_message', {
                                receiverId: activeChatUserId,
                                media_url: data.url,
                                media_type: 'audio/webm'
                            });
                        }
                    } catch (err) {
                        console.error("Voice upload failed:", err);
                    }

                    stream.getTracks().forEach(t => t.stop());
                };

                mediaRecorder.start();
                isRecording = true;
                voiceBtn.innerHTML = '<i class="ph-fill ph-stop-circle" style="color:#ff4f7b;"></i>';
            } catch (err) {
                alert("Microphone permission denied. Please allow microphone access.");
            }
        } else {
            // Stop recording
            mediaRecorder.stop();
            isRecording = false;
            voiceBtn.innerHTML = '<i class="ph ph-microphone"></i>';
        }
    });
});
