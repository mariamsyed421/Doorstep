import type { Resident } from "@/lib/doorstep-data";
import { replyText } from "@/lib/doorstep-data";
import { cn } from "@/lib/utils";

export type PhoneView = { mode: "resident" | "neighbor"; id: string } | null;

interface Props {
  view: PhoneView;
  resident: Resident | null;
  stage: number;
  status: "safe" | "needsHelp" | "silent" | "helpOnWay" | null;
  neighborReply: string | null;
  onNeighbor: (answer: "okay" | "help" | "none") => void;
  highlight: "okay" | null;
}

function Bubble({ out, children }: { out?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("rise max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug", out ? "self-end rounded-br-sm bg-bubble-out text-primary-foreground" : "self-start rounded-bl-sm bg-bubble-in")}>
      {children}
    </div>
  );
}

export function Phone({ view, resident, stage, status, neighborReply, onNeighbor, highlight }: Props) {
  const isNeighbor = view?.mode === "neighbor";
  const who = resident ? (isNeighbor ? resident.neighbor.name.split(" ")[0] : resident.shortName) : "";
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2.4rem] border-4 border-border bg-phone p-3 shadow-card">
      <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-border" />
      <div className="flex min-h-[340px] flex-col rounded-[1.8rem] bg-background p-3">
        {!resident ? (
          <p className="m-auto px-4 text-center text-sm text-muted-foreground">Tap a house to see the texts that person got.</p>
        ) : (
          <>
            <div className="mb-3 border-b border-border pb-2 text-center">
              <p className="text-xs text-muted-foreground">{isNeighbor ? "Neighbor" : "Resident"} · texts in {isNeighbor ? "English" : resident.language}</p>
              <p className="font-semibold">{isNeighbor ? resident.neighbor.name : resident.name}</p>
            </div>
            <div className="flex flex-1 flex-col gap-2" key={`${view?.mode}-${resident.id}`}>
              {isNeighbor ? (
                <>
                  <Bubble>
                    Hi {who}, can you check on {resident.shortName} at {resident.address.replace(" St", "")}? {resident.livesAlone ? `${resident.planAnswer ? "She" : "They"}'s ${resident.age} and lives alone.` : `${resident.age} years old.`}
                  </Bubble>
                  {neighborReply ? (
                    <Bubble out>{neighborReply}</Bubble>
                  ) : (
                    <div className="mt-auto flex flex-col gap-2">
                      <button data-okay onClick={() => onNeighbor("okay")} className={cn("min-h-12 rounded-xl bg-primary font-semibold text-primary-foreground transition hover:brightness-110", highlight === "okay" && "glow-amber scale-[1.03]")}>
                        {resident.planAnswer === "home" && resident.name.startsWith("Elena") ? "She's okay" : "They're okay"}
                      </button>
                      <button onClick={() => onNeighbor("help")} className="min-h-12 rounded-xl bg-alert font-semibold text-primary-foreground hover:brightness-110">Needs help</button>
                      <button onClick={() => onNeighbor("none")} className="min-h-12 rounded-xl bg-muted font-semibold hover:bg-accent">No answer</button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Bubble>Storm coming Saturday. Where are you riding out the storm? Reply 1 Home, 2 Family or friends, 3 Shelter.</Bubble>
                  {replyText(resident) ? <Bubble out>{replyText(resident)}</Bubble> : <p className="self-end text-xs text-muted-foreground">No reply</p>}
                  {stage >= 2 && (
                    <>
                      <Bubble>Doorstep check-in: Are you okay? Reply 1 Safe, 2 Need help.</Bubble>
                      {status === "safe" && resident.checkInStatus === "safe" && <Bubble out>1</Bubble>}
                      {status === "needsHelp" && <Bubble out>2</Bubble>}
                      {(status === "silent" || resident.checkInStatus === "silent") && (
                        <>
                          <p className="self-end text-xs text-muted-foreground">No reply</p>
                          <Bubble>Checking again: reply 1 if you're safe.</Bubble>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
