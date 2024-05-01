const express = require('express');
const httpProxy = require('http-proxy');
const axios = require('axios');

const app = express();
const proxy = httpProxy.createProxyServer({});

// List of servers to balance the load
const servers = [
    { host: '100.25.119.242', port: 8080 },
    { host: '3.87.69.252', port: 8080 },
    // Add more servers as needed
];



// Middleware to handle incoming requests
app.use(async (req, res) => {
    let minLoad = Infinity;
    let minLoadServer = null;


    let previousCPU = 0;
    let previousMemory = 0;
    let previousConnections = 0;

    for (const server of servers) {
        try {
            const { data } = await axios.get(`http://${server.host}:8000/get-metrics`);
            console.log("data::",data);
            let { cpuUsage, memoryUsage, activeConnections } = data;

            console.log("cpuUsage:",cpuUsage,"memoryUsage:",memoryUsage,"activeConnections:",activeConnections);
            
            cpuUsage = parseFloat(cpuUsage.replace('%', '')); // Convert "20.45%" to 20.45
            memoryUsage = parseFloat(memoryUsage.replace('%', '')); // Convert "20.45%" to 20.45
            
            const deltaCPU = previousCPU - cpuUsage;
            const deltaMemory = previousMemory - memoryUsage;
            const deltaConnections = previousConnections - activeConnections;

            // Normalize deltas to [0, 1]
            const normalizedDeltaCPU = Math.abs(deltaCPU) / 100; // Assuming previous and current CPU values are percentages
            const normalizedDeltaMemory = Math.abs(deltaMemory) / 100; // Assuming previous and current memory values are percentages
            const normalizedDeltaConnections = Math.abs(deltaConnections) / 1200; // Assuming previous and current connection counts are percentages
            

            // Calculate weights
            const weights = [
                normalizedDeltaCPU / (normalizedDeltaCPU + normalizedDeltaMemory + normalizedDeltaConnections),
                normalizedDeltaMemory / (normalizedDeltaCPU + normalizedDeltaMemory + normalizedDeltaConnections),
                normalizedDeltaConnections / (normalizedDeltaCPU + normalizedDeltaMemory + normalizedDeltaConnections)
            ];

            // Get current load
            const load = weights[0] * cpuUsage + weights[1] * memoryUsage + weights[2] * activeConnections;

            // Check if this server has minimum load
            console.log("LOAD FOR---",server.host,"------load-",load,);
            if (load < minLoad) {
                minLoad = load;
                minLoadServer = server;
            }
        } catch (error) {
            console.error(`Error fetching metrics from server ${server.host}:${server.port}: ${error.message}`);
        }
    }

    // Update previous values after processing all servers
    if (minLoadServer) {
        previousCPU = minLoadServer.cpuUsage;
        previousMemory = minLoadServer.memoryUsage;
        previousConnections = minLoadServer.activeConnections;

        // Proxy the request to the server with the minimum load
        const { host, port } = minLoadServer;
        const target = `http://${host}:${port}`;
        proxy.web(req, res, { target });
        console.log(`Redirected to ${host}:${port}`);
        console.log("***************************************************************");
    } else {
        res.status(500).send('Unable to find a server to handle the request');
    }
});

const PORT = 6000;
app.listen(PORT, () => {
    console.log(`Load balancer listening on port ${PORT}`);
});
