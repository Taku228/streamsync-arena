import db from '../db/database.js';
import type { EffectRule, StreamSettings } from '@streamsync/shared';

const SETTINGS_KEY = 'stream_settings';
const EFFECT_RULES_KEY = 'effect_rules';
const BILLING_STATUS_KEY = 'billing_status';

export class SettingsRepository {
  getSettings(): StreamSettings | null {
    return this.readJson<StreamSettings>(SETTINGS_KEY);
  }

  saveSettings(settings: StreamSettings) {
    this.writeJson(SETTINGS_KEY, settings);
  }

  getEffectRules(): EffectRule[] | null {
    return this.readJson<EffectRule[]>(EFFECT_RULES_KEY);
  }

  saveEffectRules(rules: EffectRule[]) {
    this.writeJson(EFFECT_RULES_KEY, rules);
  }

  getBillingStatus(): { active: boolean; trialEndsAt: string | null; updatedAt: string } | null {
    return this.readJson(BILLING_STATUS_KEY);
  }

  saveBillingStatus(status: { active: boolean; trialEndsAt: string | null; updatedAt: string }) {
    this.writeJson(BILLING_STATUS_KEY, status);
  }

  private readJson<T>(key: string): T | null {
    const row = db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(key) as { value: string } | undefined;

    if (!row) return null;

    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  private writeJson(key: string, value: unknown) {
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(value), new Date().toISOString());
  }
}
