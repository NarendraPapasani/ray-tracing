import init, { render_tile } from './wasm/engine.js';

let isReady = false;

init().then(() => {
    isReady = true;
    self.postMessage({ type: 'READY' });
}).catch(err => {
    console.error("WASM Load Error", err);
});

self.onmessage = (e) => {
    if (!isReady) return;
    
    if (e.data.type === 'RENDER') {
        const { id, x_start, y_start, width, height, total_width, total_height } = e.data.chunk;
        const sceneJson = JSON.stringify(e.data.scene || {});
        
        // Render tile returns a Uint8Array. 
        const u8_array = render_tile(sceneJson, x_start, y_start, width, height, total_width, total_height);
        
        // We can transfer the underlying ArrayBuffer without copying it on the main thread
        // However, the u8_array given back by wasm_bindgen shares WASM memory, so we MUST clone it.
        const outputBuffer = new Uint8ClampedArray(u8_array).buffer;
        
        self.postMessage({
            type: 'RESULT',
            id,
            buffer: outputBuffer,
            x: x_start,
            y: y_start,
            width,
            height
        }, [outputBuffer]);
    }

    if (e.data.type === 'LOCAL_RENDER') {
        const { width, height, scene } = e.data;
        const sceneJson = JSON.stringify(scene || {});
        const startTime = Date.now();
        
        const u8_array = render_tile(sceneJson, 0, 0, width, height, width, height);
        const outputBuffer = new Uint8ClampedArray(u8_array).buffer;
        
        const duration = Date.now() - startTime;
        
        self.postMessage({
            type: 'LOCAL_DONE',
            buffer: outputBuffer,
            width,
            height,
            duration
        }, [outputBuffer]);
    }
};
