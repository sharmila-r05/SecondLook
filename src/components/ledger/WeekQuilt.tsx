"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Stitch, type StitchKind } from "@/components/quilt/Stitch";
import type { BlockTone, LedgerBlock, LedgerWeek } from "@/lib/ledger";
import styles from "./WeekQuilt.module.css";

const STITCH: Record<BlockTone, StitchKind> = { settled: "light", processing: "light", waiting: "basting", cancelled: "pulled" };
const SEEN_KEY = "second-look:ledger-seen";
/** The current week's row is never shorter than this: unsewn spaces wait where this week's blocks will go. */
const ROW_MIN = 5;

/** The state mark on a block, drawn in the block's own thread colours. Decorative: the label says the same. */
function BlockMark({ tone }: { tone: BlockTone }) {
  // The cancelled hold's mark is the quilt's one big signal, sewn large above the pulled threads.
  const size = tone === "cancelled" ? 56 : 30;
  return (
    <svg className={styles.mark} width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" focusable="false">
      {tone === "settled" && (
        <>
          <circle cx="15" cy="15" r="12.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M9.5 15.5l3.6 3.6 7.4-7.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {tone === "processing" && <circle cx="15" cy="15" r="12.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="4 4" />}
      {tone === "waiting" && <circle className={styles.rose} cx="15" cy="15" r="12.5" fill="none" strokeWidth="3" />}
      {tone === "cancelled" && (
        <>
          <circle className={styles.rose} cx="15" cy="15" r="12.5" fill="none" strokeWidth="1.8" strokeDasharray="3 2.2" />
          <path className={styles.rose} d="M5.5 24.5L24.5 5.5" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 2.2" />
        </>
      )}
    </svg>
  );
}

/**
 * The cancelled hold's basting, pulled out: the bottom run of its stitch is gone and the rose thread hangs below the
 * block's edge in three loose loops.
 */
function PulledThreads() {
  return (
    <svg className={styles.pulled} viewBox="0 0 160 48" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M-3 0 C -4 30, 4 46, 18 46 C 32 46, 38 30, 32 18" />
      <path d="M52 20 C 58 48, 100 50, 108 18" />
      <path d="M163 0 C 164 30, 156 46, 142 46 C 128 46, 122 32, 128 20" />
    </svg>
  );
}

function Block({ block, selected, onSelect }: { block: LedgerBlock; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={styles.block}
      data-fabric={block.fabric}
      data-tone={block.tone}
      data-block={block.id}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <Stitch kind={STITCH[block.tone]} />
      {block.tone === "cancelled" && <PulledThreads />}
      <span className={styles.top}>
        <span className={styles.who}>{block.who}</span>
        <span className={styles.when}>{block.when}</span>
      </span>
      <span className={styles.bottom}>
        <span className={styles.title}>{block.title}</span>
        <span className={styles.amount}>{block.amount}</span>
        <span className={styles.label}>{block.label}</span>
      </span>
      <BlockMark tone={block.tone} />
    </button>
  );
}

function Detail({ block, id, empty }: { block: LedgerBlock | undefined; id: string; empty: boolean }) {
  if (!block) {
    return (
      <section id={id} className={`${styles.detail} ${styles.detailEmpty}`}>
        <Stitch kind="sewn" />
        <p>
          {empty
            ? "When Margaret pays a bill or the family settles the care week, it is stitched in here, in the colour of whoever set it going."
            : "Select a block to see what happened, who did it, and which PayPal step moved the money."}
        </p>
      </section>
    );
  }
  const stitch: StitchKind = block.tone === "waiting" ? "basting" : block.tone === "cancelled" ? "pulled" : "sewn";
  return (
    <section id={id} className={styles.detail} data-tone={block.tone} aria-labelledby={`${id}-title`}>
      <Stitch kind={stitch} />
      {/* The swatch's colour says who set it going; the story's first line says who and when. */}
      <header className={styles.swatch} data-fabric={block.fabric}>
        <h3 id={`${id}-title`} className={styles.detailTitle}>
          {block.title}
        </h3>
        <p className={styles.detailAmount}>
          {block.amount} · {block.state}
        </p>
      </header>

      <p className={styles.outcome}>{block.outcome}</p>

      <ol className={styles.story} aria-label="What happened">
        {block.story.map((line, i) => (
          <li key={i}>
            <span className={styles.dot} data-fabric={line.fabric} title={line.who} aria-hidden="true" />
            <span>{line.text}</span>
          </li>
        ))}
      </ol>

      {block.why.length > 0 && (
        <div className={styles.why}>
          <h4 className={styles.minor}>Why it was held</h4>
          <ul className={styles.chips}>
            {block.why.map((chip) => (
              <li key={chip} className={styles.chip}>
                {chip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {block.steps.length > 0 && (
        <div className={styles.paypal}>
          <h4 className={styles.flow}>PayPal: {block.flow}</h4>
          {/* One line per call: what was called, then the ID PayPal returned and its status. The table below carries
              each call's PayPal-Request-Id. */}
          <ol className={styles.steps}>
            {block.steps.map((step, i) => (
              <li key={`${step.call}-${i}`} className={styles.step}>
                <p className={styles.call}>{step.call}</p>
                <p className={styles.fact}>
                  {step.paypalId ? <code>{step.paypalId}</code> : "Waiting for PayPal"}
                  {step.status && ` · ${step.status}`}
                </p>
                {step.ours && (
                  <p className={styles.ours}>
                    {step.ours.label} <code>{step.ours.value}</code>
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

/**
 * The family's money as a quilt: each week is one row of blocks, each block a money move in the colour of the person
 * who set it going. Selecting a block opens what happened, who did it and the PayPal steps behind it: beside the quilt
 * when there's room, under the block's own week when there isn't (it sizes to its container, so it also fits the
 * family's phone column).
 */
export function WeekQuilt({ weeks, initialSelected }: { weeks: LedgerWeek[]; initialSelected: string | null }) {
  const [selected, setSelected] = useState<string | null>(initialSelected);
  const root = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string> | null>(null);
  const uid = useId();
  const blocks = weeks.flatMap((w) => w.blocks);
  const current = blocks.find((b) => b.id === selected) ?? blocks.find((b) => b.id === initialSelected) ?? blocks.at(-1);
  const sideId = `${uid}-side`;
  const inlineId = `${uid}-inline`;

  // A money move that wasn't here on the last look stitches itself in. The first look of a visit animates nothing.
  const ids = blocks.map((b) => b.id).join(" ");
  useEffect(() => {
    const now = ids ? ids.split(" ") : [];
    let known = seen.current;
    if (!known) {
      try {
        const stored = window.sessionStorage.getItem(SEEN_KEY);
        known = stored ? new Set(JSON.parse(stored) as string[]) : null;
      } catch {
        known = null;
      }
    }
    seen.current = new Set(now);
    try {
      window.sessionStorage.setItem(SEEN_KEY, JSON.stringify(now));
    } catch {
      // Storage can be unavailable (private windows); the quilt just doesn't animate.
    }
    if (!known || !root.current) return;
    for (const id of now) {
      if (known.has(id)) continue;
      const el = root.current.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`);
      if (!el) continue;
      el.dataset.fresh = "true";
      el.addEventListener("animationend", () => delete el.dataset.fresh, { once: true });
    }
  }, [ids]);

  const empty = blocks.length === 0;

  return (
    <div className={styles.quilt} ref={root}>
      <div className={styles.layout}>
        <div className={styles.weeks}>
          {weeks.map((week) => {
            const headingId = `${uid}-week-${week.id}`;
            const hasSelected = week.blocks.some((b) => b.id === current?.id);
            return (
              <section key={week.id} className={styles.week} aria-labelledby={headingId}>
                <div className={styles.weekHead}>
                  <h2 id={headingId} className={styles.weekHeading}>
                    {week.heading}
                  </h2>
                  {week.closedBy && (
                    <p className={styles.closed}>
                      <span className={styles.dot} data-fabric={week.closedBy.fabric} aria-hidden="true" />
                      Care week closed by {week.closedBy.who}, {week.closedBy.when}
                    </p>
                  )}
                </div>
                {week.blocks.length === 0 && !week.current ? (
                  <p className={styles.emptyRow}>Nothing moved this week.</p>
                ) : (
                  <ul className={styles.row}>
                    {week.blocks.map((block) => (
                      <li key={block.id} className={styles.cell}>
                        <Block block={block} selected={block.id === current?.id} onSelect={() => setSelected(block.id)} />
                      </li>
                    ))}
                    {/* This week's unsewn spaces: dashed outlines where the next money moves will be stitched in. */}
                    {week.current &&
                      Array.from({ length: Math.max(0, ROW_MIN - week.blocks.length) }, (_, i) =>
                        i === 0 && week.blocks.length === 0 ? (
                          <li key="unsewn-0" className={`${styles.unsewn} ${styles.unsewnNote}`}>
                            <p>Nothing has moved yet this week.</p>
                          </li>
                        ) : (
                          <li key={`unsewn-${i}`} className={i === 0 ? `${styles.unsewn} ${styles.unsewnFirst}` : styles.unsewn} aria-hidden="true" />
                        ),
                      )}
                  </ul>
                )}
                {hasSelected && (
                  <div className={styles.inline}>
                    <Detail block={current} id={inlineId} empty={false} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <aside className={styles.side} aria-label="Selected money move">
          <Detail block={current} id={sideId} empty={empty} />
        </aside>
      </div>
    </div>
  );
}
