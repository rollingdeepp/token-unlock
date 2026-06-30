import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { parseEther, formatEther } from "viem";
import { WalletGraph } from "./WalletGraph";
import {
  registerSchedule, addTrackedWallet, reportMovement, analyseMovement,
  claimTranche, claimWhistleblowerBounty, advanceEpoch, setAdmin, adminForceStatus,
  getPlan, getPlanWallets, getPlanTranches, getPlanMovements, getMovement,
  getWallet, getTranche, listAll, listPlansOf, listWalletsByAddress,
  getCounts, getPoolBalance, getConstants,
  PLAN_STATUS, MOVEMENT_STATUS,
  PlanRow, PlanView, TrancheView, WalletView, MovementView, Counts, Constants,
} from "./contractService";

type Hex = `0x${string}`;

function shortAddr(a: string): string { return a && a.length > 12 ? `${a.slice(0, 6)}\u2026${a.slice(-4)}` : a || "-"; }
function gen(w: string): string { try { const v = formatEther(BigInt(w || "0")); return v.length > 9 ? Number(v).toFixed(4) : v; } catch { return "0"; } }
function amt(s: string): string { const n = Number(s || 0); return n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n); }

function verdictClass(v: string): string {
  return v === "REVOKED" ? "rev" : v === "FLAGGED" ? "flag" : v === "WATCH" ? "watch" : "clean";
}
function statusClass(s: number): string {
  return s === 4 ? "rev" : s === 3 ? "flag" : s === 2 ? "watch" : s === 5 ? "done" : "live";
}

