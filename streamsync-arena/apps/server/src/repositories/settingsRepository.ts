import db from '../db/database.js';
import type { StreamSettings } from '@streamsync/shared';

const SETTINGS_KEY = 'stream_settings';

export class SettingsRepository {
  getSettings(): StreamSettings | null {
    const row = db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(SETTINGS_KEY) as { value: string } | undefined;

    if (!row) return null;

    try {
      return JSON.parse(row.value) as StreamSettings;
    } catch {
      return null;
    }
  }

  saveSettings(settings: StreamSettings) {
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(SETTINGS_KEY, JSON.stringify(settings), new Date().toISOString());
  }
}
