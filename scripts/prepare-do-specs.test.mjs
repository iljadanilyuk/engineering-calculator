import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

const repoRoot = resolve(import.meta.dirname, '..');
const backendSpecPath = resolve(repoRoot, '.scratch/deploy/backend-app.yaml');
const websiteSpecPath = resolve(repoRoot, '.scratch/deploy/website-static-app.yaml');

describe('prepare-do-specs', () => {
  test('rejects placeholder and obviously weak production JWT secrets', () => {
    for (const jwtSecret of [
      'replace-with-at-least-32-random-characters',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ]) {
      const result = runPrepareSpecs({ JWT_SECRET: jwtSecret });

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        'JWT_SECRET must be a non-placeholder random secret',
      );
    }
  });

  test('rejects the placeholder backend worker command', () => {
    const result = runPrepareSpecs({
      DO_BACKEND_WORKER_ENABLED: 'true',
      DO_BACKEND_WORKER_RUN_COMMAND: 'bun run start:worker',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'must point at a real long-running worker command',
    );
  });

  test('rejects invalid backend cron schedules before writing deploy specs', () => {
    const result = runPrepareSpecs({
      DO_BACKEND_CRON_NAME: 'daily-maintenance',
      DO_BACKEND_CRON_TASK: 'db:ping',
      DO_BACKEND_CRON_SCHEDULE: '0 3 nope * *',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('day-of-month field');
  });

  test('rejects unsupported App Platform instance size slugs', () => {
    const result = runPrepareSpecs({
      DO_API_INSTANCE_SIZE_SLUG: 'expensive-surprise',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'DO_API_INSTANCE_SIZE_SLUG must be one of:',
    );
  });

  test('rejects deployment spec generation from a different checkout branch', () => {
    const result = runPrepareSpecs(
      {
        DO_GIT_BRANCH: 'codex-deploy-branch-mismatch-test',
      },
      { skipReleaseGitCheck: false },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('Deployment branch mismatch');
  });

  test('generates explicit backend worker and cron job blocks', () => {
    const result = runPrepareSpecs({
      DO_BACKEND_WORKER_ENABLED: 'true',
      DO_BACKEND_WORKER_NAME: 'notifications',
      DO_BACKEND_WORKER_RUN_COMMAND: 'bun run start:worker:notifications',
      DO_BACKEND_CRON_NAME: 'daily-maintenance',
      DO_BACKEND_CRON_TASK: 'db:ping',
      DO_BACKEND_CRON_SCHEDULE: '0 3 * * *',
      DO_BACKEND_CRON_TIME_ZONE: 'Europe/Moscow',
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const spec = normalizeNewlines(readFileSync(backendSpecPath, 'utf8'));
    expect(appSpecName(spec)?.length).toBeLessThanOrEqual(32);
    expect(spec).toContain('version: "18"');
    expect(spec).toContain('workers:');
    expect(spec).toContain('key: CORS_ORIGINS');
    expect(spec).toContain('value: "https://website.example.com"');
    expect(spec).toContain('key: NODE_ENV');
    expect(spec).toContain('value: "production"');
    expect(spec).toContain('key: PUBLIC_API_URL');
    expect(spec).toContain('value: "https://api.example.com"');
    expect(spec).toContain('key: PUBLIC_WEBSITE_URL');
    expect(spec).toContain('key: PUBLIC_WEBAPP_URL');
    expect(spec).toContain('key: AUTH_CORS_ORIGINS');
    expect(spec).toContain('value: "https://webapp.example.com"');
    expect(spec).toContain('key: TRUST_PROXY_HEADERS');
    expect(spec).toContain('value: "true"');
    expect(spec).toContain('  - name: notifications');
    expect(spec).toContain('run_command: "bun run start:worker:notifications"');
    expect(spec).toContain('kind: SCHEDULED');
    expect(spec).toContain('run_command: "bun run start:cron -- db:ping"');
    expect(spec).toContain('time_zone: "Europe/Moscow"');
    expect(spec).toContain(`    http_port: 8080
    instance_size_slug: apps-s-1vcpu-1gb
    instance_count: 1`);
    expect(spec).not.toContain('REPLACE_WITH_');
  });

  test('generates explicit backend API instance sizing overrides', () => {
    const result = runPrepareSpecs({
      DO_API_INSTANCE_SIZE_SLUG: 'apps-s-1vcpu-2gb',
      DO_API_INSTANCE_COUNT: '2',
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const spec = normalizeNewlines(readFileSync(backendSpecPath, 'utf8'));
    expect(spec).toContain(`    http_port: 8080
    instance_size_slug: apps-s-1vcpu-2gb
    instance_count: 2`);
    expect(spec).not.toContain('REPLACE_WITH_');
  });

  test('generates initial backend spec with safe self API URL and PostgreSQL 18', () => {
    const result = runPrepareSpecs({}, { target: 'backend-initial' });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const spec = normalizeNewlines(readFileSync(backendSpecPath, 'utf8'));
    expect(spec).toContain('region: fra');
    expect(spec).toContain('version: "18"');
    expect(spec).toContain('key: PUBLIC_API_URL');
    expect(spec).toContain('value: "${_self.PUBLIC_URL}"');
    expect(spec).toContain('https://placeholder.invalid');
    expect(spec).not.toContain('REPLACE_WITH_');
  });

  test('backend final requires the deployed backend URL for proposal and Telegram links', () => {
    const result = runPrepareSpecs({ DO_BACKEND_URL: '' });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('DO_BACKEND_URL is required and cannot be empty');
  });

  test('generates website build-time API and webapp URLs', () => {
    const result = runPrepareSpecs(
      {
        DO_BACKEND_URL: 'https://api.example.com',
        DO_WEBAPP_URL: 'https://webapp.example.com',
      },
      { target: 'website' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const spec = normalizeNewlines(readFileSync(websiteSpecPath, 'utf8'));
    expect(appSpecName(spec)?.length).toBeLessThanOrEqual(32);
    expect(spec).toContain('key: BUN_VERSION');
    expect(spec).toContain('value: "1.3.14"');
    expect(spec).toContain('key: PUBLIC_API_URL');
    expect(spec).toContain('value: "https://api.example.com"');
    expect(spec).toContain('key: PUBLIC_WEBAPP_URL');
    expect(spec).toContain('value: "https://webapp.example.com"');
    expect(spec).toContain('key: PUBLIC_WEBSITE_URL');
    expect(spec).toContain('value: "https://website.example.com"');
    expect(spec).not.toContain('REPLACE_WITH_');
  });

  test('website spec can use App Platform self public URL before the custom domain is known', () => {
    const result = runPrepareSpecs(
      {
        DO_BACKEND_URL: 'https://api.example.com',
        DO_WEBAPP_URL: 'https://webapp.example.com',
        DO_WEBSITE_URL: '',
      },
      { target: 'website' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const spec = normalizeNewlines(readFileSync(websiteSpecPath, 'utf8'));
    expect(spec).toContain('key: PUBLIC_WEBSITE_URL');
    expect(spec).toContain('value: "${_self.PUBLIC_URL}"');
    expect(spec).not.toContain('REPLACE_WITH_');
  });

  test('generates webapp build-time API URL with pinned Bun buildpack version', () => {
    const result = runPrepareSpecs(
      {
        DO_BACKEND_URL: 'https://api.example.com',
      },
      { target: 'webapp' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const spec = normalizeNewlines(readFileSync(resolve(repoRoot, '.scratch/deploy/webapp-static-app.yaml'), 'utf8'));
    expect(appSpecName(spec)?.length).toBeLessThanOrEqual(32);
    expect(spec).toContain('key: BUN_VERSION');
    expect(spec).toContain('value: "1.3.14"');
    expect(spec).toContain('key: VITE_API_URL');
    expect(spec).toContain('value: "https://api.example.com"');
    expect(spec).not.toContain('REPLACE_WITH_');
  });
});

function runPrepareSpecs(extraEnv = {}, { skipReleaseGitCheck = true, target = 'backend-final' } = {}) {
  const testOnlyEnv = skipReleaseGitCheck
    ? {
        NODE_ENV: 'test',
        DO_SKIP_RELEASE_GIT_CHECK_FOR_TESTS: '1',
      }
    : {};

  return spawnSync(process.execPath, ['scripts/prepare-do-specs.mjs', target], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      ...testOnlyEnv,
      DO_PROJECT_SLUG: 'poznyak-engineering-calculator-test',
      DO_GITHUB_REPO: 'owner/repo',
      DO_GIT_BRANCH: 'main',
      JWT_SECRET: 'abcdefghijklmnopqrstuvwxyz123456',
      DO_BACKEND_URL: 'https://api.example.com',
      DO_WEBAPP_URL: 'https://webapp.example.com',
      DO_WEBSITE_URL: 'https://website.example.com',
      ...extraEnv,
    },
  });
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, '\n');
}

function appSpecName(spec) {
  return spec.match(/^name:\s*(.+)$/m)?.[1]?.trim();
}
