# Token Unlock

Vesting cliff simulator with circumvention detection on GenLayer.

- **App**: https://rollingdeepp.github.io/token-unlock/
- **Network**: GenLayer Studionet

## Overview

A project registers a token vesting schedule (cliff + linear tranches). The contract maintains the schedule deterministically and lets anyone file on-chain movement reports. An LLM scores each movement report for circumvention patterns (splitting transfers, OTC settlement pre-cliff, treasury sleight-of-hand). The contract maintains a per-wallet suspicion score with cascade detection for related wallets.

## Features

- Token vesting schedule management
- Cliff and linear tranche unlocks
- On-chain movement reporting
- LLM-based circumvention detection
- Per-wallet suspicion scoring
- Cascade detection for related wallets

## Structure

- `backend/` - GenLayer smart contract (token-unlock.py)
- `frontend/` - React + TypeScript + Vite + Three.js web application

## Develop

```bash
cd frontend
npm install
npm run dev      # http://localhost:5380
```

## Build

```bash
cd frontend
npm run build    # static output in dist/
```

## Deploy

This project is automatically deployed to GitHub Pages via GitHub Actions on every push to main.
