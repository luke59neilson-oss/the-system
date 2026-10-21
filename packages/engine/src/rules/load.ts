import type { z } from 'zod';
import { DEFAULT_RULES } from './defaults';
import { RULES_CONFIG_VERSION, rulesConfigSchema, type RulesConfig } from './schema';

/** Upgrades a raw config from version N to N+1. Must be pure. */
export type RulesMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations keyed by the version they upgrade FROM. Add one whenever
 * RULES_CONFIG_VERSION is bumped; never edit a released migration.
 */
export const RULES_MIGRATIONS: Readonly<Record<number, RulesMigration>> = {};

export type RulesResult = { ok: true; config: RulesConfig } | { ok: false; errors: string[] };

/** Formats a path like `grades[2].topLevel`. */
function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out === '' ? String(part) : `.${String(part)}`;
  }
  return out === '' ? '(root)' : out;
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`);
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
  let current = raw as Record<string, unknown>;
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
    current = { ...migrate(current), configVersion: v + 1 };
  }
  return { ok: true, raw: current };
}

/** Migrates and validates a rules config. Never throws on bad input. */
export function parseRulesConfig(
  raw: unknown,
  migrations: Readonly<Record<number, RulesMigration>> = RULES_MIGRATIONS,
): RulesResult {
  const migrated = migrateRulesConfig(raw, migrations);
  if (!migrated.ok) return migrated;
  const result = rulesConfigSchema.safeParse(migrated.raw);
  if (!result.success) return { ok: false, errors: formatIssues(result.error.issues) };
  return { ok: true, config: result.data };
}

/** The DESIGN.md defaults, parsed. Returns a fresh object on every call. */
export function defaultRules(): RulesConfig {
  const result = parseRulesConfig(JSON.parse(JSON.stringify(DEFAULT_RULES)));
  if (!result.ok) throw new Error(`Default rules are invalid:\n${result.errors.join('\n')}`);
  return result.config;
}
