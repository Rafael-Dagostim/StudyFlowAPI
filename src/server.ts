import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import http from "http";

// Import routes
import authRoutes from "./routes/auth.routes";
import chatRoutes from "./routes/chat.routes";
import documentRoutes from "./routes/document.routes";
import projectRoutes from "./routes/project.routes";
import websocketRoutes from "./routes/websocket.routes";
import generatedFilesRoutes from "./routes/generated-files.routes";

// Import middleware
import { errorHandler } from "./middleware/error.middleware";

// Import WebSocket service
import { initializeWebSocket } from "./services/websocket.service";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for WebSocket support
const server = http.createServer(app);

// Initialize WebSocket service
const webSocketService = initializeWebSocket(server);
console.log('🔌 WebSocket service initialized');

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: true, // Allow all origins in development
    credentials: true,
  })
);

// Enhanced security and performance ready

// Logging middleware
app.use(morgan("combined"));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Timeout middleware for HTTP chat routes (kept as fallback)
app.use('/api/chat', (req, res, next) => {
  // Increase timeout for fallback HTTP requests
  req.setTimeout(60000); // 1 minute for HTTP fallback
  res.setTimeout(60000);
  
  // Add timing for performance monitoring
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (duration > 15000) {
      console.warn(`Slow chat request: ${duration}ms for ${req.path}`);
    }
  });
  
  next();
});

// Timeout middleware for generated files routes
app.use('/api/projects/*/generated-files', (req, res, next) => {
  // Increase timeout for file generation requests
  req.setTimeout(180000); // 3 minutes
  res.setTimeout(180000);
  
  // Add timing for performance monitoring
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`Generated files request: ${duration}ms for ${req.method} ${req.path}`);
    if (duration > 30000) {
      console.warn(`Slow generated files request: ${duration}ms for ${req.path}`);
    }
  });
  
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Study Flow API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    websocket: "enabled",
    streaming: "enabled"
  });
});

// WebSocket status endpoint
app.get("/ws-status", (req, res) => {
  res.status(200).json({
    websocket: {
      enabled: true,
      connectedClients: webSocketService.getIO().engine.clientsCount,
      transports: ['websocket', 'polling']
    },
    streaming: {
      enabled: true,
      features: ['real-time-chat', 'progress-updates', 'conversation-sync']
    }
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/projects", generatedFilesRoutes); // Generated files routes under projects (more specific, must come first)
app.use("/api/projects", projectRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/chat", chatRoutes); // Keep HTTP routes for conversation management
app.use("/api/websocket", websocketRoutes); // WebSocket info and guide

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    hint: "For real-time chat, connect to WebSocket at /socket.io/"
  });
});

// Global error handler
app.use(errorHandler);

// Start server with WebSocket support
server.listen(PORT, () => {
  console.log(`🚀 Study Flow API is running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}/socket.io/`);
  console.log(`📊 WebSocket status: http://localhost:${PORT}/ws-status`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`⚡ Streaming chat enabled via WebSocket`);
});

export default app;
