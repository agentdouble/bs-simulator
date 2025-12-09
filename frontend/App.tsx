import { StatusBar } from "expo-status-bar";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

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
  skills: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  productivity: number;
  salary: number;
  autonomy: string;
  traits: string[];
  motivation: number;
  stability: number;
};

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
};

type GameState = {
  game_id: string;
  day: number;
  company: Company;
  agents: Agent[];
  last_report?: DayReport | null;
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

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

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

function formatCurrency(amount: number): string {
  return `${amount.toFixed(0)} €`;
}

function bestSkill(agent: Agent): string {
  const entries = Object.entries(agent.skills);
  if (!entries.length) return "production";
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function AgentCard({ agent, onTrain, onSupport }: { agent: Agent; onTrain: () => void; onSupport: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{agent.name}</Text>
        <Text style={styles.badge}>{agent.role}</Text>
      </View>
      <Text style={styles.meta}>Productivité: {agent.productivity}</Text>
      <Text style={styles.meta}>Motivation: {agent.motivation.toFixed(0)} | Stabilité: {agent.stability.toFixed(0)}</Text>
      <Text style={styles.meta}>Autonomie: {agent.autonomy} | Salaire: {formatCurrency(agent.salary)}</Text>
      <Text style={styles.meta}>Traits: {agent.traits.slice(0, 3).join(", ")}</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionButton} onPress={onTrain}>
          <Text style={styles.actionText}>Former</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButtonSecondary} onPress={onSupport}>
          <Text style={[styles.actionText, styles.actionTextSecondary]}>Supporter</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function App() {
  const [companyName, setCompanyName] = useState("Nova Corp");
  const [state, setState] = useState<GameState | null>(null);
  const [report, setReport] = useState<DayReport | null>(null);
  const [pendingActions, setPendingActions] = useState<ManagerAction[]>([]);
  const [activeTab, setActiveTab] = useState<"game" | "summary" | "agents" | "finance" | "report">("game");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const baseReport = report ?? state?.last_report;
    return baseReport?.results;
  }, [report, state]);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const created = await startGame(companyName.trim());
      setState(created.state);
      setReport(created.state.last_report ?? null);
      setPendingActions([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleTrain = (agent: Agent) => {
    const focus = bestSkill(agent);
    setPendingActions((current) => [...current, { agent_id: agent.id, action: "train", focus }]);
  };

  const handleSupport = (agent: Agent) => {
    setPendingActions((current) => [...current, { agent_id: agent.id, action: "support" }]);
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

  const hasGame = Boolean(state);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
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
                      Agents
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
              <Text style={styles.headerCash}>
                Cash: {formatCurrency(state.company.cash)} · Employés: {state.agents.length}
              </Text>
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
                    {loading ? <ActivityIndicator color="#f1f3f5" style={{ marginTop: 8 }} /> : null}
                  </View>
                </View>
              )}

              {activeTab === "agents" && (
                <View style={styles.block}>
                  <Text style={styles.sectionTitle}>Agents IA</Text>
                  <View style={styles.agentsGrid}>
                    {state.agents.map((agent) => (
                      <View key={agent.id} style={styles.agentItem}>
                        <AgentCard
                          agent={agent}
                          onTrain={() => handleTrain(agent)}
                          onSupport={() => handleSupport(agent)}
                        />
                      </View>
                    ))}
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
  background: "#f8f8f8",
  card: "#ffffff",
  accent: "#111111",
  text: "#111111",
  muted: "#555555",
  border: "#e5e5e5",
  danger: "#c00000",
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
  },
  header: {
    marginTop: 12,
    marginBottom: 8,
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
  },
  headerCash: {
    fontSize: 13,
    color: palette.muted,
  },
  subtitle: {
    color: palette.muted,
    marginTop: 4,
    marginBottom: 12,
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
    borderRadius: 12,
    padding: 14,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "600",
  },
  badge: {
    backgroundColor: "transparent",
    color: palette.text,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: palette.border,
  },
  meta: {
    color: palette.muted,
    marginVertical: 2,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  actionButton: {
    backgroundColor: palette.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionButtonSecondary: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  actionTextSecondary: {
    color: palette.text,
  },
  label: {
    color: palette.text,
    marginBottom: 6,
  },
  input: {
    backgroundColor: palette.card,
    color: palette.text,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  secondaryText: {
    color: palette.text,
  },
  error: {
    color: palette.danger,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  summaryText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "600",
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  metricLabel: {
    color: palette.muted,
    marginBottom: 4,
  },
  metricValue: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 10,
  },
  sectionTitleSmall: {
    color: palette.text,
    fontWeight: "700",
    marginTop: 8,
  },
  tabBar: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: "#ececec",
    borderRadius: 999,
    padding: 4,
    marginTop: 0,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  tabButtonActive: {
    backgroundColor: palette.accent,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.muted,
  },
  tabButtonTextActive: {
    color: "#ffffff",
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
});
