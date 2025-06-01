const express = require('express');
const WebSocket = require('ws');
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

const clients = new Map();

console.log(`FF WebSocket Server running on port ${PORT}`);

server.on('connection', (ws) => {
    console.log('New client connected');
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleMessage(ws, message);
        } catch (error) {
            console.log('Invalid message received:', error);
        }
    });
    
    ws.on('close', () => {
        for (const [username, client] of clients.entries()) {
            if (client === ws) {
                clients.delete(username);
                broadcastPlayerLeave(username);
                console.log(`Player ${username} disconnected`);
                break;
            }
        }
    });
    
    ws.on('error', (error) => {
        console.log('WebSocket error:', error);
    });
});

function handleMessage(ws, message) {
    switch (message.type) {
        case 'player_join':
            const username = message.username;
            clients.set(username, ws);
            console.log(`Player ${username} joined`);
        
            const userList = Array.from(clients.keys());
            ws.send(JSON.stringify({
                type: 'user_list',
                users: userList
            }));
            
            broadcastPlayerJoin(username, ws);
            break;
            
        case 'player_leave':
            const leavingPlayer = message.username;
            clients.delete(leavingPlayer);
            broadcastPlayerLeave(leavingPlayer);
            console.log(`Player ${leavingPlayer} left`);
            break;
    }
}

function broadcastPlayerJoin(username, excludeWs) {
    const message = JSON.stringify({
        type: 'player_join',
        username: username
    });
    
    clients.forEach((client, clientUsername) => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function broadcastPlayerLeave(username) {
    const message = JSON.stringify({
        type: 'player_leave',
        username: username
    });
    
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

app.post('/join', (req, res) => {
    const { username } = req.body;
    clients.set(username, { type: 'http', username });
    console.log(`Player ${username} joined via HTTP`);
    res.json({ status: 'success' });
});

app.post('/leave', (req, res) => {
    const { username } = req.body;
    clients.delete(username);
    console.log(`Player ${username} left via HTTP`);
    res.json({ status: 'success' });
});

app.post('/users', (req, res) => {
    const userList = Array.from(clients.keys());
    res.json({ users: userList });
});

const server = app.listen(PORT, () => {
    console.log(`FF Server running on port ${PORT}`);
});

setInterval(() => {
    console.log(`Server alive - ${clients.size} clients connected`);
}, 300000);
