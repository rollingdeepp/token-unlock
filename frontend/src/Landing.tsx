import { useEffect, useRef } from "react";
import "./Landing.css";

const STEPS = [
  { n: "01", t: "Register schedule", d: "A project bonds GEN and registers a vesting plan: cliff epoch, token symbol, tranche table." },
  { n: "02", t: "Track wallets", d: "Beneficiary, treasury and intermediate wallets are attached to the plan and watched." },
  { n: "03", t: "Report movement", d: "Anyone files a transfer with evidence. Pre-cliff or split routes raise suspicion." },
  { n: "04", t: "LLM analysis", d: "GenLayer validators score each movement and cascade flags across linked wallets." },
  { n: "05", t: "Slash & bounty", d: "Confirmed circumvention slashes the bond; the whistleblower claims 40 percent." },
];

const KINDS = ["EARLY_UNLOCK", "SPLIT_TRANSFER", "PRE_CLIFF_OTC", "HIDDEN_ROUTE", "DUMP"];

export function Landing({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = root.current?.querySelectorAll("[data-reveal]");
    if (!els) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.18 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="tul" ref={root}>
      <div className="tul-grain" aria-hidden />

      <nav className="tul-nav">
        <div className="tul-brand">
          <span className="tul-lock" aria-hidden>
            <svg viewBox="0 0 32 40" width="22" height="26" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
              <rect x="4" y="16" width="24" height="20" rx="3" />
              <path d="M9 16v-5a7 7 0 0 1 14 0v5" />
              <circle cx="16" cy="25" r="2.6" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <b>TOKEN<span>UNLOCK</span></b>
        </div>
      </nav>

      <header className="tul-hero">
        <div className="tul-hero-copy">
          <span className="tul-kicker" data-reveal>Vesting integrity · GenLayer Studionet</span>
          <h1 data-reveal>
            Cliffs are promises.<br /><em>We watch them hold.</em>
          </h1>
          <p data-reveal>
            A vesting-cliff simulator and circumvention map. Register a schedule, track the wallets,
            and let validator consensus catch the transfer that breaks the lock.
          </p>
          <div className="tul-actions" data-reveal>
            <button className="tul-enter" onClick={onEnter}>Enter the console</button>
            <a className="tul-ghost" href="#how">How it works</a>
          </div>
          <div className="tul-tags" data-reveal>
            {KINDS.map((k) => <span key={k}>{k}</span>)}
          </div>
        </div>
        <div className="tul-hero-art" data-reveal>
          <img src="./landing/vault.jpg" alt="Steel vault door with combination lock" loading="eager" />
          <div className="tul-art-cap"><span>SCHEDULE</span><b>locked until cliff</b></div>
        </div>
      </header>

      <section className="tul-band">
        <figure data-reveal>
          <img src="./landing/padlock.jpg" alt="Padlock on a weathered door" loading="lazy" />
          <figcaption>The cliff</figcaption>
        </figure>
        <div className="tul-band-copy" data-reveal>
          <h2>A tranche cannot be claimed before its epoch.</h2>
          <p>
            Every plan encodes a cliff and an ordered tranche table. Claims out of order, or before the
            cliff passes, are rejected on-chain. The lock is not a UI hint — it is contract state.
          </p>
        </div>
      </section>

      <section className="tul-how" id="how">
        <span className="tul-eyebrow" data-reveal>How it works</span>
        <div className="tul-steps">
          {STEPS.map((s) => (
            <div className="tul-step" key={s.n} data-reveal>
              <span className="tul-step-n">{s.n}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="tul-band reverse">
        <figure data-reveal>
          <img src="./landing/flows.jpg" alt="Analyst reviewing transfer charts on a laptop" loading="lazy" />
          <figcaption>Movement evidence</figcaption>
        </figure>
        <div className="tul-band-copy" data-reveal>
          <h2>Suspicion cascades through linked wallets.</h2>
          <p>
            When one wallet is flagged, the suspicion inherits across the transfer graph. A single
            pre-cliff OTC route can light up an entire cluster — and the bond pays the reporter.
          </p>
        </div>
      </section>

      <footer className="tul-foot">
        <span>GenLayer Studionet · token-unlock</span>
      </footer>
    </div>
  );
}
