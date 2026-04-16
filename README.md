# TaurusDB CLI (TypeScript)

This repository is now fully TypeScript-based.

## Requirements

- Node.js 20+

## Install & Build

```bash
npm install
npm run build
```

## Run

Use either:

```bash
./taurusdb --help
```

or:

```bash
node dist/index.js --help
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
