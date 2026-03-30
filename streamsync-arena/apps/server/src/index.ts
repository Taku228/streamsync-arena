import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { registerApiRoutes } from './routes/api.js';
import { MockPlatformAdapter } from './adapters/mockPlatformAdapter.js';
import { MockGameStatsAdapter } from './adapters/gameStatsAdapter.js';
import { StreamService } from './services/streamService.js';

const port = Number(process.env.PORT ?? 3001);
const app = Fastify({ logger: true });
await app.register(cors, { origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' });

const httpServer = createServer(app.server);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }
});

const service = new StreamService(io, new MockGameStatsAdapter());
await registerApiRoutes(app, service);
await app.ready();

const adapter = new MockPlatformAdapter();
adapter.onMessage(async (message) => {
  await service.ingestMessage(message);
});
adapter.connect();

io.on('connection', (socket) => {
  socket.emit('dashboard:state', service.getState());
});

httpServer.listen(port, () => {
  app.log.info(`server listening on http://localhost:${port}`);
});
