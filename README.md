# TaurusDB CLI (TypeScript)

This repository is now fully TypeScript-based.

## Requirements

- Node.js 20+

## Quick Start

```bash
npm install
npm run build
./taurusdb
```

## Run

```bash
./taurusdb
```

Show help:

```bash
./taurusdb --help
```

Run directly with Node:

```bash
node dist/index.js
```

Install globally:

```bash
npm install -g .
taurusdb --help
```

## Test

```bash
npm test
```

## Main Commands

- `taurusdb configure`
- `taurusdb connect`
- `taurusdb instance list`
- `taurusdb instance show <id>`
- `taurusdb instance create ...`
- `taurusdb flavor list`
- `taurusdb flavor pick`
- `taurusdb llm configure|show|test`
- `taurusdb ask "<text>"`
- `taurusdb chat`
