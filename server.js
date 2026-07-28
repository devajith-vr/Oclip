const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // Allow up to 100MB for file uploads via websocket
});

// Serve static files from the current directory
app.use(express.static(__dirname));

// Keep track of which room a socket belongs to and their user info for graceful disconnects
const socketData = {};

io.on('connection', (socket) => {
    console.log(`[Socket Connected] ${socket.id}`);

    socket.on('join_room', ({ otp, user }) => {
        socket.join(otp);
        socketData[socket.id] = { otp, user };
        
        // Notify others in the room
        socket.to(otp).emit('USER_JOINED', { user });
        console.log(`[Join] ${user.name} joined room: ${otp}`);
    });

    socket.on('leave_room', ({ otp, user }) => {
        socket.leave(otp);
        if (socketData[socket.id]) {
            delete socketData[socket.id].otp;
        }
        
        // Notify others
        socket.to(otp).emit('USER_LEFT', { user });
        console.log(`[Leave] ${user.name} left room: ${otp}`);
    });

    socket.on('clip_update', ({ otp, text }) => {
        // Broadcast the clipboard update to everyone else in the room
        socket.to(otp).emit('CLIP_UPDATE', { text });
    });

    socket.on('clip_sync', ({ otp, text }) => {
        socket.to(otp).emit('CLIP_SYNC', { text });
    });

    socket.on('chat_message', ({ otp, message, user }) => {
        socket.to(otp).emit('CHAT_MESSAGE', { message, user });
    });

    socket.on('file_share', ({ otp, fileData, fileType, fileName, user }) => {
        socket.to(otp).emit('FILE_SHARE', { fileData, fileType, fileName, user });
    });

    socket.on('disconnect', () => {
        const data = socketData[socket.id];
        if (data && data.otp && data.user) {
            socket.to(data.otp).emit('USER_LEFT', { user: data.user });
            console.log(`[Disconnect] ${data.user.name} abruptly left room: ${data.otp}`);
        }
        delete socketData[socket.id];
        console.log(`[Socket Disconnected] ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`Online Clip Server is running!`);
    console.log(`Local Access: http://localhost:${PORT}`);
    console.log(`Network Access: http://<YOUR_LOCAL_IP>:${PORT}`);
    console.log(`=================================`);
});
