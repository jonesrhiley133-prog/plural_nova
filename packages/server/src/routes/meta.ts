import { Router } from 'express';
import {
  ACHIEVEMENTS,
  API_VERSION,
  APP_VERSION,
  BODY_REGIONS,
  COLLECTIONS,
  EMOTIONS,
  EMOTION_FAMILIES,
  LOCALES,
  NAVIGATION,
  SENSATION_WORDS,
  TERMS,
  THEME_PRESETS,
  ACCENT_PRESETS,
} from '@pluralnova/shared';
import { handler, ok } from '../http/respond.js';
import { publicKey } from '../services/push.js';
import { connectionCount } from '../realtime/hub.js';

/**
 * Reference data the client needs but should not carry a second copy of.
 * Served once, cached hard, and versioned with the app so a stale client can
 * tell it is behind.
 */
export const metaRouter: Router = Router();

metaRouter.get(
  '/health',
  handler((_req, res) => {
    ok(res, {
      status: 'ok',
      version: APP_VERSION,
      apiVersion: API_VERSION,
      realtimeConnections: connectionCount(),
      time: new Date().toISOString(),
    });
  }),
);

metaRouter.get(
  '/catalogue',
  handler((_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    ok(res, {
      version: APP_VERSION,
      apiVersion: API_VERSION,
      emotions: EMOTIONS,
      emotionFamilies: EMOTION_FAMILIES,
      bodyRegions: BODY_REGIONS,
      sensationWords: SENSATION_WORDS,
      achievements: ACHIEVEMENTS,
      terms: TERMS,
      themePresets: THEME_PRESETS,
      accentPresets: ACCENT_PRESETS,
      navigation: NAVIGATION,
      locales: LOCALES.map((l) => ({ code: l.code, label: l.label, coverage: l.coverage })),
      collections: COLLECTIONS.map((c) => ({
        name: c.name,
        label: c.label,
        singular: c.singular,
        icon: c.icon,
        area: c.area,
        scope: c.scope,
        titleField: c.titleField,
        subtitleField: c.subtitleField ?? null,
        sortField: c.sortField ?? null,
        sortDir: c.sortDir ?? 'desc',
        memberScoped: Boolean(c.memberScoped),
        systemOnly: Boolean(c.systemOnly),
        serverManaged: Boolean(c.serverManaged),
        vault: Boolean(c.vault),
        description: c.description ?? null,
        fields: c.fields,
      })),
    });
  }),
);

metaRouter.get(
  '/push-key',
  handler((_req, res) => {
    ok(res, { publicKey: publicKey() });
  }),
);
