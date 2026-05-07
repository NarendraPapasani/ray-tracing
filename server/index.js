const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  }
});
const redis = new Redis();

// Globals
const BASE_TILE_SIZE = 32;

app.post('/init', async (req, res) => {
  // Clear existing queues
  await redis.del('queue:pending');
  await redis.del('queue:processing');
  
  const sceneData = req.body.scene || "{}";
  await redis.set('job:scene', JSON.stringify(sceneData));
  
  const TOTAL_WIDTH = parseInt(req.body.width) || 800;
  const TOTAL_HEIGHT = parseInt(req.body.height) || 600;
  
  await redis.set('job:startTime', Date.now());
  await redis.set('job:width', TOTAL_WIDTH);
  await redis.set('job:height', TOTAL_HEIGHT);
  
  // Job Initialization: Populate `queue:pending` with micro-chunks
  let count = 0;
  // Use pipeline for batch insertion performance
  const pipeline = redis.pipeline();
  
  for (let y = 0; y < TOTAL_HEIGHT; y += BASE_TILE_SIZE) {
    for (let x = 0; x < TOTAL_WIDTH; x += BASE_TILE_SIZE) {
      const tileWidth = Math.min(BASE_TILE_SIZE, TOTAL_WIDTH - x);
      const tileHeight = Math.min(BASE_TILE_SIZE, TOTAL_HEIGHT - y);
      
      const chunk = {
        id: `chunk_${x}_${y}`,
        x_start: x,
        y_start: y,
        width: tileWidth,
        height: tileHeight,
        total_width: TOTAL_WIDTH,
        total_height: TOTAL_HEIGHT
      };
      
      pipeline.lpush('queue:pending', JSON.stringify(chunk));
      count++;
    }
  }
  
  await pipeline.exec();
  
  // Broadcast to all clients to start working
  io.emit('JOB_STARTED', { totalChunks: count, width: TOTAL_WIDTH, height: TOTAL_HEIGHT });
  res.json({ message: 'Job Initialized', totalChunks: count, width: TOTAL_WIDTH, height: TOTAL_HEIGHT });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Connection Manager: Record user
  // Using an async wrapper here to handle the connect/disconnect broadcasts cleanly
  (async () => {
    await redis.hset('users:active', socket.id, Date.now());
    const workers = await redis.hkeys('users:active');
    io.emit('ACTIVE_WORKERS', { count: workers.length, workers });
  })();

  // Listen for REQUEST_WORK
  socket.on('REQUEST_WORK', async () => {
    // Basic Adaptive Load Balancing Simulation
    // Normally we'd check their average speed. For now, pop 1 chunk.
    const chunkStr = await redis.rpop('queue:pending');
    
    if (chunkStr) {
      const chunk = JSON.parse(chunkStr);
      chunk.assignedAt = Date.now();
      chunk.workerId = socket.id;
      
      // Move to processing queue
      await redis.hset('queue:processing', chunk.id, JSON.stringify(chunk));
      
      // Get scene
      const sceneStr = await redis.get('job:scene');
      const sceneData = sceneStr ? JSON.parse(sceneStr) : null;
      
      // Send task to client
      socket.emit('TASK_DATA', { chunk, scene: sceneData });
    } else {
      socket.emit('NO_WORK_AVAILABLE');
    }
  });

  socket.on('SUBMIT_RESULT', async (data) => {
    // data is { id: string, buffer: ArrayBuffer }
    // Actually, socket.io handles ArrayBuffer natively
    const { id, buffer, x, y, width, height } = data;
    
    // Remove from processing queue
    await redis.hdel('queue:processing', id);
    
    // Broadcast the rendered tile to all other clients so they can update their canvas
    // We send binary array to avoid JSON serialization overhead
    socket.broadcast.emit('TILE_COMPLETED', { id, buffer, x, y, width, height });
    
    // Tell the worker to request more work
    socket.emit('WORK_ACCEPTED');

    // Check if job is entirely finished
    const processingCount = await redis.hlen('queue:processing');
    const pendingCount = await redis.llen('queue:pending');
    
    if (processingCount === 0 && pendingCount === 0) {
      const startTime = await redis.get('job:startTime');
      if (startTime) {
        const duration = Date.now() - parseInt(startTime);
        io.emit('JOB_FINISHED', { duration });
        await redis.del('job:startTime');
      }
    }
  });

  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    await redis.hdel('users:active', socket.id);
    const workers = await redis.hkeys('users:active');
    io.emit('ACTIVE_WORKERS', { count: workers.length, workers });
  });
});

const { runReaper } = require('./reaper');

// The Reaper Cron Job
setInterval(async () => {
  await runReaper(redis);
}, 5000);

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
