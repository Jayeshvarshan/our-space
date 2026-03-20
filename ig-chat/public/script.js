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
    let chatNotesStorage = {}; // { userId: note }
    let chatThemes = {}; // { userId: theme }
    let peerConnection = null;
    let localStream = null;
    let isCallActive = false;
    let currentCallUserId = null;

    const STICKERS = [
        "😀","😂","🥰","😍","🤩","😎","🥳","😭","😤","🤔",
        "😴","🤯","🥺","😇","🤗","👋","🔥","💖","✨","🎉",
        "🌸","🌈","🦋","🍕","🎂","🎁","👀","💯","☕","🚀",
        "🐶","🐱","🐻","🦊","🐼","🌺","🌻","🍓","🦄","🎵"
    ];

    const THEMES = [
        { name: "Default Dark", bg: "#0d0d0d", sent: "#ff4f7b", received: "#1e1e1e" },
        { name: "Ocean Blue", bg: "#061a2e", sent: "#0066cc", received: "#0a2540" },
        { name: "Forest Green", bg: "#051a0d", sent: "#22c55e", received: "#0d2b1a" },
        { name: "Purple Dream", bg: "#110020", sent: "#9333ea", received: "#1e0035" },
        { name: "Sunset", bg: "#1a0a00", sent: "#f97316", received: "#2d1200" },
        { name: "Rose Gold", bg: "#1a0f10", sent: "#e879a0", received: "#2d1520" },
        { name: "Midnight", bg: "#000010", sent: "#4f46e5", received: "#0d0d2b" },
        { name: "Teal", bg: "#001a1a", sent: "#0d9488", received: "#002626" },
    ];

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
        document.getElementById('current-user-name').src = currentUser.avatar || 'assets/avatar_default.png';
        document.getElementById('current-user-avatar').src = currentUser.avatar || 'assets/avatar_default.png';
        document.getElementById('profile-avatar-preview').src = currentUser.avatar || 'assets/avatar_default.png';
        document.getElementById('profile-username').textContent = currentUser.username;
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

    // ====== PROFILE MODAL ======
    document.getElementById('open-profile-btn').addEventListener('click', () => {
        document.getElementById('profile-modal').classList.remove('hidden');
    });
    document.getElementById('close-profile-modal').addEventListener('click', () => {
        document.getElementById('profile-modal').classList.add('hidden');
    });
    document.getElementById('pfp-upload-area').addEventListener('click', () => {
        document.getElementById('pfp-input').click();
    });
    document.getElementById('pfp-input').addEventListener('change', async () => {
        const file = document.getElementById('pfp-input').files[0];
        if (!file) return;
        const status = document.getElementById('pfp-upload-status');
        status.textContent = 'Uploading...';
        const formData = new FormData();
        formData.append('media', file);
        try {
            const res = await fetch('/api/user/avatar', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.avatarUrl) {
                currentUser.avatar = data.avatarUrl;
                document.getElementById('profile-avatar-preview').src = data.avatarUrl;
                document.getElementById('current-user-avatar').src = data.avatarUrl;
                document.getElementById('current-user-name').src = data.avatarUrl;
                status.textContent = '✅ Photo updated!';
                setTimeout(() => { status.textContent = ''; }, 3000);
            }
        } catch (err) {
            status.textContent = '❌ Upload failed.';
        }
    });

    // ====== BACK BUTTON ======
    document.getElementById('back-btn').addEventListener('click', () => {
        viewActiveChat.classList.add('hidden');
        viewChatList.classList.remove('hidden');
        bottomNav.style.display = 'flex';
        document.getElementById('chat-options-menu').classList.add('hidden');
    });

    // ====== CHAT OPTIONS DROPDOWN ======
    document.getElementById('btn-chat-options').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('chat-options-menu').classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
        document.getElementById('chat-options-menu').classList.add('hidden');
    });

    // ====== CHAT THEMES ======
    document.getElementById('theme-option-btn').addEventListener('click', () => {
        document.getElementById('chat-options-menu').classList.add('hidden');
        openChatThemes();
    });
    window.openChatThemes = () => {
        document.getElementById('theme-modal').classList.remove('hidden');
        const grid = document.getElementById('theme-grid');
        grid.innerHTML = '';
        THEMES.forEach((theme, i) => {
            const btn = document.createElement('div');
            btn.className = 'theme-swatch';
            btn.style.background = `linear-gradient(135deg, ${theme.sent}, ${theme.bg})`;
            btn.title = theme.name;
            btn.innerHTML = `<span>${theme.name}</span>`;
            btn.addEventListener('click', () => {
                if (activeChatUserId) {
                    chatThemes[activeChatUserId] = theme;
                    applyTheme(theme);
                }
                document.getElementById('theme-modal').classList.add('hidden');
            });
            grid.appendChild(btn);
        });
    };
    document.getElementById('close-theme-modal').addEventListener('click', () => {
        document.getElementById('theme-modal').classList.add('hidden');
    });
    function applyTheme(theme) {
        if (!theme) return;
        chatMessages.style.background = theme.bg;
        document.documentElement.style.setProperty('--sent-bubble', theme.sent);
        document.documentElement.style.setProperty('--received-bubble', theme.received);
    }

    // ====== CHAT NOTES ======
    document.getElementById('notes-option-btn').addEventListener('click', () => {
        document.getElementById('chat-options-menu').classList.add('hidden');
        openChatNotes();
    });
    window.openChatNotes = () => {
        document.getElementById('notes-modal').classList.remove('hidden');
        document.getElementById('chat-notes-text').value = chatNotesStorage[activeChatUserId] || '';
    };
    document.getElementById('close-notes-modal').addEventListener('click', () => {
        document.getElementById('notes-modal').classList.add('hidden');
    });
    document.getElementById('save-notes-btn').addEventListener('click', () => {
        const note = document.getElementById('chat-notes-text').value;
        chatNotesStorage[activeChatUserId] = note;
        document.getElementById('notes-modal').classList.add('hidden');
    });

    // ====== DELETE CHAT ======
    document.getElementById('delete-chat-btn').addEventListener('click', async () => {
        if (!activeChatUserId) return;
        if (confirm(`Delete all messages with ${activeChatUsername}?`)) {
            try {
                const res = await fetch(`/api/messages/${activeChatUserId}`, { method: 'DELETE' });
                if (res.ok) {
                    chatMessages.innerHTML = '<div class="message-timestamp">Chat history cleared</div>';
                    updateChatPreview(activeChatUserId, 'Chat cleared', false);
                    document.getElementById('chat-options-menu').classList.add('hidden');
                }
            } catch (err) { console.error(err); }
        }
    });

    // ====== STICKER PICKER ======
    const stickerPanel = document.getElementById('sticker-panel');
    const stickerGrid = document.getElementById('sticker-grid');
    STICKERS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'sticker-btn';
        btn.textContent = emoji;
        btn.addEventListener('click', () => {
            if (!activeChatUserId) return;
            socket.emit('send_message', { receiverId: activeChatUserId, content: emoji });
            stickerPanel.classList.add('hidden');
        });
        stickerGrid.appendChild(btn);
    });
    document.getElementById('btn-stickers').addEventListener('click', () => {
        stickerPanel.classList.toggle('hidden');
    });

    // ====== DRAWING BOARD ======
    let canvas, ctx, isDrawing = false, drawingMode = 'pen';
    document.getElementById('btn-draw').addEventListener('click', () => {
        if (!activeChatUserId) return;
        document.getElementById('drawing-modal').classList.remove('hidden');
        initCanvas();
    });
    document.getElementById('close-drawing-modal').addEventListener('click', () => {
        document.getElementById('drawing-modal').classList.add('hidden');
    });
    document.getElementById('close-drawing-modal-cancel').addEventListener('click', () => {
        document.getElementById('drawing-modal').classList.add('hidden');
    });
    document.getElementById('draw-clear').addEventListener('click', () => {
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    document.getElementById('draw-eraser').addEventListener('click', () => {
        drawingMode = drawingMode === 'eraser' ? 'pen' : 'eraser';
        document.getElementById('draw-eraser').style.color = drawingMode === 'eraser' ? 'var(--accent-blue)' : '';
    });

    function initCanvas() {
        canvas = document.getElementById('draw-canvas');
        const modal = canvas.closest('.drawing-modal');
        canvas.width = modal.clientWidth || 350;
        canvas.height = 320;
        ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            if (e.touches) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        canvas.onmousedown = canvas.ontouchstart = (e) => {
            e.preventDefault();
            isDrawing = true;
            const pos = getPos(e);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        };
        canvas.onmousemove = canvas.ontouchmove = (e) => {
            e.preventDefault();
            if (!isDrawing) return;
            const pos = getPos(e);
            ctx.globalCompositeOperation = drawingMode === 'eraser' ? 'destination-out' : 'source-over';
            ctx.strokeStyle = drawingMode === 'eraser' ? 'rgba(0,0,0,1)' : document.getElementById('draw-color').value;
            ctx.lineWidth = parseInt(document.getElementById('draw-size').value);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        };
        canvas.onmouseup = canvas.ontouchend = () => { isDrawing = false; };
    }

    document.getElementById('send-drawing-btn').addEventListener('click', async () => {
        if (!canvas || !activeChatUserId) return;
        canvas.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('media', blob, 'drawing.png');
            try {
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.url) {
                    socket.emit('send_message', {
                        receiverId: activeChatUserId,
                        media_url: data.url,
                        media_type: 'image/png'
                    });
                    document.getElementById('drawing-modal').classList.add('hidden');
                }
            } catch (err) { console.error(err); }
        }, 'image/png');
    });

    // ====== SOCKET.IO ======
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

        socket.on('user_status', ({ userId, status, lastSeen }) => {
            const dot = document.getElementById(`status-${userId}`);
            const lastSeenEl = document.getElementById(`last-seen-${userId}`);
            if (dot) {
                if (status === 'online') {
                    dot.classList.remove('offline');
                    if (lastSeenEl) lastSeenEl.textContent = 'Online';
                    if (activeChatUserId === userId) document.getElementById('chat-status').textContent = 'Online';
                } else {
                    dot.classList.add('offline');
                    const timeStr = formatLastSeen(lastSeen);
                    if (lastSeenEl) lastSeenEl.textContent = timeStr;
                    if (activeChatUserId === userId) document.getElementById('chat-status').textContent = timeStr;
                }
            }
        });

        socket.on('user_typing', ({ userId }) => {
            if (userId === activeChatUserId) {
                document.getElementById('typing-indicator').classList.remove('hidden');
                document.getElementById('chat-status').classList.add('hidden');
            }
        });
        socket.on('user_stop_typing', ({ userId }) => {
            if (userId === activeChatUserId) {
                document.getElementById('typing-indicator').classList.add('hidden');
                document.getElementById('chat-status').classList.remove('hidden');
            }
        });

        socket.on('message_updated', ({ messageId, newContent }) => {
            const msgEl = document.getElementById(`msg-${messageId}`);
            if (msgEl) {
                const textEl = msgEl.querySelector('.message-text');
                if (textEl) {
                    textEl.innerHTML = `${newContent} <span class="edited-tag">(edited)</span>`;
                }
            }
        });
        socket.on('message_deleted', ({ messageId }) => {
            const msgEl = document.getElementById(`msg-${messageId}`);
            if (msgEl) {
                const bubble = msgEl.querySelector('.message-bubble');
                if (bubble) bubble.innerHTML = '<div class="message-text deleted-text"><i>Message unsent</i></div>';
                msgEl.classList.add('unsent-msg');
            }
        });

        // WebRTC Signaling
        socket.on('call_offer', async ({ from, fromName, fromAvatar, offer, type }) => {
            showIncomingCall(from, fromName, fromAvatar);
            document.getElementById('accept-call-btn').onclick = async () => {
                hideIncomingCall();
                await startCall(from, fromName, fromAvatar, false, type);
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                peerConnection.onicecandidate = (e) => {
                    if (e.candidate) socket.emit('ice_candidate', { to: from, candidate: e.candidate });
                };
                await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                socket.emit('call_answer', { to: from, answer });
            };
            document.getElementById('reject-call-btn').onclick = () => {
                hideIncomingCall();
                socket.emit('call_rejected', { to: from });
            };
        });
        socket.on('call_answer', async ({ answer }) => {
            if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            document.getElementById('call-status').textContent = 'Connected';
        });
        socket.on('ice_candidate', async ({ candidate }) => {
            if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        });
        socket.on('call_ended', () => endCall());
        socket.on('call_rejected', () => { endCall(); alert('Call was declined.'); });

        await loadUsers();
    }

    // ====== CALLING ======
    document.getElementById('btn-call-audio').addEventListener('click', () => startCallToUser('audio'));
    document.getElementById('btn-call-video').addEventListener('click', () => startCallToUser('video'));
    document.getElementById('call-end-btn').addEventListener('click', () => {
        if (currentCallUserId) socket.emit('call_end', { to: currentCallUserId });
        endCall();
    });

    let isMuted = false;
    document.getElementById('call-mute-btn').addEventListener('click', () => {
        if (!localStream) return;
        isMuted = !isMuted;
        localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
        document.getElementById('call-mute-btn').innerHTML = isMuted
            ? '<i class="ph ph-microphone-slash" style="color:#ff4f7b"></i>'
            : '<i class="ph ph-microphone"></i>';
    });

    async function startCallToUser(type) {
        if (!activeChatUserId) return;
        await startCall(activeChatUserId, activeChatUsername, activeChatAvatar, true, type);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        peerConnection.onicecandidate = (e) => {
            if (e.candidate) socket.emit('ice_candidate', { to: activeChatUserId, candidate: e.candidate });
        };
        socket.emit('call_offer', {
            to: activeChatUserId,
            from: currentUser.id,
            fromName: currentUser.username,
            fromAvatar: currentUser.avatar,
            offer,
            type
        });
        document.getElementById('call-status').textContent = 'Calling...';
    }

    async function startCall(userId, username, avatar, isCaller, type) {
        currentCallUserId = userId;
        isCallActive = true;
        document.getElementById('call-overlay').classList.remove('hidden');
        document.getElementById('call-avatar').src = avatar || 'assets/avatar_default.png';
        document.getElementById('call-name').textContent = username;
        document.getElementById('call-status').textContent = isCaller ? 'Ringing...' : 'Answering...';

        const constraints = { audio: true, video: type === 'video' };
        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            if (type === 'video') {
                document.getElementById('local-video').srcObject = localStream;
                document.getElementById('local-video').classList.remove('hidden');
            }
        } catch (e) {
            alert('Media access denied.'); endCall(); return;
        }

        peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
        peerConnection.ontrack = (e) => {
            document.getElementById('remote-video').srcObject = e.streams[0];
            if (type === 'video') document.getElementById('remote-video').classList.remove('hidden');
        };
    }

    function endCall() {
        if (peerConnection) { peerConnection.close(); peerConnection = null; }
        if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
        isCallActive = false;
        currentCallUserId = null;
        document.getElementById('call-overlay').classList.add('hidden');
        document.getElementById('local-video').srcObject = null;
        document.getElementById('remote-video').srcObject = null;
    }

    function showIncomingCall(from, name, avatar) {
        document.getElementById('incoming-call-banner').classList.remove('hidden');
        document.getElementById('incoming-caller-name').textContent = name;
        document.getElementById('incoming-caller-avatar').src = avatar || 'assets/avatar_default.png';
    }
    function hideIncomingCall() {
        document.getElementById('incoming-call-banner').classList.add('hidden');
    }

    // ====== LOAD USERS ======
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
                chatItem.setAttribute('data-avatar', user.avatar || 'assets/avatar_default.png');
                chatItem.innerHTML = `
                    <img src="${user.avatar || 'assets/avatar_default.png'}" alt="${user.username}" class="avatar">
                    <div class="chat-info">
                        <span class="chat-name">${user.username}</span>
                        <span class="chat-preview" id="preview-${user.id}">Tap to chat</span>
                    </div>
                    <div class="chat-meta">
                        <span class="last-seen-text" id="last-seen-${user.id}">${formatLastSeen(user.last_seen)}</span>
                        <div class="status-dot offline" id="status-${user.id}"></div>
                    </div>
                `;
                chatItem.addEventListener('click', () => selectChat(user.id, user.username, user.avatar || 'assets/avatar_default.png'));
                chatList.appendChild(chatItem);
            });
        } catch (error) { console.error('Error loading users:', error); }
    }

    // ====== SELECT CHAT ======
    async function selectChat(userId, username, avatar) {
        document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active-chat'));
        document.getElementById(`chat-item-${userId}`)?.classList.add('active-chat');

        activeChatUserId = userId;
        activeChatUsername = username;
        activeChatAvatar = avatar;

        viewChatList.classList.add('hidden');
        viewActiveChat.classList.remove('hidden');
        bottomNav.style.display = 'none';
        stickerPanel.classList.add('hidden');

        document.getElementById('header-name').textContent = username;
        document.getElementById('header-avatar').src = avatar;
        document.getElementById('chat-status').textContent = '...';
        document.getElementById('typing-indicator').classList.add('hidden');
        document.getElementById('chat-status').classList.remove('hidden');

        // Apply saved theme
        if (chatThemes[userId]) applyTheme(chatThemes[userId]);
        else {
            chatMessages.style.background = '';
            document.documentElement.style.removeProperty('--sent-bubble');
            document.documentElement.style.removeProperty('--received-bubble');
        }

        chatMessages.innerHTML = '<div class="loading-text">Loading messages...</div>';
        try {
            const res = await fetch(`/api/messages/${userId}`);
            const messages = await res.json();
            chatMessages.innerHTML = '';
            if (messages.length === 0) {
                const ts = document.createElement("div");
                ts.className = "message-timestamp";
                ts.textContent = "Start of a new conversation 💌";
                chatMessages.appendChild(ts);
            } else {
                messages.forEach(msg => {
                    const isSent = msg.sender_id === currentUser.id;
                    appendMessage(msg, isSent, isSent ? currentUser.avatar : activeChatAvatar);
                });
                scrollToBottom();
            }

            // Update header status from already-loaded users
            const thisUser = allUsers.find(u => u.id === userId);
            if (thisUser) {
                const dot = document.getElementById(`status-${userId}`);
                if (dot && !dot.classList.contains('offline')) {
                    document.getElementById('chat-status').textContent = 'Online';
                } else {
                    document.getElementById('chat-status').textContent = formatLastSeen(thisUser.last_seen);
                }
            }
        } catch (error) {
            chatMessages.innerHTML = '<div class="loading-text" style="color:red;">Error loading messages</div>';
        }
    }

    // ====== APPEND MESSAGE ======
    function appendMessage(msg, isSent, avatarSrc) {
        const wrapper = document.createElement("div");
        wrapper.className = `message ${isSent ? 'sent' : 'received'}`;
        wrapper.id = `msg-${msg.id}`;

        const avatarHtml = !isSent ? `<img src="${avatarSrc || 'assets/avatar_default.png'}" alt="User" class="avatar-tiny">` : '';
        let contentHtml = '';

        if (msg.is_deleted) {
            contentHtml = '<div class="message-text deleted-text"><i>Message unsent</i></div>';
            wrapper.classList.add('unsent-msg');
        } else {
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
                contentHtml += `<div class="message-text">${msg.content}${msg.is_edited ? '<span class="edited-tag"> (edited)</span>' : ''}</div>`;
            }
            // Read aloud + Edit/Unsend actions for sent msgs
            const actionsHtml = `
                <div class="message-actions">
                    ${msg.content ? `<button class="action-btn" onclick="readAloud('${msg.content.replace(/'/g, "\\'")}')" title="Read Aloud">🔊</button>` : ''}
                    ${isSent ? `
                        <button class="action-btn" onclick="openMessageActions('${msg.id}', '${msg.content ? msg.content.replace(/'/g, "\\'") : ''}')" title="More">⋮</button>
                    ` : ''}
                </div>
            `;
            contentHtml += actionsHtml;
        }

        wrapper.innerHTML = `${avatarHtml}<div class="message-bubble">${contentHtml}</div>`;
        chatMessages.appendChild(wrapper);
    }

    // ====== READ ALOUD ======
    window.readAloud = (text) => {
        if (!text || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 0.95;
        window.speechSynthesis.speak(utter);
    };

    // ====== MESSAGE ACTIONS ======
    window.openMessageActions = (messageId, currentContent) => {
        const action = prompt("Type 'edit' to change or 'delete' to unsend:");
        if (action === 'edit') {
            const newContent = prompt("Enter new message:", currentContent);
            if (newContent && newContent.trim() !== "" && newContent !== currentContent) {
                socket.emit('edit_message', { messageId, newContent, receiverId: activeChatUserId });
            }
        } else if (action === 'delete') {
            if (confirm("Unsend this message?")) {
                socket.emit('unsend_message', { messageId, receiverId: activeChatUserId });
            }
        }
    };

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

    function formatLastSeen(timestamp) {
        if (!timestamp) return 'Offline';
        const date = new Date(timestamp);
        const now = new Date();
        const diffInSecs = Math.floor((now - date) / 1000);
        if (diffInSecs < 60) return 'Just now';
        if (diffInSecs < 3600) return `${Math.floor(diffInSecs / 60)}m ago`;
        if (diffInSecs < 86400) return `${Math.floor(diffInSecs / 3600)}h ago`;
        return date.toLocaleDateString();
    }

    // ====== SEARCH ======
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

    let typingTimeout;
    messageInput.addEventListener("input", (e) => {
        if (activeChatUserId) {
            socket.emit('typing', { receiverId: activeChatUserId });
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => { socket.emit('stop_typing', { receiverId: activeChatUserId }); }, 2000);
        }
        stickerPanel.classList.add('hidden');
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
            if (data.url) socket.emit('send_message', { receiverId: activeChatUserId, media_url: data.url, media_type: data.type });
        } catch (err) { console.error("Upload failed:", err); }
        mediaInput.value = "";
    });

    // ====== VOICE RECORDING ======
    const voiceBtn = document.getElementById("btn-voice");
    voiceBtn.addEventListener("click", async () => {
        if (!isRecording) {
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
                        if (data.url) socket.emit('send_message', { receiverId: activeChatUserId, media_url: data.url, media_type: 'audio/webm' });
                    } catch (err) { console.error("Voice upload failed:", err); }
                    stream.getTracks().forEach(t => t.stop());
                };
                mediaRecorder.start();
                isRecording = true;
                voiceBtn.innerHTML = '<i class="ph-fill ph-stop-circle" style="color:#ff4f7b;"></i>';
            } catch (err) { alert("Microphone permission denied."); }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            voiceBtn.innerHTML = '<i class="ph ph-microphone"></i>';
        }
    });
});
