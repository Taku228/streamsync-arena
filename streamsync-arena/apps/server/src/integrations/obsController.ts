import WebSocket from 'ws';

export type ObsControllerConfig = {
  url: string;
  password?: string;
  effectScene?: string;
  voteSourceName?: string;
  voteSceneName?: string;
};

export interface ObsController {
  connect(): Promise<void>;
  onVoteUpdated(active: boolean): Promise<void>;
  onEffectTriggered(): Promise<void>;
}

export class NoopObsController implements ObsController {
  async connect() {}
  async onVoteUpdated() {}
  async onEffectTriggered() {}
}

export class ObsWebSocketController implements ObsController {
  private socket?: WebSocket;
  private requestId = 0;
  private readonly pending = new Map<string, (value: unknown) => void>();
  private connected = false;

  constructor(private readonly config: ObsControllerConfig) {}

  async connect() {
    if (this.config.password) {
      throw new Error('OBS password auth is not implemented yet. Disable auth or use Noop mode temporarily.');
    }

    await new Promise<void>((resolve, reject) => {
      this.socket = new WebSocket(this.config.url);

      this.socket.on('open', () => resolve());
      this.socket.on('message', (buffer) => this.handleMessage(String(buffer)));
      this.socket.on('error', (err) => reject(err));
      this.socket.on('close', () => {
        this.connected = false;
      });
    });

    await this.identify();
    this.connected = true;
  }

  async onVoteUpdated(active: boolean) {
    if (!this.connected || !this.config.voteSourceName) return;
    const sceneName = this.config.voteSceneName ?? this.config.effectScene;
    if (!sceneName) return;

    const sceneItemId = await this.getSceneItemId(sceneName, this.config.voteSourceName);
    await this.call('SetSceneItemEnabled', {
      sceneName,
      sceneItemId,
      sceneItemEnabled: active
    });
  }

  async onEffectTriggered() {
    if (!this.connected || !this.config.effectScene) return;
    await this.call('SetCurrentProgramScene', { sceneName: this.config.effectScene });
  }

  private handleMessage(raw: string) {
    const payload = JSON.parse(raw) as { op: number; d?: Record<string, unknown> };

    // 2: Identified
    if (payload.op === 2) return;

    // 7: RequestResponse
    if (payload.op === 7) {
      const requestId = String(payload.d?.requestId ?? '');
      const resolver = this.pending.get(requestId);
      if (resolver) {
        this.pending.delete(requestId);
        resolver(payload.d);
      }
    }
  }

  private async identify() {
    this.send({ op: 1, d: { rpcVersion: 1 } });
  }

  private async getSceneItemId(sceneName: string, sourceName: string): Promise<number> {
    const response = (await this.call('GetSceneItemList', { sceneName })) as {
      responseData?: { sceneItems?: Array<{ sourceName: string; sceneItemId: number }> };
    };
    const hit = response.responseData?.sceneItems?.find((item) => item.sourceName === sourceName);
    if (!hit) {
      throw new Error(`OBS scene item not found: ${sourceName} in ${sceneName}`);
    }
    return hit.sceneItemId;
  }

  private async call(requestType: string, requestData: Record<string, unknown>) {
    const requestId = String(++this.requestId);
    const responsePromise = new Promise<unknown>((resolve) => {
      this.pending.set(requestId, resolve);
    });

    this.send({ op: 6, d: { requestType, requestId, requestData } });
    return responsePromise;
  }

  private send(payload: Record<string, unknown>) {
    this.socket?.send(JSON.stringify(payload));
  }
}
