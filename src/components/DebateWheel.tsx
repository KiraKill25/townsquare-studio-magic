import { useEffect, useRef, useState } from "react";
import { Pause, Play, Plus, RotateCcw, SkipForward } from "lucide-react";
import { playTimeUpAlert } from "@/lib/audio";
import { useI18n } from "@/lib/i18n";
import {
  SeatingWheel,
  buildTurnQueue,
  type RotationDirection,
} from "@/components/SeatingWheel";
import type { Player } from "@/game/engine";

/** Modale de début de journée : le capitaine choisit le sens de passage. */
export function CaptainDirectionModal({
  captainName,
  onPick,
}: {
  captainName?: string;
  onPick: (d: RotationDirection) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6 backdrop-blur">
      <div className="surface-card animate-rise-in neon-ring w-full max-w-sm space-y-5 rounded-3xl p-6 text-center">
        <p className="text-[11px] tracking-widest text-primary uppercase">
          {t("captainDirTitle")}
        </p>
        <p className="text-base font-semibold">
          {captainName
            ? t("captainDirText", { name: captainName })
            : t("noCaptainDir")}
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => onPick("clockwise")}
            className="w-full rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground"
          >
            ↻ {t("dirClockwise")}
          </button>
          <button
            onClick={() => onPick("counter-clockwise")}
            className="w-full rounded-full border border-primary py-3 text-sm font-bold text-primary"
          >
            ↺ {t("dirCounterClockwise")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Roue de débat : anneau des joueurs + timer central + barre de contrôle MJ. */
export function DebateWheel({
  seating,
  seconds,
  captainId,
  direction,
  onFinish,
}: {
  seating: Player[];
  seconds: number;
  captainId?: string;
  direction: RotationDirection;
  onFinish: () => void;
}) {
  const { t } = useI18n();
  const queue = buildTurnQueue(seating, captainId, direction).filter(
    (p) => !p.mutedForDay,
  );
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(true);
  const alerted = useRef(false);

  useEffect(() => {
    setLeft(seconds);
    alerted.current = false;
  }, [i, seconds]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [running, i]);

  useEffect(() => {
    if (left === 0 && !alerted.current) {
      alerted.current = true;
      playTimeUpAlert();
    }
  }, [left]);

  const current = queue[i];
  if (!current) return null;
  const pct = Math.max(0, Math.min(1, left / Math.max(1, seconds)));
  const R = 42;
  const C = 2 * Math.PI * R;

  return (
    <div className="space-y-4">
      <p className="text-center text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
        {t("speaker", { i: i + 1, n: queue.length })}
      </p>

      <SeatingWheel
        players={seating}
        activeId={current.id}
        direction={direction}
        captainId={captainId}
        center={
          <div className="relative flex size-full items-center justify-center">
            <svg viewBox="0 0 100 100" className="absolute size-full -rotate-90">
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                strokeWidth="6"
                className="stroke-input"
              />
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - pct)}
                className={
                  left === 0 ? "stroke-destructive" : "stroke-primary"
                }
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div className="relative z-10 px-2">
              <p className="truncate text-[10px] font-bold tracking-widest text-primary uppercase">
                {current.name}
              </p>
              <p
                className={`text-2xl font-black tabular-nums ${left === 0 ? "animate-danger-pulse text-destructive" : "text-foreground"}`}
              >
                {String(Math.floor(left / 60)).padStart(2, "0")}:
                {String(left % 60).padStart(2, "0")}
              </p>
              <p className="text-[9px] tracking-widest text-muted-foreground uppercase">
                {t("currentSpeaker")}
              </p>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setRunning((r) => !r)}
          className="flex items-center justify-center gap-2 rounded-full border border-border py-3 text-sm font-semibold"
        >
          {running ? <Pause className="size-4" /> : <Play className="size-4" />}
          {running ? t("pauseTimer") : t("startTimer")}
        </button>
        <button
          onClick={() => {
            setLeft(seconds);
            alerted.current = false;
          }}
          className="flex items-center justify-center gap-2 rounded-full border border-border py-3 text-sm font-semibold"
        >
          <RotateCcw className="size-4" />
          {t("resetTimer")}
        </button>
        <button
          onClick={() => setLeft((v) => v + 10)}
          className="flex items-center justify-center gap-1 rounded-full border border-primary/60 py-3 text-sm font-bold text-primary"
        >
          <Plus className="size-3.5" />
          {t("plus10")}
        </button>
        <button
          onClick={() => (i + 1 < queue.length ? setI(i + 1) : onFinish())}
          className="flex items-center justify-center gap-2 rounded-full bg-primary py-3 text-xs font-bold text-primary-foreground"
        >
          <SkipForward className="size-4" />
          {i + 1 < queue.length ? t("nextSpeaker") : t("endDebate")}
        </button>
      </div>
    </div>
  );
}
