const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const server = new WebSocket.Server({ port: PORT });

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

setInterval(() => {
    console.log(`Server alive - ${clients.size} clients connected`);
}, 300000);
