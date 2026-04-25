const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { PubSub } = require('@google-cloud/pubsub');
const { BigQuery } = require('@google-cloud/bigquery');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json()); // Allow receiving JSON notifications from Cloud Function
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
    }
});
const pubsub = new PubSub();
const bigquery = new BigQuery();

const topicName = 'resource-events';
const subscriptionName = 'websocket-gateway-sub';

// Endpoint to receive notifications from Cloud Function
app.post('/notify', (req, res) => {
    const eventData = req.body;
    console.log('Notification received from FaaS:', eventData.eventId);
    
    io.emit('new-view', eventData);
    io.emit('stats-refresh-trigger', { lastResourceId: eventData.resourceId });
    res.status(200).send('OK');
});

// Websockets Logic + BigQuery Integration
io.on('connection', async (socket) => {
    console.log('Client connected:', socket.id);

    // Emit the current number of connected clients to all clients
    io.emit('user-count-update', io.engine.clientsCount);

    try {
        const topQuery = `
            SELECT resourceId, COUNT(*) as views 
            FROM \`pcd-analytics-project.analytics_db.view_stats\` 
            GROUP BY resourceId 
            ORDER BY views DESC`;

        const recentQuery = `
            SELECT resourceId, timestamp, resourceType 
            FROM \`pcd-analytics-project.analytics_db.view_stats\` 
            ORDER BY timestamp DESC`;

        const [topRows] = await bigquery.query(topQuery);
        const [recentRows] = await bigquery.query(recentQuery);
        
        // Emit initial stats and recent activity to the newly connected client
        socket.emit('initial-stats', topRows);
        socket.emit('initial-activity', recentRows);
    } catch (err) {
        console.error('BigQuery Query Error:', err);
    }

    socket.on('disconnect', () => {
        io.emit('user-count-update', io.engine.clientsCount);
        console.log('Client disconnected:', socket.id);
    });
});


// Listen to Pub/Sub messages and broadcast to WebSocket clients
// Fan-out logic: Each message is broadcast to all connected clients
async function listenForEvents() {
    try {
        await pubsub.topic(topicName).createSubscription(subscriptionName);
        console.log(`Subscription ${subscriptionName} created.`);
    } catch (err) {
        if (err.code === 6) {
            console.log(`Subscription ${subscriptionName} already exists.`);
        } else {
            console.error('Error creating subscription:', err);
            return;
        }
    }
}

// Start the server and listen for events
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    listenForEvents().catch(console.error);
});