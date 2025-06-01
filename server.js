const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

const clients = new Map();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.post('/join', (req, res) => {
    try {
        const { username, client } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username required' });
        }
        
        clients.set(username, { 
            type: 'http', 
            username: username,
            client: client || 'FF_CLIENT',
            joinTime: new Date(),
            lastSeen: new Date()
        });
        
        console.log(`Player ${username} joined via HTTP`);
        
        broadcastToWebSocket({
            type: 'player_join',
            username: username
        });
        
        res.json({ 
            status: 'success', 
            message: 'Player joined successfully' 
        });
        
    } catch (error) {
        console.error('Error in /join:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/leave', (req, res) => {
    try {
        const { username } = req.body;
        
        if (clients.has(username)) {
            clients.delete(username);
            console.log(`Player ${username} left via HTTP`);
            
            broadcastToWebSocket({
                type: 'player_leave',
                username: username
            });
        }
        
        res.json({ 
            status: 'success', 
            message: 'Player left successfully' 
        });
        
    } catch (error) {
        console.error('Error in /leave:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/users', (req, res) => {
    try {
        const { username } = req.body;
        if (username && clients.has(username)) {
            const client = clients.get(username);
            client.lastSeen = new Date();
            clients.set(username, client);
        }
        
        const userList = Array.from(clients.keys());
        res.json({ 
            users: userList,
            count: userList.length 
        });
    } catch (error) {
        console.error('Error in /users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'online', 
        clients: clients.size,
        uptime: process.uptime()
    });
});

wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleWebSocketMessage(ws, message);
        } catch (error) {
            console.log('Invalid WebSocket message received:', error);
        }
    });
    
    ws.on('close', () => {
        for (const [username, client] of clients.entries()) {
            if (client.ws === ws) {
                clients.delete(username);
                broadcastPlayerLeave(username);
                console.log(`WebSocket Player ${username} disconnected`);
                break;
            }
        }
    });
    
    ws.on('error', (error) => {
        console.log('WebSocket error:', error);
    });
});

function handleWebSocketMessage(ws, message) {
    switch (message.type) {
        case 'player_join':
            const username = message.username;
            clients.set(username, { 
                type: 'websocket', 
                username: username,
                ws: ws,
                joinTime: new Date()
            });
            console.log(`WebSocket Player ${username} joined`);
        
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
            console.log(`WebSocket Player ${leavingPlayer} left`);
            break;
    }
}

function broadcastToWebSocket(message) {
    const messageStr = JSON.stringify(message);
    
    clients.forEach((client) => {
        if (client.type === 'websocket' && client.ws && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(messageStr);
        }
    });
}

function broadcastPlayerJoin(username, excludeWs) {
    const message = JSON.stringify({
        type: 'player_join',
        username: username
    });
    
    clients.forEach((client) => {
        if (client.type === 'websocket' && 
            client.ws && 
            client.ws !== excludeWs && 
            client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}

function broadcastPlayerLeave(username) {
    const message = JSON.stringify({
        type: 'player_leave',
        username: username
    });
    
    clients.forEach((client) => {
        if (client.type === 'websocket' && 
            client.ws && 
            client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}

setInterval(() => {
    let removedCount = 0;
    const now = new Date();
    const TIMEOUT_MS = 30000;
    
    clients.forEach((client, username) => {
        if (client.type === 'websocket' && 
            (!client.ws || client.ws.readyState !== WebSocket.OPEN)) {
            clients.delete(username);
            removedCount++;
        } else if (client.type === 'http' && client.lastSeen) {
            const timeSinceLastSeen = now - client.lastSeen;
            if (timeSinceLastSeen > TIMEOUT_MS) {
                console.log(`HTTP client ${username} timed out (${Math.round(timeSinceLastSeen/1000)}s since last heartbeat)`);
                clients.delete(username);
                removedCount++;
                
                broadcastToWebSocket({
                    type: 'player_leave',
                    username: username
                });
            }
        }
    });
    
    if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} disconnected/timed out clients`);
    }
}, 15000);

setInterval(() => {
    const httpClients = Array.from(clients.values()).filter(c => c.type === 'http').length;
    const wsClients = Array.from(clients.values()).filter(c => c.type === 'websocket').length;
    
    console.log(`${clients.size} total clients (${httpClients} HTTP, ${wsClients} WebSocket)`);
}, 300000);

server.listen(PORT, () => {
    console.log(`FF Server running on port ${PORT}`);
    console.log(`HTTP endpoints: /join, /leave, /users, /health`);
    console.log(`WebSocket server also available on same port`);
});
