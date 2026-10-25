import type { z } from 'zod';
import { DEFAULT_RULES } from './defaults';
import { RULES_CONFIG_VERSION, rulesConfigSchema, type RulesConfig } from './schema';

/** Upgrades a raw config from version N to N+1. Must be pure. */
export type RulesMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations keyed by the version they upgrade FROM. Add one whenever
 * RULES_CONFIG_VERSION is bumped; never edit a released migration.
 */
export const RULES_MIGRATIONS: Readonly<Record<number, RulesMigration>> = {
  /** 1 → 2 (MT.3, DESIGN §7): the hunger tracker is gone, so its settings are dropped. */
  1: (raw) => {
    const next = { ...raw };
    delete next['hunger'];
    return next;
  },
};

export type RulesResult = { ok: true; config: RulesConfig } | { ok: false; errors: string[] };

/** Adds the entry id to array paths so the GM sees `grades[3] (D).topLevel`. */
function describePath(path: readonly PropertyKey[], raw: unknown): string {
  let out = '';
  let node: unknown = raw;
  for (const part of path) {
    if (typeof part === 'number') {
      out += `[${part}]`;
      node = Array.isArray(node) ? node[part] : undefined;
      const entryId = (node as { id?: unknown } | undefined)?.id;
      if (typeof entryId === 'string') out += ` (${entryId})`;
    } else {
      out += out === '' ? String(part) : `.${String(part)}`;
      node =
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[String(part)]
          : undefined;
    }
  }
  return out === '' ? '(root)' : out;
}

function valueAt(raw: unknown, path: readonly PropertyKey[]): unknown {
  let node = raw;
  for (const part of path) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<PropertyKey, unknown>)[part];
  }
  return node;
}

function formatIssues(issues: readonly z.core.$ZodIssue[], raw: unknown): string[] {
  const lines = issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => `${describePath([...issue.path, key], raw)}: unknown setting`);
    }
    const missing = valueAt(raw, issue.path) === undefined;
    return [`${describePath(issue.path, raw)}: ${missing ? 'is required' : issue.message}`];
  });
  return [...new Set(lines)];
}

/** Applies migrations until the raw config reaches the current version. */
export function migrateRulesConfig(
  raw: unknown,
  migrations: Readonly<Record<number, RulesMigration>> = RULES_MIGRATIONS,
  targetVersion: number = RULES_CONFIG_VERSION,
): { ok: true; raw: Record<string, unknown> } | { ok: false; errors: string[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['(root): rules config must be an object'] };
  }
  // Migrations get a private copy so they can never mutate the caller's object.
  let current: Record<string, unknown>;
  try {
    current = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  } catch {
    return { ok: false, errors: ['(root): rules config is not plain JSON data'] };
  }
  const version = current['configVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, errors: ['configVersion: must be a positive integer'] };
  }
  if (version > targetVersion) {
    return {
      ok: false,
      errors: [
        `configVersion: ${version} is newer than this app supports (${targetVersion}); update the app`,
      ],
    };
  }
  for (let v = version; v < targetVersion; v++) {
    const migrate = migrations[v];
    if (!migrate) {
      return { ok: false, errors: [`configVersion: no migration from version ${v} to ${v + 1}`] };
    }
    try {
      current = { ...migrate(current), configVersion: v + 1 };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        errors: [`configVersion: migration from version ${v} failed: ${reason}`],
      };
    }
  }
  return { ok: true, raw: current };
}

/** Migrates and validates a rules config. Never throws on bad input. */
export function parseRulesConfig(
  raw: unknown,
  migrations: Readonly<Record<number, RulesMigration>> = RULES_MIGRATIONS,
  targetVersion: number = RULES_CONFIG_VERSION,
): RulesResult {
  const migrated = migrateRulesConfig(raw, migrations, targetVersion);
  if (!migrated.ok) return migrated;
  const result = rulesConfigSchema.safeParse(migrated.raw);
  if (!result.success)
    return { ok: false, errors: formatIssues(result.error.issues, migrated.raw) };
  return { ok: true, config: result.data };
}

/** The DESIGN.md defaults, parsed. Returns a fresh object on every call. */
export function defaultRules(): RulesConfig {
  const result = parseRulesConfig(JSON.parse(JSON.stringify(DEFAULT_RULES)));
  if (!result.ok) throw new Error(`Default rules are invalid:\n${result.errors.join('\n')}`);
  return result.config;
}

/** Grade a level belongs to: the first grade whose top level is at or above it. */
export function gradeIndexForLevel(rules: RulesConfig, level: number): number {
  const index = rules.grades.findIndex((g) => level <= g.topLevel);
  return index === -1 ? rules.grades.length - 1 : index;
}

/** Class levels that grant a skill selection, per grade, up to the level cap (DESIGN §3). */
export function selectionLevels(rules: RulesConfig): { grade: string; levels: number[] }[] {
  let previousTop = 0;
  const out: { grade: string; levels: number[] }[] = [];
  for (const grade of rules.grades) {
    if (previousTop >= rules.campaign.levelCap) break;
    const levels: number[] = [];
    if (grade.selectionInterval !== null) {
      for (let l = previousTop + 1; l <= grade.topLevel; l++) {
        if (l % grade.selectionInterval === 0) levels.push(l);
      }
    }
    out.push({ grade: grade.id, levels });
    previousTop = grade.topLevel;
  }
  return out;
}