export function App({ onHome }: { onHome?: () => void }) {
  const { address, isConnected } = useAccount();
  const acct = address as Hex | undefined;

  const [rows, setRows] = useState<PlanRow[]>([]);
  const [counts, setCounts] = useState<Counts>({ nextPlanId: 0, nextTrancheId: 0, nextWalletId: 0, nextMovementId: 0, analysedMovements: 0, flaggedPlans: 0, revokedPlans: 0, totalViolations: 0, epoch: 0, totalSlashedWei: "0" });
  const [pool, setPool] = useState("0");
  const [consts, setConsts] = useState<Constants | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // selected plan detail
  const [selId, setSelId] = useState<number | null>(null);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [tranches, setTranches] = useState<TrancheView[]>([]);
  const [wallets, setWallets] = useState<WalletView[]>([]);
  const [movements, setMovements] = useState<MovementView[]>([]);

  // forms
  const [reg, setReg] = useState({ projectName: "", tokenSymbol: "", cliffEpoch: "", totalAmount: "", tranchesCsv: "", publicNotes: "", bond: "0.005" });
  const [wal, setWal] = useState({ address: "", role: "BENEFICIARY" });
  const [mov, setMov] = useState({ fromAddress: "", toAddress: "", amount: "", observedEpoch: "", evidenceUrl: "", evidenceNotes: "" });
  const [adm, setAdm] = useState({ newAdmin: "", forceStatus: "1" });
  const [lookup, setLookup] = useState({ project: "", address: "" });
  const [lookupOut, setLookupOut] = useState<string>("");

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4200); };

  const refreshTop = useCallback(async () => {
    try {
      const [c, p, list, k] = await Promise.all([getCounts(), getPoolBalance(), listAll(60), consts ? Promise.resolve(consts) : getConstants()]);
      setCounts(c); setPool(p); setRows(list); if (!consts) setConsts(k as Constants);
    } finally { setLoading(false); }
  }, [consts]);

  const refreshPlan = useCallback(async (id: number) => {
    const [p, t, w, m] = await Promise.all([getPlan(id), getPlanTranches(id), getPlanWallets(id), getPlanMovements(id)]);
    // upgrade movement summaries into full movement views for the violations panel
    const full = await Promise.all(p.movementIds.map((mid) => getMovement(mid).catch(() => null)));
    setPlan(p); setTranches(t); setWallets(w);
    setMovements(full.filter((x): x is MovementView => x !== null).length ? full.filter((x): x is MovementView => x !== null) : m);
  }, []);

  useEffect(() => { refreshTop(); }, [refreshTop]);
  useEffect(() => { if (selId !== null) refreshPlan(selId).catch(() => {}); }, [selId, refreshPlan]);

  const reload = async () => { await refreshTop(); if (selId !== null) await refreshPlan(selId); };

  const run = async (label: string, fn: () => Promise<void>) => {
    if (!acct) { flash("Connect a wallet first."); return; }
    setBusy(label);
    try { await fn(); await reload(); flash(`${label} \u2713`); }
    catch (e: any) { flash(`${label} failed: ${String(e?.message || e).slice(0, 140)}`); }
    finally { setBusy(null); }
  };

  // ── write handlers ──
  const doRegister = () => run("register_schedule", async () => {
    const bond = parseEther(reg.bond || "0");
    const id = await registerSchedule(acct!, {
      projectName: reg.projectName, tokenSymbol: reg.tokenSymbol,
      cliffEpoch: Number(reg.cliffEpoch || 0), totalAmount: reg.totalAmount || "0",
      tranchesCsv: reg.tranchesCsv, publicNotes: reg.publicNotes,
    }, bond);
    setSelId(id);
  });
  const doAddWallet = () => run("add_tracked_wallet", async () => {
    if (selId === null) throw new Error("select a plan");
    await addTrackedWallet(acct!, selId, wal.address, wal.role);
  });
  const doReport = () => run("report_movement", async () => {
    if (selId === null) throw new Error("select a plan");
    await reportMovement(acct!, selId, mov.fromAddress, mov.toAddress, mov.amount || "0", Number(mov.observedEpoch || 0), mov.evidenceUrl, mov.evidenceNotes);
  });
  const doAnalyse = (mid: number) => run("analyse_movement", async () => { await analyseMovement(acct!, mid); });
  const doClaimTranche = (idx: number) => run("claim_tranche", async () => { if (selId === null) throw new Error("select a plan"); await claimTranche(acct!, selId, idx); });
  const doBounty = (mid: number) => run("claim_whistleblower_bounty", async () => { await claimWhistleblowerBounty(acct!, mid); });
  const doAdvance = () => run("advance_epoch", async () => { await advanceEpoch(acct!); });
  const doSetAdmin = () => run("set_admin", async () => { await setAdmin(acct!, adm.newAdmin); });
  const doForce = () => run("admin_force_status", async () => { if (selId === null) throw new Error("select a plan"); await adminForceStatus(acct!, selId, Number(adm.forceStatus)); });

  const doLookupPlans = () => run("list_plans_of", async () => {
    const ids = await listPlansOf(lookup.project || (acct ?? ""));
    setLookupOut(`plans of ${shortAddr(lookup.project || acct || "")}: [${ids.join(", ") || "none"}]`);
  });
  const doLookupWallets = () => run("list_wallets_by_address", async () => {
    const ids = await listWalletsByAddress(lookup.address);
    let extra = "";
    if (ids.length) { try { const w = await getWallet(ids[0]); extra = ` \u2192 #${w.walletId} ${w.role} susp=${w.suspicionBps} ${w.verdict}`; } catch { /* noop */ } }
    setLookupOut(`wallet ids for ${shortAddr(lookup.address)}: [${ids.join(", ") || "none"}]${extra}`);
  });
  const doProbeTranche = () => run("get_tranche", async () => {
    if (!plan || plan.trancheIds.length === 0) throw new Error("no tranche");
    const t = await getTranche(plan.trancheIds[0]);
    flash(`tranche #${t.trancheId} idx ${t.index} @epoch ${t.unlockEpoch} amt ${amt(t.amount)} claimed=${t.claimed} (${t.claimedEpoch}/${amt(t.claimedAmount)})`);
  });

  const epoch = counts.epoch;
  const cascadeKey = useMemo(() => (plan ? plan.flaggedWalletCount * 1000 + plan.confirmedViolations + plan.lastCascadeEpoch : 0), [plan]);
  const flaggedFloor = consts?.suspicionFlaggedFloor ?? 650;

  const confirmedMine = useMemo(
    () => movements.filter((m) => m.status === 3 && acct && m.reporter.toLowerCase() === acct.toLowerCase()),
    [movements, acct]
  );

  return (
    <div className="app">
      <div className="grain" />
      <header className="top">
        <div className="brand" onClick={onHome} style={onHome ? { cursor: "pointer" } : undefined} title={onHome ? "Back to home" : undefined}>
          <div className="lock-mark" aria-hidden>
            <svg viewBox="0 0 32 40" width="30" height="38"><rect x="4" y="16" width="24" height="20" rx="3" /><path d="M9 16v-5a7 7 0 0 1 14 0v5" fill="none" strokeWidth="3" /><circle cx="16" cy="25" r="2.6" /></svg>
          </div>
          <div>
            <h1>TOKEN<span>UNLOCK</span></h1>
            <p className="tag">vesting cliff simulator · circumvention cascade map</p>
          </div>
        </div>
        <div className="top-right">
          <div className="epoch-pill"><span>EPOCH</span><b className="tnum">{epoch}</b></div>
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>
      </header>

      <section className="stats">
        <Stat k="Plans" v={String(counts.nextPlanId)} />
        <Stat k="Tranches" v={String(counts.nextTrancheId)} />
        <Stat k="Wallets" v={String(counts.nextWalletId)} />
        <Stat k="Movements" v={String(counts.nextMovementId)} />
        <Stat k="Analysed" v={String(counts.analysedMovements)} />
        <Stat k="Flagged plans" v={String(counts.flaggedPlans)} accent="flag" />
        <Stat k="Revoked plans" v={String(counts.revokedPlans)} accent="rev" />
        <Stat k="Violations" v={String(counts.totalViolations)} accent="flag" />
        <Stat k="Slashed" v={`${gen(counts.totalSlashedWei)}`} suff="GEN" />
        <Stat k="Pool" v={`${gen(pool)}`} suff="GEN" />
      </section>

      <main className="grid">
        {/* ── LEFT: plan register + list ── */}
        <div className="col col-left">
          <Card title="Register vesting schedule" sub="PAYABLE · bond ≥ 0.005 GEN">
            <div className="form">
              <Field label="Project name"><input value={reg.projectName} onChange={(e) => setReg({ ...reg, projectName: e.target.value })} placeholder="Helix Labs" /></Field>
              <div className="row2">
                <Field label="Token symbol"><input value={reg.tokenSymbol} onChange={(e) => setReg({ ...reg, tokenSymbol: e.target.value })} placeholder="HLX" /></Field>
                <Field label="Cliff epoch"><input className="tnum" value={reg.cliffEpoch} onChange={(e) => setReg({ ...reg, cliffEpoch: e.target.value })} placeholder={String(epoch + 2)} /></Field>
              </div>
              <Field label="Total amount (sum of tranches)"><input className="tnum" value={reg.totalAmount} onChange={(e) => setReg({ ...reg, totalAmount: e.target.value })} placeholder="1000000" /></Field>
              <Field label="Tranches CSV — epoch:amount,…"><input className="tnum" value={reg.tranchesCsv} onChange={(e) => setReg({ ...reg, tranchesCsv: e.target.value })} placeholder={`${epoch + 2}:400000,${epoch + 4}:600000`} /></Field>
              <Field label="Public notes"><input value={reg.publicNotes} onChange={(e) => setReg({ ...reg, publicNotes: e.target.value })} placeholder="Team allocation, 24-month linear" /></Field>
              <Field label="Bond (GEN)"><input className="tnum" value={reg.bond} onChange={(e) => setReg({ ...reg, bond: e.target.value })} /></Field>
              <button className="btn primary" disabled={!isConnected || !!busy} onClick={doRegister}>{busy === "register_schedule" ? "registering…" : "Register & bond"}</button>
            </div>
          </Card>

          <Card title="Plans" sub={`${rows.length} on-chain`}>
            <div className="plan-list">
              {loading && <div className="muted">loading…</div>}
              {!loading && rows.length === 0 && <div className="muted">no plans yet</div>}
              {rows.map((r) => (
                <button key={r.id} className={`plan-item ${selId === r.id ? "on" : ""}`} onClick={() => setSelId(r.id)}>
                  <div className="pi-head">
                    <span className="pi-name">{r.projectName || `plan #${r.id}`}</span>
                    <span className={`badge ${statusClass(r.status)}`}>{PLAN_STATUS[r.status] ?? r.status}</span>
                  </div>
                  <div className="pi-meta tnum">
                    <span>{r.tokenSymbol}</span>
                    <span>cliff @{r.cliffEpoch}</span>
                    <span>{amt(r.totalAmount)} tok</span>
                    <span className={r.confirmedViolations ? "v-on" : ""}>{r.confirmedViolations} viol</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card title="Lookups" sub="list_plans_of · list_wallets_by_address">
            <div className="form">
              <Field label="Project hex (blank = me)"><input value={lookup.project} onChange={(e) => setLookup({ ...lookup, project: e.target.value })} placeholder={acct ?? "0x…"} /></Field>
              <button className="btn ghost" disabled={!!busy} onClick={doLookupPlans}>list_plans_of</button>
              <Field label="Wallet address"><input value={lookup.address} onChange={(e) => setLookup({ ...lookup, address: e.target.value })} placeholder="0x…" /></Field>
              <button className="btn ghost" disabled={!!busy} onClick={doLookupWallets}>list_wallets_by_address</button>
              {lookupOut && <div className="lookup-out tnum">{lookupOut}</div>}
            </div>
          </Card>
        </div>

        {/* ── CENTER: 3D cascade map + timeline + detail ── */}
        <div className="col col-mid">
          <Card title="Network cascade map" sub="wallet graph · transfers · GSAP cascade" pad={false}>
            <div className="graph-wrap">
              <WalletGraph wallets={wallets} movements={movements} flaggedFloor={flaggedFloor} cascadeKey={cascadeKey} />
              <div className="legend">
                <span><i style={{ background: "#8B7BFF" }} />clean</span>
                <span><i style={{ background: "#F5C84B" }} />watch / cascade</span>
                <span><i style={{ background: "#FF3FA4" }} />flagged</span>
                <span><i style={{ background: "#5b4d8c" }} />external</span>
              </div>
            </div>
          </Card>

          {plan ? (
            <>
              <Card title="Tranche timeline" sub={`cliff @epoch ${plan.cliffEpoch} · now ${epoch}`} pad={false}>
                <TrancheTimeline plan={plan} tranches={tranches} epoch={epoch} onClaim={doClaimTranche} busy={busy} />
              </Card>

              <Card title={`Plan #${plan.planId} · ${plan.projectName}`} sub={`${PLAN_STATUS[plan.status]} · verdict ${plan.overallVerdict}`}>
                <div className="detail-grid">
                  <KV k="Project" v={shortAddr(plan.project)} mono />
                  <KV k="Token" v={plan.tokenSymbol} />
                  <KV k="Total amount" v={`${amt(plan.totalAmount)} (${plan.totalAmount})`} />
                  <KV k="Bond" v={`${gen(plan.bondWei)} GEN`} />
                  <KV k="Cliff epoch" v={String(plan.cliffEpoch)} />
                  <KV k="Cliff passed" v={plan.cliffPassed ? "yes" : "no"} />
                  <KV k="Next tranche" v={`#${plan.nextTrancheToClaim} / ${plan.trancheIds.length}`} />
                  <KV k="Flagged wallets" v={String(plan.flaggedWalletCount)} bad={plan.flaggedWalletCount > 0} />
                  <KV k="Revoked wallets" v={String(plan.revokedWalletCount)} bad={plan.revokedWalletCount > 0} />
                  <KV k="Confirmed violations" v={String(plan.confirmedViolations)} bad={plan.confirmedViolations > 0} />
                  <KV k="Last cascade epoch" v={String(plan.lastCascadeEpoch)} />
                  <KV k="Tranche ids" v={`[${plan.trancheIds.join(", ")}]`} mono />
                  <KV k="Wallet ids" v={`[${plan.trackedWalletIds.join(", ")}]`} mono />
                  <KV k="Movement ids" v={`[${plan.movementIds.join(", ")}]`} mono />
                </div>
                {plan.publicNotes && <div className="notes">“{plan.publicNotes}”</div>}
                {plan.rationale && <div className="rationale"><b>rationale</b> {plan.rationale}</div>}
                <button className="btn ghost sm" disabled={!!busy} onClick={doProbeTranche}>probe get_tranche #{plan.trancheIds[0] ?? 0}</button>
              </Card>
            </>
          ) : (
            <Card title="No plan selected" sub="pick a plan or register one"><div className="muted">Select a plan from the left to render its cascade map, tranche timeline and violation cards.</div></Card>
          )}
        </div>

        {/* ── RIGHT: wallets, movements, violations, admin ── */}
        <div className="col col-right">
          <Card title="Add tracked wallet" sub={selId === null ? "select a plan" : `plan #${selId}`}>
            <div className="form">
              <Field label="Address"><input value={wal.address} onChange={(e) => setWal({ ...wal, address: e.target.value })} placeholder="0x…" /></Field>
              <Field label="Role">
                <select value={wal.role} onChange={(e) => setWal({ ...wal, role: e.target.value })}>
                  {(consts?.walletRoles ?? ["BENEFICIARY", "TREASURY", "MULTISIG", "INTERMEDIATE", "EXCHANGE"]).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <button className="btn" disabled={!isConnected || !!busy || selId === null} onClick={doAddWallet}>{busy === "add_tracked_wallet" ? "adding…" : "add_tracked_wallet"}</button>
            </div>
            <div className="wallet-chips">
              {wallets.map((w) => (
                <div key={w.walletId} className={`wchip ${verdictClass(w.verdict)}`} title={w.address}>
                  <span className="wc-role">{w.role}</span>
                  <span className="wc-addr tnum">{shortAddr(w.address)}</span>
                  <span className="wc-susp tnum">{w.suspicionBps}</span>
                  <span className="wc-verdict">{w.verdict}{w.cascadeInherited ? " ⇲casc" : ""}</span>
                  <span className="wc-epoch tnum">lv {w.lastViolationEpoch}</span>
                </div>
              ))}
              {wallets.length === 0 && <div className="muted">no tracked wallets</div>}
            </div>
          </Card>

          <Card title="Report movement" sub="from must be a tracked wallet">
            <div className="form">
              <div className="row2">
                <Field label="From"><input value={mov.fromAddress} onChange={(e) => setMov({ ...mov, fromAddress: e.target.value })} placeholder="0x… tracked" /></Field>
                <Field label="To"><input value={mov.toAddress} onChange={(e) => setMov({ ...mov, toAddress: e.target.value })} placeholder="0x…" /></Field>
              </div>
              <div className="row2">
                <Field label="Amount"><input className="tnum" value={mov.amount} onChange={(e) => setMov({ ...mov, amount: e.target.value })} placeholder="250000" /></Field>
                <Field label="Observed epoch (≤ now)"><input className="tnum" value={mov.observedEpoch} onChange={(e) => setMov({ ...mov, observedEpoch: e.target.value })} placeholder={String(epoch)} /></Field>
              </div>
              <Field label="Evidence URL"><input value={mov.evidenceUrl} onChange={(e) => setMov({ ...mov, evidenceUrl: e.target.value })} placeholder="https://…" /></Field>
              <Field label="Evidence notes"><input value={mov.evidenceNotes} onChange={(e) => setMov({ ...mov, evidenceNotes: e.target.value })} placeholder="pre-cliff OTC via shell wallet" /></Field>
              <button className="btn" disabled={!isConnected || !!busy || selId === null} onClick={doReport}>{busy === "report_movement" ? "filing…" : "report_movement"}</button>
            </div>
          </Card>

          <Card title="Violations" sub="EARLY_UNLOCK · SPLIT_TRANSFER · PRE_CLIFF_OTC · HIDDEN_ROUTE · DUMP">
            <div className="viol-list">
              {movements.length === 0 && <div className="muted">no movements reported</div>}
              {movements.map((m) => {
                const mine = acct && m.reporter.toLowerCase() === acct.toLowerCase();
                const confirmed = m.status === 3;
                return (
                  <div key={m.movementId} className={`viol-card kind-${(m.violationKind || "NONE").toLowerCase()} st-${m.status}`}>
                    <div className="vc-top">
                      <span className="vc-kind">{m.violationKind || "—"}</span>
                      <span className={`badge mov-${m.status}`}>{MOVEMENT_STATUS[m.status] ?? m.status}</span>
                      {m.isPreCliff && <span className="badge pre">PRE-CLIFF</span>}
                    </div>
                    <div className="vc-route tnum">{shortAddr(m.fromAddress)} <span className="arr">→</span> {shortAddr(m.toAddress)}</div>
                    <div className="vc-bars">
                      <Bar label="suspicion" pct={m.suspicionPct} color="#FF3FA4" />
                      <Bar label="severity" pct={m.severityPct} color="#F5C84B" />
                    </div>
                    <div className="vc-meta tnum">
                      <span>#{m.movementId}</span><span>{amt(m.amount)} tok</span><span>epoch {m.observedEpoch}</span>
                      <span>reporter {shortAddr(m.reporter)}</span>
                    </div>
                    {m.evidenceUrl && <a className="vc-url" href={m.evidenceUrl} target="_blank" rel="noreferrer">{m.evidenceUrl.slice(0, 48)}</a>}
                    {m.evidenceNotes && <div className="vc-notes">{m.evidenceNotes}</div>}
                    {m.rationale && <div className="vc-rat">{m.rationale}</div>}
                    <div className="vc-actions">
                      {m.status === 0 && <button className="btn sm" disabled={!!busy} onClick={() => doAnalyse(m.movementId)}>{busy === "analyse_movement" ? "analysing…" : "analyse_movement"}</button>}
                      {confirmed && mine && <button className="btn sm bounty" disabled={!!busy} onClick={() => doBounty(m.movementId)}>{busy === "claim_whistleblower_bounty" ? "claiming…" : "claim bounty 40%"}</button>}
                    </div>
                  </div>
                );
              })}
            </div>
            {confirmedMine.length > 0 && (
              <div className="bounty-cta">
                <b>{confirmedMine.length}</b> confirmed report{confirmedMine.length > 1 ? "s" : ""} you filed — whistleblower bounty available.
              </div>
            )}
          </Card>

          <Card title="Keeper / admin" sub="advance_epoch · set_admin · admin_force_status">
            <div className="form">
              <button className="btn ghost" disabled={!isConnected || !!busy} onClick={doAdvance}>{busy === "advance_epoch" ? "advancing…" : `advance_epoch → ${epoch + 1}`}</button>
              <div className="row2">
                <Field label="Force status">
                  <select value={adm.forceStatus} onChange={(e) => setAdm({ ...adm, forceStatus: e.target.value })}>
                    {PLAN_STATUS.map((s, i) => <option key={s} value={i}>{i} · {s}</option>)}
                  </select>
                </Field>
                <button className="btn ghost" disabled={!!busy || selId === null} onClick={doForce}>admin_force_status</button>
              </div>
              <Field label="New admin"><input value={adm.newAdmin} onChange={(e) => setAdm({ ...adm, newAdmin: e.target.value })} placeholder="0x…" /></Field>
              <button className="btn ghost" disabled={!!busy} onClick={doSetAdmin}>set_admin</button>
            </div>
          </Card>

          {consts && (
            <Card title="Protocol constants" sub="get_constants">
              <div className="const-grid tnum">
                <KV k="susp max" v={String(consts.suspicionMax)} />
                <KV k="watch floor" v={String(consts.suspicionWatchFloor)} />
                <KV k="flag floor" v={String(consts.suspicionFlaggedFloor)} />
                <KV k="revoke floor" v={String(consts.suspicionRevokedFloor)} />
                <KV k="cascade bps" v={String(consts.cascadeInheritanceBps)} />
                <KV k="max tranches" v={String(consts.maxTranches)} />
                <KV k="max wallets" v={String(consts.maxTrackedWallets)} />
                <KV k="min bond" v={`${gen(consts.minProjectBondWei)} GEN`} />
                <KV k="bounty bps" v={String(consts.whistleblowerBountyBps)} />
                <KV k="roles" v={consts.walletRoles.join(", ")} />
                <KV k="kinds" v={consts.violationKinds.join(", ")} />
              </div>
            </Card>
          )}
        </div>
      </main>

      {toast && <div className="toast">{toast}</div>}
      <footer className="foot tnum">contract 0x12aDc7e9ecf8Bede6Fd18327A823C849d5b1352B · GenLayer Studionet · token-unlock</footer>
    </div>
  );
}

// ── small components ──
function Stat({ k, v, suff, accent }: { k: string; v: string; suff?: string; accent?: string }) {
  return <div className={`stat ${accent ?? ""}`}><span className="s-k">{k}</span><span className="s-v tnum">{v}{suff && <i> {suff}</i>}</span></div>;
}
function Card({ title, sub, children, pad = true }: { title: string; sub?: string; children: React.ReactNode; pad?: boolean }) {
  return (
    <section className="card">
      <div className="card-head"><h2>{title}</h2>{sub && <span className="card-sub">{sub}</span>}</div>
      <div className={pad ? "card-body" : "card-body flush"}>{children}</div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
function KV({ k, v, mono, bad }: { k: string; v: string; mono?: boolean; bad?: boolean }) {
  return <div className={`kv ${bad ? "bad" : ""}`}><span className="kv-k">{k}</span><span className={`kv-v ${mono ? "tnum" : ""}`}>{v}</span></div>;
}
function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="bar">
      <span className="bar-l">{label}</span>
      <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color }} /></span>
      <span className="bar-n tnum">{pct}</span>
    </div>
  );
}

function TrancheTimeline({ plan, tranches, epoch, onClaim, busy }: { plan: PlanView; tranches: TrancheView[]; epoch: number; onClaim: (idx: number) => void; busy: string | null }) {
  const maxEpoch = Math.max(plan.cliffEpoch + 1, ...tranches.map((t) => t.unlockEpoch), epoch);
  const minEpoch = Math.min(plan.cliffEpoch, epoch) - 1;
  const span = Math.max(1, maxEpoch - minEpoch);
  const pos = (e: number) => `${((e - minEpoch) / span) * 100}%`;
  const cliffReached = epoch >= plan.cliffEpoch;
  return (
    <div className="timeline">
      <div className="tl-track">
        <div className="tl-progress" style={{ width: pos(epoch) }} />
        {/* cliff lock */}
        <div className={`tl-cliff ${cliffReached ? "open" : "locked"}`} style={{ left: pos(plan.cliffEpoch) }}>
          <svg viewBox="0 0 24 28" width="20" height="24"><rect x="3" y="12" width="18" height="14" rx="2" /><path d="M7 12V8a5 5 0 0 1 10 0" fill="none" strokeWidth="2.5" className="shackle" /></svg>
          <span className="tl-cliff-lbl">cliff {plan.cliffEpoch}</span>
        </div>
        {/* now marker */}
        <div className="tl-now" style={{ left: pos(epoch) }}><span>now {epoch}</span></div>
        {/* tranche segments */}
        {tranches.map((t) => {
          const unlocked = epoch >= t.unlockEpoch;
          const claimable = unlocked && !t.claimed && cliffReached && t.index === plan.nextTrancheToClaim && plan.status !== 3 && plan.status !== 4;
          return (
            <div key={t.trancheId} className={`tl-seg ${t.claimed ? "claimed" : unlocked ? "unlocked" : "locked"}`} style={{ left: pos(t.unlockEpoch) }}>
              <button className="tl-node" disabled={!claimable || !!busy} onClick={() => onClaim(t.index)} title={claimable ? "claim_tranche" : t.claimed ? "claimed" : unlocked ? "out of order / flagged" : "locked"}>
                <span className="tl-idx tnum">T{t.index}</span>
              </button>
              <span className="tl-amt tnum">{amt(t.amount)}</span>
              <span className="tl-ep tnum">@{t.unlockEpoch}</span>
              {t.claimed && <span className="tl-claimed">✓ {t.claimedEpoch}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
