import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Crown, Pencil, RotateCcw, Skull, X } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { MuteButton } from "@/components/MuteButton";
import { ROLE_BY_ID, TEAM_LABEL, roleImage } from "@/data/roles";
import { NarratorCard } from "@/components/NarratorCard";
import { PhaseTransition } from "@/components/PhaseTransition";
import { SpeakButton } from "@/components/SpeakButton";
import { CaptainDirectionModal, DebateWheel } from "@/components/DebateWheel";
import { VoteWheel } from "@/components/VoteWheel";
import type { RotationDirection } from "@/components/SeatingWheel";
import { EliminationReveal } from "@/components/EliminationReveal";
import {
  GameRecapCard,
  type VoteRecord,
} from "@/components/GameRecapCard";
import { useI18n } from "@/lib/i18n";
import { useNarrate } from "@/hooks/use-narrate";
import {
  clearBgm,
  playCheer,
  playWolfHowl,
  startBgm,
} from "@/lib/audio";
import {
  clearGame,
  loadGame,
  loadSettings,
  loadSetup,
  saveGame,
  type GameSettings,
} from "@/lib/session";
import {
  createGame,
  currentStep,
  effectiveRoleId,
  executeTalkativeWolfAndSkip,
  goToVote,
  resolveHunter,
  skipVote,
  submitStep,
  assignCaptain,
  bearNeighbors,
  type GameState,
  type Player,
} from "@/game/engine";

const TITLE = "Partie en cours — Nightfall Oracle";
const DESC = "Le meneur guide la nuit, l'aube et le vote du village, tour après tour.";

export const Route = createFileRoute("/game")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GamePage,
});

