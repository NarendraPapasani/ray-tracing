async function runReaper(redis) {
  try {
    const processingTasks = await redis.hgetall('queue:processing');
    const now = Date.now();
    let reapedCount = 0;
    
    const pipeline = redis.pipeline();

    for (const [id, taskStr] of Object.entries(processingTasks)) {
      const task = JSON.parse(taskStr);
      if (now - task.assignedAt > 30000) {
        pipeline.hdel('queue:processing', id);
        
        delete task.assignedAt;
        delete task.workerId;
        
        pipeline.rpush('queue:pending', JSON.stringify(task));
        reapedCount++;
      }
    }
    
    if (reapedCount > 0) {
      await pipeline.exec();
      console.log(`Reaper reclaimed ${reapedCount} stale tasks.`);
    }
    return reapedCount;
  } catch (err) {
    console.error('Reaper Error:', err);
    throw err;
  }
}

module.exports = { runReaper };
