# Distributed WebAssembly Rendering Grid

This project consists of three main components: a Rust-based WebAssembly rendering engine, a Node.js orchestrator (server), and a React-based frontend (client).

## Prerequisites

Before running the project, ensure you have the following installed on your machine:

1. **Node.js & npm**: Install the latest LTS version of [Node.js](https://nodejs.org/) (which includes npm).
2. **Rust & Cargo**: Install Rust via [rustup](https://rustup.rs/).
3. **wasm-pack**: Used for compiling Rust to WebAssembly. Install it by running:
   ```bash
   cargo install wasm-pack
   ```
4. **Redis**: An in-memory data store used by the server.
   - **Linux (Ubuntu/Debian)**: 
     ```bash
     sudo apt install redis-server
     sudo systemctl start redis-server
     ```
   - **macOS**: Install via [Homebrew](https://brew.sh/):
     ```bash
     brew install redis
     brew services start redis
     ```
   - **Windows**: Redis is not officially supported natively. It is recommended to use **Windows Subsystem for Linux (WSL2)** and follow the Linux instructions above, or use **Docker Desktop**:
     ```bash
     docker run -p 6379:6379 -d redis
     ```
   - **Docker (Any OS)**:
     ```bash
     docker run -p 6379:6379 -d redis
     ```

## How to Run the Project

You will need to open multiple terminal windows or tabs to run the components simultaneously.

### 1. Build the WebAssembly Engine

First, you need to compile the Rust engine into WebAssembly so the client can use it.

1. Open a terminal.
2. Navigate to the `engine` directory:
   ```bash
   cd "Work Space/final year project/engine"
   ```
3. Build the WebAssembly package:
   ```bash
   wasm-pack build --target web --out-dir pkg
   ```

### 2. Start the Orchestrator Server

The server manages the distribution of rendering tasks and requires a running Redis instance. Ensure Redis is running before starting the server.

1. Open a new terminal window.
2. Navigate to the `server` directory:
   ```bash
   cd "Work Space/final year project/server"
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   # or node index.js
   ```

### 3. Start the Client Application

The client acts as both the user interface and the rendering worker.

1. Open another new terminal window.
2. Navigate to the `client` directory:
   ```bash
   cd "Work Space/final year project/client"
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

Once the client development server is running, open your web browser and navigate to the local URL provided in the terminal (usually `http://localhost:5173` or similar).