function GamePage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const narrate = useNarrate();
  const [state, setState] = useState<GameState | null>(null);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [transition, setTransition] = useState<"NIGHT" | "DAY" | null>("NIGHT");
  const [victims, setVictims] = useState<
    { id: string; name: string; roleId: string }[] | null
  >(null);
  const [debateDoneDay, setDebateDoneDay] = useState(0);
  const [direction, setDirection] = useState<RotationDirection>("clockwise");
  const [directionDay, setDirectionDay] = useState(0);
  const [voteHistory, setVoteHistory] = useState<VoteRecord[]>([]);
  const [stateHistory, setStateHistory] = useState<GameState[]>([]);
  const lastPhase = useRef<string>("");

  /** Push current state to history then apply next. Max 30 snapshots. */
  const updateState = (next: GameState) => {
    setState((cur) => {
      if (cur) setStateHistory((h) => [...h, cur].slice(-30));
      return next;
    });
  };

  /** Restore the previous snapshot. */
  const undo = () => {
    setStateHistory((h) => {
      const prev = h[h.length - 1];
      if (prev) setState(prev);
      return h.slice(0, -1);
    });
  };

  const canUndo = stateHistory.length > 0;

  useEffect(() => {
    setSettings(loadSettings());
    const saved = loadGame<GameState>();
    if (saved) {
      setState(saved);
      return;
    }
    const setup = loadSetup();
    if (setup?.players?.length)
      setState(createGame(setup.players, setup.villageCaptainId));
    else navigate({ to: "/setup" });
  }, [navigate]);

  // Phase transition cards
  useEffect(() => {
    if (!state) return;
    const isNight = state.phase.startsWith("NUIT");
    const key = isNight ? `N${state.night}` : `${state.phase}${state.day}`;
    if (lastPhase.current && lastPhase.current !== key) {
      if (isNight) setTransition("NIGHT");
      else if (state.phase === "AUBE") setTransition("DAY");
    }
    lastPhase.current = key;
  }, [state]);

  // End-of-game SFX
  useEffect(() => {
    if (state?.phase !== "FIN") return;
    if (state.winnerTeam === "WOLVES") playWolfHowl();
    else playCheer();
  }, [state?.phase, state?.winnerTeam]);

  useEffect(() => {
    if (state) saveGame(state);
  }, [state]);

  // BGM lifecycle
  useEffect(() => {
    if (!state) return;
    if (state.phase === "FIN") { clearBgm(); return; }
    startBgm(state.phase.startsWith("NUIT") ? "NIGHT" : "DAY");
  }, [state?.phase]);

  useEffect(() => () => clearBgm(), []);

  if (!state)
    return <main className="p-8 text-muted-foreground">{t("loading")}</main>;

  if (state.phase === "FIN")
    return (
      <GameRecapCard
        state={state}
        voteHistory={voteHistory}
        onRestart={() => { clearGame(); navigate({ to: "/" }); }}
        onPlayAgain={() => { clearGame(); navigate({ to: "/composition" }); }}
      />
    );

  const isNight = state.phase.startsWith("NUIT");
  const needsDirection =
    !isNight &&
    (state.phase === "AUBE" || state.phase === "JOUR_VOTE") &&
    directionDay !== state.day &&
    !state.reveal &&
    !transition &&
    !victims &&
    !state.captainSuccessionPending;
  const phaseLabel = isNight
    ? t("nightN", { n: state.night })
    : t("dayN", { n: state.day });

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 py-6 pb-16">
      <header className="sticky top-0 z-40 -mx-4 flex items-center justify-between gap-2 bg-background/80 px-4 py-2 backdrop-blur">
        <span className="text-xs tracking-widest text-muted-foreground uppercase">
          {phaseLabel}
        </span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <MuteButton />
          <button
            onClick={() => { clearGame(); navigate({ to: "/" }); }}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-primary"
          >
            {t("quit")}
          </button>
        </div>
      </header>

      {transition && (
        <PhaseTransition
          kind={transition}
          subtitle={
            transition === "NIGHT"
              ? t("nightSubtitle", { n: state.night })
              : t("daySubtitle", { n: state.day })
          }
          onDone={() => setTransition(null)}
        />
      )}

      {victims && (
        <EliminationReveal victims={victims} onClose={() => setVictims(null)} />
      )}

      {state.reveal && (
        <Overlay onClose={() => setState({ ...state, reveal: undefined })}>
          {narrate(state.reveal)}
        </Overlay>
      )}

      {needsDirection && (
        <CaptainDirectionModal
          captainName={
            state.players.find((p) => p.id === state.villageCaptainId)?.name
          }
          onPick={(d) => {
            setDirection(d);
            setDirectionDay(state.day);
          }}
        />
      )}

      {state.phase === "EVENEMENT_MORT" ? (
        <HunterPanel state={state} onDone={setState} />
      ) : state.captainSuccessionPending ? (
        <CaptainSuccessionPanel state={state} onDone={setState} />
      ) : state.phase === "AUBE" ? (
        <DawnPanel
          state={state}
          settings={settings}
          direction={direction}
          debateDone={debateDoneDay === state.day}
          onDebateDone={() => setDebateDoneDay(state.day)}
          onChange={updateState}
          onUndo={undo}
          canUndo={canUndo}
        />
      ) : state.phase === "JOUR_VOTE" ? (
        <VoteWheel
          state={state}
          direction={direction}
          onVoteRecord={(r) => setVoteHistory((h) => [...h, r])}
          onChange={(next) => {
            if (next.lastEliminated?.length) setVictims(next.lastEliminated);
            updateState(next);
          }}
          onUndo={undo}
          canUndo={canUndo}
        />
      ) : (
        <NightPanel state={state} onChange={updateState} onUndo={undo} canUndo={canUndo} />
      )}

      <section className="surface-card rounded-2xl p-4">
        <h2 className="mb-2 text-xs tracking-widest text-primary uppercase">
          {t("village", { n: state.players.filter((p) => p.alive).length })}
        </h2>
        <RoleList players={state.players} revealAll />
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6 backdrop-blur">
      <div className="surface-card animate-rise-in neon-ring max-w-sm space-y-5 rounded-3xl p-6 text-center">
        <p className="text-lg font-semibold">{children}</p>
        <button
          onClick={onClose}
          className="w-full rounded-full bg-primary py-3 font-bold text-primary-foreground"
        >
          {t("continue")}
        </button>
      </div>
    </div>
  );
}

