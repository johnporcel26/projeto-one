import { useEffect, useMemo, useRef, useState } from "react";
import {
  fruitDefinitions,
  hunts,
  itemDefinitions,
  shopDefinitions,
  skillDefinitions,
  type FruitId,
  type ItemId,
} from "@onepiece/shared";
import {
  Activity,
  Backpack,
  BarChart3,
  BookOpen,
  Bot,
  Box,
  Coins,
  Compass,
  Crown,
  Gem,
  Map,
  Maximize2,
  Minimize2,
  PackageOpen,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Store,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { useGameUi, type PanelId } from "../../ui/GameUiStore";
import { PremiumMarketPanel } from "./MarketPanel";
import { CatalogPanel } from "./CatalogPanel";
import { DepositPanel } from "./DepositPanel";
import { HuntCenter } from "./HuntCenter";
import "./hunt.css";
const root = "/";
const assets: Record<string, string> = new Proxy<Record<string, string>>({ ted: `${root}personagem/Player/idle/1.png` }, { get: (known, id) => known[id as string] ?? `${root}${itemDefinitions[id as string]?.icon ?? fruitDefinitions[id as string]?.icon ?? ""}` });
const fruitNames: Record<FruitId, string> = new Proxy({}, { get: (_, id) => fruitDefinitions[id as string]?.name ?? String(id) }) as Record<FruitId, string>;
const itemNames: Record<ItemId, string> = new Proxy({}, { get: (_, id) => itemDefinitions[id as string]?.displayName ?? String(id) }) as Record<ItemId, string>;
const lockedFruitSkills = (fruit: string) =>
  Array.from({ length: 4 }, (_, index) => ({
    id: `${fruit}_${index}`,
    name: "Habilidade bloqueada",
    description: "Habilidades desta Akuma no Mi ainda não foram implementadas.",
    cooldown: 0,
    type: "—",
    range: "—",
    available: false,
  }));
const skillData: Record<
  FruitId,
  readonly {
    id: string;
    name: string;
    description: string;
    cooldown: number;
    type: string;
    range: string;
    available: boolean;
  }[]
> = Object.fromEntries(
  Object.entries(fruitDefinitions).map(([fruitId, fruit]) => [
    fruitId,
    fruit.skillIds.map((skillId) => {
      const skill = skillDefinitions[skillId];
      return {
        id: skill.id,
        name: skill.displayName,
        description: skill.description,
        cooldown: skill.cooldownMs / 1000,
        type:
          skill.targetType === "self"
            ? "Próprio"
            : skill.targetType === "enemy"
              ? "Ataque"
              : "—",
        range:
          skill.targetType === "enemy"
            ? "Curto"
            : skill.targetType === "self"
              ? "Próprio"
              : "—",
        available: skill.status === "AVAILABLE",
      };
    }),
  ]),
) as unknown as Record<
  FruitId,
  readonly {
    id: string;
    name: string;
    description: string;
    cooldown: number;
    type: string;
    range: string;
    available: boolean;
  }[]
>;
const nav: readonly {
  id: PanelId;
  label: string;
  icon: typeof BookOpen;
  status: "available" | "soon";
}[] = [
  { id: "catalog", label: "Catálogo", icon: BookOpen, status: "available" },
  { id: "deposit", label: "Depósito", icon: Box, status: "available" },
  { id: "inventory", label: "Bolsa", icon: Backpack, status: "available" },
  { id: "hunts", label: "Hunts", icon: Compass, status: "available" },
  { id: "bot", label: "Bot", icon: Bot, status: "available" },
  { id: "analysis", label: "Análise", icon: BarChart3, status: "available" },
  { id: "diary", label: "Diário", icon: BookOpen, status: "soon" },
  { id: "pass", label: "Passe", icon: Crown, status: "soon" },
  { id: "wiki", label: "Wiki", icon: Search, status: "soon" },
  { id: "shop", label: "Loja", icon: Store, status: "soon" },
  { id: "market", label: "Mercado", icon: ShoppingBag, status: "available" },
  { id: "world", label: "Mundo", icon: Map, status: "available" },
  { id: "search", label: "Busca", icon: Search, status: "available" },
  { id: "settings", label: "Ajustes", icon: Settings, status: "available" },
  { id: "profile", label: "Perfil", icon: UserRound, status: "available" },
];
export function Hud({
  onIntent,
}: {
  onIntent: (intent: unknown) => void;
}): JSX.Element {
  const { snapshot, logs, panel, openPanel, closePanel, uiScale } = useGameUi();
  const player = snapshot?.player;
  const fruitId = player?.activeFruitId;
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, []);
  const cooldowns = useMemo(
    () =>
      Object.entries(player?.skillCooldownEndsAt ?? {}).reduce<
        Record<string, number>
      >((values, [id, endsAt]) => {
        if (typeof endsAt === "number") {
          const remaining = Math.max(0, (endsAt - clock) / 1000);
          if (remaining > 0) values[id] = remaining;
        }
        return values;
      }, {}),
    [player?.skillCooldownEndsAt, clock],
  );
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePanel();
        return;
      }
      if ((event.target as HTMLElement)?.matches("input, textarea, select"))
        return;
      if (event.key === "5" || event.key === "6") {
        const id = player?.utilitySlots?.[Number(event.key) - 5];
        if (id) onIntent({ type: "useItem", itemId: id });
        return;
      }
      if (!fruitId) return;
      const index = Number(event.key) - 1;
      const skill = skillData[fruitId][index];
      if (
        index >= 0 &&
        index < 4 &&
        skill?.available &&
        !(cooldowns[skill.id] ?? 0)
      ) {
        event.preventDefault();
        useSkill(skill.id, onIntent);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [fruitId, player?.utilitySlots, cooldowns, onIntent, closePanel]);
  return (
    <div
      className="hud-layer"
      style={{
        transform: `scale(${uiScale})`,
        width: `${100 / uiScale}%`,
        height: `${100 / uiScale}%`,
      }}
    >
      <PlayerStatus />
      <TopNavigation active={panel} openPanel={openPanel} />
      <Minimap />
      <BattleSummary onIntent={onIntent} />
      <GameLog logs={logs} />
      <UtilityBar onIntent={onIntent} />
      <SkillBar
        fruitId={fruitId}
        cooldowns={cooldowns}
        onUse={(id) => useSkill(id, onIntent)}
      />
      {panel && (
        <HudWindow panel={panel} onClose={closePanel} onIntent={onIntent} />
      )}
    </div>
  );
}
function useSkill(id: string, onIntent: (intent: unknown) => void): void {
  onIntent({ type: "useSkill", skillId: id });
}
function PlayerStatus(): JSX.Element {
  const { snapshot } = useGameUi();
  const player = snapshot?.player;
  const fruit = player?.activeFruitId;
  const required = player?.xpRequiredForNextLevel;
  return (
    <section className="player-status ui-panel" aria-label="Perfil do jogador">
      <div className="profile-rivets" />
      <img className="avatar" src={assets.ted} alt="Retrato de Ted" />
      <div className="player-core">
        <strong>{player?.name ?? "Ted"}</strong>
        <span>CAPITÃO · Lv. {player?.level ?? 1}</span>
        <Meter
          label={`HP ${player?.resources.currentHp ?? 100} / ${player?.stats.maxHp ?? 100}`}
          value={
            (player?.resources.currentHp ?? 100) / (player?.stats.maxHp ?? 100)
          }
          tone="health"
        />
        <Meter
          label={`MANA ${player?.resources.currentMana ?? 50} / ${player?.stats.maxMana ?? 50}`}
          value={
            (player?.resources.currentMana ?? 50) /
            (player?.stats.maxMana ?? 50)
          }
          tone="mana"
        />
        <Meter
          label={
            required === null
              ? "XP MAX"
              : `XP ${player?.xpIntoCurrentLevel ?? 0} / ${required ?? 100}`
          }
          value={required ? (player?.xpIntoCurrentLevel ?? 0) / required : 1}
          tone="xp"
        />
      </div>
      <div className="player-meta">
        <span title="Berries">
          <Coins size={14} /> {player?.wallet.berries ?? 0}
        </span>
        <span title="Rubis">
          <Gem size={14} /> {player?.wallet.rubies ?? 0}
        </span>
        {fruit ? (
          <span title={fruitNames[fruit]}>
            <img src={assets[fruit]} alt="" /> {fruitNames[fruit]}
          </span>
        ) : (
          <span>Sem Akuma no Mi</span>
        )}
      </div>
    </section>
  );
}
function Meter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}): JSX.Element {
  return (
    <div className={`meter ${tone}`}>
      <i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      <span>{label}</span>
    </div>
  );
}
function TopNavigation({
  active,
  openPanel,
}: {
  active: PanelId | null;
  openPanel: (id: PanelId) => void;
}): JSX.Element {
  return (
    <nav className="top-navigation ui-panel" aria-label="Navegação principal">
      <span className="nav-crest" aria-hidden="true">
        ✦
      </span>
      {nav.map(({ id, label, icon: Icon, status }) => (
        <button
          className={active === id ? "active" : ""}
          key={id}
          onClick={() => openPanel(id)}
          aria-label={label}
          title={
            status === "soon"
              ? `${label}: em desenvolvimento`
              : `${label} — abrir painel`
          }
        >
          <Icon size={16} />
          <span>{label}</span>
          {status === "soon" && <i />}
        </button>
      ))}
    </nav>
  );
}
function Minimap(): JSX.Element {
  const { snapshot } = useGameUi();
  const player = snapshot?.player;
  return (
    <section className="minimap ui-panel">
      <header>
        <Map size={14} />{" "}
        {snapshot?.area === "pirate_ship"
          ? "Barco Pirata"
          : "Floresta da Alvida"}
      </header>
      <div className="map-grid">
        <b
          className="player-dot"
          style={{
            left: `${Math.max(8, Math.min(92, (player?.x ?? 720) / 16))}%`,
            top: `${Math.max(8, Math.min(92, (player?.y ?? 520) / 11))}%`,
          }}
        />
        {snapshot?.enemies
          .filter((enemy) => enemy.state !== "DEAD")
          .map((enemy) => (
            <i
              key={enemy.id}
              style={{ left: `${enemy.x / 16}%`, top: `${enemy.y / 11}%` }}
            />
          ))}
      </div>
    </section>
  );
}
function BattleSummary({
  onIntent,
}: {
  onIntent: (intent: unknown) => void;
}): JSX.Element {
  const { snapshot, openPanel, logs } = useGameUi();
  const player = snapshot?.player;
  const analyzer = snapshot?.huntAnalyzer;
  const state = player?.autoHunt ?? "OFF";
  const active = analyzer?.status === "ACTIVE";
  const duration = analyzer ? Math.floor(analyzer.durationMs / 1000) : 0;
  const time = `${String(Math.floor(duration / 3600)).padStart(2, "0")}:${String(Math.floor(duration / 60) % 60).padStart(2, "0")}:${String(duration % 60).padStart(2, "0")}`;
  const rate = (value: number) =>
    analyzer && analyzer.durationMs > 0
      ? Math.floor((value * 3600000) / analyzer.durationMs).toLocaleString(
          "pt-BR",
        )
      : "0";
  return (
    <aside className="hunt-widget ui-panel" aria-label="Resumo de batalha">
      <header>
        <span className="eyebrow">
          {active ? "RESUMO DE BATALHA" : "PORTO SEGURO"}
        </span>
        <button onClick={() => openPanel("analysis")}>DETALHES</button>
      </header>
      <strong>
        {active
          ? analyzer?.huntId === "hunt_buffalo_beach"
            ? "Praia do Buffalo"
            : "Floresta da Alvida"
          : "Nenhuma Hunt ativa"}
      </strong>
      <small>
        {active ? `Tempo: ${time}` : "Última sessão disponível em Detalhes"}
      </small>
      <button
        className={`auto-hunt ${state !== "OFF" ? "on" : ""}`}
        onClick={() => onIntent({ type: "toggleAutoHunt" })}
      >
        <Bot size={16} /> AUTO-HUNT: {state.replaceAll("_", " ")}
      </button>
      <div className="analyzer-compact">
        <div>
          <span>KILLS</span>
          <b>{analyzer?.totalKills ?? 0}</b>
        </div>
        <div>
          <span>KILLS/h</span>
          <b>{rate(analyzer?.totalKills ?? 0)}</b>
        </div>
        <div>
          <span>XP</span>
          <b>{analyzer?.xpGained ?? 0}</b>
        </div>
        <div>
          <span>XP/h</span>
          <b>{rate(analyzer?.xpGained ?? 0)}</b>
        </div>
        <div>
          <span>BERRIES</span>
          <b>{analyzer?.berriesGained ?? 0}</b>
        </div>
        <div>
          <span>LOOT</span>
          <b>
            {Object.values(analyzer?.lootByItemId ?? {}).reduce<number>(
              (sum, value) => sum + (value ?? 0),
              0,
            )}
          </b>
        </div>
        <div>
          <span>VALOR</span>
          <b>{analyzer?.estimatedLootValue ?? 0}</b>
        </div>
      </div>
      <div className="battle-feed">
        <span>ÚLTIMOS EVENTOS</span>
        {logs.slice(0, 3).map((log, index) => (
          <p key={`${log}-${index}`}>{log}</p>
        ))}
      </div>
    </aside>
  );
}
function GameLog({ logs }: { logs: string[] }): JSX.Element {
  const [tab, setTab] = useState<"log" | "chat">("log");
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("onepiece-chat-collapsed") === "true",
  );
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("onepiece-chat-position") ?? "null") ??
        {}
      );
    } catch {
      return {};
    }
  });
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const move = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const next = {
      x: Math.max(8, drag.current.left + event.clientX - drag.current.x),
      y: Math.max(8, drag.current.top + event.clientY - drag.current.y),
    };
    setPosition(next);
  };
  const end = () => {
    if (drag.current)
      localStorage.setItem("onepiece-chat-position", JSON.stringify(position));
    drag.current = null;
  };
  const toggle = () =>
    setCollapsed((value) => {
      localStorage.setItem("onepiece-chat-collapsed", String(!value));
      return !value;
    });
  return (
    <section
      className={`game-log ui-panel ${collapsed ? "collapsed" : ""}`}
      style={
        position.x !== undefined
          ? { left: position.x, top: position.y, bottom: "auto" }
          : undefined
      }
    >
      <header
        className="chat-drag-handle"
        onPointerDown={(event) => {
          const rect =
            event.currentTarget.parentElement!.getBoundingClientRect();
          drag.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: rect.left,
            top: rect.top,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={end}
      >
        <button
          className={tab === "log" ? "active" : ""}
          onClick={() => setTab("log")}
        >
          LOG
        </button>
        <button
          className={tab === "chat" ? "active" : ""}
          onClick={() => setTab("chat")}
        >
          CHAT
        </button>
        <button
          className="chat-collapse"
          onClick={toggle}
          aria-label={collapsed ? "Expandir chat" : "Retrair chat"}
          title={collapsed ? "Expandir" : "Retrair"}
        >
          {collapsed ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
        </button>
      </header>
      {!collapsed &&
        (tab === "log" ? (
          <div className="log-lines">
            {logs.slice(0, 7).map((line, index) => (
              <p key={`${line}-${index}`}>{line}</p>
            ))}
          </div>
        ) : (
          <p className="empty-note">Chat em desenvolvimento.</p>
        ))}
    </section>
  );
}
function SkillBar({
  fruitId,
  cooldowns,
  onUse,
}: {
  fruitId: FruitId | null | undefined;
  cooldowns: Record<string, number>;
  onUse: (id: string, cooldown: number) => void;
}): JSX.Element {
  const skills = fruitId
    ? (skillData[fruitId] ?? lockedFruitSkills(fruitId))
    : lockedFruitSkills("locked");
  return (
    <section className="skill-bar ui-panel" aria-label="Habilidades">
      <span className="skills-title">HABILIDADES</span>
      {fruitId ? (
        <img
          className="fruit-orb"
          src={assets[fruitId]}
          alt={fruitNames[fruitId]}
          title={fruitNames[fruitId]}
        />
      ) : (
        <span className="fruit-orb empty-fruit" title="Sem Akuma no Mi">
          <Gem size={22} />
        </span>
      )}
      {skills.map((skill, index) => {
        const remaining = cooldowns[skill.id] ?? 0;
        return (
          <button
            key={skill.id}
            disabled={!skill.available || remaining > 0}
            className={`skill-slot ${!skill.available ? "locked" : ""} ${remaining ? "cooling" : ""}`}
            onClick={() =>
              !remaining && skill.available && onUse(skill.id, skill.cooldown)
            }
            aria-label={`${index + 1}: ${skill.name}`}
          >
            <span className="key">{index + 1}</span>
            <Zap size={23} />
            <strong>{remaining ? remaining.toFixed(1) : ""}</strong>
            {!skill.available && <Shield size={15} />}
            <div className="skill-tooltip">
              <b>{skill.name}</b>
              <p>{skill.description}</p>
              <small>
                Cooldown: {skill.cooldown ? `${skill.cooldown}s` : "—"} · Tipo:{" "}
                {skill.type} · Alcance: {skill.range}
              </small>
            </div>
          </button>
        );
      })}
    </section>
  );
}
function HudWindow({
  panel,
  onClose,
  onIntent,
}: {
  panel: PanelId;
  onClose: () => void;
  onIntent: (intent: unknown) => void;
}): JSX.Element {
  const { snapshot } = useGameUi();
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const title = nav.find((entry) => entry.id === panel)?.label ?? panel;
  return (
    <div className="modal-overlay" role="presentation">
      <section
        className="hud-window ui-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <span className="eyebrow">MMORPG</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-close"
            onClick={onClose}
            aria-label="Fechar painel"
          >
            <X />
          </button>
        </header>
        {panel === "shop" ? (
          <ShopPanel onIntent={onIntent} />
        ) : (
          <PanelContent
            panel={panel}
            snapshot={snapshot}
            onIntent={onIntent}
            onClose={onClose}
          />
        )}
      </section>
    </div>
  );
}
function PanelContent({
  panel,
  snapshot,
  onIntent,
  onClose,
}: {
  panel: PanelId;
  snapshot: ReturnType<typeof useGameUi>["snapshot"];
  onIntent: (intent: unknown) => void;
  onClose: () => void;
}): JSX.Element {
  const player = snapshot?.player;
  const { uiScale, setUiScale } = useGameUi();
  if (panel === "inventory") return <InventoryPanel />;
  if (panel === "deposit") return <DepositPanel snapshot={snapshot} onIntent={onIntent} />;
  if (panel === "market") return <PremiumMarketPanel onIntent={onIntent} />;
  if (panel === "profile")
    return (
      <div className="profile-panel">
        <img src={assets.ted} alt="Ted" />
        <div>
          <h3>Ted · Lv. {player?.level ?? 1}</h3>
          <Stat
            label="EXP"
            value={
              player?.xpRequiredForNextLevel === null
                ? "MAX"
                : `${player?.xpIntoCurrentLevel ?? 0} / ${player?.xpRequiredForNextLevel ?? 100}`
            }
          />
          <Stat label="Força" value={String(player?.stats.strength ?? 10)} />
          <Stat label="Defesa" value={String(player?.stats.defense ?? 5)} />
          <Stat
            label="Vida"
            value={`${player?.resources.currentHp ?? 100} / ${player?.stats.maxHp ?? 100}`}
          />
          <Stat
            label="Mana"
            value={`${player?.resources.currentMana ?? 50} / ${player?.stats.maxMana ?? 50}`}
          />
          <Stat
            label="Crítico"
            value={`${((player?.stats.critChanceBps ?? 500) / 100).toFixed(2)}%`}
          />
          <Stat
            label="Evasão"
            value={`${((player?.stats.evasionChanceBps ?? 300) / 100).toFixed(2)}%`}
          />
          <Stat label="Berries" value={String(player?.wallet.berries ?? 0)} />
          <Stat label="Rubis" value={String(player?.wallet.rubies ?? 0)} />
        </div>
      </div>
    );
  if (panel === "hunts") return <HuntCenter snapshot={snapshot} onIntent={onIntent} onClose={onClose} />;
  if (panel === "bot")
    return (
      <div className="settings-list">
        <button onClick={() => onIntent({ type: "toggleAutoHunt" })}>
          Auto-Hunt <b>{player?.autoHunt ?? "OFF"}</b>
        </button>
        {[
          "Prioridade de alvo",
          "Usar Skills",
          "Auto Loot",
          "Limite de poções",
        ].map((label) => (
          <button disabled key={label}>
            {label}
            <span>Em desenvolvimento</span>
          </button>
        ))}
      </div>
    );
  if (panel === "analysis")
    return (
      <div className="analysis-grid">
        <Stat label="Tempo de sessão" value="—" />
        <Stat label="Kills" value="—" />
        <Stat label="XP total" value={String(player?.totalXp ?? 0)} />
        <Stat label="Nível" value={String(player?.level ?? 1)} />
        <Stat label="Berries" value={String(player?.wallet.berries ?? 0)} />
        <Stat label="Itens" value={String(player?.inventory.length ?? 0)} />
      </div>
    );
  if (panel === "catalog") return <CatalogPanel snapshot={snapshot} />;
  if (panel === "world")
    return (
      <div className="world-list">
        <Map />
        <p>
          Floresta da Alvida <b>Atual</b>
        </p>
        <p>
          Barco Pirata <span>Safe zone</span>
        </p>
      </div>
    );
  if (panel === "search") return <InventoryPanel searchOnly />;
  if (panel === "settings")
    return (
      <div className="settings-list">
        <label>
          Escala da UI{" "}
          <select
            value={Math.round(uiScale * 100)}
            onChange={(event) => setUiScale(Number(event.target.value) / 100)}
          >
            <option value="80">80</option>
            <option value="90">90</option>
            <option value="100">100</option>
            <option value="110">110</option>
            <option value="120">120</option>
          </select>
          %
        </label>
        <button disabled>
          Volume <span>Sem áudio</span>
        </button>
        <button disabled>
          Tela cheia <span>Em desenvolvimento</span>
        </button>
      </div>
    );
  return (
    <div className="placeholder">
      <PackageOpen size={36} />
      <p>Em desenvolvimento.</p>
    </div>
  );
}
function HuntPanel({
  playerLevel,
  current,
  onEnter,
}: {
  playerLevel: number;
  current: boolean;
  onEnter: (huntId: (typeof hunts)[number]["id"]) => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const visible = hunts.filter((hunt) =>
    `${hunt.displayName} ${hunt.mainEnemyId}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="hunts-panel">
      <div className="hunt-controls">
        <input
          autoFocus
          placeholder="Buscar Hunt ou inimigo..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="hunt-grid hunt-grid-six">
        {visible.map((hunt) => (
          <HuntCardV3
            key={hunt.id}
            hunt={hunt}
            playerLevel={playerLevel}
            current={current && hunt.mapId === "forest_alvida"}
            onEnter={() => onEnter(hunt.id)}
          />
        ))}
      </div>
      {!visible.length && (
        <p className="empty-note">Nenhuma Hunt encontrada.</p>
      )}
    </div>
  );
}
function HuntCardV3({
  hunt,
  playerLevel,
  current,
  onEnter,
}: {
  hunt: (typeof hunts)[number];
  playerLevel: number;
  current: boolean;
  onEnter: () => void;
}): JSX.Element {
  const buffalo = hunt.mainEnemyId === "enemy_buffalo";
  const portrait = buffalo
    ? `${root}enemies/buffalo/idle/down/idle_down_01.png`
    : `${root}Monsters/Alvida/Idle/Frente/1.png`;
  const name = buffalo ? "BUFFALO" : "ALVIDA";
  return (
    <article className="hunt-card-v3">
      <img src={portrait} alt={name} />
      <span>{current ? "HUNT ATUAL" : "DISPONÍVEL"}</span>
      <h3>{name}</h3>
      <p>{hunt.displayName}</p>
      <small>
        Lv. {hunt.recommendedLevelMin} — {hunt.recommendedLevelMax}
      </small>
      <div className="hunt-card-v3-loot">
        {hunt.lootTable.map((entry) => (
          <img
            key={entry.itemId}
            src={assets[entry.itemId]}
            alt={itemNames[entry.itemId]}
            title={itemNames[entry.itemId]}
          />
        ))}
        {hunt.specialDrops.map((drop) => (
          <img
            key={drop.fruitId}
            src={assets[drop.fruitId]}
            alt={fruitNames[drop.fruitId]}
            title={`${fruitNames[drop.fruitId]} · ${(drop.chanceBps / 100).toFixed(2)}%`}
          />
        ))}
      </div>
      <button
        disabled={playerLevel < hunt.recommendedLevelMin}
        onClick={onEnter}
      >
        {playerLevel < hunt.recommendedLevelMin
          ? `REQUER Lv. ${hunt.recommendedLevelMin}`
          : "ENTRAR NA HUNT"}
      </button>
    </article>
  );
}
function HuntCard({
  hunt,
  playerLevel,
  current,
  selected,
  onSelect,
  onEnter,
}: {
  hunt: (typeof hunts)[number];
  playerLevel: number;
  current: boolean;
  selected: boolean;
  onSelect: () => void;
  onEnter: () => void;
}): JSX.Element {
  const low = playerLevel < hunt.recommendedLevelMin;
  const high = playerLevel > hunt.recommendedLevelMax;
  const chance = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;
  return (
    <article
      className={`hunt-card-v2 ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <div className="hunt-front">
        <img src={`${root}Monsters/Alvida/Idle/Frente/1.png`} alt="Alvida" />
        <span className={current ? "current" : "available"}>
          {current ? "HUNT ATUAL" : "DISPONÍVEL"}
        </span>
        <h3>ALVIDA</h3>
        <p>{hunt.displayName}</p>
        <small>
          Lv. {hunt.recommendedLevelMin} — {hunt.recommendedLevelMax}
        </small>
        <b>●{Array.from({ length: 9 }, () => "○").join("")}</b>
      </div>
      <div className="hunt-details">
        <header>
          <div>
            <span className="eyebrow">INIMIGO PRINCIPAL</span>
            <h3>ALVIDA</h3>
          </div>
          <strong>1 / 10</strong>
        </header>
        <p>{hunt.description}</p>
        <div className="hunt-stats">
          <span>
            Recomendado{" "}
            <b>
              Lv. {hunt.recommendedLevelMin} — {hunt.recommendedLevelMax}
            </b>
          </span>
          <span>
            XP base <b>{hunt.xpBase}</b>
          </span>
          <span>
            Gold base <b>{hunt.goldBase}</b>
          </span>
          <span>
            Tipo <b>Enemy</b>
          </span>
        </div>
        <small className={low ? "level-low" : "level-ok"}>
          {low
            ? `Nível recomendado: ${hunt.recommendedLevelMin}.`
            : high
              ? "Você já supera o nível recomendado desta Hunt."
              : "Boa Hunt para o seu nível."}
        </small>
        <h4>LOOT</h4>
        <div className="hunt-loot">
          {hunt.lootTable.map((entry) => (
            <span
              title={`${itemNames[entry.itemId]} · Chance: ${chance(entry.chanceBps)}`}
              key={entry.itemId}
            >
              <img src={assets[entry.itemId]} alt="" />
              {itemNames[entry.itemId]} <b>{chance(entry.chanceBps)}</b>
            </span>
          ))}
          {hunt.specialDrops.map((drop) => (
            <span
              className="rare-loot"
              title={`${fruitNames[drop.fruitId]} · Chance: ${chance(drop.chanceBps)}`}
              key={drop.fruitId}
            >
              <img src={assets[drop.fruitId]} alt="" />
              {fruitNames[drop.fruitId]} <b>{chance(drop.chanceBps)}</b>
            </span>
          ))}
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onEnter();
          }}
        >
          {current ? "HUNT ATUAL" : "ENTRAR NA HUNT"}
        </button>
      </div>
    </article>
  );
}
function InventoryPanel({
  searchOnly = false,
}: {
  searchOnly?: boolean;
}): JSX.Element {
  const { snapshot } = useGameUi();
  const [query, setQuery] = useState("");
  const [locked, setLocked] = useState<Set<ItemId>>(() => new Set());
  const [selected, setSelected] = useState<Set<ItemId>>(() => new Set());
  const [menuId, setMenuId] = useState<ItemId | null>(null);
  const stacks = (snapshot?.player.inventory ?? []).filter((stack) =>
    itemNames[stack.itemId].toLowerCase().includes(query.toLowerCase()),
  );
  const sell = (ids: ItemId[]) =>
    window.dispatchEvent(
      new CustomEvent("game-intent", {
        detail: {
          type: "sellItems",
          itemIds: ids.filter((id) => !id.startsWith("fruit_")),
        },
      }),
    );
  const action = (
    id: ItemId,
    kind: "info" | "equip" | "unequip" | "sell" | "link" | "lock",
  ) => {
    const fruit = id.startsWith("fruit_") ? (id as FruitId) : null;
    if (kind === "info")
      window.alert(
        `${itemNames[id]}\nQuantidade: ${snapshot?.player.inventory.find((stack) => stack.itemId === id)?.quantity ?? 0}${fruit ? "\nAkuma no Mi equipável." : ""}`,
      );
    if (kind === "equip" && fruit)
      window.dispatchEvent(
        new CustomEvent("game-intent", {
          detail: { type: "equipFruit", fruitId: fruit },
        }),
      );
    if (kind === "unequip")
      window.dispatchEvent(
        new CustomEvent("game-intent", { detail: { type: "unequipFruit" } }),
      );
    if (kind === "sell") sell([id]);
    if (kind === "link") navigator.clipboard?.writeText(`[${itemNames[id]}]`);
    if (kind === "lock")
      setLocked((current) => {
        const next = new Set(current);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    setMenuId(null);
  };
  return (
    <div className="inventory-panel" onClick={() => setMenuId(null)}>
      <div className="inventory-controls">
        <input
          autoFocus
          placeholder="Pesquisar item..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {!searchOnly && (
        <div className="inventory-actions">
          <button
            onClick={() =>
              sell(
                stacks
                  .filter((stack) => !locked.has(stack.itemId))
                  .map((stack) => stack.itemId),
              )
            }
          >
            VENDER TUDO
          </button>
          <button
            onClick={() => sell([...selected].filter((id) => !locked.has(id)))}
          >
            VENDER SELECIONADO
          </button>
        </div>
      )}
      <p className="inventory-hint">Clique direito em um item para ações.</p>
      <div className="inventory-grid">
        {stacks.map((stack) => {
          const open = menuId === stack.itemId;
          const fruit = stack.itemId.startsWith("fruit_");
          return (
            <article
              key={stack.itemId}
              className={selected.has(stack.itemId) ? "selected-item" : ""}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenuId(stack.itemId);
              }}
            >
              <button
                className="item-select"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelected((current) => {
                    const next = new Set(current);
                    next.has(stack.itemId)
                      ? next.delete(stack.itemId)
                      : next.add(stack.itemId);
                    return next;
                  });
                }}
              >
                <img src={assets[stack.itemId]} alt={itemNames[stack.itemId]} />
              </button>
              <span>{itemNames[stack.itemId]}</span>
              <b>×{stack.quantity}</b>
              {open && (
                <div
                  className="item-context-menu"
                  onClick={(event) => event.stopPropagation()}
                >
                  <strong>{itemNames[stack.itemId]}</strong>
                  <button onClick={() => action(stack.itemId, "info")}>
                    Informações do item
                  </button>
                  {fruit &&
                    (snapshot?.player.activeFruitId === stack.itemId ? (
                      <button onClick={() => action(stack.itemId, "unequip")}>
                        Desequipar
                      </button>
                    ) : (
                      <button onClick={() => action(stack.itemId, "equip")}>
                        Equipar
                      </button>
                    ))}{" "}
                  {!fruit && (
                    <button onClick={() => action(stack.itemId, "sell")}>
                      Vender
                    </button>
                  )}
                  <button onClick={() => action(stack.itemId, "link")}>
                    Linkar no chat
                  </button>
                  <button onClick={() => action(stack.itemId, "lock")}>
                    {locked.has(stack.itemId) ? "Destrancar" : "Trancar"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!stacks.length && (
          <p className="empty-note">Nenhum item encontrado.</p>
        )}
      </div>
    </div>
  );
}
function MarketPanel({
  onIntent,
}: {
  onIntent: (intent: unknown) => void;
}): JSX.Element {
  const { snapshot } = useGameUi();
  const [tab, setTab] = useState<"browse" | "sell" | "mine">("browse");
  const [itemId, setItemId] = useState<ItemId>("item_gravel"),
    [quantity, setQuantity] = useState(1),
    [berries, setBerries] = useState(""),
    [rubies, setRubies] = useState(""),
    [offers, setOffers] = useState(true);
  const market = snapshot?.auction;
  const player = snapshot?.player;
  const submit = () =>
    onIntent({
      type: "createAuctionListing",
      itemId,
      quantity,
      berriesPrice: berries ? Number(berries) : undefined,
      rubiesPrice: rubies ? Number(rubies) : undefined,
      allowOffers: offers,
    });
  const listings =
    tab === "browse" ? (market?.listings ?? []) : (market?.myListings ?? []);
  const makeOffer = (listingId: string) => {
    const amount = Number(window.prompt("Valor da oferta (inteiro):", ""));
    if (!Number.isInteger(amount) || amount < 1) return;
    const currency = window.confirm("Confirmar em Rubis? Cancelar usa Berries.")
      ? "RUBIES"
      : "BERRIES";
    onIntent({ type: "createAuctionOffer", listingId, currency, amount });
  };
  return (
    <section className="market-panel">
      <header>
        <div>
          <span className="eyebrow">CARTEIRA</span>
          <b>
            <Coins size={15} /> {player?.wallet.berries ?? 0} Berries ·{" "}
            <Gem size={15} /> {player?.wallet.rubies ?? 0} Rubis
          </b>
        </div>
        <small>Taxa do Mercado: 10% · Anúncios expiram em 48h</small>
      </header>
      <div className="market-tabs">
        <button
          className={tab === "browse" ? "active" : ""}
          onClick={() => setTab("browse")}
        >
          ANÚNCIOS
        </button>
        <button
          className={tab === "sell" ? "active" : ""}
          onClick={() => setTab("sell")}
        >
          VENDER
        </button>
        <button
          className={tab === "mine" ? "active" : ""}
          onClick={() => setTab("mine")}
        >
          MEUS ANÚNCIOS
        </button>
      </div>
      {tab === "sell" ? (
        <div className="market-sell">
          <label>
            Item
            <select
              value={itemId}
              onChange={(event) => setItemId(event.target.value as ItemId)}
            >
              {(player?.inventory ?? [])
                .filter(
                  (stack) =>
                    itemDefinitions[stack.itemId].tradeable &&
                    stack.quantity > 0,
                )
                .map((stack) => (
                  <option key={stack.itemId} value={stack.itemId}>
                    {itemNames[stack.itemId]} ×{stack.quantity}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Quantidade
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <label>
            Preço em Berries
            <input
              type="number"
              min="1"
              value={berries}
              onChange={(event) => setBerries(event.target.value)}
            />
          </label>
          <label>
            Preço em Rubis
            <input
              type="number"
              min="1"
              value={rubies}
              onChange={(event) => setRubies(event.target.value)}
            />
          </label>
          <label className="market-check">
            <input
              type="checkbox"
              checked={offers}
              onChange={(event) => setOffers(event.target.checked)}
            />{" "}
            Aceitar ofertas
          </label>
          <button onClick={submit}>CRIAR ANÚNCIO</button>
        </div>
      ) : (
        <>
          <div className="market-list">
            {listings.map((listing) => (
              <article key={listing.id}>
                <img src={assets[listing.itemId]} alt="" />
                <div>
                  <b>
                    {itemNames[listing.itemId]} ×{listing.quantity}
                  </b>
                  <small>
                    {listing.berriesPrice
                      ? `${listing.berriesPrice} Berries`
                      : ""}
                    {listing.berriesPrice && listing.rubiesPrice ? " · " : ""}
                    {listing.rubiesPrice ? `${listing.rubiesPrice} Rubis` : ""}
                    {listing.allowOffers ? " · aceita ofertas" : ""}
                  </small>
                </div>
                {tab === "mine" ? (
                  <button
                    onClick={() =>
                      onIntent({
                        type: "cancelAuctionListing",
                        listingId: listing.id,
                      })
                    }
                    disabled={listing.status !== "ACTIVE"}
                  >
                    CANCELAR
                  </button>
                ) : (
                  <div className="market-actions">
                    {listing.berriesPrice && (
                      <button
                        onClick={() =>
                          onIntent({
                            type: "buyAuctionListing",
                            listingId: listing.id,
                            currency: "BERRIES",
                          })
                        }
                      >
                        COMPRAR BERRIES
                      </button>
                    )}
                    {listing.rubiesPrice && (
                      <button
                        onClick={() =>
                          onIntent({
                            type: "buyAuctionListing",
                            listingId: listing.id,
                            currency: "RUBIES",
                          })
                        }
                      >
                        COMPRAR RUBIS
                      </button>
                    )}
                    {listing.allowOffers && (
                      <button onClick={() => makeOffer(listing.id)}>
                        OFERTAR
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
            {!listings.length && (
              <p className="empty-note">Nenhum anúncio nesta aba.</p>
            )}
          </div>
          {tab === "mine" && Boolean(market?.receivedOffers.length) && (
            <div className="market-list">
              <span className="eyebrow">OFERTAS RECEBIDAS</span>
              {market!.receivedOffers
                .filter((offer) => offer.status === "ACTIVE")
                .map((offer) => (
                  <article key={offer.id}>
                    <div>
                      <b>
                        {offer.amount}{" "}
                        {offer.currency === "BERRIES" ? "Berries" : "Rubis"}
                      </b>
                      <small>Oferta em escrow</small>
                    </div>
                    <div className="market-actions">
                      <button
                        onClick={() =>
                          onIntent({
                            type: "acceptAuctionOffer",
                            listingId: offer.listingId,
                            offerId: offer.id,
                          })
                        }
                      >
                        ACEITAR
                      </button>
                      <button
                        onClick={() =>
                          onIntent({
                            type: "rejectAuctionOffer",
                            listingId: offer.listingId,
                            offerId: offer.id,
                          })
                        }
                      >
                        RECUSAR
                      </button>
                    </div>
                  </article>
                ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
function ShopPanel({
  onIntent,
}: {
  onIntent: (intent: unknown) => void;
}): JSX.Element {
  const { snapshot } = useGameUi();
  const goods = shopDefinitions[0].itemIds.map((id) => ({
    id,
    price: itemDefinitions[id].buyValue ?? 0,
    description:
      id === "item_potion_small"
        ? "Recupera vida em combate."
        : "Recuperação reforçada para a jornada.",
  }));
  return (
    <section className="shop-panel">
      <header>
        <span className="eyebrow">ARMAZÉM DO CAPITÃO</span>
        <b>
          <Coins size={15} /> {snapshot?.player.wallet.berries ?? 0} Berries
        </b>
      </header>
      <div className="shop-grid">
        {goods.map((good) => (
          <article key={good.id}>
            <img src={assets[good.id]} alt="" />
            <div>
              <h3>{itemNames[good.id]}</h3>
              <p>{good.description}</p>
              <small>{good.price} Berries</small>
            </div>
            <button
              onClick={() => onIntent({ type: "buyItem", itemId: good.id })}
            >
              COMPRAR
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
function UtilityBar({
  onIntent,
}: {
  onIntent: (intent: unknown) => void;
}): JSX.Element {
  const { snapshot } = useGameUi();
  const [picker, setPicker] = useState<0 | 1 | null>(null);
  const [pending, setPending] = useState<ItemId | null>(null);
  const [dragging, setDragging] = useState<ItemId | null>(null);
  const slots = snapshot?.player.utilitySlots ?? [null, null];
  useEffect(() => {
    if (picker !== null && pending && slots[picker] === pending) {
      setPicker(null);
      setPending(null);
    }
  }, [picker, pending, slots]);
  useEffect(() => {
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setPicker(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const compatible = (snapshot?.player.inventory ?? []).filter(
    (stack) =>
      itemDefinitions[stack.itemId].usable &&
      itemDefinitions[stack.itemId].consumable &&
      stack.quantity > 0,
  );
  const set = (slot: 0 | 1, id: ItemId) => {
    setPending(id);
    onIntent({ type: "setUtilitySlot", slot, itemId: id });
  };
  return (
    <section
      className="utility-bar ui-panel"
      onDragOver={(event) => event.preventDefault()}
    >
      <span>UTILIDADES</span>
      <div>
        {slots.map((id, index) => {
          const slot = index as 0 | 1,
            quantity = id
              ? (snapshot?.player.inventory.find((stack) => stack.itemId === id)
                  ?.quantity ?? 0)
              : 0;
          return (
            <button
              key={index}
              className={`utility-slot ${!id || !quantity ? "empty" : ""} ${dragging ? "drop-ready" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const itemId = event.dataTransfer.getData(
                  "application/x-onepiece-item",
                ) as ItemId;
                if (itemDefinitions[itemId]?.usable) set(slot, itemId);
                setDragging(null);
              }}
              onClick={() =>
                id && quantity
                  ? onIntent({ type: "useItem", itemId: id })
                  : setPicker(slot)
              }
              onContextMenu={(event) => {
                event.preventDefault();
                if (id) setPicker(slot);
              }}
              title={
                id
                  ? `${itemDefinitions[id].displayName} · Quantidade: ${quantity} · Atalho: ${index + 5}`
                  : "Clique para adicionar"
              }
            >
              {id ? <img src={assets[id]} alt="" /> : "+"}
              <b>{index + 5}</b>
              <small>×{quantity}</small>
            </button>
          );
        })}
      </div>
      {picker !== null && (
        <div className="utility-picker">
          <b>ESCOLHER UTILIDADE</b>
          {compatible.map((stack) => (
            <button
              disabled={slots[1 - picker] === stack.itemId || pending !== null}
              key={stack.itemId}
              onClick={() => set(picker, stack.itemId)}
            >
              <img src={assets[stack.itemId]} alt="" />
              {itemNames[stack.itemId]} ×{stack.quantity}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
