# Doorstep

AI-assisted disaster-response coordination: find the residents who may have been overlooked
after a storm, explain **why** they need review, and walk coordinators through a consented,
approval-gated escalation.

Doorstep's core is **Signal Fusion**. It never treats silence alone as proof that someone is
safe or hurt. It combines the preparedness profile, check-in delivery evidence, simulated
outage intelligence, and AI-classified replies into an explainable review score.

> All residents, phone numbers, outages and shelters in this repository are **synthetic**.
> The weights are hackathon demonstration heuristics, not validated triage criteria.

## Quick start

```sh
bun install        # or npm i
bun run dev        # http://localhost:8080
bun run test       # scoring, escalation, simulation, AI fallback, resource matching
bun run build
```

No credentials are required. Everything runs on synthetic data, a mock messaging provider,
a simulated outage feed and rule-based AI. Copy `.env.example` to `.env` (or add the values as
Lovable Secrets) to turn on real providers.

## Architecture

The app keeps the existing **TanStack Start + React + Vite** frontend and its
Leaflet/MapLibre (OpenFreeMap) map. The backend lives in TanStack Start server routes in the
same deployable app, so no Next.js, no new framework, and no new npm dependencies.

```
src/lib/doorstep-data.ts            40 synthetic households + STEAR-style preparedness profiles
src/lib/doorstep/
  scoring.ts                        Signal Fusion engine (deterministic, configurable weights)
  escalation.ts                     Escalation state machine (stages 0–5, consent, approvals, idempotency)
  simulation.ts                     Pure reducer: sim clock, scripted demo events, mock delivery, logs
  outages.ts                        SIMULATED Ting-style outage feed + geo overlap
  resources.ts / fema.server.ts     Shelter matching; FEMA NSS ArcGIS adapter with synthetic fallback
  insurance.ts                      Post-safety recovery / documentation guidance
  schemas.ts                        Zod schemas for every AI output and API payload
  ai/rules.ts                       Deterministic multilingual classifier + check-in templates
  ai/service.server.ts              Nemotron → Gemini → rules, 5 s timeout, Zod-validated
  messaging/                        Provider interface, mock provider, Photon adapter + HMAC verify
  persistence.server.ts             Optional Supabase (PostgREST over fetch)
  api.ts                            Browser client with local fallbacks for every call
src/routes/api/                     /api/checkin, /api/escalate, /api/webhook, /api/classify,
                                    /api/summarize, /api/shelters, /api/inbox, /api/health
src/components/doorstep/
  Dashboard.tsx                     Existing dashboard, now driven by the simulation
  ResponseMap.tsx                   Existing map + outage overlays, silence heatmap, filtering, fly-to
  StreetView.tsx / House.tsx        Existing street illustration, now live
  PriorityQueue.tsx                 Replaces the static "Where to look" cards (same visual style)
  ResidentDetail.tsx                Detail sheet: score breakdown, AI reply, escalation, resources
  SimControls.tsx                   Start / pause / advance / reset / speed / wait interval
```

### Signal Fusion

| Factor | Points |
|---|---:|
| Power-dependent medical equipment + active local outage | +5 |
| Declared critical medical need | +3 |
| Mobility / accessibility need | +3 |
| Lives alone | +2 |
| Transportation assistance needed | +2 |
| Planned to remain in affected area | +3 |
| No confirmed response | +2 |
| Each additional hour without response | +1 (cap +6) |
| ≥2 failed message deliveries | +2 |
| Residence overlaps an outage zone | +3 |

Levels: urgent ≥ 20, high ≥ 12, medium ≥ 6, else low. A confirmed response (from the
resident, a neighbor or a contact) resolves the case. An **explicit urgent request forces urgent
review** regardless of score. Every assessment returns a score, level, factors with their
evidence sources, an explanation, a recommended action, a confidence level and a timestamp.
Age, language, disability identity, insurance and renter status are never scored.

Scores are recalculated whenever the simulation state changes: new replies, outages, delivery
failures, confirmations or the clock advancing.

### Escalation

`0` initial check-in → `1` follow-up in the preferred language → `2` automated voice call →
`3` authorized emergency contact* → `4` approved neighbor check-in* →
`5` flag for responder welfare-check review*.

\* These steps reach third parties, so they **always wait for coordinator approval**, on the
client and again on the server in `/api/escalate`. Stages the resident did not consent to are
skipped. A confirmed reply stops silence escalation, and assistance requests go to human review.
Each stage has an idempotency key, which prevents duplicate actions. The wait interval can be
set to 30, 60 or 120 simulated minutes. Fast-forward speeds include **1 simulated hour = 30 s**.

## What is real vs simulated

