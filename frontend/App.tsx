import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Company = {
  name: string;
  cash: number;
  revenue: number;
  costs: number;
};

type Agent = {
  id: string;
  name: string;
  role: string;
  skills: Record<CompetencyKey, number>;
  productivity: number;
  salary: number;
  autonomy: string;
  traits: string[];
  motivation: number;
  stability: number;
};

type CompetencyKey = "technical" | "creativity" | "communication" | "organisation" | "autonomy";

type BusinessResults = {
  revenue: number;
  costs: number;
  net: number;
  clients: number;
  errors: number;
  innovations: number;
};

type AgentInsight = {
  agent_id: string;
  name: string;
  motivation: number;
  stability: number;
  productivity: number;
  note?: string | null;
};

type DayReport = {
  day: number;
  agent_situation: AgentInsight[];
  results: BusinessResults;
  decisions_impact: string[];
  recommendations: string[];
  energy_total: number;
  energy_used: number;
};

type GameState = {
  game_id: string;
  day: number;
  company: Company;
  agents: Agent[];
  last_report?: DayReport | null;
  energy_total: number;
};

type StartResponse = {
  state: GameState;
};

type ManagerAction = {
  agent_id: string;
  action: "assign_tasks" | "train" | "promote" | "fire" | "support";
  focus?: string | null;
};

type ActionResponse = {
  state: GameState;
  report: DayReport;
};

type RecruitResponse = { state: GameState };
type BuyEnergyResponse = { state: GameState };

type SectorId = "product" | "marketing" | "service" | "rnd";

type SectorDefinition = {
  id: SectorId;
  title: string;
  description: string;
  metrics: string[];
};

type SectorAgentBuckets = Record<SectorId, Agent[]> & { unassigned: Agent[] };

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8055";

const terminalFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });
const GAME_DURATION_MS = 60 * 60 * 1000;
const INITIAL_DISPLAY_CASH = 10;

const SECTORS: SectorDefinition[] = [
  {
    id: "product",
    title: "Développement Produit",
    description: "Les agents dev et améliorent le produit.",
    metrics: ["Qualité du produit", "Vitesse de développement", "Stabilité"],
  },
  {
    id: "marketing",
    title: "Marketing",
    description: "Visibilité, contenu et image de marque.",
    metrics: ["Visibilité", "Attractivité de la marque", "Concurrence"],
  },
  {
    id: "service",
    title: "Service Client",
    description: "S'occupe des retours et feedbacks.",
    metrics: ["Satisfaction client", "Rapidité de résolution", "Confiance utilisateur"],
  },
  {
    id: "rnd",
    title: "Recherche & Dev",
    description: "Crée les futurs agents et technos.",
    metrics: ["Niveau d'innovation", "Efficacité des recherches", "Avantage technologique"],
  },
];

const COMPETENCIES: { key: CompetencyKey; label: string }[] = [
  { key: "technical", label: "Compétence Technique" },
  { key: "creativity", label: "Créativité" },
  { key: "communication", label: "Communication" },
  { key: "organisation", label: "Organisation" },
  { key: "autonomy", label: "Autonomie" },
];

const DEFAULT_COMPETENCIES: Record<CompetencyKey, number> = {
  technical: 1,
  creativity: 1,
  communication: 1,
  organisation: 1,
  autonomy: 1,
};
const ENERGY_PER_AGENT = 40;

async function startGame(companyName: string): Promise<StartResponse> {
  const res = await fetch(`${API_BASE_URL}/game/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_name: companyName }),
  });

  if (!res.ok) {
    throw new Error(`Impossible de créer la partie (${res.status})`);
  }
  return res.json();
}

async function playDay(gameId: string, actions: ManagerAction[]): Promise<ActionResponse> {
  const res = await fetch(`${API_BASE_URL}/game/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: gameId, actions }),
  });

  if (!res.ok) {
    throw new Error(`Action refusée (${res.status})`);
  }
  return res.json();
}

