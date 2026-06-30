import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS } from "./chain";

type Hex = `0x${string}`;
const TIMEOUT_MS = 240_000;

// ─── Domain vocabulary (mirrors backend) ─────────────────────────────────────
export type Verdict = "CLEAN" | "WATCH" | "FLAGGED" | "REVOKED" | "";
export type ViolationKind =
  | "NONE" | "EARLY_UNLOCK" | "SPLIT_TRANSFER" | "PRE_CLIFF_OTC"
  | "HIDDEN_ROUTE" | "DUMP" | "";
export type WalletRole =
  | "BENEFICIARY" | "TREASURY" | "MULTISIG" | "INTERMEDIATE" | "EXCHANGE";

export const PLAN_STATUS = ["DRAFT", "LIVE", "WATCH", "FLAGGED", "REVOKED", "COMPLETED"];
export const MOVEMENT_STATUS = ["PENDING", "ANALYSED", "DISMISSED", "CONFIRMED"];

// ─── View shapes ─────────────────────────────────────────────────────────────
export interface PlanView {
  planId: number; project: string; projectName: string; tokenSymbol: string;
  cliffEpoch: number; totalAmount: string; publicNotes: string; bondWei: string;
  status: number; overallVerdict: Verdict; cliffPassed: boolean;
  trancheIds: number[]; trackedWalletIds: number[]; movementIds: number[];
  flaggedWalletCount: number; revokedWalletCount: number; confirmedViolations: number;
  nextTrancheToClaim: number; lastCascadeEpoch: number; rationale: string;
}
export interface PlanRow extends PlanView { id: number; }

export interface TrancheView {
  trancheId: number; index: number; unlockEpoch: number; amount: string;
  claimed: boolean; claimedEpoch: number; claimedAmount: string;
}
export interface WalletView {
  walletId: number; planId: number; address: string; role: string;
  suspicionBps: number; verdict: Verdict; lastViolationEpoch: number;
  cascadeInherited: boolean;
}
export interface MovementView {
  movementId: number; planId: number; reporter: string; fromAddress: string;
  toAddress: string; amount: string; observedEpoch: number; evidenceUrl: string;
  evidenceNotes: string; status: number; suspicionPct: number; severityPct: number;
  violationKind: ViolationKind; rationale: string; isPreCliff: boolean;
}
export interface Counts {
  nextPlanId: number; nextTrancheId: number; nextWalletId: number;
  nextMovementId: number; analysedMovements: number; flaggedPlans: number;
  revokedPlans: number; totalViolations: number; epoch: number; totalSlashedWei: string;
}
export interface Constants {
  suspicionMax: number; suspicionWatchFloor: number; suspicionFlaggedFloor: number;
  suspicionRevokedFloor: number; cascadeInheritanceBps: number; maxTranches: number;
  maxTrackedWallets: number; minProjectBondWei: string; whistleblowerBountyBps: number;
  walletRoles: string[]; violationKinds: string[];
}

// ─── Clients ─────────────────────────────────────────────────────────────────
function readClient() { return createClient({ chain: studionet, account: createAccount() }); }
function writeClient(account: Hex) { return createClient({ chain: studionet, account }); }

