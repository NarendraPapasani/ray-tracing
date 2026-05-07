import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

// Dynamically connect to the server using the machine's current IP/hostname
const SERVER_URL = `http://${window.location.hostname}:3001`;

function App() {
  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const socketRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [workerReady, setWorkerReady] = useState(false);
  const [tilesRendered, setTilesRendered] = useState(0);
  const [activeWorkers, setActiveWorkers] = useState([]);
  const [resolution, setResolution] = useState({ w: 800, h: 600 });
  const [gridTime, setGridTime] = useState(null);
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isHost = isLocalhost || new URLSearchParams(window.location.search).get('host') === 'true';
  const [sceneJson, setSceneJson] = useState(JSON.stringify({
    spheres: [
      { center: { x: 0.0, y: -1.0, z: -3.0 }, radius: 1.0, color: { x: 1.0, y: 0.2, z: 0.2 }, reflectivity: 0.1 },
      { center: { x: -2.0, y: 0.0, z: -4.0 }, radius: 1.0, color: { x: 0.2, y: 1.0, z: 0.2 }, reflectivity: 0.1 },
      { center: { x: 2.0, y: 0.0, z: -4.0 }, radius: 1.0, color: { x: 0.2, y: 0.2, z: 1.0 }, reflectivity: 0.1 },
      { center: { x: 0.0, y: -101.0, z: -4.0 }, radius: 100.0, color: { x: 0.8, y: 0.8, z: 0.8 }, reflectivity: 0.0 }
    ],
    light: { position: { x: 5.0, y: 5.0, z: 0.0 }, intensity: 1.0 },
    camera: { position: { x: 0.0, y: 0.0, z: 0.0 } }
  }, null, 2));

  // Initialize Worker
  useEffect(() => {
    const worker = new Worker(new URL('./renderer.worker.js', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
      if (e.data.type === 'READY') {
        setWorkerReady(true);
      } else if (e.data.type === 'RESULT') {
        const { id, buffer, x, y, width, height } = e.data;
        
        // Draw directly to the screen
        drawToCanvas(buffer, x, y, width, height);
        
        // Send to server
        if (socketRef.current) {
          socketRef.current.emit('SUBMIT_RESULT', { id, buffer, x, y, width, height });
        }
      }
    };

    workerRef.current = worker;
    
    return () => worker.terminate();
  }, []);

  // Initialize Socket.io
  useEffect(() => {
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Wait a tiny bit and request work if worker is ready
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('TASK_DATA', (data) => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'RENDER', chunk: data.chunk, scene: data.scene });
      }
    });

    socket.on('ACTIVE_WORKERS', (data) => {
      setActiveWorkers(data.workers || []);
    });

    socket.on('JOB_FINISHED', (data) => {
      setGridTime(data.duration);
    });

    socket.on('WORK_ACCEPTED', () => {
      setTilesRendered(prev => prev + 1);
      socket.emit('REQUEST_WORK');
    });

    // Listen for other people finishing tiles!
    socket.on('TILE_COMPLETED', (data) => {
      const { buffer, x, y, width, height } = data;
      drawToCanvas(buffer, x, y, width, height);
      setTilesRendered(prev => prev + 1);
    });

    socket.on('NO_WORK_AVAILABLE', () => {
      // Server is empty. Try again in 5 seconds
      setTimeout(() => {
        socket.emit('REQUEST_WORK');
      }, 5000);
    });

    return () => socket.disconnect();
  }, []);

  // Effect to request work continuously when worker is ready
  useEffect(() => {
    if (connected && workerReady) {
      socketRef.current.emit('REQUEST_WORK');
    }
  }, [connected, workerReady]);

  const drawToCanvas = (buffer, x, y, width, height) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const u8Clamped = new Uint8ClampedArray(buffer);
    const imageData = new ImageData(u8Clamped, width, height);
    ctx.putImageData(imageData, x, y);
  };

  const initJob = async () => {
    let parsedScene;
    try {
      parsedScene = JSON.parse(sceneJson);
    } catch (e) {
      alert("Invalid JSON!");
      return;
    }

    setGridTime(null);
    const res = await fetch(`${SERVER_URL}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: parsedScene, width: resolution.w, height: resolution.h })
    });
    const data = await res.json();
    console.log(data);
    
    // Clear the canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setTilesRendered(0);
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Distributed WebAssembly Rendering Grid</h1>
        <div className="status-indicators">
          <span className={`status ${connected ? 'ready' : 'offline'}`}>
            {connected ? 'Server Connected' : 'Server Offline'}
          </span>
          <span className={`status ${workerReady ? 'ready' : 'offline'}`}>
            {workerReady ? 'Wasm Ready' : 'Wasm Loading'}
          </span>
          <span className="info">Tiles Rendered (Network): {tilesRendered}</span>
          <span className="info">Renderers Online: {activeWorkers.length}</span>
        </div>
        
        {isHost && (
          <div className="host-controls" style={{ display: 'flex', gap: '10px', marginTop: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <select 
              value={`${resolution.w}x${resolution.h}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                setResolution({ w, h });
              }}
              style={{ padding: '0.8rem', borderRadius: '8px', background: 'var(--panel-bg)', color: '#fff', border: '1px solid var(--glass-border)' }}
            >
              <option value="800x600">800 x 600 (Standard)</option>
              <option value="1920x1080">1920 x 1080 (HD)</option>
              <option value="3840x2160">3840 x 2160 (4K)</option>
            </select>
            <button className="primary-btn" onClick={initJob}>Initialize Server Queue (Distributed Test)</button>
          </div>
        )}

        {(gridTime !== null) && (
          <div className="benchmark-results" style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.5)', borderRadius: '12px', border: '1px solid var(--accent)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--accent)' }}>Result ({resolution.w}x{resolution.h})</h3>
            <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '1.2rem' }}>
              <div>Render Time: <strong>{gridTime ? (gridTime / 1000).toFixed(2) + 's' : '--'}</strong></div>
            </div>
          </div>
        )}

        <div className="worker-list">
          {activeWorkers.map(w => (
            <span key={w} className="worker-badge">#{w.substring(0, 6)}</span>
          ))}
        </div>
      </header>

      <div className="content-area" style={{ display: 'flex', gap: '20px', marginTop: '20px', justifyContent: 'center' }}>
        {isHost && (
          <div className="scene-editor" style={{ flex: 1, maxWidth: '500px' }}>
            <h3>Scene Configuration (JSON)</h3>
            <textarea 
              value={sceneJson}
              onChange={(e) => setSceneJson(e.target.value)}
              style={{ width: '100%', height: '580px', fontFamily: 'monospace', padding: '10px' }}
            />
          </div>
        )}
        <div className="canvas-wrapper" style={{ flex: isHost ? 2 : 'none' }}>
          <canvas 
            ref={canvasRef} 
            width={resolution.w} 
            height={resolution.h} 
            className="render-canvas"
            style={{ border: '1px solid #333' }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
