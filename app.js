/**
 * Online Clip Application Logic - Backend Connected Edition
 */

const app = (() => {
    // State
    let currentUser = null;
    let currentRoom = null;
    let socket = null;

    // DOM
    const views = {
        login: document.getElementById('view-login'),
        dashboard: document.getElementById('view-dashboard'),
        room: document.getElementById('view-room')
    };
    
    const ui = {
        pfpInput: document.getElementById('pfp-input'),
        loginAvatar: document.getElementById('login-avatar'),
        nameInput: document.getElementById('name-input'),
        
        navUserName: document.getElementById('nav-user-name'),
        navUserAvatar: document.getElementById('nav-user-avatar'),
        welcomeName: document.getElementById('welcome-name'),
        joinOtpInput: document.getElementById('join-otp-input'),
        
        roomTitle: document.getElementById('room-type-title'),
        currentOtp: document.getElementById('current-otp'),
        sharedText: document.getElementById('shared-text'),
        chatMessages: document.getElementById('chat-messages'),
        chatInput: document.getElementById('chat-input'),
        stickersPopup: document.getElementById('stickers-popup'),
        fileInput: document.getElementById('file-input')
    };

    function init() {
        ui.sharedText.addEventListener('input', (e) => {
            if (!currentRoom || !socket) return;
            socket.emit('clip_update', { otp: currentRoom.otp, text: e.target.value });
        });

        // History API for Browser Back Button
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.view) {
                // Prevent navigating to dashboard/room if not logged in
                if (e.state.view !== 'login' && !currentUser) {
                    showView('login', false);
                } else {
                    showView(e.state.view, false);
                }
            } else {
                showView('login', false);
            }
        });
        
        // Initial state
        history.replaceState({ view: 'login' }, '', '#login');
    }

    function showView(viewName, pushToHistory = true) {
        Object.values(views).forEach(v => {
            if (v) {
                v.classList.remove('active');
                setTimeout(() => { if (!v.classList.contains('active')) v.classList.add('hidden'); }, 250);
            }
        });
        
        const target = views[viewName];
        if (target) {
            target.classList.remove('hidden');
            setTimeout(() => target.classList.add('active'), 10);
            
            if (pushToHistory) {
                history.pushState({ view: viewName }, '', `#${viewName}`);
            }
        }
    }

    function handlePfpUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            ui.loginAvatar.src = event.target.result;
            ui.loginAvatar.dataset.custom = "true";
        };
        reader.readAsDataURL(file);
    }

    // Creates an avatar with initials if they haven't uploaded one
    function updateAvatarInitial() {
        if (ui.loginAvatar.dataset.custom === "true") return; // Keep user's uploaded image
        
        const name = ui.nameInput.value.trim();
        if (name.length > 0) {
            // Generate canvas avatar with first letter
            const canvas = document.createElement('canvas');
            canvas.width = 100; canvas.height = 100;
            const ctx = canvas.getContext('2d');
            
            // Randomish color based on name length
            const colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6'];
            const color = colors[name.length % colors.length];
            
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 100, 100);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 50px Outfit';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(name.charAt(0).toUpperCase(), 50, 50);
            
            ui.loginAvatar.src = canvas.toDataURL();
        } else {
            // Default back to favicon if empty
            ui.loginAvatar.src = 'favicon.png';
        }
    }

    function initiateLogin() {
        const name = ui.nameInput.value.trim();
        
        if (!name) return showToast('Please enter your name', 'error');

        currentUser = {
            id: 'u_' + Math.random().toString(36).substr(2, 9),
            name: name,
            avatar: ui.loginAvatar.src,
            joinTime: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };

        ui.navUserName.textContent = currentUser.name;
        ui.welcomeName.textContent = currentUser.name;
        ui.navUserAvatar.src = currentUser.avatar;
        
        showToast(`Welcome, ${name}!`);
        showView('dashboard');
    }

    function logout() {
        if (currentRoom) leaveSession();
        currentUser = null;
        ui.nameInput.value = '';
        ui.loginAvatar.src = 'favicon.png';
        ui.loginAvatar.removeAttribute('dataset.custom');
        showView('login');
    }

    function generateOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }

    function createSession(type) {
        const otp = generateOTP();
        joinRoom(otp, type === 'group' ? 'Group Room' : 'Direct Link', true);
    }

    function joinSession() {
        const otp = ui.joinOtpInput.value.trim();
        if (otp.length !== 6) return showToast('Enter a valid 6-digit code', 'error');
        joinRoom(otp, 'Joined Room', false);
    }

    function joinRoom(otp, title, isHost) {
        currentRoom = { otp, title, isHost };
        
        // Initialize Socket.io connection if not already connected
        if (!socket) {
            socket = io();
            setupSocketListeners();
        }

        ui.roomTitle.textContent = title;
        ui.currentOtp.textContent = otp;
        ui.sharedText.value = '';
        ui.chatMessages.innerHTML = '<div class="sys-msg">Room connected. Waiting for others...</div>';
        
        showView('room');
        
        // Join the backend room
        socket.emit('join_room', { otp: otp, user: currentUser });
    }

    function leaveSession() {
        if (currentRoom && socket) {
            socket.emit('leave_room', { otp: currentRoom.otp, user: currentUser });
        }
        currentRoom = null;
        ui.joinOtpInput.value = '';
        showView('dashboard');
    }

    function setupSocketListeners() {
        socket.on('USER_JOINED', (data) => {
            addSystemMessage(`${data.user.name} joined the room`);
            // If we are the host, sync our current clipboard state to the new user
            if (currentRoom && currentRoom.isHost && ui.sharedText.value) {
                socket.emit('clip_sync', { otp: currentRoom.otp, text: ui.sharedText.value });
            }
        });

        socket.on('USER_LEFT', (data) => {
            addSystemMessage(`${data.user.name} left the room`);
        });

        socket.on('CLIP_UPDATE', (data) => {
            if (ui.sharedText.value !== data.text) ui.sharedText.value = data.text;
        });

        socket.on('CLIP_SYNC', (data) => {
            if (ui.sharedText.value !== data.text) ui.sharedText.value = data.text;
        });

        socket.on('CHAT_MESSAGE', (data) => {
            addChatMessage(data.message, data.user, false);
        });

        socket.on('FILE_SHARE', (data) => {
            addFileMessage(data.fileData, data.fileType, data.fileName, data.user, false);
        });
        
        socket.on('disconnect', () => {
            addSystemMessage(`Disconnected from server. Reconnecting...`);
        });
        
        socket.on('connect', () => {
            if (currentRoom) {
                // Rejoin the room if we reconnected
                socket.emit('join_room', { otp: currentRoom.otp, user: currentUser });
            }
        });
    }

    function handleChatKeyPress(e) { if (e.key === 'Enter') sendChatMessage(); }

    function sendChatMessage() {
        const text = ui.chatInput.value.trim();
        if (!text || !socket || !currentRoom) return;

        addChatMessage(text, currentUser, true);
        socket.emit('chat_message', { otp: currentRoom.otp, message: text, user: currentUser });
        
        ui.chatInput.value = '';
    }

    function addChatMessage(text, user, isSelf) {
        const div = document.createElement('div');
        div.className = `msg ${isSelf ? 'self' : 'other'}`;
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        div.innerHTML = `
            ${!isSelf ? `<div class="msg-header"><img src="${user.avatar}" class="msg-avatar"><span class="msg-sender">${user.name}</span><span class="msg-time">${time}</span></div>` : ''}
            ${escapeHTML(text)}
        `;
        ui.chatMessages.appendChild(div);
        scrollToBottom(ui.chatMessages);
    }

    function addSystemMessage(text) {
        const div = document.createElement('div'); div.className = 'sys-msg'; div.textContent = text;
        ui.chatMessages.appendChild(div); scrollToBottom(ui.chatMessages);
    }

    function toggleStickers() { ui.stickersPopup.classList.toggle('hidden'); }

    function sendSticker(sticker) {
        if (!socket || !currentRoom) return;
        addChatMessage(sticker, currentUser, true);
        socket.emit('chat_message', { otp: currentRoom.otp, message: sticker, user: currentUser });
        ui.stickersPopup.classList.add('hidden');
    }

    function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file || !socket || !currentRoom) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result;
            const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'other';
            
            addFileMessage(base64, type, file.name, currentUser, true);
            socket.emit('file_share', { 
                otp: currentRoom.otp, 
                fileData: base64, 
                fileType: type, 
                fileName: file.name, 
                user: currentUser 
            });
        };
        reader.readAsDataURL(file);
        ui.fileInput.value = '';
    }

    function addFileMessage(dataUrl, type, name, user, isSelf) {
        const div = document.createElement('div');
        div.className = `msg ${isSelf ? 'self' : 'other'}`;
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let content = type === 'image' ? `<img src="${dataUrl}" class="msg-img">` : 
                      type === 'audio' ? `<audio controls src="${dataUrl}" class="msg-audio"></audio>` : 
                      `<a href="${dataUrl}" download="${name}" style="color:inherit; text-decoration:underline;">📎 ${name}</a>`;

        div.innerHTML = `${!isSelf ? `<div class="msg-header"><img src="${user.avatar}" class="msg-avatar"><span class="msg-sender">${user.name}</span><span class="msg-time">${time}</span></div>` : ''}${content}`;
        ui.chatMessages.appendChild(div); scrollToBottom(ui.chatMessages);
    }

    function copyClipboard() { navigator.clipboard.writeText(ui.sharedText.value).then(() => showToast('Copied to clipboard')); }
    function scrollToBottom(el) { el.scrollTop = el.scrollHeight; }
    function escapeHTML(str) { return str.replace(/[&<>'"]/g, t => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[t]); }

    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-check-circle text-success' : 'fa-circle-exclamation text-danger'}"></i> <span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    document.addEventListener('click', (e) => {
        if (ui.stickersPopup && !ui.stickersPopup.classList.contains('hidden') && !e.target.closest('.chat-input-wrapper')) {
            ui.stickersPopup.classList.add('hidden');
        }
    });

    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const icon = document.querySelector('#theme-toggle i');
        if (document.body.classList.contains('dark-mode')) {
            icon.className = 'fa-solid fa-sun';
        } else {
            icon.className = 'fa-solid fa-moon';
        }
    }

    function handleLoginKeyPress(e) {
        if (e.key === 'Enter') {
            initiateLogin();
        }
    }

    init();

    return {
        showView, handlePfpUpload, updateAvatarInitial, initiateLogin, logout,
        createSession, joinSession, leaveSession, sendChatMessage, handleChatKeyPress,
        toggleStickers, sendSticker, handleFileUpload, copyClipboard,
        toggleTheme, handleLoginKeyPress
    };
})();