async function recruitAgent(gameId: string): Promise<RecruitResponse> {
  const res = await fetch(`${API_BASE_URL}/game/recruit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: gameId }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Recrutement refusé (${res.status})`);
  }
  return res.json();
}

async function buyEnergy(gameId: string): Promise<BuyEnergyResponse> {
  const res = await fetch(`${API_BASE_URL}/game/energy/buy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: gameId }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Achat énergie refusé (${res.status})`);
  }
  return res.json();
}

function formatCurrency(amount: number): string {
  return `${amount.toFixed(0)} €`;
}

function formatTimer(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function AgentStatsCard({ agent }: { agent: Agent }) {
  const stats = { ...DEFAULT_COMPETENCIES, ...(agent.skills ?? {}) };
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{agent.name}</Text>
        <Text style={styles.badge}>{agent.role}</Text>
      </View>
      {COMPETENCIES.map((stat) => {
        const value = stats[stat.key];
        return (
          <View key={stat.key} style={styles.statRow}>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <View style={styles.statBarTrack}>
              <View style={[styles.statBarFill, { width: `${(value / 10) * 100}%` }]} />
            </View>
            <Text style={styles.statValue}>{value}</Text>
          </View>
        );
      })}
    </View>
  );
}

function EnergyGrid({ total, used }: { total: number; used: number }) {
  const cells = 500; // 50 x 10
  const energyPerCell = 10;
  const boughtCells = Math.floor(total / energyPerCell);
  const usedCells = Math.floor(used / energyPerCell);
  return (
    <View style={styles.energyGrid}>
      {Array.from({ length: cells }).map((_, idx) => {
        let cellStyle = styles.energyCellEmpty;
        if (idx < boughtCells) {
          cellStyle = idx < usedCells ? styles.energyCellUsed : styles.energyCellOwned;
        }
        return <View key={idx} style={[styles.energyCell, cellStyle]} />;
      })}
    </View>
  );
}