async function waitAccepted(client: any, hash: Hex) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Transaction timed out")), TIMEOUT_MS);
  });
  try {
    await Promise.race([
      client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 64 }),
      timeout,
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

// Defensive accessor: works whether the contract returns a dict or a tuple.
function pick(obj: any, key: string, idx: number): any {
  if (obj == null) return undefined;
  if (Array.isArray(obj)) return obj[idx];
  if (typeof obj === "object" && key in obj) return obj[key];
  return undefined;
}
function asBig(v: string): bigint { try { return BigInt(v); } catch { return 0n; } }
function numArr(v: any): number[] { return Array.isArray(v) ? v.map((x) => Number(x) || 0) : []; }

// ─── Mappers ─────────────────────────────────────────────────────────────────
function mapPlan(r: any): PlanView {
  return {
    planId: Number(pick(r, "plan_id", 0) ?? 0),
    project: String(pick(r, "project", 1) ?? ""),
    projectName: String(pick(r, "project_name", 2) ?? ""),
    tokenSymbol: String(pick(r, "token_symbol", 3) ?? ""),
    cliffEpoch: Number(pick(r, "cliff_epoch", 4) ?? 0),
    totalAmount: String(pick(r, "total_amount", 5) ?? "0"),
    publicNotes: String(pick(r, "public_notes", 6) ?? ""),
    bondWei: String(pick(r, "bond_wei", 7) ?? "0"),
    status: Number(pick(r, "status", 8) ?? 0),
    overallVerdict: String(pick(r, "overall_verdict", 9) ?? "") as Verdict,
    cliffPassed: Boolean(pick(r, "cliff_passed", 10) ?? false),
    trancheIds: numArr(pick(r, "tranche_ids", 11)),
    trackedWalletIds: numArr(pick(r, "tracked_wallet_ids", 12)),
    movementIds: numArr(pick(r, "movement_ids", 13)),
    flaggedWalletCount: Number(pick(r, "flagged_wallet_count", 14) ?? 0),
    revokedWalletCount: Number(pick(r, "revoked_wallet_count", 15) ?? 0),
    confirmedViolations: Number(pick(r, "confirmed_violations", 16) ?? 0),
    nextTrancheToClaim: Number(pick(r, "next_tranche_to_claim", 17) ?? 0),
    lastCascadeEpoch: Number(pick(r, "last_cascade_epoch", 18) ?? 0),
    rationale: String(pick(r, "rationale", 19) ?? ""),
  };
}
function mapTranche(r: any): TrancheView {
  return {
    trancheId: Number(pick(r, "tranche_id", 0) ?? 0),
    index: Number(pick(r, "index", 1) ?? 0),
    unlockEpoch: Number(pick(r, "unlock_epoch", 2) ?? 0),
    amount: String(pick(r, "amount", 3) ?? "0"),
    claimed: Boolean(pick(r, "claimed", 4) ?? false),
    claimedEpoch: Number(pick(r, "claimed_epoch", 5) ?? 0),
    claimedAmount: String(pick(r, "claimed_amount", 6) ?? "0"),
  };
}
function mapWallet(r: any): WalletView {
  return {
    walletId: Number(pick(r, "wallet_id", 0) ?? 0),
    planId: Number(pick(r, "plan_id", 1) ?? 0),
    address: String(pick(r, "address", 2) ?? ""),
    role: String(pick(r, "role", 3) ?? ""),
    suspicionBps: Number(pick(r, "suspicion_bps", 4) ?? 0),
    verdict: String(pick(r, "verdict", 5) ?? "") as Verdict,
    lastViolationEpoch: Number(pick(r, "last_violation_epoch", 6) ?? 0),
    cascadeInherited: Boolean(pick(r, "cascade_inherited", 7) ?? false),
  };
}
function mapMovement(r: any): MovementView {
  return {
    movementId: Number(pick(r, "movement_id", 0) ?? 0),
    planId: Number(pick(r, "plan_id", 1) ?? 0),
    reporter: String(pick(r, "reporter", 2) ?? ""),
    fromAddress: String(pick(r, "from_address", 3) ?? ""),
    toAddress: String(pick(r, "to_address", 4) ?? ""),
    amount: String(pick(r, "amount", 5) ?? "0"),
    observedEpoch: Number(pick(r, "observed_epoch", 6) ?? 0),
    evidenceUrl: String(pick(r, "evidence_url", 7) ?? ""),
    evidenceNotes: String(pick(r, "evidence_notes", 8) ?? ""),
    status: Number(pick(r, "status", 9) ?? 0),
    suspicionPct: Number(pick(r, "suspicion_pct", 10) ?? 0),
    severityPct: Number(pick(r, "severity_pct", 11) ?? 0),
    violationKind: String(pick(r, "violation_kind", 12) ?? "") as ViolationKind,
    rationale: String(pick(r, "rationale", 13) ?? ""),
    isPreCliff: Boolean(pick(r, "is_pre_cliff", 14) ?? false),
  };
}

// ════════════════════════════ WRITES ════════════════════════════════════════
export interface ScheduleForm {
  projectName: string; tokenSymbol: string; cliffEpoch: number;
  totalAmount: string; tranchesCsv: string; publicNotes: string;
}
export async function registerSchedule(account: Hex, f: ScheduleForm, bond: bigint): Promise<number> {
  if (bond <= 0n) throw new Error("Bond must be > 0");
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex,
    functionName: "register_schedule",
    args: [
      f.projectName.trim(), f.tokenSymbol.trim().toUpperCase(),
      Math.trunc(f.cliffEpoch), asBig(f.totalAmount),
      f.tranchesCsv.trim(), f.publicNotes.trim(),
    ],
    value: bond,
  })) as Hex;
  await waitAccepted(wc, h);
  const c = await getCounts();
  return c.nextPlanId - 1;
}
export async function addTrackedWallet(account: Hex, planId: number, address: string, role: string): Promise<number> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex, functionName: "add_tracked_wallet",
    args: [planId, address.trim().toLowerCase(), role.trim().toUpperCase()], value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
  const c = await getCounts();
  return c.nextWalletId - 1;
}
export async function reportMovement(
  account: Hex, planId: number, fromAddress: string, toAddress: string,
  amount: string, observedEpoch: number, evidenceUrl: string, evidenceNotes: string,
): Promise<number> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex, functionName: "report_movement",
    args: [
      planId, fromAddress.trim().toLowerCase(), toAddress.trim().toLowerCase(),
      asBig(amount), Math.trunc(observedEpoch), evidenceUrl.trim(), evidenceNotes.trim(),
    ], value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
  const c = await getCounts();
  return c.nextMovementId - 1;
}
export async function analyseMovement(account: Hex, movementId: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex, functionName: "analyse_movement",
    args: [movementId], value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
}
export async function claimTranche(account: Hex, planId: number, trancheIndex: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex, functionName: "claim_tranche",
    args: [planId, Math.trunc(trancheIndex)], value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
}
export async function claimWhistleblowerBounty(account: Hex, movementId: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex, functionName: "claim_whistleblower_bounty",
    args: [movementId], value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
}
export async function advanceEpoch(account: Hex): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex, functionName: "advance_epoch", args: [], value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
}
export async function setAdmin(account: Hex, newAdmin: string): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex, functionName: "set_admin",
    args: [newAdmin.trim()], value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
}
export async function adminForceStatus(account: Hex, planId: number, newStatus: number): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({
    address: CONTRACT_ADDRESS as Hex, functionName: "admin_force_status",
    args: [planId, Math.trunc(newStatus)], value: 0n,
  })) as Hex;
  await waitAccepted(wc, h);
}

