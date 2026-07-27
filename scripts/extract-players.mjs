#!/usr/bin/env node
/*
 * 从 PostgreSQL custom 格式 dump 中提取选手数据,生成可直接导入
 * csgofriberg 管理后台(/api/admin/players/import)的 players.json。
 *
 * 用法:
 *   node scripts/extract-players.mjs <postgres.dump> [输出文件=players.json]
 *
 * 需要 pg_restore(PostgreSQL 客户端工具);不在 PATH 时通过环境变量指定:
 *   PG_RESTORE="C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" node scripts/extract-players.mjs ...
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dumpPath = process.argv[2];
const outPath = process.argv[3] ?? 'players.json';
if (!dumpPath) {
  console.error('用法: node scripts/extract-players.mjs <postgres.dump> [输出文件]');
  process.exit(1);
}

const DIFFICULTY_ORDER = ['normal', 'easy', 'beginner'];

function decodeCopyValue(raw) {
  if (raw === '\\N') return null;
  return raw.replace(/\\(.)/g, (_, ch) =>
    ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === 'r' ? '\r' : ch
  );
}

function parseCopy(sql, table) {
  const lines = sql.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`COPY public.${table} `));
  if (start === -1) throw new Error(`dump 中未找到表 ${table} 的数据`);
  const header = lines[start];
  const columns = header
    .slice(header.indexOf('(') + 1, header.indexOf(')'))
    .split(',')
    .map((name) => name.trim());
  const rows = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === '\\.') break;
    if (!line) continue;
    const values = line.split('\t').map(decodeCopyValue);
    rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index]])));
  }
  return rows;
}

function sortDifficulties(keys) {
  return [...new Set(keys)].sort((a, b) => {
    const ia = DIFFICULTY_ORDER.indexOf(a);
    const ib = DIFFICULTY_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

const pgRestore = process.env.PG_RESTORE || 'pg_restore';
const tmp = mkdtempSync(join(tmpdir(), 'csgo-major-db-'));
const sqlPath = join(tmp, 'players.sql');
let sql;
try {
  execFileSync(
    pgRestore,
    ['-f', sqlPath, '--data-only', '-t', 'players', '-t', 'player_difficulties', dumpPath],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );
  sql = readFileSync(sqlPath, 'utf8');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const playerRows = parseCopy(sql, 'players');
const difficultyRows = parseCopy(sql, 'player_difficulties');

const difficultiesByPlayer = new Map();
for (const row of difficultyRows) {
  if (!difficultiesByPlayer.has(row.player_id)) difficultiesByPlayer.set(row.player_id, []);
  difficultiesByPlayer.get(row.player_id).push(row.difficulty_key);
}

const players = playerRows
  .filter((row) => row.is_enabled === 't')
  .map((row) => {
    const entry = {
      nickname: row.nickname,
      nationality: row.nationality,
      region: row.region ?? '',
      team: row.team ?? '',
      age: Number(row.age),
      role: row.role,
      major_championships: Number(row.major_championships),
      major_appearances: Number(row.major_appearances),
    };
    const difficulties = difficultiesByPlayer.get(row.id);
    if (difficulties?.length) entry.difficulties = sortDifficulties(difficulties);
    entry.is_active = row.is_active === 't';
    entry.is_enabled = row.is_enabled === 't';
    return entry;
  })
  .sort((a, b) => a.nickname.localeCompare(b.nickname, 'en', { sensitivity: 'base' }));

writeFileSync(outPath, `${JSON.stringify(players, null, 2)}\n`);
console.log(`已生成 ${outPath}: ${players.length} 名选手`);