| Integration | Status | Turn on with |
|---|---|---|
| Map | **Real**: Leaflet + MapLibre, OpenFreeMap keyless tiles | — |
| Resident profiles | **Synthetic**, STEAR-*inspired* fields. No access to real STEAR records | — |
| Ting outages | **Simulated** feed, labeled in the UI. Not connected to Ting | — |
| AI (Nemotron / Gemini) | Real when keys are set; otherwise deterministic rules (labeled "rules") | `NVIDIA_API_KEY`, `LOVABLE_API_KEY` or `GEMINI_API_KEY`, `AI_PROVIDER` |
| Messaging (Photon) | Spectrum iMessage provider sends only to the resident whose synthetic phone matches `PHOTON_DEMO_RECIPIENT`; all other residents use the mock provider | `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `PHOTON_DEMO_RECIPIENT` |
| FEMA shelters | Real NSS ArcGIS lookup when reachable. Field names are read from layer metadata. Falls back to labeled synthetic shelters | `FEMA_NSS_LAYER_URL` |
| Supabase | Optional persistence of check-ins / escalations via PostgREST, plus inbox polling for webhook replies | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Insurance | General documentation guidance only, shown after safety is resolved. No insurer integration | — |

**Supabase schema:** `docs/supabase-schema.sql` has the tables (residents, incidents,
check_ins, priority_assessments, escalation_events, outage_events, resources), RLS policies and
the Realtime publication. Because Lovable manages this project's database, apply it through
Lovable rather than adding files under `supabase/migrations/`.

**AI safety:** the AI only classifies, translates and drafts text. Its output is validated with
Zod, and a model can raise urgency but cannot lower an explicit urgent signal. It cannot change
scores, contact anyone, or dispatch responders.

## API

| Route | Purpose |
|---|---|
| `POST /api/checkin` `{residentId, channel, stage}` | Send a check-in (consent-checked, idempotent) |
| `POST /api/escalate` `{residentId, stage, idempotencyKey, coordinatorApproval?}` | Perform / record an escalation stage; 3–5 require approval |
| `POST /api/webhook` | Inbound reply → signature check (if secret set) → AI classification → persist |
| `POST /api/classify` `{text, residentId?}` | Classify a reply |
| `POST /api/summarize` `{residentId, facts[]}` | Coordinator case summary |
| `GET /api/shelters` | FEMA NSS or synthetic shelters |
| `GET /api/inbox?since=` | Webhook replies persisted in Supabase |
| `GET /api/health` | Which integrations are configured (booleans only) |

Try the webhook locally:

```sh
curl -X POST localhost:8080/api/webhook -H 'content-type: application/json' \
  -d '{"from":"555-0141","text":"Se fue la luz, necesito ayuda","messageId":"demo-1"}'
```

## Demo walkthrough

The dashboard opens at **T+3h05m**, with the storm three hours in. Press **Run demo** to replay
the scripted sequence from the start (1 simulated hour = 10 s):

1. **Incident opens.** The header and activity log update.
2. **Initial check-ins** go out in each resident's language. The map zooms to Elm Street.
3. **Residents confirm safety.** Markers turn green and the accounted-for counter rises.
4. **A simulated Ting outage is detected.** Dashed overlays appear: two power zones and one
   degraded cell site.
5. **Signal Fusion recalculates.** The log reports how many residents were re-scored and how
   many unresolved residents overlap the outage.
6. **The priority queue re-ranks.** Mr. Haddad reports his oxygen machine has no power, which is
   an explicit urgent request, so he goes to the top.
7. **Sra. Medina writes in Spanish** asking for transportation.
8. **AI classifies the reply** as *needs assistance · transportation*. Her detail sheet opens
   with matched shelters and caveats.
9. **The coordinator approves a neighbor check** for Mrs. Lopez. Maria knocks and confirms she's
   okay, silence escalation stops, and the queue updates.

Other scenarios in the data: confirmed safe by text (most of the street), transportation
request (441), power-dependent equipment in an outage (406, 449), no reply (412, 438, 452),
Spanish reply (441), international student asking what "shelter in place" means (439),
insurance documentation question after confirming safety (445), evacuated before the storm
(447), a neighborhood-wide delivery-failure pocket (449–455), and an accessible-shelter request
(443).

Manual controls: **Start/Pause**, **Advance** (jump to the next event), **Reset** (pre-incident),
**T+3h**, speed and wait interval. Click any marker or house to select that resident in the
queue. Click a queue card to fly the map to that household. Search and filter chips filter both
the queue and the map. In any resident's sheet, **Simulate an inbound reply** runs a free-text
message through the same classify → score → queue path that the webhook uses.

## Build with Lovable

Continue developing this project in the
[Lovable editor](https://lovable.dev/projects/5ba2be5e-5c59-45f7-bdcc-fdfb7068e2a9). Changes made
in Lovable are committed to this repository, and pushes here sync back into Lovable.