// ════════════════════════════ VIEWS ═════════════════════════════════════════
async function read(functionName: string, args: any[]): Promise<any> {
  return readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName, args });
}
export async function getPlan(planId: number): Promise<PlanView> { return mapPlan(await read("get_plan", [planId])); }
export async function getTranche(trancheId: number): Promise<TrancheView> { return mapTranche(await read("get_tranche", [trancheId])); }
export async function getWallet(walletId: number): Promise<WalletView> { return mapWallet(await read("get_wallet", [walletId])); }
export async function getMovement(movementId: number): Promise<MovementView> { return mapMovement(await read("get_movement", [movementId])); }

export async function listPlans(): Promise<number[]> { return numArr(await read("list_plans", [])); }
export async function listPlansOf(projectHex: string): Promise<number[]> { return numArr(await read("list_plans_of", [projectHex.trim()])); }
export async function listWalletsByAddress(address: string): Promise<number[]> { return numArr(await read("list_wallets_by_address", [address.trim().toLowerCase()])); }

export async function getPlanWallets(planId: number): Promise<WalletView[]> {
  const arr: any = await read("get_plan_wallets", [planId]);
  return Array.isArray(arr) ? arr.map(mapWallet) : [];
}
export async function getPlanTranches(planId: number): Promise<TrancheView[]> {
  const arr: any = await read("get_plan_tranches", [planId]);
  return Array.isArray(arr) ? arr.map(mapTranche) : [];
}
export async function getPlanMovements(planId: number): Promise<MovementView[]> {
  const arr: any = await read("get_plan_movements", [planId]);
  return Array.isArray(arr) ? arr.map(mapMovement) : [];
}

export async function getCounts(): Promise<Counts> {
  const r: any = await read("get_counts", []);
  const p = String(r).split("||").map((x) => x.trim());
  const n = (i: number) => Number(p[i]) || 0;
  return {
    nextPlanId: n(0), nextTrancheId: n(1), nextWalletId: n(2), nextMovementId: n(3),
    analysedMovements: n(4), flaggedPlans: n(5), revokedPlans: n(6),
    totalViolations: n(7), epoch: n(8), totalSlashedWei: p[9] || "0",
  };
}
export async function getPoolBalance(): Promise<string> { return String((await read("get_pool_balance", [])) ?? "0"); }
export async function getConstants(): Promise<Constants> {
  const r: any = await read("get_constants", []);
  return {
    suspicionMax: Number(pick(r, "SUSPICION_MAX", 0) ?? 1000),
    suspicionWatchFloor: Number(pick(r, "SUSPICION_WATCH_FLOOR", 1) ?? 350),
    suspicionFlaggedFloor: Number(pick(r, "SUSPICION_FLAGGED_FLOOR", 2) ?? 650),
    suspicionRevokedFloor: Number(pick(r, "SUSPICION_REVOKED_FLOOR", 3) ?? 880),
    cascadeInheritanceBps: Number(pick(r, "CASCADE_INHERITANCE_BPS", 4) ?? 200),
    maxTranches: Number(pick(r, "MAX_TRANCHES", 5) ?? 32),
    maxTrackedWallets: Number(pick(r, "MAX_TRACKED_WALLETS", 6) ?? 16),
    minProjectBondWei: String(pick(r, "MIN_PROJECT_BOND_WEI", 7) ?? "5000000000000000"),
    whistleblowerBountyBps: Number(pick(r, "WHISTLEBLOWER_BOUNTY_BPS", 8) ?? 4000),
    walletRoles: (pick(r, "WALLET_ROLES", 9) as string[]) ?? ["BENEFICIARY", "TREASURY", "MULTISIG", "INTERMEDIATE", "EXCHANGE"],
    violationKinds: (pick(r, "VIOLATION_KINDS", 10) as string[]) ?? ["NONE", "EARLY_UNLOCK", "SPLIT_TRANSFER", "PRE_CLIFF_OTC", "HIDDEN_ROUTE", "DUMP"],
  };
}

// ─── Aggregate loaders ───────────────────────────────────────────────────────
export async function listAll(maxRows = 60): Promise<PlanRow[]> {
  const ids = await listPlans();
  if (ids.length === 0) return [];
  const slice = ids.slice(-maxRows).reverse();
  const rows = await Promise.all(slice.map(async (id) => {
    try { const p = await getPlan(id); return { id, ...p }; } catch { return null; }
  }));
  return rows.filter((r): r is PlanRow => r !== null);
}
