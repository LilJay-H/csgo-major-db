# csgo-major-db

[csgofriberg](https://github.com/shnlfriberg/csgofriberg)（弗一把）的选手数据仓库。

## 内容

| 文件 | 说明 |
|---|---|
| `players.json` | 646 名 CS Major 选手，可直接通过管理后台 `POST /api/admin/players/import` 导入（单次上限 1000） |
| `scripts/extract-players.mjs` | 从 PostgreSQL 备份（custom 格式 dump）重新生成 `players.json` |
| `scripts/validate-players.mjs` | 校验 `players.json` 是否符合导入接口约束 |

## 重新生成

需要 Node.js ≥ 18 与 PostgreSQL 客户端工具（`pg_restore`），以及一份包含 `players` 与 `player_difficulties` 表的数据库 dump：

```bash
node scripts/extract-players.mjs <postgres.dump> players.json
# pg_restore 不在 PATH 时：
# PG_RESTORE="C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" node scripts/extract-players.mjs ...
```

## 校验

```bash
node scripts/validate-players.mjs players.json
```

校验规则与 csgofriberg 服务端 `playerImportSchema` 一致：nickname 全局唯一（1-64 字符）、`age` 为 10-100 的整数、`role` ∈ Rifler/AWPer/Coach、`difficulties` ∈ easy/normal 且不重复等。GitHub Actions 会在每次 push / PR 时自动运行该校验。