function SelectableAgentChip({
  agent,
  selected,
  onPress,
}: {
  agent: Agent;
  selected: boolean;
  onPress: (agent: Agent) => void;
}) {
  return (
    <TouchableOpacity
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation?.();
        onPress(agent);
      }}
      activeOpacity={0.8}
      style={[styles.agentChip, selected && styles.agentChipSelected]}
    >
      <Text style={[styles.agentChipName, selected && styles.agentChipNameSelected]}>{agent.name}</Text>
      <Text style={[styles.agentChipRole, selected && styles.agentChipRoleSelected]}>{agent.role}</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const [companyName, setCompanyName] = useState("Nova Corp");
  const [state, setState] = useState<GameState | null>(null);
  const [report, setReport] = useState<DayReport | null>(null);
  const [pendingActions, setPendingActions] = useState<ManagerAction[]>([]);
  const [activeTab, setActiveTab] = useState<"game" | "summary" | "agents" | "finance" | "report" | "sectors" | "energy">("game");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, SectorId | null>>({});
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(GAME_DURATION_MS);
  const [displayCash, setDisplayCash] = useState<number>(INITIAL_DISPLAY_CASH);

  const summary = useMemo(() => {
    const baseReport = report ?? state?.last_report;
    return baseReport?.results;
  }, [report, state]);

  useEffect(() => {
    if (!state?.company) {
      setDisplayCash(INITIAL_DISPLAY_CASH);
      return;
    }
    setDisplayCash(state.company.cash);
  }, [state?.company]);

  const energyTotals = useMemo(() => {
    const total = state?.energy_total ?? 0;
    const used = state?.last_report?.energy_used ?? Math.min((state?.agents.length ?? 0) * ENERGY_PER_AGENT, total);
    return { total, used };
  }, [state]);

  useEffect(() => {
    if (!timerStart) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - timerStart;
      const remaining = Math.max(0, GAME_DURATION_MS - elapsed);
      setRemainingMs(remaining);
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [timerStart]);

  useEffect(() => {
    if (!state?.agents) {
      setAssignments({});
      return;
    }
    setAssignments((current) => {
      const next: Record<string, SectorId | null> = {};
      state.agents.forEach((agent) => {
        next[agent.id] = current[agent.id] ?? null;
      });
      return next;
    });
  }, [state?.agents]);

  const agentsBySector = useMemo<SectorAgentBuckets>(() => {
    const buckets: SectorAgentBuckets = {
      product: [],
      marketing: [],
      service: [],
      rnd: [],
      unassigned: [],
    };

    if (!state?.agents) {
      return buckets;
    }

    state.agents.forEach((agent) => {
      const target = assignments[agent.id];
      if (target) {
        buckets[target].push(agent);
      } else {
        buckets.unassigned.push(agent);
      }
    });

    return buckets;
  }, [assignments, state?.agents]);

  useEffect(() => {
    if (!state?.agents) {
      setSelectedAgentId(null);
      return;
    }
    if (selectedAgentId && !state.agents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(null);
    }
  }, [selectedAgentId, state?.agents]);

  const handleSelectAgent = useCallback((agent: Agent) => {
    setSelectedAgentId((current) => (current === agent.id ? null : agent.id));
  }, []);

  const assignSelectedAgent = useCallback(
    (target: SectorId | null) => {
      if (!selectedAgentId || !state?.agents?.some((agent) => agent.id === selectedAgentId)) {
        return;
      }
      setAssignments((current) => ({ ...current, [selectedAgentId]: target }));
      setSelectedAgentId(null);
    },
    [selectedAgentId, state?.agents]
  );

  const handleAssignToSector = useCallback(
    (sectorId: SectorId) => {
      assignSelectedAgent(sectorId);
    },
    [assignSelectedAgent]
  );

  const handleClearAssignment = useCallback(() => {
    assignSelectedAgent(null);
  }, [assignSelectedAgent]);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const created = await startGame(companyName.trim());
      setState(created.state);
      setReport(created.state.last_report ?? null);
      setPendingActions([]);
      setTimerStart(Date.now());
      setRemainingMs(GAME_DURATION_MS);
      setDisplayCash(INITIAL_DISPLAY_CASH);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunDay = async () => {
    if (!state) return;
    setLoading(true);
    setError(null);
    try {
      const res = await playDay(state.game_id, pendingActions);
      setState(res.state);
      setReport(res.report);
      setPendingActions([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecruit = async () => {
    if (!state) return;
    setLoading(true);
    setError(null);
    try {
      const res = await recruitAgent(state.game_id);
      setState(res.state);
      setReport(res.state.last_report ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyEnergy = async () => {
    if (!state) return;
    setLoading(true);
    setError(null);
    try {
      const res = await buyEnergy(state.game_id);
      setState(res.state);
      setReport(res.state.last_report ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const hasGame = Boolean(state);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>B$</Text>
              {hasGame && state ? (
                <View style={styles.tabBar}>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === "game" && styles.tabButtonActive]}
                    onPress={() => setActiveTab("game")}
                  >
                    <Text style={[styles.tabButtonText, activeTab === "game" && styles.tabButtonTextActive]}>
                      Partie
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === "summary" && styles.tabButtonActive]}
                    onPress={() => setActiveTab("summary")}
                  >
                    <Text style={[styles.tabButtonText, activeTab === "summary" && styles.tabButtonTextActive]}>
                      Synthèse
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === "agents" && styles.tabButtonActive]}
                    onPress={() => setActiveTab("agents")}
                  >
                    <Text style={[styles.tabButtonText, activeTab === "agents" && styles.tabButtonTextActive]}>
                      Effectifs
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === "sectors" && styles.tabButtonActive]}
                    onPress={() => setActiveTab("sectors")}
                  >
                    <Text style={[styles.tabButtonText, activeTab === "sectors" && styles.tabButtonTextActive]}>
                      Secteurs
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === "energy" && styles.tabButtonActive]}
                    onPress={() => setActiveTab("energy")}
                  >
                    <Text style={[styles.tabButtonText, activeTab === "energy" && styles.tabButtonTextActive]}>
                      Energie
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === "finance" && styles.tabButtonActive]}
                    onPress={() => setActiveTab("finance")}
                  >
                    <Text style={[styles.tabButtonText, activeTab === "finance" && styles.tabButtonTextActive]}>
                      Finance
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabButton, activeTab === "report" && styles.tabButtonActive]}
                    onPress={() => setActiveTab("report")}
                  >
                    <Text style={[styles.tabButtonText, activeTab === "report" && styles.tabButtonTextActive]}>
                      Rapport
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
            {hasGame && state ? (
              <View style={styles.headerRight}>
                <View style={styles.cashBox}>
                  <Text style={styles.metricLabelSmall}>Cash</Text>
                  <Text style={styles.cashValue}>{formatCurrency(displayCash)}</Text>
                </View>
                <View style={styles.timerBox}>
                  <Text style={styles.timerValue}>{formatTimer(remainingMs)}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {activeTab === "game" && (
          <View style={styles.topRow}>
            <View style={styles.topColumn}>
              <View style={styles.card}>
                <Text style={styles.label}>Nom de l'entreprise</Text>
                <TextInput
                  value={companyName}
                  onChangeText={setCompanyName}
                  style={styles.input}
                  placeholder="Ex: Nova Ops"
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleStart}
                  disabled={loading || companyName.trim().length === 0}
                >
                  <Text style={styles.primaryText}>{hasGame ? "Relancer une partie" : "Démarrer"}</Text>
                </TouchableOpacity>
                {error ? <Text style={styles.error}>{error}</Text> : null}
              </View>
            </View>
          </View>
        )}

        {hasGame && state ? (
          <View style={styles.tabContent}>
            {activeTab === "summary" && (
              <View style={styles.block}>
                <Text style={styles.sectionTitle}>Actions en attente ({pendingActions.length})</Text>
                <View style={styles.card}>
                  {pendingActions.length === 0 ? (
                    <Text style={styles.meta}>Choisis des actions pour tes agents.</Text>
                  ) : (
                    pendingActions.map((action, idx) => (
                      <Text key={`${action.agent_id}-${idx}`} style={styles.meta}>
                        • {action.action} ({action.focus ?? "n/a"})
                      </Text>
                    ))
                  )}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.primaryButton} onPress={handleRunDay} disabled={loading}>
                      <Text style={styles.primaryText}>Passer au jour suivant</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => setPendingActions([])}
                      disabled={loading}
                    >
                      <Text style={styles.secondaryText}>Vider</Text>
                    </TouchableOpacity>
                  </View>
                  {loading ? <ActivityIndicator color={palette.text} style={{ marginTop: 8 }} /> : null}
                </View>
              </View>
            )}

              {activeTab === "agents" && (
                <View style={styles.block}>
                  <View style={styles.sectionRow}>
                    <Text style={styles.sectionTitle}>Effectifs</Text>
                    <TouchableOpacity style={styles.primaryButton} onPress={handleRecruit} disabled={loading || !state}>
                      <Text style={styles.primaryText}>Recruter</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.agentsGrid}>
                    {state.agents.map((agent) => (
                      <View key={agent.id} style={styles.agentItem}>
                        <AgentStatsCard agent={agent} />
                      </View>
                    ))}
                  </View>
                </View>
              )}

            {activeTab === "sectors" && (
              <View style={[styles.block, styles.sectorsBlock]}>
                <Text style={styles.sectionTitle}>Secteurs</Text>
                <View style={styles.sectorContainer}>
                  <View style={styles.sectorGridWrapper}>
                    <View style={styles.sectorGrid}>
                      {SECTORS.map((sector) => {
                        const assignedAgents = agentsBySector[sector.id];
                        return (
                          <Pressable
                            key={sector.id}
                            style={[styles.sectorTile, selectedAgentId && styles.sectorTileActive]}
                            onPress={() => handleAssignToSector(sector.id)}
                          >
                            <View style={styles.sectorHeaderRow}>
                              <Text style={styles.sectorTitle}>{sector.title}</Text>
                              <Text style={styles.sectorHint}>{assignedAgents.length} affecté(s)</Text>
                            </View>
                            <ScrollView
                              style={styles.agentScroll}
                              contentContainerStyle={styles.agentChipsContent}
                              showsVerticalScrollIndicator={false}
                            >
                              {assignedAgents.length === 0 ? (
                                <Text style={styles.meta}>Aucun agent ici.</Text>
                              ) : (
                                assignedAgents.map((agent) => (
                                  <SelectableAgentChip
                                    key={agent.id}
                                    agent={agent}
                                    selected={selectedAgentId === agent.id}
                                    onPress={handleSelectAgent}
                                  />
                                ))
                              )}
                            </ScrollView>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <Pressable style={styles.unassignedBar} onPress={handleClearAssignment}>
                    <View style={styles.sectorHeaderRow}>
                      <Text style={styles.sectionTitleSmall}>Non assignés</Text>
                      <Text style={styles.sectorHint}>
                        {selectedAgentId ? "Appuie ici pour libérer l'agent sélectionné." : "Aucun agent sélectionné."}
                      </Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.agentChipsRow}
                    >
                      {agentsBySector.unassigned.length === 0 ? (
                        <Text style={styles.meta}>Tous les agents sont affectés.</Text>
                      ) : (
                        agentsBySector.unassigned.map((agent) => (
                          <SelectableAgentChip
                            key={agent.id}
                            agent={agent}
                            selected={selectedAgentId === agent.id}
                            onPress={handleSelectAgent}
                          />
                        ))
                      )}
                    </ScrollView>
                  </Pressable>
                </View>
              </View>
            )}

            {activeTab === "finance" && (
              <View style={styles.block}>
                <Text style={styles.sectionTitle}>Finance</Text>
                {summary ? (
                  <View style={styles.card}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryText}>Jour {state.day}</Text>
                      <Text style={styles.summaryText}>{state.company.name}</Text>
                    </View>
                    <View style={styles.metricsRow}>
                      <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Cash</Text>
                        <Text style={styles.metricValue}>{formatCurrency(state.company.cash)}</Text>
                      </View>
                      <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Revenu</Text>
                        <Text style={styles.metricValue}>{formatCurrency(summary.revenue)}</Text>
                      </View>
                      <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Coûts</Text>
                        <Text style={styles.metricValue}>{formatCurrency(summary.costs)}</Text>
                      </View>
                    </View>
                    <Text style={styles.meta}>Résultat net: {formatCurrency(summary.net)}</Text>
                    <Text style={styles.sectionTitleSmall}>Indicateurs opérationnels</Text>
                    <Text style={styles.meta}>Clients: {summary.clients}</Text>
                    <Text style={styles.meta}>Innovations: {summary.innovations}</Text>
                    <Text style={styles.meta}>Incidents: {summary.errors}</Text>
                  </View>
                ) : (
                  <Text style={styles.meta}>Les chiffres financiers apparaîtront après le premier jour.</Text>
                )}
              </View>
            )}

            {activeTab === "energy" && (
              <View style={styles.block}>
                <Text style={styles.sectionTitle}>Energie</Text>
                <View style={styles.card}>
                  <Text style={styles.meta}>
                    Energie: {Math.max(0, energyTotals.total - energyTotals.used).toFixed(0)} / {energyTotals.total.toFixed(0)} (max 5000)
                  </Text>
                  <EnergyGrid total={energyTotals.total} used={energyTotals.used} />
                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.primaryButton} onPress={handleRecruit} disabled={loading || !state}>
                      <Text style={styles.primaryText}>Recruter (40 énergie)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryButton} onPress={handleBuyEnergy} disabled={loading || !state}>
                      <Text style={styles.secondaryText}>Acheter +100 énergie (1000€)</Text>
                    </TouchableOpacity>
                  </View>
                  {loading ? <ActivityIndicator color={palette.text} style={{ marginTop: 8 }} /> : null}
                </View>
              </View>
            )}

            {activeTab === "report" && (
              <View style={styles.block}>
                <Text style={styles.sectionTitle}>Rapport du jour</Text>
                {report ? (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>État du jour {report.day}</Text>
                    <Text style={styles.meta}>Résultats: {formatCurrency(report.results.net)} net</Text>
                    <Text style={styles.sectionTitleSmall}>Situation des agents</Text>
                    {report.agent_situation.map((agent) => (
                      <Text key={agent.agent_id} style={styles.meta}>
                        • {agent.name}: mot {agent.motivation.toFixed(0)} | stab {agent.stability.toFixed(0)} | prod{" "}
                        {agent.productivity}
                      </Text>
                    ))}
                    <Text style={styles.sectionTitleSmall}>Impact des décisions</Text>
                    {report.decisions_impact.map((item, idx) => (
                      <Text key={`${item}-${idx}`} style={styles.meta}>
                        • {item}
                      </Text>
                    ))}
                    <Text style={styles.sectionTitleSmall}>Recommandations</Text>
                    {report.recommendations.map((item, idx) => (
                      <Text key={`${item}-${idx}`} style={styles.meta}>
                        • {item}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.meta}>Le rapport sera disponible après le premier jour.</Text>
                )}
              </View>
            )}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const palette = {
  background: "#ffffff",
  card: "#ffffff",
  accent: "#000000",
  text: "#000000",
  muted: "#1f1f1f",
  border: "#000000",
  danger: "#b00000",
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 12,
    backgroundColor: palette.background,
  },
  header: {
    marginTop: 8,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderColor: palette.border,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: palette.text,
    fontFamily: terminalFont,
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cashBox: {
    borderWidth: 2,
    borderColor: palette.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 100,
  },
  metricLabelSmall: {
    fontSize: 11,
    color: palette.muted,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  cashValue: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.text,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  timerBox: {
    borderWidth: 2,
    borderColor: palette.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 140,
    alignItems: "center",
    backgroundColor: palette.card,
  },
  timerValue: {
    fontSize: 32,
    fontWeight: "700",
    color: palette.text,
    fontFamily: terminalFont,
    letterSpacing: 1,
  },
  subtitle: {
    color: palette.muted,
    marginTop: 4,
    marginBottom: 12,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  topRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
    flexWrap: "wrap",
  },
  topColumn: {
    flex: 1,
    minWidth: 280,
  },
  block: {
    gap: 12,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 4,
    padding: 12,
    marginVertical: 8,
    borderWidth: 2,
    borderColor: palette.border,
    shadowColor: palette.accent,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 0,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  badge: {
    backgroundColor: palette.accent,
    color: palette.card,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    fontWeight: "700",
    borderWidth: 2,
    borderColor: palette.border,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  meta: {
    color: palette.muted,
    marginVertical: 2,
    fontFamily: terminalFont,
    letterSpacing: 0.25,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  actionButton: {
    backgroundColor: palette.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: palette.border,
  },
  actionButtonSecondary: {
    backgroundColor: palette.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: palette.border,
  },
  actionText: {
    color: "#ffffff",
    fontWeight: "700",
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  actionTextSecondary: {
    color: palette.accent,
  },
  label: {
    color: palette.text,
    marginBottom: 6,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: palette.card,
    color: palette.text,
    padding: 12,
    borderRadius: 4,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: palette.border,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    padding: 12,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 2,
    borderColor: palette.border,
  },
  primaryText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  secondaryButton: {
    padding: 10,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: palette.border,
    backgroundColor: palette.card,
  },
  secondaryText: {
    color: palette.text,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  error: {
    color: palette.danger,
    marginTop: 8,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  summaryText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: palette.card,
    padding: 10,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: palette.border,
  },
  metricLabel: {
    color: palette.muted,
    marginBottom: 4,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  metricValue: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 10,
    fontFamily: terminalFont,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sectionTitleSmall: {
    color: palette.text,
    fontWeight: "700",
    marginTop: 8,
    fontFamily: terminalFont,
    letterSpacing: 0.75,
    textTransform: "uppercase",
  },
  tabBar: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: palette.card,
    borderRadius: 4,
    padding: 6,
    marginTop: 0,
    borderWidth: 2,
    borderColor: palette.border,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  tabButtonActive: {
    backgroundColor: palette.accent,
    borderWidth: 2,
    borderColor: palette.border,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.text,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  tabButtonTextActive: {
    color: palette.card,
  },
  tabContent: {
    flex: 1,
    marginTop: 12,
  },
  agentsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  agentItem: {
    flexBasis: "48%",
    minWidth: 260,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  sectorsBlock: {
    flex: 1,
  },
  sectorContainer: {
    marginTop: 8,
    gap: 12,
    flex: 1,
  },
  sectorGridWrapper: {
    flex: 1,
    marginBottom: 22,
  },
  unassignedBar: {
    borderWidth: 2,
    borderColor: palette.border,
    borderRadius: 6,
    padding: 12,
    backgroundColor: palette.card,
    minHeight: 100,
    justifyContent: "space-between",
  },
  sectorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    flex: 1,
    justifyContent: "space-between",
    alignContent: "space-between",
  },
  sectorTile: {
    flexBasis: "48%",
    flexGrow: 1,
    minWidth: 260,
    minHeight: 180,
    borderWidth: 2,
    borderColor: palette.border,
    borderRadius: 6,
    padding: 10,
    backgroundColor: palette.card,
  },
  sectorTileActive: {
    borderColor: palette.accent,
  },
  sectorHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  sectorTitle: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 16,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  sectorHint: {
    color: palette.text,
    fontSize: 12,
    opacity: 0.7,
    fontFamily: terminalFont,
    letterSpacing: 0.25,
    textAlign: "right",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 4,
  },
  statLabel: {
    flex: 1,
    fontSize: 12,
    color: palette.muted,
    fontFamily: terminalFont,
    letterSpacing: 0.25,
  },
  statBarTrack: {
    flex: 2,
    height: 10,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
  },
  statBarFill: {
    height: "100%",
    backgroundColor: palette.accent,
  },
  statValue: {
    width: 28,
    textAlign: "right",
    fontWeight: "700",
    color: palette.text,
    fontFamily: terminalFont,
  },
  agentScroll: {
    marginTop: 6,
  },
  agentChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  agentChipsContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  agentChip: {
    borderWidth: 2,
    borderColor: palette.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: palette.background,
  },
  agentChipSelected: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  agentChipName: {
    color: palette.text,
    fontFamily: terminalFont,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  agentChipNameSelected: {
    color: palette.card,
  },
  agentChipRole: {
    color: palette.muted,
    fontSize: 11,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
  },
  agentChipRoleSelected: {
    color: palette.card,
  },
  energyGrid: {
    marginTop: 10,
    borderWidth: 2,
    borderColor: palette.border,
    borderRadius: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    padding: 6,
    backgroundColor: palette.card,
  },
  energyCell: {
    width: 18,
    height: 18,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: palette.border,
  },
  energyCellEmpty: {
    backgroundColor: "#ffffff",
    opacity: 0.25,
  },
  energyCellOwned: {
    backgroundColor: "#ffffff",
  },
  energyCellUsed: {
    backgroundColor: "#000000",
  },
});
