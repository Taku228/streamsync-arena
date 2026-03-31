import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { registerApiRoutes } from './routes/api.js';
import { MockPlatformAdapter } from './adapters/mockPlatformAdapter.js';
import { MockGameStatsAdapter } from './adapters/gameStatsAdapter.js';
import { StreamService } from './services/streamService.js';
import type { PlatformAdapter } from './adapters/platform.js';
import { YouTubeLiveAdapter } from './adapters/youtubeAdapter.js';
import { TwitchChatAdapter } from './adapters/twitchAdapter.js';
import { SettingsRepository } from './repositories/settingsRepository.js';
import { NoopObsController, ObsWebSocketController } from './integrations/obsController.js';

const port = Number(process.env.PORT ?? 3001);
const app = Fastify({ logger: true });
await app.register(cors, { origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' });

const httpServer = createServer(app.server);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }
});

const obsController = process.env.OBS_WS_URL
  ? new ObsWebSocketController({
      url: process.env.OBS_WS_URL,
      password: process.env.OBS_WS_PASSWORD,
      effectScene: process.env.OBS_EFFECT_SCENE,
      voteSourceName: process.env.OBS_VOTE_SOURCE_NAME
    })
  : new NoopObsController();

const service = new StreamService(
  io,
  new MockGameStatsAdapter(),
  new SettingsRepository(),
  obsController,
  process.env.ALERT_WEBHOOK_URL,
  {
    active: process.env.BILLING_ACTIVE !== 'false',
    trialEndsAt: process.env.BILLING_TRIAL_END ?? null
  }
);
await service.initialize();
await registerApiRoutes(app, service);

app.setErrorHandler((error: unknown, _req, reply) => {
  app.log.error(error);
  const message = error instanceof Error ? error.message : "Unexpected server error";
  reply.status(400).send({ ok: false, message });
});

await app.ready();

function createPlatformAdapter(): PlatformAdapter {
  const platform = process.env.CHAT_PLATFORM ?? 'mock';

  if (platform === 'youtube') {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const liveChatId = process.env.YOUTUBE_LIVE_CHAT_ID;
    if (!apiKey || !liveChatId) {
      throw new Error('YOUTUBE_API_KEY and YOUTUBE_LIVE_CHAT_ID are required for youtube mode');
    }
    return new YouTubeLiveAdapter({
      apiKey,
      liveChatId,
      streamId: process.env.YOUTUBE_STREAM_ID ?? 'youtube-stream'
    });
  }

  if (platform === 'twitch') {
    const channel = process.env.TWITCH_CHANNEL;
    const botUserName = process.env.TWITCH_BOT_USERNAME;
    const oauthToken = process.env.TWITCH_OAUTH_TOKEN;
    if (!channel || !botUserName || !oauthToken) {
      throw new Error('TWITCH_CHANNEL, TWITCH_BOT_USERNAME and TWITCH_OAUTH_TOKEN are required for twitch mode');
    }
    return new TwitchChatAdapter({
      channel,
      botUserName,
      oauthToken,
      streamId: process.env.TWITCH_STREAM_ID ?? channel
    });
  }

  return new MockPlatformAdapter();
}

let adapter: PlatformAdapter;
try {
  adapter = createPlatformAdapter();
} catch (error: unknown) {
  const resolved = error instanceof Error ? error : new Error(String(error));
  app.log.error(resolved, 'Failed to create requested platform adapter. Falling back to mock adapter.');
  service.reportPlatformError(resolved);
  adapter = new MockPlatformAdapter();
}

function bindAdapterHandlers(target: PlatformAdapter) {
  target.onMessage(async (message) => {
    await service.ingestMessage(message);
  });
  target.onError?.((error) => {
    app.log.error(error);
    service.reportPlatformError(error);
  });
}

bindAdapterHandlers(adapter);

try {
  await adapter.connect();
} catch (error: unknown) {
  const resolved = error instanceof Error ? error : new Error(String(error));
  app.log.error(resolved, 'Platform adapter connect failed.');
  service.reportPlatformError(resolved);
  if (!(adapter instanceof MockPlatformAdapter)) {
    adapter = new MockPlatformAdapter();
    bindAdapterHandlers(adapter);
    await adapter.connect();
  }
}

io.on('connection', (socket) => {
  socket.emit('dashboard:state', service.getState());
});

httpServer.listen(port, () => {
  app.log.info(`server listening on http://localhost:${port}`);
});


process.on('SIGINT', async () => {
  await adapter.disconnect();
  await service.stop();
  await app.close();
  process.exit(0);
});
