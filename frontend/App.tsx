import { StatusBar } from "expo-status-bar";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

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
  persona_prompt?: string;
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

type InterviewMessage = {
  sender: "manager" | "candidate";
  content: string;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8055";

const terminalFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

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

async function fetchCandidates(gameId: string, count: number = 3): Promise<Agent[]> {
  const res = await fetch(`${API_BASE_URL}/recruitment/candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: gameId, count }),
  });
  if (!res.ok) {
    throw new Error(`Impossible de générer des candidats (${res.status})`);
  }
  const data = await res.json();
  return data.candidates;
}

async function interviewCandidate(
  gameId: string,
  candidate: Agent,
  messages: InterviewMessage[]
): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/recruitment/interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: gameId, candidate, messages }),
  });
  if (!res.ok) {
    throw new Error(`Entretien indisponible (${res.status})`);
  }
  const data = await res.json();
  return data.reply;
}

async function hireCandidate(gameId: string, candidate: Agent): Promise<GameState> {
  const res = await fetch(`${API_BASE_URL}/recruitment/hire`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: gameId, candidate }),
  });
  if (!res.ok) {
    throw new Error(`Recrutement refusé (${res.status})`);
  }
  const data = await res.json();
  return data.state;
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
  const [activeTab, setActiveTab] = useState<"game" | "summary" | "agents" | "finance" | "report" | "recruitment">(
    "game"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Agent[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [interviewMessages, setInterviewMessages] = useState<Record<string, InterviewMessage[]>>({});
  const [interviewInput, setInterviewInput] = useState("");
  const [recruitmentLoading, setRecruitmentLoading] = useState(false);
  const [interviewLoading, setInterviewLoading] = useState(false);

  const summary = useMemo(() => {
    const baseReport = report ?? state?.last_report;
    return baseReport?.results;
  }, [report, state]);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null,
    [candidates, selectedCandidateId]
  );
  const currentInterview = selectedCandidate ? interviewMessages[selectedCandidate.id] ?? [] : [];

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const created = await startGame(companyName.trim());
      setState(created.state);
      setReport(created.state.last_report ?? null);
      setPendingActions([]);
      setCandidates([]);
      setSelectedCandidateId(null);
      setInterviewMessages({});
      setInterviewInput("");
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

  const handleGenerateCandidates = async () => {
    if (!state) return;
    setRecruitmentLoading(true);
    setError(null);
    try {
      const profiles = await fetchCandidates(state.game_id);
      setCandidates(profiles);
      setInterviewMessages({});
      setSelectedCandidateId(profiles[0]?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecruitmentLoading(false);
    }
  };

  const handleSendInterview = async () => {
    if (!state || !selectedCandidate || interviewInput.trim().length === 0) return;
    const message: InterviewMessage = { sender: "manager", content: interviewInput.trim() };
    const thread = interviewMessages[selectedCandidate.id] ?? [];
    const updatedThread = [...thread, message];
    setInterviewMessages((current) => ({ ...current, [selectedCandidate.id]: updatedThread }));
    setInterviewInput("");
    setInterviewLoading(true);
    setError(null);
    try {
      const reply = await interviewCandidate(state.game_id, selectedCandidate, updatedThread);
      setInterviewMessages((current) => ({
        ...current,
        [selectedCandidate.id]: [...updatedThread, { sender: "candidate", content: reply }],
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInterviewLoading(false);
    }
  };

  const handleHireSelected = async () => {
    if (!state || !selectedCandidate) return;
    setRecruitmentLoading(true);
    setError(null);
    try {
      const updatedState = await hireCandidate(state.game_id, selectedCandidate);
      setState(updatedState);
      const remaining = candidates.filter((candidate) => candidate.id !== selectedCandidate.id);
      setCandidates(remaining);
      setInterviewMessages((current) => {
        const copy = { ...current };
        delete copy[selectedCandidate.id];
        return copy;
      });
      setSelectedCandidateId(remaining[0]?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecruitmentLoading(false);
    }
  };

  const handleSelectCandidate = (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    setInterviewInput("");
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
                    style={[styles.tabButton, activeTab === "recruitment" && styles.tabButtonActive]}
                    onPress={() => setActiveTab("recruitment")}
                  >
                    <Text
                      style={[styles.tabButtonText, activeTab === "recruitment" && styles.tabButtonTextActive]}
                    >
                      Recrutement
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
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                    {loading ? <ActivityIndicator color={palette.text} style={{ marginTop: 8 }} /> : null}
                  </View>
                </View>
              )}

              {activeTab === "agents" && (
                <View style={styles.block}>
                  <Text style={styles.sectionTitle}>Effectifs</Text>
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

              {activeTab === "recruitment" && (
                <View style={styles.block}>
                  <Text style={styles.sectionTitle}>Recrutement</Text>
                  <View style={styles.card}>
                    <Text style={styles.meta}>Génère des profils et simule l'entretien avant d'embaucher.</Text>
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleGenerateCandidates}
                        disabled={recruitmentLoading}
                      >
                        <Text style={styles.primaryText}>Générer des candidats</Text>
                      </TouchableOpacity>
                      {recruitmentLoading ? <ActivityIndicator color={palette.text} /> : null}
                    </View>
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                  </View>
                  {candidates.length === 0 ? (
                    <Text style={styles.meta}>Aucun profil pour l'instant.</Text>
                  ) : (
                    <View style={styles.agentsGrid}>
                      {candidates.map((candidate) => (
                        <TouchableOpacity
                          key={candidate.id}
                          onPress={() => handleSelectCandidate(candidate.id)}
                          style={[styles.card, selectedCandidateId === candidate.id && styles.cardSelected]}
                        >
                          <View style={styles.cardHeader}>
                            <Text style={styles.cardTitle}>{candidate.name}</Text>
                            <Text style={styles.badge}>{candidate.role}</Text>
                          </View>
                          <Text style={styles.meta}>Salaire cible: {formatCurrency(candidate.salary)}</Text>
                          <Text style={styles.meta}>Autonomie: {candidate.autonomy}</Text>
                          <Text style={styles.meta}>Traits: {candidate.traits.slice(0, 3).join(", ")}</Text>
                          <Text style={styles.meta}>
                            Points forts: {candidate.strengths.join(", ")} | Risques: {candidate.weaknesses.join(", ")}
                          </Text>
                          <View style={styles.actionsRow}>
                            <TouchableOpacity
                              style={styles.secondaryButton}
                              onPress={() => handleSelectCandidate(candidate.id)}
                            >
                              <Text style={styles.secondaryText}>Ouvrir l'entretien</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.actionButtonSecondary}
                              onPress={() => handleSelectCandidate(candidate.id)}
                            >
                              <Text style={[styles.actionText, styles.actionTextSecondary]}>Examiner</Text>
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {selectedCandidate ? (
                    <View style={styles.card}>
                      <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>Entretien avec {selectedCandidate.name}</Text>
                        <Text style={styles.meta}>Role {selectedCandidate.role}</Text>
                      </View>
                      <Text style={styles.meta}>
                        Productivité: {selectedCandidate.productivity} · Motivation:{" "}
                        {selectedCandidate.motivation.toFixed(0)} · Stabilité: {selectedCandidate.stability.toFixed(0)}
                      </Text>
                      <Text style={styles.meta}>
                        Compétences clés:{" "}
                        {Object.entries(selectedCandidate.skills)
                          .slice(0, 3)
                          .map(([name, score]) => `${name} ${score}`)
                          .join(" · ")}
                      </Text>
                      <View style={styles.interviewThread}>
                        {currentInterview.length === 0 ? (
                          <Text style={styles.meta}>Pose une première question pour lancer la discussion.</Text>
                        ) : (
                          currentInterview.map((msg, idx) => (
                            <View
                              key={`${msg.sender}-${idx}`}
                              style={[
                                styles.chatBubble,
                                msg.sender === "manager" ? styles.chatManager : styles.chatCandidate,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.meta,
                                  msg.sender === "manager" ? styles.chatTextManager : styles.chatTextCandidate,
                                ]}
                              >
                                {msg.sender === "manager" ? "Toi" : selectedCandidate.name}: {msg.content}
                              </Text>
                            </View>
                          ))
                        )}
                      </View>
                      <View style={styles.interviewInputRow}>
                        <TextInput
                          value={interviewInput}
                          onChangeText={setInterviewInput}
                          style={[styles.input, styles.chatInput]}
                          placeholder="Pose une question d'entretien"
                          editable={!interviewLoading}
                        />
                        <TouchableOpacity
                          style={[styles.primaryButton, styles.sendButton]}
                          onPress={handleSendInterview}
                          disabled={interviewLoading || interviewInput.trim().length === 0}
                        >
                          <Text style={styles.primaryText}>Envoyer</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={handleHireSelected}
                          disabled={recruitmentLoading}
                        >
                          <Text style={styles.actionText}>Recruter</Text>
                        </TouchableOpacity>
                        {interviewLoading ? <ActivityIndicator color={palette.text} /> : null}
                      </View>
                    </View>
                  ) : candidates.length ? (
                    <Text style={styles.meta}>Sélectionne un profil pour démarrer un entretien.</Text>
                  ) : null}
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
  headerCash: {
    fontSize: 13,
    color: palette.muted,
    fontFamily: terminalFont,
    letterSpacing: 0.5,
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
  cardSelected: {
    borderColor: palette.accent,
    borderWidth: 3,
  },
  interviewThread: {
    gap: 8,
    marginTop: 12,
  },
  chatBubble: {
    padding: 10,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: palette.border,
  },
  chatManager: {
    alignSelf: "flex-end",
    backgroundColor: palette.accent,
  },
  chatCandidate: {
    alignSelf: "flex-start",
    backgroundColor: palette.card,
  },
  chatTextManager: {
    color: palette.card,
  },
  chatTextCandidate: {
    color: palette.text,
  },
  interviewInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  chatInput: {
    flex: 1,
    marginBottom: 0,
  },
  sendButton: {
    minWidth: 110,
  },
});
