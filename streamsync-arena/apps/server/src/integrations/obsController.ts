import { createHash } from 'node:crypto';
import WebSocket from 'ws';

type ObsHello = {
  op: 0;
  d: {
    rpcVersion: number;
    authentication?: {
      challenge: string;
      salt: string;
    };
  };
};

type ObsIdentified = { op: 2 };
type ObsRequestResponse = {
  op: 7;
  d: {
    requestId: string;
    requestStatus: { result: boolean; code: number; comment?: string };
    responseData?: Record<string, unknown>;
  };
};

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
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();
  private connected = false;

  constructor(private readonly config: ObsControllerConfig) {}

  async connect() {
    this.socket = new WebSocket(this.config.url);

    await new Promise<void>((resolve, reject) => {
      this.socket?.once('open', () => resolve());
      this.socket?.once('error', (err) => reject(err));
    });

    const hello = await this.waitForHello();
    const authentication = this.buildAuthentication(hello);
    this.send({ op: 1, d: { rpcVersion: hello.d.rpcVersion, authentication } });
    await this.waitForIdentified();

    this.socket.on('message', (buffer) => this.handleMessage(String(buffer)));
    this.socket.on('close', () => {
      this.connected = false;
      for (const item of this.pending.values()) {
        item.reject(new Error('OBS socket closed'));
      }
      this.pending.clear();
    });
    this.socket.on('error', () => {
      this.connected = false;
    });
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

  private async waitForHello(): Promise<ObsHello> {
    return new Promise<ObsHello>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('OBS hello timeout')), 5000);
      this.socket?.once('message', (buffer) => {
        clearTimeout(timeout);
        const payload = JSON.parse(String(buffer)) as ObsHello;
        if (payload.op !== 0) {
          reject(new Error(`Unexpected OBS hello opcode: ${payload.op}`));
          return;
        }
        resolve(payload);
      });
    });
  }

  private async waitForIdentified(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('OBS identify timeout')), 5000);
      this.socket?.once('message', (buffer) => {
        clearTimeout(timeout);
        const payload = JSON.parse(String(buffer)) as ObsIdentified;
        if (payload.op !== 2) {
          reject(new Error(`Unexpected OBS identify opcode: ${payload.op}`));
          return;
        }
        resolve();
      });
    });
  }

  private buildAuthentication(hello: ObsHello): string | undefined {
    const authMeta = hello.d.authentication;
    if (!authMeta) return undefined;
    if (!this.config.password) {
      throw new Error('OBS requires password authentication but OBS_WS_PASSWORD is empty');
    }

    const secret = this.sha256Base64(`${this.config.password}${authMeta.salt}`);
    return this.sha256Base64(`${secret}${authMeta.challenge}`);
  }

  private handleMessage(raw: string) {
    const payload = JSON.parse(raw) as ObsRequestResponse | { op: number };
    if (payload.op !== 7 || !('d' in payload)) return;

    const resolver = this.pending.get(payload.d.requestId);
    if (!resolver) return;

    this.pending.delete(payload.d.requestId);
    if (!payload.d.requestStatus.result) {
      resolver.reject(new Error(`OBS request failed (${payload.d.requestStatus.code}): ${payload.d.requestStatus.comment ?? 'unknown'}`));
      return;
    }
    resolver.resolve(payload.d);
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
    if (!this.connected) {
      throw new Error('OBS is not connected');
    }

    const requestId = String(++this.requestId);
    const responsePromise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(requestId)) return;
        this.pending.delete(requestId);
        reject(new Error(`OBS request timeout: ${requestType}`));
      }, 5000);
    });

    this.send({ op: 6, d: { requestType, requestId, requestData } });
    return responsePromise;
  }

  private sha256Base64(input: string) {
    return createHash('sha256').update(input).digest('base64');
  }

  private send(payload: Record<string, unknown>) {
    this.socket?.send(JSON.stringify(payload));
  }
}