function RoleList({
  players,
  revealAll,
}: {
  players: Player[];
  revealAll?: boolean;
}) {
  const { t } = useI18n();
  return (
    <ul className="grid grid-cols-2 gap-2 text-sm">
      {players.map((p) => (
        <li
          key={p.id}
          className={`rounded-xl border border-border px-3 py-2 ${p.alive ? "" : "opacity-40 line-through"}`}
        >
          <span className="flex items-center gap-1 font-semibold">
            {p.name}
            {p.isCaptain && p.alive && (
              <Crown className="size-3.5 text-accent" aria-label={t("captain")} />
            )}
            {p.isConvertedToWolf && (
              <span
                title={t("convertedInfo")}
                className="rounded bg-destructive/20 px-1 text-[9px] font-bold text-destructive uppercase"
              >
                {t("wolfTag")}
              </span>
            )}
          </span>
          {(revealAll || !p.alive) && (
            <span className="block text-[11px] text-muted-foreground">
              {ROLE_BY_ID[p.originalRoleId ?? effectiveRoleId(p)]?.name}
              {p.isConvertedToWolf && t("converted")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function PlayerPicker({
  players,
  selected,
  onToggle,
}: {
  players: Player[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((p) => (
        <button
          key={p.id}
          onClick={() => onToggle(p.id)}
          className={`relative rounded-xl border px-3 py-3 text-sm transition ${
            selected.includes(p.id)
              ? "neon-ring border-primary bg-primary/15 text-primary"
              : "border-border"
          }`}
        >
          {p.isCaptain && (
            <span
              aria-label={t("captain")}
              className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg"
            >
              <Crown className="size-3.5" />
            </span>
          )}
          {p.name}
        </button>
      ))}
    </div>
  );
}

// ─── Night panel ──────────────────────────────────────────────────────────────

function NightPanel({
  state,
  onChange,
  onUndo,
  canUndo,
}: {
  state: GameState;
  onChange: (s: GameState) => void;
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  const { t, prompt, roleName } = useI18n();
  const step = currentStep(state);
  const [sel, setSel] = useState<string[]>([]);
  const [execute, setExecute] = useState(false);
  const [heal, setHeal] = useState(false);
  const [infect, setInfect] = useState(false);
  const [mute, setMute] = useState<string | null>(null);
  const [editingWord, setEditingWord] = useState(false);
  const [shieldConfirm, setShieldConfirm] = useState(false);
  const [wordDraft, setWordDraft] = useState("");

  useEffect(() => {
    setSel([]);
    setExecute(false);
    setHeal(false);
    setInfect(false);
    setMute(null);
    setEditingWord(false);
    setWordDraft("");
    setShieldConfirm(false);
  }, [step?.key]);

  // Wolf-pack SFX
  useEffect(() => {
    if (!step) return;
    const WOLF_ROLES = ["loup-garou", "loup-noir", "loup-blanc", "loup-matriarche", "loup-bavard"];
    if (WOLF_ROLES.includes(step.roleId)) playWolfHowl();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.key]);

  if (!step) {
    return (
      <NarratorCard text={t("nightEnds")}>
        <button
          onClick={() => onChange(submitStep(state, {}))}
          className="w-full rounded-full bg-primary py-3 font-bold text-primary-foreground"
        >
          {t("raiseDay")}
        </button>
      </NarratorCard>
    );
  }

  const actor = state.players.find((p) => p.id === step.actorId)!;
  let candidates = state.players.filter((p) => p.alive);
  if (step.roleId === "loup-blanc")
    candidates = step.soloKill
      ? candidates.filter((p) => p.id !== actor.id)
      : candidates.filter((p) => p.team === "WEREWOLVES" && p.id !== actor.id);

  if (step.roleId === "salvateur")
    candidates = candidates.filter((p) => p.id !== state.round.previousProtectedId);
  if (["voyante", "cupidon", "mime", "enfant-sauvage", "general"].includes(step.roleId))
    candidates = candidates.filter((p) => p.id !== actor.id);

  const toggle = (id: string) =>
    setSel((s) =>
      s.includes(id)
        ? s.filter((x) => x !== id)
        : step.mode === "two"
          ? [...s, id].slice(-2)
          : [id],
    );

  const send = (payload: Parameters<typeof submitStep>[1]) =>
    onChange(submitStep(state, payload));

  const matriarch = state.players.find(
    (p) =>
      p.alive &&
      effectiveRoleId(p) === "loup-matriarche" &&
      !p.disabledNightAbility &&
      !p.powersDisabled,
  );

  // Salvateur + Sorcière interaction: if salvateur already protects the attacked player,
  // the witch's heal potion is unnecessary.
  const isAttackedPlayerSaved =
    step.mode === "witch" &&
    state.round.attackedId != null &&
    state.round.attackedId === state.round.protectedId;

  const attackedPlayerName = state.players.find((p) => p.id === state.round.attackedId)?.name;

  const stepPrompt = prompt(step.roleId) || step.prompt;
  const stepTitle = `${roleName(step.roleId)}${step.soloKill ? t("soloPackSuffix") : ""}`;

  return (
    <div className="surface-card animate-rise-in neon-ring overflow-hidden rounded-3xl">
      <div className="relative aspect-[16/10] overflow-hidden">
        <img
          src={roleImage(step.roleId)}
          alt={t("stepWakeAlt", { role: stepTitle })}
          width={640}
          height={640}
          loading="lazy"
          className="animate-slow-zoom h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
        <p className="absolute bottom-3 left-4 text-lg font-black text-primary">
          {stepTitle}
        </p>
        <div className="absolute right-3 bottom-3">
          <SpeakButton text={stepTitle} />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-sm text-muted-foreground">
          {actor.name} — {stepPrompt}
        </p>

        {step.mode === "word" ? (
          <div className="space-y-4">
            {step.soloKill && (
              <div className="space-y-2">
                <p className="text-xs tracking-widest text-primary uppercase">
                  {t("noirSoloVictimTitle")}
                </p>
                <PlayerPicker
                  players={candidates.filter((p) => p.id !== actor.id)}
                  selected={sel}
                  onToggle={toggle}
                />
              </div>
            )}

            <div className="neon-ring relative overflow-hidden rounded-3xl border-2 border-primary bg-black/60 p-6 text-center">
              <p className="text-[11px] tracking-[0.3em] text-primary uppercase">
                {t("secretWordTitle")}
              </p>
              {editingWord ? (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    autoFocus
                    value={wordDraft}
                    onChange={(e) => setWordDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && wordDraft.trim()) {
                        onChange({ ...state, round: { ...state.round, requiredWord: wordDraft.trim() } });
                        setEditingWord(false);
                      }
                      if (e.key === "Escape") setEditingWord(false);
                    }}
                    className="flex-1 rounded-2xl bg-input px-4 py-3 text-center text-3xl font-black outline-none focus:ring-2 focus:ring-primary"
                    placeholder={t("newWordPlaceholder")}
                  />
                  <button
                    onClick={() => {
                      if (wordDraft.trim())
                        onChange({ ...state, round: { ...state.round, requiredWord: wordDraft.trim() } });
                      setEditingWord(false);
                    }}
                    className="shrink-0 rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => setEditingWord(false)}
                    className="shrink-0 rounded-full border border-border p-3 text-muted-foreground"
                    aria-label={t("cancel")}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-center gap-3">
                  <span className="gradient-text text-6xl font-black leading-tight tracking-wider">
                    {state.round.requiredWord}
                  </span>
                  <button
                    onClick={() => {
                      setWordDraft(state.round.requiredWord ?? "");
                      setEditingWord(true);
                    }}
                    aria-label={t("editWord")}
                    className="shrink-0 rounded-full border border-primary/40 p-2 text-primary/60 transition hover:border-primary hover:text-primary"
                  >
                    <Pencil className="size-4" />
                  </button>
                </div>
              )}
            </div>
            <button
              disabled={step.soloKill && sel.length !== 1}
              onClick={() => send(step.soloKill ? { targetId: sel[0] } : {})}
              className="neon-ring w-full rounded-full bg-primary py-3 font-bold text-primary-foreground disabled:opacity-40"
            >
              {t("bavardSeen")}
            </button>

          </div>
        ) : step.mode === "wolves" ? (
          <div className="space-y-3">
            <PlayerPicker players={candidates} selected={sel} onToggle={toggle} />
            <button
              disabled={sel.length !== 1}
              onClick={() => send({ targetId: sel[0] })}
              className="w-full rounded-full bg-primary py-3 font-bold text-primary-foreground disabled:opacity-40"
            >
              {t("packAgrees")}
            </button>
            {matriarch && (
              <button
                onClick={() => send({ disagreement: true })}
                className="w-full rounded-full border border-primary py-3 text-sm font-bold text-primary"
              >
                {t("disagreement")}
              </button>
            )}
          </div>
        ) : step.mode === "blackwolf" ? (
          <div className="space-y-3">
            {/* ── Solo kill: victim picker (only when Loup Noir is the last wolf) ── */}
            {step.soloKill ? (
              <>
                <p className="text-xs tracking-widest text-primary uppercase">
                  {t("noirSoloVictimTitle")}
                </p>
                <PlayerPicker
                  players={candidates.filter((p) => p.id !== actor.id)}
                  selected={sel}
                  onToggle={toggle}
                />
                {/* Contaminate: available once victim is picked and ability not yet used */}
                {sel.length === 1 && !actor.abilityUsed && (
                  <label className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={infect}
                      onChange={(e) => setInfect(e.target.checked)}
                    />
                    {t("infectPlayer", {
                      name: state.players.find((p) => p.id === sel[0])?.name ?? "",
                    })}
                  </label>
                )}
              </>
            ) : (
              /* Normal flow: contaminate uses attackedId already set by the pack */
              state.round.attackedId && !actor.abilityUsed && (
                <label className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={infect}
                    onChange={(e) => setInfect(e.target.checked)}
                  />
                  {t("infectPlayer", {
                    name: state.players.find((p) => p.id === state.round.attackedId)?.name ?? "",
                  })}
                </label>
              )
            )}
            {/* ── Silence ── */}
            {state.night >= 2 ? (
              <>
                <p className="text-xs tracking-widest text-primary uppercase">
                  {t("muteTitle")}
                </p>
                <PlayerPicker
                  players={candidates.filter(
                    (p) => p.id !== actor.id && p.id !== state.round.previousMutedId,
                  )}
                  selected={mute ? [mute] : []}
                  onToggle={(id) => setMute((m) => (m === id ? null : id))}
                />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t("muteUnavailable")}</p>
            )}
            <button
              disabled={step.soloKill && sel.length !== 1}
              onClick={() =>
                send({
                  targetId: step.soloKill ? sel[0] : undefined,
                  yes: infect,
                  muteId: mute ?? undefined,
                })
              }
              className="w-full rounded-full bg-primary py-3 font-bold text-primary-foreground disabled:opacity-40"
            >
              {step.soloKill ? t("noirSoloConfirm") : t("validate")}
            </button>
          </div>
        ) : step.mode === "bear" ? (
          <>
            <div className="space-y-1 rounded-2xl border border-border p-3 text-sm">
              <p className="text-[11px] tracking-widest text-primary uppercase">
                {t("bearNeighbors")}
              </p>
              {(() => {
                const { left, right } = bearNeighbors(state, actor.id);
                return [left, right].map((n, idx) =>
                  n ? (
                    <p key={idx} className="text-muted-foreground">
                      {idx === 0 ? t("left") : t("right")} :{" "}
                      <span className="font-semibold text-foreground">{n.name}</span>{" "}
                      — {ROLE_BY_ID[n.originalRoleId ?? effectiveRoleId(n)]?.name}
                      {n.isConvertedToWolf && t("infected")}
                    </p>
                  ) : null,
                );
              })()}
            </div>
            <button
              onClick={() => send({})}
              className="neon-ring w-full rounded-full bg-primary py-3 font-bold text-primary-foreground"
            >
              {t("bearSniff")}
            </button>
          </>
        ) : step.mode === "yesno" ? (
          <div className="flex gap-3">
            <button
              onClick={() => send({ yes: true })}
              className="flex-1 rounded-full bg-primary py-3 font-bold text-primary-foreground"
            >
              {t("yes")}
            </button>
            <button
              onClick={() => send({ yes: false })}
              className="flex-1 rounded-full border border-border py-3 font-semibold"
            >
              {t("no")}
            </button>
          </div>
        ) : step.mode === "witch" ? (
          <div className="space-y-3">
            {isAttackedPlayerSaved ? (
              /* Salvateur already saved the victim — hide heal potion */
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                🛡️ {t("witchTargetProtected")}
              </div>
            ) : (
              state.round.attackedId && !actor.healUsed && (
                <label className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={heal}
                    onChange={(e) => setHeal(e.target.checked)}
                  />
                  {t("healSave", { name: attackedPlayerName ?? "" })}
                </label>
              )
            )}
            {!actor.poisonUsed && (
              <>
                <p className="text-xs tracking-widest text-primary uppercase">
                  {t("poisonPotion")}
                </p>
                <PlayerPicker players={candidates} selected={sel} onToggle={toggle} />
              </>
            )}
            <button
              onClick={() => send({ healUsed: isAttackedPlayerSaved ? false : heal, poisonId: sel[0] })}
              className="w-full rounded-full bg-primary py-3 font-bold text-primary-foreground"
            >
              {t("validate")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <PlayerPicker players={candidates} selected={sel} onToggle={toggle} />
            {step.roleId === "salvateur" && !actor.ultimateShieldUsed && (
              <div className="space-y-2 rounded-2xl border border-accent/50 bg-accent/5 p-3">
                <p className="text-xs tracking-widest text-accent uppercase">
                  {t("ultimateShield")}
                </p>
                <p className="text-xs text-muted-foreground">{t("ultimateShieldDesc")}</p>
                {shieldConfirm ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-destructive">
                      {t("ultimateShieldWarn")}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => send({ ultimateShield: true })}
                        className="flex-1 rounded-full bg-accent py-2.5 text-sm font-bold text-accent-foreground"
                      >
                        {t("ultimateShieldConfirm")}
                      </button>
                      <button
                        onClick={() => setShieldConfirm(false)}
                        className="rounded-full border border-border px-4 py-2.5 text-sm"
                      >
                        {t("no")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShieldConfirm(true)}
                    className="w-full rounded-full border border-accent py-2.5 text-sm font-bold text-accent"
                  >
                    🛡️ {t("ultimateShieldActivate")}
                  </button>
                )}
              </div>
            )}
            {step.roleId === "geolier" && (
              <label className="flex items-center gap-3 rounded-xl border border-destructive/50 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={execute}
                  onChange={(e) => setExecute(e.target.checked)}
                />
                {t("execPrisoner")}
              </label>
            )}
            <div className="flex gap-3">
              <button
                disabled={step.mode === "two" ? sel.length !== 2 : sel.length !== 1}
                onClick={() => send({ targetId: sel[0], targetIds: sel, yes: execute })}
                className="flex-1 rounded-full bg-primary py-3 font-bold text-primary-foreground disabled:opacity-40"
              >
                {t("validate")}
              </button>
              {step.optional && (
                <button
                  onClick={() => send({})}
                  className="rounded-full border border-border px-5 py-3 text-sm"
                >
                  {t("skip")}
                </button>
              )}
            </div>
          </div>
        )}

        {canUndo && onUndo && (
          <button
            onClick={onUndo}
            className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground"
          >
            <RotateCcw className="size-3.5" />
            {t("undoStep")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Dawn panel ───────────────────────────────────────────────────────────────

function DawnPanel({
  state,
  settings,
  direction,
  debateDone,
  onDebateDone,
  onChange,
  onUndo,
  canUndo,
}: {
  state: GameState;
  settings: GameSettings | null;
  direction: RotationDirection;
  debateDone: boolean;
  onDebateDone: () => void;
  onChange: (s: GameState) => void;
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  const { t } = useI18n();
  const narrate = useNarrate();
  const [bavardModal, setBavardModal] = useState(false);
  const firstDay = state.day === 1 && !state.voteSkippedOffer;
  const alive = state.players.filter((p) => p.alive);

  // Loup Bavard alive and Day 2+ → pre-vote modal
  const talkative = state.players.find(
    (p) => p.alive && effectiveRoleId(p) === "loup-bavard",
  );
  const needsBavardCheck = !!talkative && state.day > 1;

  const handleGoToVote = () => {
    if (needsBavardCheck) {
      setBavardModal(true);
    } else {
      onChange(goToVote(state));
    }
  };

  const UndoButton = canUndo && onUndo ? (
    <button
      onClick={onUndo}
      className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground"
    >
      <RotateCcw className="size-3.5" />
      {t("undoStep")}
    </button>
  ) : null;

  if (settings?.isDebateTimerEnabled && !debateDone)
    return (
      <NarratorCard
        title={t("debateTitle", { n: state.day })}
        text={t("debateText")}
      >
        {alive.some((p) => p.mutedForDay) && (
          <p className="rounded-xl border border-destructive/50 p-3 text-xs text-muted-foreground">
            {t("mutedBy", {
              names: alive
                .filter((p) => p.mutedForDay)
                .map((p) => p.name)
                .join(", "),
            })}
          </p>
        )}
        <DebateWheel
          seating={alive}
          seconds={settings.debateTimePerPlayer}
          captainId={state.villageCaptainId}
          direction={direction}
          onFinish={onDebateDone}
        />
        {UndoButton}
      </NarratorCard>
    );

  return (
    <>
      {/* Bavard pre-vote modal */}
      {bavardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6 backdrop-blur">
          <div className="surface-card animate-rise-in neon-ring max-w-sm space-y-5 rounded-3xl p-6 text-center">
            <p className="text-[11px] tracking-widest text-primary uppercase">
              {t("bavardPreVoteTitle")}
            </p>
            <p className="text-base font-semibold">
              {t("bavardPreVoteAsk", {
                word: state.round.requiredWord
                  ? `« ${state.round.requiredWord} »`
                  : "—",
              })}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setBavardModal(false);
                  onChange(goToVote(state));
                }}
                className="w-full rounded-full bg-primary py-3 font-bold text-primary-foreground"
              >
                {t("bavardPreVoteYes")}
              </button>
              <button
                onClick={() => {
                  setBavardModal(false);
                  onChange(executeTalkativeWolfAndSkip(state));
                }}
                className="w-full rounded-full border border-destructive py-3 font-bold text-destructive"
              >
                {t("bavardPreVoteNo")}
              </button>
            </div>
          </div>
        </div>
      )}

      <NarratorCard
        title={t("dawnTitle", { n: state.day })}
        text={state.dawnSummary.map((l) => narrate(l)).join(" ")}
      >
        {state.round.requiredWord && (
          <InlineWordEditor
            word={state.round.requiredWord}
            onChange={(w) =>
              onChange({ ...state, round: { ...state.round, requiredWord: w } })
            }
          />
        )}

        {firstDay ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("firstDayVoteQuestion")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleGoToVote}
                className="flex-1 rounded-full bg-primary py-3 font-bold text-primary-foreground"
              >
                {t("vote")}
              </button>
              <button
                onClick={() => onChange(skipVote(state))}
                className="flex-1 rounded-full border border-border py-3 font-semibold"
              >
                {t("noVote")}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleGoToVote}
            className="neon-ring w-full rounded-full bg-primary py-3 font-bold text-primary-foreground"
          >
            {t("forceVote")}
          </button>
        )}
        {UndoButton}
      </NarratorCard>
    </>
  );
}

// ─── Vote panel ───────────────────────────────────────────────────────────────

// ─── Game over / Bilan de Partie ──────────────────────────────────────────────

// ─── Captain succession ───────────────────────────────────────────────────────

function CaptainSuccessionPanel({
  state,
  onDone,
}: {
  state: GameState;
  onDone: (s: GameState) => void;
}) {
  const { t } = useI18n();
  const [sel, setSel] = useState<string[]>([]);
  const dead = state.players.find((p) => p.id === state.captainSuccessionPending);
  const candidates = state.players.filter((p) => p.alive);
  return (
    <NarratorCard
      title={t("captainSuccession")}
      text={t("captainSuccessionText", { name: dead?.name ?? t("captain") })}
    >
      <PlayerPicker
        players={candidates}
        selected={sel}
        onToggle={(id) => setSel([id])}
      />
      <button
        disabled={sel.length !== 1}
        onClick={() => onDone(assignCaptain(state, sel[0]))}
        className="neon-ring w-full rounded-full bg-primary py-3 font-bold text-primary-foreground disabled:opacity-40"
      >
        {t("transmit")}
      </button>
    </NarratorCard>
  );
}

// ─── Hunter panel ─────────────────────────────────────────────────────────────

function HunterPanel({
  state,
  onDone,
}: {
  state: GameState;
  onDone: (s: GameState) => void;
}) {
  const { t } = useI18n();
  const [sel, setSel] = useState<string[]>([]);
  const candidates = state.players.filter(
    (p) => p.alive && p.id !== state.hunterPending,
  );
  return (
    <NarratorCard
      title={t("hunterTitle")}
      text={t("hunterText")}
    >
      <PlayerPicker
        players={candidates}
        selected={sel}
        onToggle={(id) => setSel([id])}
      />
      <button
        disabled={sel.length !== 1}
        onClick={() => onDone(resolveHunter(state, sel[0]))}
        className="w-full rounded-full bg-primary py-3 font-bold text-primary-foreground disabled:opacity-40"
      >
        {t("shoot")}
      </button>
    </NarratorCard>
  );
}

/** Champ inline permettant au MJ de consulter et modifier le mot du Loup Bavard. */
function InlineWordEditor({
  word,
  onChange,
}: {
  word: string;
  onChange: (w: string) => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(word);

  if (editing)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-primary/50 p-3">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onChange(draft.trim());
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          className="flex-1 rounded-lg bg-input px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={() => {
            if (draft.trim()) onChange(draft.trim());
            setEditing(false);
          }}
          className="rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
        >
          OK
        </button>
        <button
          onClick={() => setEditing(false)}
          aria-label={t("remove")}
          className="rounded-full border border-border p-2 text-muted-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );

  return (
    <p className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm">
      {t("bavardWordOfDay")}{" "}
      <span className="font-bold text-primary">{word}</span>
      <button
        onClick={() => {
          setDraft(word);
          setEditing(true);
        }}
        aria-label={t("editWord")}
        className="ms-auto rounded-full border border-primary/40 p-1.5 text-primary/70 transition hover:border-primary hover:text-primary"
      >
        <Pencil className="size-3.5" />
      </button>
    </p>
  );
}
