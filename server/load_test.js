const { io } = require('socket.io-client');
const os = require('os');

const SOCKET_COUNT = 50;
const SERVER_URL = 'http://localhost:3001';

const sockets = [];
let connections = 0;
let tasksReceived = 0;

console.log(`Starting Load Test: ${SOCKET_COUNT} connections to ${SERVER_URL}`);

const startTime = Date.now();

for (let i = 0; i < SOCKET_COUNT; i++) {
  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false
  });

  socket.on('connect', () => {
    connections++;
    socket.emit('REQUEST_WORK');
    
    if (connections === SOCKET_COUNT) {
      console.log(`✅ All ${SOCKET_COUNT} sockets connected successfully.`);
    }
  });

  socket.on('TASK_DATA', (chunk) => {
    tasksReceived++;
    
    // Fake the work being done to test throughput
    setTimeout(() => {
      // Just returning the payload empty but signaling SUBMIT_RESULT
      const fakeBuffer = new Uint8Array(chunk.width * chunk.height * 4).buffer;
      socket.emit('SUBMIT_RESULT', {
        id: chunk.id,
        buffer: fakeBuffer,
        x: chunk.x_start,
        y: chunk.y_start,
        width: chunk.width,
        height: chunk.height
      });
    }, 50); // 50ms latency
  });

  socket.on('WORK_ACCEPTED', () => {
    socket.emit('REQUEST_WORK');
  });

  socket.on('disconnect', () => {
    connections--;
  });

  sockets.push(socket);
}

// Memory Monitoring
const monitorInterval = setInterval(() => {
  const memUsage = process.memoryUsage();
  console.log(`--- [Status at ${Math.floor((Date.now() - startTime) / 1000)}s] ---`);
  console.log(`Connected Sockets: ${connections}`);
  console.log(`Tasks Received Loop: ${tasksReceived}`);
  console.log(`RAM Usage (Heap Used): ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`);
  
  if (tasksReceived > 200) {
    console.log("✅ Load test passed. System handled multiple loops of queueing seamlessly.");
    clearInterval(monitorInterval);
    sockets.forEach(s => s.disconnect());
    process.exit(0);
  }
}, 1000);

// Timeout
setTimeout(() => {
  console.log("Test timed out.");
  process.exit(1);
}, 15000);
