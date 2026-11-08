import { useEffect, useState } from "react";
import {
  Bot,
  Building2,
  Check,
  FileText,
  Footprints,
  Loader2,
  Send,
  ShieldCheck,
  Phone as PhoneIcon,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { planLabel, type Resident } from "@/lib/doorstep-data";
import type { Message } from "@/lib/doorstep/simulation";
import { summarize } from "@/lib/doorstep/api";
import { STAGES, allowed, type Stage } from "@/lib/doorstep/escalation";
import { RECOVERY_GUIDANCE, insuranceNote } from "@/lib/doorstep/insurance";
import { matchShelters, otherResources, type Shelter } from "@/lib/doorstep/resources";
import type { Assessment } from "@/lib/doorstep/scoring";
import { THRESHOLDS } from "@/lib/doorstep/scoring";
import { formatClock, wallClock, type SimState } from "@/lib/doorstep/simulation";
import { cn } from "@/lib/utils";
import { LEVEL_STYLE } from "./logic";
import { Ladder } from "./PriorityQueue";

interface Props {
  person: Resident;
  sim: SimState;
  assessment: Assessment;
  shelters: { shelters: Shelter[]; source: string; warning?: string } | null;
  busy: boolean;
  realMessages: Message[];
  canSendRealCheckin: boolean;
  onSendRealCheckin: () => Promise<void>;
  onApprove: (r: Resident, stage: 3 | 4 | 5) => void;
  onSimulateReply: (text: string) => Promise<void>;
}

export function ResidentDetail({
  person,
  sim,
  assessment: a,
  shelters,
  busy,
  realMessages,
  canSendRealCheckin,
  onSendRealCheckin,
  onApprove,
  onSimulateReply,
}: Props) {
  const esc = sim.escalations[person.id];
  const sig = sim.signals[person.id];
  const reply = sig?.latestReply ?? null;
  const msgs = [...sim.messages, ...realMessages].filter((m) => m.residentId === person.id);
  const p = person.profile;
  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState<{ text: string; provider: string } | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  useEffect(() => {
    setSummary(null);
    setDraft("");
  }, [person.id]);

  const safetyResolved = a.level === "resolved";
  const showResources =
    !safetyResolved && (a.humanReview || a.level === "urgent" || a.level === "high");
  const matches = shelters ? matchShelters(person, shelters.shelters, reply?.needs ?? []) : [];
  const extras = otherResources(person, reply?.needs ?? []);
  const wantsGuidance =
    reply?.needs.includes("insurance_guidance") || reply?.needs.includes("property_damage");

  async function makeSummary() {
    setSummarizing(true);
    const facts = [
      `Signal Fusion score ${a.score} (${a.level})`,
      ...a.factors.map((f) => f.label),
      `Plan: ${planLabel(person)}`,
      reply
        ? `Latest reply classified ${reply.category.replaceAll("_", " ")}: ${reply.explanation}`
        : "No reply received",
      `Escalation: ${esc?.status.replaceAll("_", " ")}${esc?.stage !== null && esc?.stage !== undefined ? ` at stage ${esc.stage} (${STAGES[esc.stage].label})` : ""}`,
      `Recommended: ${a.recommendedAction}`,
    ];
    const out = await summarize(person.id, person.shortName, facts);
    setSummary({ text: out.summary, provider: out.provider });
    setSummarizing(false);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-2xl">{person.name}</SheetTitle>
        <SheetDescription>
          {person.address} · prefers {person.language} · household of {p.householdSize}
        </SheetDescription>
      </SheetHeader>

      {/* ---------- Signal Fusion ---------- */}
      <section
        className="my-5 rounded-lg border border-primary/30 bg-card p-4"
        aria-label="Signal Fusion assessment"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">Signal Fusion</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {a.score}
              <span className="ml-2 text-sm font-normal text-muted-foreground">review score</span>
            </p>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "inline-block rounded-full px-3 py-1 text-xs font-bold uppercase",
                LEVEL_STYLE[a.level],
              )}
            >
              {a.level}
            </span>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Confidence: <span className="font-semibold text-foreground">{a.confidence}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Updated {wallClock(a.computedAt)} · {formatClock(a.computedAt)}
            </p>
          </div>
        </div>
        {a.override && (
          <p className="mt-3 rounded-md bg-danger/15 px-3 py-2 text-xs font-semibold text-danger">
            Explicit urgent request — urgent human review regardless of score.
          </p>
        )}
        <ul className="mt-4 space-y-1.5 text-sm">
          {a.factors.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-3">
              <span>
                {f.label}
                <span className="block text-[10px] text-muted-foreground">{f.source}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-primary">
                {f.points ? `+${f.points}` : "—"}
              </span>
            </li>
          ))}
          {!a.factors.length && <li className="text-muted-foreground">No contributing factors.</li>}
        </ul>
        <p className="mt-4 text-sm">{a.explanation}</p>
        <p className="mt-3 rounded-md bg-secondary p-3 text-sm">
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Recommended next action
          </span>
          {a.recommendedAction}
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          {a.evidence.map((e) => (
            <span
              key={e}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {e}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Demo heuristics, not validated triage criteria. Levels: urgent ≥{THRESHOLDS.urgent}, high
          ≥{THRESHOLDS.high}, medium ≥{THRESHOLDS.medium}. Age, language, insurance and renter
          status are never scored.
        </p>
      </section>

      {/* ---------- Latest reply ---------- */}
      {reply && (
        <section className="mb-5 rounded-lg border border-border p-4">
          <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Bot className="size-3.5" /> AI reply classification
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 normal-case tracking-normal">
              {reply.provider}
              {reply.uncertain ? " · uncertain" : ""}
            </span>
          </p>
          <p className="mt-2 text-sm italic">
            “{msgs.filter((m) => m.direction === "in" && m.from === "resident").at(-1)?.text}”
          </p>
          {reply.detectedLanguage !== "English" &&
            reply.translation &&
            reply.translation !== msgs.at(-1)?.text && (
              <p className="mt-1 text-xs text-muted-foreground">Translation: {reply.translation}</p>
            )}
          <p className="mt-2 text-sm">
            <span className="font-semibold">{reply.category.replaceAll("_", " ")}</span> ·{" "}
            {reply.urgency} · {reply.detectedLanguage}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{reply.explanation}</p>
          {reply.needs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {reply.needs.map((n) => (
                <span
                  key={n}
                  className="rounded-full bg-alert/20 px-2 py-0.5 text-[10px] text-alert"
                >
                  {n.replaceAll("_", " ")}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------- Escalation ---------- */}
      <section className="mb-5">
        <h3 className="text-base font-semibold">Escalation</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Status: <span className="text-foreground">{esc?.status.replaceAll("_", " ")}</span>
          {esc?.nextActionAt != null && ` · next step at ${wallClock(esc.nextActionAt)}`}
          {esc?.pendingStage != null && ` · awaiting approval: ${STAGES[esc.pendingStage].label}`}
        </p>
        <Ladder
          stage={esc?.pendingStage ?? esc?.stage ?? -1}
          waiting={esc?.status === "awaiting_approval"}
        />
        {!safetyResolved && !sim.welfare[person.id] && (
          <div className="mt-4 grid gap-2">
            {([4, 3, 5] as const).map((s) => {
              const ok = allowed(person, s as Stage);
              const done = esc?.attempts.some((t) => t.stage === s && t.outcome === "approved");
              return (
                <Button
                  key={s}
                  variant={s === 5 ? "destructive" : "secondary"}
                  disabled={!ok || done || busy}
                  onClick={() => onApprove(person, s)}
                  className="h-auto min-h-10 justify-start whitespace-normal text-left text-xs"
                  title={!ok ? "Not permitted by resident consent / data on file" : undefined}
                >
                  {s === 4 ? <Footprints /> : s === 3 ? <PhoneIcon /> : <ShieldCheck />}
                  Approve: {STAGES[s].label}
                  {s === 3 && ok ? ` (${person.emergencyContact.name})` : ""}
                  {!ok && " — no consent"}
                  {done && " — done"}
                </Button>
              );
            })}
            <p className="text-[10px] text-muted-foreground">
              Third-party outreach and welfare checks always require coordinator approval. Doorstep
              never dispatches responders automatically.
            </p>
          </div>
        )}
        {sim.welfare[person.id] && (
          <p className="mt-3 rounded-md bg-alert/15 px-3 py-2 text-xs text-alert">
            Flagged for authorized responder welfare-check review.
          </p>
        )}
      </section>

      {/* ---------- Resources ---------- */}
      {showResources && (
        <section className="mb-5">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Building2 className="size-4 text-primary" /> Suggested resources
          </h3>
          {!shelters ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Loading shelters…
            </p>
          ) : (
            <>
              {shelters.warning && (
                <p className="mt-1 text-[10px] text-muted-foreground">{shelters.warning}</p>
              )}
              <ul className="mt-3 space-y-2">
                {matches.map((m) => (
                  <li key={m.shelter.id} className="rounded-md border border-border p-3 text-sm">
                    <p className="font-semibold">
                      {m.shelter.name}{" "}
                      <span className="font-normal text-muted-foreground">· {m.distanceKm} km</span>
                    </p>
                    {m.reasons.length > 0 && (
                      <p className="mt-1 text-xs text-safe">✓ {m.reasons.join(" · ")}</p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {m.caveats.join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
          {extras.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
              {extras.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------- Recovery (only after safety) ---------- */}
      {safetyResolved && (wantsGuidance || p.insurance) && (
        <section className="mb-5 rounded-lg border border-border p-4">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <FileText className="size-4 text-primary" /> Recovery guidance
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">{insuranceNote(person)}</p>
          <p className="mt-3 text-xs font-semibold">Safe damage documentation</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {RECOVERY_GUIDANCE.documentation.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-semibold">Claim preparation checklist</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {RECOVERY_GUIDANCE.claimChecklist.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-semibold">Relief & temporary housing</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {RECOVERY_GUIDANCE.relief.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground">
            General information only; Doorstep has no access to any insurer's policy or claims
            systems.
          </p>
        </section>
      )}

      {/* ---------- AI summary ---------- */}
      <section className="mb-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Case summary</h3>
          <Button size="sm" variant="outline" onClick={makeSummary} disabled={summarizing}>
            {summarizing ? <Loader2 className="animate-spin" /> : <Zap />}{" "}
            {summary ? "Refresh" : "Generate"}
          </Button>
        </div>
        {summary && (
          <p className="mt-2 rounded-md bg-secondary p-3 text-sm">
            {summary.text}
            <span className="mt-1 block text-[10px] text-muted-foreground">
              Generated by {summary.provider} from the facts above.
            </span>
          </p>
        )}
      </section>

      {/* ---------- Profile ---------- */}
      <div className="mb-5 border-y border-primary/30 py-4">
        <p className="text-xs uppercase tracking-widest text-primary">Pre-storm plan</p>
        <h3 className="mt-2 text-xl font-semibold">Plan: {planLabel(person).toLowerCase()}</h3>
        <p className="mt-2 text-sm text-muted-foreground">“{person.planQuote}”</p>
      </div>
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">
        Preparedness profile · synthetic, STEAR-style, opt-in
      </p>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
        {(
          [
            ["Language", person.language],
            ["Lives alone", person.livesAlone ? "Yes" : "No"],
            ["Declared needs", person.medicalNeed ?? "None listed"],
            ["Power-dependent equipment", p.needs.powerDependentEquipment ?? "None"],
            ["Transportation help", p.needs.transportation ? "Needed" : "Not needed"],
            ["Accessible shelter", p.needs.accessibleShelter ? "Needed" : "Not needed"],
            [
              "Emergency contact",
              `${person.emergencyContact.name} · ${person.emergencyContact.relation}`,
            ],
            ["Contact", `${p.contactChannels.join(" + ")} · ${p.phone} (synthetic)`],
            ["Opted-in neighbor", `${person.neighbor.name} · ${person.neighbor.address}`],
            [
              "Consent",
              [
                p.consent.automatedMessages && "texts",
                p.consent.voiceCalls && "voice",
                p.consent.contactEmergencyContact && "contact",
                p.consent.neighborCheck && "neighbor",
                p.consent.shareWithResponders && "responders",
              ]
                .filter(Boolean)
                .join(", "),
            ],
            ["Insurance (voluntary)", p.insurance ? p.insurance.carrier : "Not shared"],
            ["Notes", p.notes ?? "—"],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className={k === "Opted-in neighbor" || k === "Contact" ? "col-span-2" : ""}>
            <dt className="mb-1 text-xs text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {/* ---------- Communication history ---------- */}
      <h3 className="mb-4 mt-8 text-base font-semibold">Communication & escalation timeline</h3>
      <ol className="space-y-4 border-l border-border pl-5">
        <li>
          <p className="text-[11px] text-primary">Fri 6:10pm</p>
          <p className="mt-1 text-sm">
            Asked plan →{" "}
            {person.planAnswer
              ? person.planAnswer === "home"
                ? "'Home'"
                : person.planDetail
              : "No reply"}
          </p>
        </li>
        {[
          ...msgs.map((m) => ({ at: m.at, key: m.id, node: <MessageLine m={m} /> })),
          ...(esc?.history ?? [])
            .filter(
              (h) =>
                h.text.startsWith("Awaiting") ||
                h.text.startsWith("Confirmed") ||
                h.text.startsWith("Assistance"),
            )
            .map((h, i) => ({
              at: h.at,
              key: `h${i}`,
              node: <p className="mt-1 text-sm text-muted-foreground">{h.text}</p>,
            })),
        ]
          .sort((x, y) => x.at - y.at)
          .map((x) => (
            <li key={x.key}>
              <p className="text-[11px] text-primary">{wallClock(x.at)}</p>
              {x.node}
            </li>
          ))}
      </ol>

      {canSendRealCheckin && (
        <Button
          variant="outline"
          className="mb-5 w-full border-primary text-primary"
          disabled={busy}
          onClick={() => void onSendRealCheckin()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Send />}
          Send real check-in
        </Button>
      )}

      {/* ---------- Demo tool ---------- */}
      <section className="mt-8 rounded-lg border border-dashed border-border p-4">
        <p className="text-xs font-semibold">Simulate an inbound reply (demo)</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Runs the same path as the /api/webhook: AI classification → Signal Fusion → queue.
        </p>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            person.language === "Spanish"
              ? "Ej: No tengo luz y necesito ayuda"
              : "e.g. My power is out and my oxygen machine needs electricity"
          }
          className="mt-2 min-h-16 text-sm"
          maxLength={500}
        />
        <Button
          className="mt-2 w-full"
          disabled={!draft.trim() || busy}
          onClick={async () => {
            await onSimulateReply(draft.trim());
            setDraft("");
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Send />} Send as {person.shortName}
        </Button>
      </section>
    </>
  );
}

function MessageLine({ m }: { m: SimState["messages"][number] }) {
  const out = m.direction === "out";
  return (
    <div className="mt-1 text-sm">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {out ? `Doorstep → ${m.channel}` : `${m.from} replied`}
        {m.stage !== undefined ? ` · stage ${m.stage}` : ""}
      </span>
      <p className={cn(!out && "italic")}>{out ? m.text : `“${m.text}”`}</p>
      {out && m.status && (
        <span
          className={cn(
            "text-[10px]",
            m.status === "failed" ? "text-danger" : "text-muted-foreground",
          )}
        >
          {m.status === "failed" ? (
            "✕ delivery failed"
          ) : (
            <>
              <Check className="inline size-3" /> {m.status}
            </>
          )}{" "}
          · {m.provider === "mock" ? "mock provider" : m.provider}
        </span>
      )}
    </div>
  );
}
