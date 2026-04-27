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
    console.log(`Notification received from FaaS: ${eventData.eventId}. Timestamp received: ${eventData.timestamp}`);

    let rawTimestamp = eventData.timestamp;
    
    if (rawTimestamp && typeof rawTimestamp === 'object' && rawTimestamp.value) {
        rawTimestamp = rawTimestamp.value;
    }

    console.log(`Notification received: ${eventData.eventId}. Final TS: ${rawTimestamp}`);

    
    io.emit('new-view', {
        resourceId: eventData.resourceId,
        timestamp: eventData.timestamp, 
        eventId: eventData.eventId,
        resourceType: eventData.resourceType
    });
    io.emit('stats-refresh-trigger', { lastResourceId: eventData.resourceId });
    res.status(200).send('OK');
});

// Endpoint utilized for measuring the eventual consistency window via HTTP GET
app.get('/', async (req, res) => {
    try {
        // Querying the latest 10 records to verify data propagation from Service A
        const query = `SELECT resourceId FROM \`pcd-analytics-project.analytics_db.view_stats\` ORDER BY timestamp DESC LIMIT 10`;
        const [rows] = await bigquery.query(query);
        res.status(200).json(rows);
    } catch (err) {
        console.error('BigQuery Error on GET /:', err);
        res.status(500).send('Error querying BigQuery');
    }
});

// Endpoint to simulate a service crash
app.post('/crash', (req, res) => {
    console.log('--- CRASH TRIGGERED: Simulating service failure ---');
    res.status(500).json({ status: 'crashing', message: 'Instance is terminating' });
    
    // Graceful exit to let the response send, then kill the process
    setTimeout(() => {
        process.exit(1); 
    }, 500);
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