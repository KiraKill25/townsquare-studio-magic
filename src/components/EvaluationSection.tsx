import { motion } from "framer-motion";
import { Crown, Target, Trophy, TrendingDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { effectiveRoleId, type GameState, type Player } from "@/game/engine";
import type { VoteRecord } from "@/components/GameRecapCard";

const spring = { type: "spring" as const, stiffness: 220, damping: 24 };

export interface Scorecard {
  player: Player;
  /** Points de vote posés sur des joueurs du camp adverse / total posé. */
  accuracy: number;
  votePoints: number;
  /** Efficacité du rôle (nuits utiles : sauvetages, kills réussis, survie). */
  roleEfficiency: number;
  /** A initié le premier vote sur la cible finalement éliminée. */
  leaderCount: number;
  followerCount: number;
  score: number;
}

const isWolf = (p: Player) =>
  p.team === "WEREWOLVES" || !!p.isConvertedToWolf;

/**
 * Évaluation post-partie 100 % basée sur les journaux enregistrés :
 * bulletins de vote (dont votes doubles / séparés du capitaine) et évènements de nuit.
 */
export function buildScorecards(
  state: GameState,
  voteHistory: VoteRecord[],
): Scorecard[] {
  const wolfIds = new Set(state.players.filter(isWolf).map((p) => p.id));
  const events = state.events ?? [];

  return state.players
    .map((p) => {
      let good = 0;
      let total = 0;
      let leaderCount = 0;
      let followerCount = 0;

      for (const round of voteHistory) {
        const ballots = round.ballots ?? [];
        const mine = ballots.filter((b) => b.voterId === p.id);
        for (const b of mine) {
          for (const tid of b.targets) {
            total += 1;
            const targetIsWolf = wolfIds.has(tid);
            if (wolfIds.has(p.id) ? !targetIsWolf : targetIsWolf) good += 1;
          }
        }
        // Meneur : premier bulletin posé sur le joueur finalement éliminé.
        const elimIds = round.eliminated.map((e) => e.id);
        const pushers = ballots.filter((b) =>
          b.targets.some((tid) => elimIds.includes(tid)),
        );
        if (pushers.length > 0) {
          if (pushers[0].voterId === p.id) leaderCount += 1;
          else if (pushers.some((b) => b.voterId === p.id)) followerCount += 1;
        }
      }

      // Efficacité du rôle depuis la frise : sauvetages provoqués, survie, capitanat.
      const rid = p.originalRoleId ?? effectiveRoleId(p);
      const rescues = events.filter((e) => e.type === "RESCUE" && e.bySavior === rid).length;
      const kills = events.filter(
        (e) => e.type === "KILL" && e.cause === "WITCH_POISON" && wolfIds.has(p.id) === false,
      ).length;
      let roleEfficiency = rescues * 30 + Math.min(kills, 2) * 15;
      if (p.alive) roleEfficiency += 25;
      if (p.isCaptain) roleEfficiency += 10;
      roleEfficiency = Math.min(100, roleEfficiency);

      const accuracy = total > 0 ? Math.round((good / total) * 100) : 0;
      const score = Math.round(
        accuracy * 0.5 +
          roleEfficiency * 0.4 +
          leaderCount * 6 +
          followerCount * 2 +
          (p.alive ? 8 : 0),
      );

      return {
        player: p,
        accuracy,
        votePoints: total,
        roleEfficiency,
        leaderCount,
        followerCount,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/** Note de camp : moyenne des scores individuels du camp. */
function factionRating(cards: Scorecard[], pick: (p: Player) => boolean) {
  const list = cards.filter((c) => pick(c.player));
  if (!list.length) return null;
  return Math.round(list.reduce((s, c) => s + c.score, 0) / list.length);
}

export function EvaluationSection({
  state,
  voteHistory,
}: {
  state: GameState;
  voteHistory: VoteRecord[];
}) {
  const { t, roleName } = useI18n();
  const cards = buildScorecards(state, voteHistory);
  if (cards.length === 0) return null;

  const mvp = cards[0];
  const lvp = cards[cards.length - 1];
  const factions = [
    {
      label: t("factionWolves"),
      value: factionRating(cards, isWolf),
      bar: "bg-destructive",
    },
    {
      label: t("factionVillage"),
      value: factionRating(cards, (p) => !isWolf(p) && p.team === "VILLAGEOIS"),
      bar: "bg-primary",
    },
    {
      label: t("factionSolo"),
      value: factionRating(
        cards,
        (p) => p.team === "SOLO" || p.team === "LOVERS",
      ),
      bar: "bg-accent",
    },
  ].filter((f) => f.value !== null);

  const hasBallots = voteHistory.some((r) => (r.ballots ?? []).length > 0);

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.28 }}
      className="surface-card space-y-4 rounded-3xl p-4"
    >
      <p className="text-[11px] tracking-[0.3em] text-primary uppercase">
        {t("evalTitle")}
      </p>

      {!hasBallots && (
        <p className="text-xs text-muted-foreground">{t("evalNoData")}</p>
      )}

      <div className="grid gap-2">
        {[
          { card: mvp, key: "evalMvp" as const, icon: Trophy, tone: "text-gold" },
          { card: lvp, key: "evalLvp" as const, icon: TrendingDown, tone: "text-destructive" },
        ].map(({ card, key, icon: Icon, tone }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-2 rounded-2xl border border-border p-3"
          >
            <div className="min-w-0">
              <p className={`flex items-center gap-1 text-[10px] tracking-widest uppercase ${tone}`}>
                <Icon className="size-3" />
                {t(key)}
              </p>
              <p className="truncate text-sm font-black">
                {card.player.name}
                {card.player.isCaptain && (
                  <Crown className="ms-1 inline size-3 text-accent" />
                )}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {roleName(card.player.originalRoleId ?? effectiveRoleId(card.player))}
              </p>
            </div>
            <div className="text-end">
              <p className={`text-xl font-black ${tone}`}>{card.score}</p>
              <p className="text-[10px] text-muted-foreground">
                {t("evalAccuracy")} {card.accuracy}%
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] tracking-widest text-muted-foreground uppercase">
          {t("evalFactions")}
        </p>
        {factions.map((f) => (
          <div key={f.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-bold text-foreground">{f.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-input">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, f.value ?? 0)}%` }}
                transition={{ duration: 0.9, delay: 0.3 }}
                className={`h-full rounded-full ${f.bar}`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] tracking-widest text-muted-foreground uppercase">
          {t("evalScorecards")}
        </p>
        <ul className="space-y-2">
          {cards.map((c, i) => (
            <li
              key={c.player.id}
              className="space-y-1 rounded-2xl border border-border p-3 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-black text-primary tabular-nums">
                    {i + 1}
                  </span>
                  <span className="truncate font-bold">{c.player.name}</span>
                  {c.player.isCaptain && <Crown className="size-3 text-accent" />}
                </span>
                <b className="tabular-nums">{c.score}</b>
              </div>
              <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                <span className="rounded-full bg-input px-2 py-0.5">
                  <Target className="me-1 inline size-2.5" />
                  {t("evalAccuracy")} {c.accuracy}%
                </span>
                <span className="rounded-full bg-input px-2 py-0.5">
                  {t("evalRoleEff")} {c.roleEfficiency}%
                </span>
                <span className="rounded-full bg-input px-2 py-0.5">
                  {t("evalVotesCast", { n: c.votePoints })}
                </span>
                {c.leaderCount > 0 && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">
                    {t("evalLeader")} ×{c.leaderCount}
                  </span>
                )}
                {c.followerCount > 0 && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-accent">
                    {t("evalFollower")} ×{c.followerCount}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}
