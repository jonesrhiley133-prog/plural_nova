import type { CollectionDef, FieldDef } from './collections/schema.js';
import { VISIBILITY_LEVELS, type Visibility } from './types.js';

/**
 * One validator, used by the server before a write and by the client before a
 * form submits. Sharing it is what keeps "the form said it was fine" and "the
 * server rejected it" from disagreeing — the client's check is a courtesy, the
 * server's is the rule, and they are the same code.
 */

export interface ValidationResult {
  ok: boolean;
  /** Coerced values, safe to persist. Only present when `ok`. */
  values: Record<string, unknown>;
  /** Field name → message, ready to show under the input. */
  errors: Record<string, string>;
}

const URL_PATTERN = /^(https?:\/\/|data:|blob:|\/)/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

function coerceField(field: FieldDef, raw: unknown): { value: unknown; error?: string } {
  const empty = raw === null || raw === undefined || raw === '';

  if (empty) {
    if (field.required) return { value: null, error: `${field.label} is required.` };
    return { value: field.kind === 'tags' || field.kind === 'refs' ? [] : null };
  }

  switch (field.kind) {
    case 'text':
    case 'color':
    case 'ref':
    case 'time': {
      const text = asString(raw).trim();
      const limit = field.maxLength ?? 400;
      if (text.length > limit) {
        return { value: text.slice(0, limit), error: `${field.label} is limited to ${limit} characters.` };
      }
      return { value: text };
    }
    case 'longtext': {
      const text = asString(raw);
      const limit = field.maxLength ?? 120_000;
      if (text.length > limit) {
        return { value: text.slice(0, limit), error: `${field.label} is longer than ${limit} characters.` };
      }
      return { value: text };
    }
    case 'url':
    case 'image': {
      const text = asString(raw).trim();
      if (text && !URL_PATTERN.test(text)) {
        return { value: text, error: `${field.label} must be a link starting with http, https or /.` };
      }
      return { value: text };
    }
    case 'int':
    case 'duration': {
      const num = Number(raw);
      if (!Number.isFinite(num)) return { value: null, error: `${field.label} must be a number.` };
      const rounded = Math.round(num);
      if (field.min !== undefined && rounded < field.min) {
        return { value: field.min, error: `${field.label} cannot be below ${field.min}.` };
      }
      if (field.max !== undefined && rounded > field.max) {
        return { value: field.max, error: `${field.label} cannot be above ${field.max}.` };
      }
      return { value: rounded };
    }
    case 'real':
    case 'money': {
      const num = Number(raw);
      if (!Number.isFinite(num)) return { value: null, error: `${field.label} must be a number.` };
      if (field.min !== undefined && num < field.min) {
        return { value: field.min, error: `${field.label} cannot be below ${field.min}.` };
      }
      if (field.max !== undefined && num > field.max) {
        return { value: field.max, error: `${field.label} cannot be above ${field.max}.` };
      }
      return { value: Math.round(num * 100) / 100 };
    }
    case 'bool':
      return { value: raw === true || raw === 1 || raw === 'true' ? 1 : 0 };
    case 'date': {
      const text = asString(raw).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return { value: null, error: `${field.label} must be a date.` };
      }
      return { value: text };
    }
    case 'datetime': {
      const parsed = new Date(asString(raw));
      if (Number.isNaN(parsed.getTime())) {
        return { value: null, error: `${field.label} must be a date and time.` };
      }
      return { value: parsed.toISOString() };
    }
    case 'enum': {
      const text = asString(raw).trim();
      const allowed = field.options?.map((o) => o.value) ?? [];
      if (allowed.length && !allowed.includes(text)) {
        return { value: field.defaultValue ?? allowed[0], error: `${field.label} is not one of the allowed values.` };
      }
      return { value: text };
    }
    case 'tags':
    case 'refs': {
      const list = Array.isArray(raw)
        ? raw
        : asString(raw)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
      const cleaned = list.map((item) => asString(item).trim()).filter(Boolean).slice(0, 200);
      return { value: cleaned };
    }
    case 'json': {
      if (typeof raw === 'string') {
        try {
          return { value: JSON.parse(raw) };
        } catch {
          return { value: null, error: `${field.label} is not valid structured data.` };
        }
      }
      return { value: raw };
    }
    default:
      return { value: raw };
  }
}

export function validateVisibility(value: unknown, fallback: Visibility = 'private'): Visibility {
  return VISIBILITY_LEVELS.includes(value as Visibility) ? (value as Visibility) : fallback;
}

/**
 * Validates `input` against a collection.
 *
 * `partial` skips required-field checks for fields that were not supplied, which
 * is what a PATCH means; a create passes `partial: false` so a missing required
 * field is caught rather than stored as null.
 */
export function validateRecord(
  collection: CollectionDef,
  input: Record<string, unknown>,
  options: { partial?: boolean } = {},
): ValidationResult {
  const partial = options.partial ?? false;
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of collection.fields) {
    const supplied = Object.prototype.hasOwnProperty.call(input, field.name);
    if (partial && !supplied) continue;

    const raw = supplied ? input[field.name] : field.defaultValue ?? null;
    const { value, error } = coerceField(field, raw);
    if (error) errors[field.name] = error;
    else values[field.name] = value;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'visibility')) {
    values['visibility'] = validateVisibility(input['visibility']);
  }
  if (collection.memberScoped && Object.prototype.hasOwnProperty.call(input, 'memberId')) {
    const memberId = asString(input['memberId']).trim();
    values['memberId'] = memberId || null;
  }

  return { ok: Object.keys(errors).length === 0, values, errors };
}

/** Field-level password rules, shared by registration, reset and account recovery. */
export function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 200) return 'That password is too long.';
  if (!/[a-zA-Z]/.test(password)) return 'Include at least one letter.';
  if (!/[0-9\W]/.test(password)) return 'Include at least one number or symbol.';
  return null;
}

export function validateHandle(handle: string): string | null {
  const trimmed = handle.trim();
  if (trimmed.length < 3) return 'Handles need at least 3 characters.';
  if (trimmed.length > 30) return 'Handles are limited to 30 characters.';
  if (!/^[a-z0-9_.-]+$/i.test(trimmed)) return 'Use letters, numbers, dots, dashes or underscores.';
  return null;
}
