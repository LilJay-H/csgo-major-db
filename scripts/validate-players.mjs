#!/usr/bin/env node
/*
 * 校验 players.json 是否符合 csgofriberg 管理后台导入接口的格式约束
 * (与 server/src/routes/admin.ts 的 playerImportSchema 保持一致)。
 *
 * 用法: node scripts/validate-players.mjs [文件=players.json]
 * 校验失败时以非零退出码结束并列出所有问题。
 */
import { readFileSync } from 'node:fs';

const ROLES = ['Rifler', 'AWPer', 'Coach'];
const KNOWN_DIFFICULTIES = ['easy', 'normal'];
const IMPORT_BATCH_LIMIT = 1000;

const file = process.argv[2] ?? 'players.json';
const errors = [];

let players;
try {
  players = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`无法读取或解析 ${file}: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(players)) {
  console.error('顶层必须是数组');
  process.exit(1);
}
if (players.length < 1) errors.push('数组不能为空');

const isString = (value) => typeof value === 'string';
const isInt = (value) => Number.isInteger(value);
const isBool = (value) => typeof value === 'boolean';

players.forEach((player, index) => {
  const where = `#${index}(${player?.nickname ?? '?'})`;
  if (typeof player !== 'object' || player === null) {
    errors.push(`${where}: 必须是对象`);
    return;
  }
  if (!isString(player.nickname) || !player.nickname.trim() || player.nickname.trim().length > 64) {
    errors.push(`${where}: nickname 必须是 1-64 字符的非空字符串`);
  }
  if (!isString(player.nationality) || !player.nationality.trim() || player.nationality.trim().length > 64) {
    errors.push(`${where}: nationality 必须是 1-64 字符的非空字符串`);
  }
  if (!isString(player.region) || player.region.trim().length > 32) {
    errors.push(`${where}: region 必须是不超过 32 字符的字符串`);
  }
  if (!isString(player.team) || player.team.trim().length > 64) {
    errors.push(`${where}: team 必须是不超过 64 字符的字符串`);
  }
  if (!isInt(player.age) || player.age < 10 || player.age > 100) {
    errors.push(`${where}: age 必须是 10-100 的整数`);
  }
  if (!ROLES.includes(player.role)) {
    errors.push(`${where}: role 必须是 ${ROLES.join('/')}`);
  }
  if (!isInt(player.major_championships) || player.major_championships < 0) {
    errors.push(`${where}: major_championships 必须是非负整数`);
  }
  if (!isInt(player.major_appearances) || player.major_appearances < 0) {
    errors.push(`${where}: major_appearances 必须是非负整数`);
  }
  if (player.is_active !== undefined && !isBool(player.is_active)) {
    errors.push(`${where}: is_active 必须是布尔值`);
  }
  if (player.is_enabled !== undefined && !isBool(player.is_enabled)) {
    errors.push(`${where}: is_enabled 必须是布尔值`);
  }
  if (player.difficulties !== undefined) {
    if (!Array.isArray(player.difficulties) || player.difficulties.length < 1 || player.difficulties.length > 20) {
      errors.push(`${where}: difficulties 必须是 1-20 项的数组`);
    } else {
      if (new Set(player.difficulties).size !== player.difficulties.length) {
        errors.push(`${where}: difficulties 存在重复项`);
      }
      for (const key of player.difficulties) {
        if (!KNOWN_DIFFICULTIES.includes(key)) {
          errors.push(`${where}: 未知难度 "${key}"(允许: ${KNOWN_DIFFICULTIES.join('/')})`);
        }
      }
    }
  }
});

const nicknames = players.map((player) => player?.nickname);
const duplicates = nicknames.filter((name, index) => nicknames.indexOf(name) !== index);
if (duplicates.length) {
  errors.push(`nickname 重复: ${[...new Set(duplicates)].join(', ')}`);
}

if (errors.length) {
  console.error(`${file} 校验失败,共 ${errors.length} 个问题:`);
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`${file} 校验通过: ${players.length} 名选手`);
if (players.length > IMPORT_BATCH_LIMIT) {
  console.log(`提示: 超过单次导入上限 ${IMPORT_BATCH_LIMIT},导入时需要分批`);
}
