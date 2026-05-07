const { runReaper } = require('./reaper');

describe('Reaper Logic', () => {
  it('moves tasks older than 30s back to the pending queue', async () => {
    // Mock the Redis client
    const mockHgetAll = jest.fn();
    const mockPipeline = {
      hdel: jest.fn(),
      rpush: jest.fn(),
      exec: jest.fn()
    };
    
    const mockRedis = {
      hgetall: mockHgetAll,
      pipeline: () => mockPipeline
    };

    // Simulate task assigned 31 seconds ago
    const staleTask = {
      id: "chunk_0_0",
      assignedAt: Date.now() - 31000,
      workerId: "socket_123",
      x_start: 0
    };
    
    // Simulate task assigned 5 seconds ago
    const freshTask = {
      id: "chunk_32_0",
      assignedAt: Date.now() - 5000,
      workerId: "socket_456",
      x_start: 32
    };

    mockHgetAll.mockResolvedValue({
      "chunk_0_0": JSON.stringify(staleTask),
      "chunk_32_0": JSON.stringify(freshTask)
    });

    const reapedCount = await runReaper(mockRedis);

    expect(reapedCount).toBe(1);
    expect(mockPipeline.hdel).toHaveBeenCalledWith('queue:processing', 'chunk_0_0');
    expect(mockPipeline.rpush).toHaveBeenCalledWith('queue:pending', JSON.stringify({
      id: "chunk_0_0",
      x_start: 0
    }));
    expect(mockPipeline.exec).toHaveBeenCalled();
  });
});
