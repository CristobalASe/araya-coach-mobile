import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Vibration,
  Modal,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { auth, db } from "../../firebaseConfig";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const REST_NOTIFICATION_CHANNEL_ID = "rest-timer";

type SetRow = {
  set: number;
  reps: string;
  weight: string;
  completed: boolean;
};

function getTodayId() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekDaysIds() {
  const today = new Date();
  const currentDay = today.getDay();
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;

  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  });
}

function getMinimumSets(setsText: string) {
  const match = setsText.match(/^(\d+)/);
  return match ? Number(match[1]) : 4;
}

function parseSets(setsText: string) {
  const total = getMinimumSets(setsText);

  return Array.from({ length: total }, (_, index) => ({
    set: index + 1,
    reps: "",
    weight: "",
    completed: false,
  }));
}

export default function RegisterSeriesScreen() {
  const params = useLocalSearchParams<{
    exerciseId?: string;
    name?: string;
    sets?: string;
    muscleGroup?: string;
    equipment?: string;
    activeDay?: string;
    dayTitle?: string;
    routineName?: string;
  }>();

  const exerciseId = params.exerciseId || "";
  const name = params.name || "Ejercicio";
  const plannedSets = params.sets || "";
  const muscleGroup = params.muscleGroup || "";
  const equipment = params.equipment || "";
  const activeDay = params.activeDay || "";
  const dayTitle = params.dayTitle || "";
  const routineName = params.routineName || "";

  const safeExerciseId =
    exerciseId || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const minimumSets = useMemo(() => getMinimumSets(plannedSets), [plannedSets]);

  const draftKey = `workoutDraft:${
    auth.currentUser?.uid || "guest"
  }:${safeExerciseId}`;

  const [series, setSeries] = useState<SetRow[]>(() => parseSets(plannedSets));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [alreadyDoneThisWeek, setAlreadyDoneThisWeek] = useState(false);
  const [savedDate, setSavedDate] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);

  const [restTime, setRestTime] = useState(90);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [isResting, setIsResting] = useState(false);
  const [notificationId, setNotificationId] = useState<string | null>(null);

  const [showRestFinishedModal, setShowRestFinishedModal] = useState(false);
  const [showMinimumModal, setShowMinimumModal] = useState(false);

  const isReadOnly = alreadyDoneThisWeek;

  useEffect(() => {
    loadExistingLog();
  }, []);

  useEffect(() => {
    prepareRestNotifications();
  }, []);

  useEffect(() => {
    async function saveDraft() {
      if (!draftLoaded) return;
      if (isReadOnly) return;

      try {
        await AsyncStorage.setItem(
          draftKey,
          JSON.stringify({
            series,
            restEndsAt,
            updatedAt: Date.now(),
          })
        );
      } catch (error) {
        console.log("Error guardando borrador:", error);
      }
    }

    saveDraft();
  }, [series, restEndsAt, isReadOnly, draftLoaded, draftKey]);

  useEffect(() => {
    if (!isResting || !restEndsAt) return;

    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((restEndsAt - Date.now()) / 1000)
      );

      setRestTime(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        setIsResting(false);
        setRestEndsAt(null);
        setShowRestFinishedModal(true);
        Vibration.vibrate([0, 500, 200, 500]);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isResting, restEndsAt]);

  function normalizeSeries(items: any[]) {
    const normalized = items.map((item, index) => ({
      set: item.set || index + 1,
      reps:
        item.reps !== undefined && item.reps !== null && item.reps !== 0
          ? String(item.reps)
          : "",
      weight:
        item.weight !== undefined && item.weight !== null && item.weight !== 0
          ? String(item.weight)
          : "",
      completed: !!item.completed,
    }));

    if (normalized.length >= minimumSets) return normalized;

    const missing = minimumSets - normalized.length;

    return [
      ...normalized,
      ...Array.from({ length: missing }, (_, index) => ({
        set: normalized.length + index + 1,
        reps: "",
        weight: "",
        completed: false,
      })),
    ];
  }

  async function loadExistingLog() {
    const user = auth.currentUser;

    if (!user) {
      setDraftLoaded(true);
      return;
    }

    try {
      const days = getWeekDaysIds();
      let foundInFirestore = false;

      for (const dayId of days) {
        const snap = await getDoc(
          doc(
            db,
            "students",
            user.uid,
            "trainingLogs",
            dayId,
            "exercises",
            safeExerciseId
          )
        );

        if (snap.exists()) {
          const data = snap.data();

          if (Array.isArray(data.sets)) {
            setSeries(normalizeSeries(data.sets));
          }

          setSavedDate(data.date || dayId);
          setAlreadyDoneThisWeek(true);
          setMessage("Este ejercicio ya fue registrado esta semana.");
          foundInFirestore = true;

          await AsyncStorage.removeItem(draftKey);
          break;
        }
      }

      if (foundInFirestore) {
        setDraftLoaded(true);
        return;
      }

      const draft = await AsyncStorage.getItem(draftKey);

      if (draft) {
        const parsed = JSON.parse(draft);

        if (Array.isArray(parsed.series)) {
          setSeries(normalizeSeries(parsed.series));
        }

        if (parsed.restEndsAt && parsed.restEndsAt > Date.now()) {
          setRestEndsAt(parsed.restEndsAt);
          setIsResting(true);
          setRestTime(Math.ceil((parsed.restEndsAt - Date.now()) / 1000));
        }
      }
    } catch (error) {
      console.log("Error cargando registro semanal/borrador:", error);
    } finally {
      setDraftLoaded(true);
    }
  }

  async function prepareRestNotifications() {
    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(
          REST_NOTIFICATION_CHANNEL_ID,
          {
            name: "Descanso entre series",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 200, 500],
            enableVibrate: true,
            lockscreenVisibility:
              Notifications.AndroidNotificationVisibility.PUBLIC,
          }
        );
      }

      const currentPermission = await Notifications.getPermissionsAsync();

      if (currentPermission.granted) {
        return true;
      }

      const requestedPermission = await Notifications.requestPermissionsAsync();

      return requestedPermission.granted;
    } catch (error) {
      console.log("Error preparando notificaciones:", error);
      return false;
    }
  }

  async function startRestTimer() {
    if (isReadOnly) return;

    const secondsToRest = 90;
    const endsAt = Date.now() + secondsToRest * 1000;

    setRestTime(secondsToRest);
    setRestEndsAt(endsAt);
    setIsResting(true);

    const notificationsAllowed = await prepareRestNotifications();

    if (!notificationsAllowed) {
      setMessage("Activa las notificaciones para recibir la alerta de descanso.");
      return;
    }

    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      setNotificationId(null);
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Descanso terminado 💪",
        body: "Ya puedes comenzar la siguiente serie.",
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
        color: "#facc15",
        vibrate: [0, 500, 200, 500],
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(endsAt),
        channelId: REST_NOTIFICATION_CHANNEL_ID,
      },
    });

    setNotificationId(id);
  }

  async function stopRestTimer() {
    setIsResting(false);
    setRestTime(90);
    setRestEndsAt(null);

    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      setNotificationId(null);
    }
  }

  function updateSet(index: number, field: keyof SetRow, value: string | boolean) {
    if (isReadOnly) return;

    setSeries((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    );
  }

  function addSet() {
    if (isReadOnly) return;

    setSeries((prev) => [
      ...prev,
      {
        set: prev.length + 1,
        reps: "",
        weight: "",
        completed: false,
      },
    ]);
  }

  function removeSet(index: number) {
    if (isReadOnly) return;

    if (series.length <= minimumSets) {
      setShowMinimumModal(true);
      return;
    }

    const isLastSet = index === series.length - 1;

    if (!isLastSet) {
      setMessage("Solo puedes quitar la última serie agregada.");
      return;
    }

    setSeries((prev) =>
      prev.slice(0, -1).map((item, newIndex) => ({
        ...item,
        set: newIndex + 1,
      }))
    );
  }

  async function saveWorkoutLog() {
    try {
      const user = auth.currentUser;

      if (!user) {
        setMessage("No hay usuario logueado.");
        return;
      }

      if (isReadOnly) {
        setMessage("Este ejercicio ya fue guardado esta semana.");
        return;
      }

      setLoading(true);
      setMessage("");

      const todayId = getTodayId();

      await setDoc(
        doc(
          db,
          "students",
          user.uid,
          "trainingLogs",
          todayId,
          "exercises",
          safeExerciseId
        ),
        {
          exerciseId: safeExerciseId,
          name,
          plannedSets,
          muscleGroup,
          equipment,
          activeDay,
          dayTitle,
          routineName,
          sets: series.map((item) => ({
            set: item.set,
            reps: Number(item.reps) || 0,
            weight: Number(String(item.weight).replace(",", ".")) || 0,
            completed: item.completed,
          })),
          completedSets: series.filter((item) => item.completed).length,
          totalSets: series.length,
          date: todayId,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      await AsyncStorage.removeItem(draftKey);
      setSavedDate(todayId);
      setAlreadyDoneThisWeek(true);
      setMessage("Registro guardado correctamente.");

      setTimeout(() => {
        router.back();
      }, 600);
    } catch (error) {
      console.log(error);
      setMessage("Error al guardar el registro.");
    } finally {
      setLoading(false);
    }
  }

  const minutes = Math.floor(restTime / 60);
  const seconds = restTime % 60;
  const formattedTime = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.dismiss()}>
            <Ionicons name="chevron-back" size={24} color="#ffffff" />
          </Pressable>

          <View style={styles.headerText}>
            <Text style={styles.title}>Registro de series</Text>
            <Text style={styles.subtitle}>{name}</Text>
          </View>

          <View style={{ width: 36 }} />
        </View>

        {alreadyDoneThisWeek && (
          <View style={styles.doneBox}>
            <Ionicons name="lock-closed" size={18} color="#22c55e" />
            <Text style={styles.doneText}>
              Ejercicio registrado esta semana{savedDate ? ` (${savedDate})` : ""}
            </Text>
          </View>
        )}

        <View style={styles.infoCard}>
          <InfoRow label="Series indicadas" value={plannedSets || "-"} />
          <InfoRow label="Grupo muscular" value={muscleGroup || "-"} />
          <InfoRow label="Equipo" value={equipment || "-"} />
        </View>

        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeadText, styles.colSmall]}>Serie</Text>
            <Text style={styles.tableHeadText}>Reps</Text>
            <Text style={styles.tableHeadText}>Peso</Text>
            <Text style={[styles.tableHeadText, styles.colSmall]}>OK</Text>
            <Text style={styles.removeHeadSpace} />
          </View>

          {series.map((item, index) => {
            const canRemove =
              !isReadOnly &&
              series.length > minimumSets &&
              index === series.length - 1;

            return (
              <View key={`${item.set}-${index}`} style={styles.tableRow}>
                <View style={[styles.cellBox, styles.colSmall]}>
                  <Text style={styles.cellNumber}>{item.set}</Text>
                </View>

                <TextInput
                  style={[styles.input, isReadOnly && styles.inputDisabled]}
                  placeholder="0"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  value={item.reps}
                  editable={!isReadOnly}
                  onChangeText={(text) => updateSet(index, "reps", text)}
                />

                <TextInput
                  style={[styles.input, isReadOnly && styles.inputDisabled]}
                  placeholder="kg"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  value={item.weight}
                  editable={!isReadOnly}
                  onChangeText={(text) => updateSet(index, "weight", text)}
                />

                <Pressable
                  disabled={isReadOnly}
                  style={[
                    styles.checkButton,
                    item.completed && styles.checkButtonActive,
                    isReadOnly && styles.readOnlyButton,
                  ]}
                  onPress={() => {
                    const nextCompleted = !item.completed;
                    updateSet(index, "completed", nextCompleted);

                    if (nextCompleted) {
                      startRestTimer();
                    }
                  }}
                >
                  <Ionicons
                    name={item.completed ? "checkmark" : "ellipse-outline"}
                    size={18}
                    color={item.completed ? "#050505" : "#777"}
                  />
                </Pressable>

                <Pressable
                  disabled={!canRemove}
                  style={[
                    styles.removeButton,
                    !canRemove && styles.removeButtonDisabled,
                  ]}
                  onPress={() => removeSet(index)}
                >
                  <Ionicons
                    name="close"
                    size={16}
                    color={canRemove ? "#aaa" : "#555"}
                  />
                </Pressable>
              </View>
            );
          })}

          <Pressable
            style={[styles.addButton, isReadOnly && styles.disabledAction]}
            onPress={addSet}
            disabled={isReadOnly}
          >
            <Text
              style={[
                styles.addButtonText,
                isReadOnly && styles.disabledActionText,
              ]}
            >
              Agregar serie
            </Text>
          </Pressable>

          <Text style={styles.minimumText}>
            {isReadOnly
              ? "Información cargada desde la base de datos."
              : `Mínimo: ${minimumSets} series según ${
                  plannedSets || "la rutina"
                }`}
          </Text>
        </View>

        <View style={styles.restCard}>
          <View>
            <Text style={styles.restLabel}>Descanso recomendado</Text>
            <Text style={styles.restValue}>{formattedTime}</Text>
          </View>

          <Pressable
            style={[styles.timerButton, isReadOnly && styles.disabledTimer]}
            onPress={isResting ? stopRestTimer : startRestTimer}
            disabled={isReadOnly}
          >
            <Ionicons
              name={isResting ? "stop-circle-outline" : "timer-outline"}
              size={18}
              color={isReadOnly ? "#555" : "#050505"}
            />
            <Text
              style={[
                styles.timerButtonText,
                isReadOnly && styles.disabledTimerText,
              ]}
            >
              {isResting ? "Detener" : "Iniciar"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={[
            styles.saveButton,
            (loading || isReadOnly) && styles.saveButtonDisabled,
          ]}
          onPress={saveWorkoutLog}
          disabled={loading || isReadOnly}
        >
          <Text style={styles.saveButtonText}>
            {isReadOnly
              ? "Ya guardado esta semana"
              : loading
              ? "Guardando..."
              : "Guardar y volver"}
          </Text>
        </Pressable>

        {!!message && <Text style={styles.message}>{message}</Text>}
      </ScrollView>

      <Modal transparent visible={showRestFinishedModal} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Ionicons name="timer" size={38} color="#facc15" />
            <Text style={styles.modalTitle}>Descanso terminado</Text>
            <Text style={styles.modalText}>
              Ya puedes comenzar la siguiente serie.
            </Text>

            <Pressable
              style={styles.modalButton}
              onPress={() => setShowRestFinishedModal(false)}
            >
              <Text style={styles.modalButtonText}>Continuar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showMinimumModal} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Ionicons name="alert-circle" size={38} color="#facc15" />
            <Text style={styles.modalTitle}>No puedes quitar más series</Text>
            <Text style={styles.modalText}>
              Esta rutina tiene un mínimo de {minimumSets} series.
            </Text>

            <Pressable
              style={styles.modalButton}
              onPress={() => setShowMinimumModal(false)}
            >
              <Text style={styles.modalButtonText}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#050505" },
  container: { padding: 16, paddingTop: 58, paddingBottom: 120 },

  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },

  backButton: {
    width: 36,
    height: 36,
    borderRadius: 99,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#242424",
  },

  headerText: { flex: 1, alignItems: "center" },

  title: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
  },

  subtitle: {
    color: "#a3a3a3",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },

  doneBox: {
    backgroundColor: "#111111",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#22c55e",
    padding: 12,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  doneText: {
    color: "#22c55e",
    fontWeight: "900",
    fontSize: 12,
  },

  infoCard: {
    backgroundColor: "#111111",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 14,
    marginBottom: 14,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
  },

  infoLabel: { color: "#9a9a9a", fontSize: 12, fontWeight: "700" },

  infoValue: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
    maxWidth: "55%",
  },

  tableCard: {
    backgroundColor: "#111111",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 12,
  },

  tableHeader: { flexDirection: "row", gap: 8, marginBottom: 8 },

  tableHeadText: {
    flex: 1,
    color: "#a3a3a3",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },

  colSmall: { flex: 0.7 },

  removeHeadSpace: {
    width: 28,
  },

  tableRow: { flexDirection: "row", gap: 8, marginBottom: 8 },

  cellBox: {
    flex: 0.7,
    height: 38,
    backgroundColor: "#171717",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },

  cellNumber: { color: "#ffffff", fontWeight: "900" },

  input: {
    flex: 1,
    height: 38,
    backgroundColor: "#171717",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    color: "#ffffff",
    textAlign: "center",
    fontWeight: "800",
  },

  inputDisabled: {
    opacity: 0.75,
    color: "#a3a3a3",
  },

  checkButton: {
    flex: 0.7,
    height: 38,
    backgroundColor: "#171717",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },

  checkButtonActive: {
    backgroundColor: "#facc15",
    borderColor: "#facc15",
  },

  readOnlyButton: {
    opacity: 0.8,
  },

  removeButton: {
    width: 28,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },

  removeButtonDisabled: {
    opacity: 0.4,
  },

  addButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#facc15",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },

  addButtonText: { color: "#facc15", fontSize: 12, fontWeight: "900" },

  disabledAction: {
    borderColor: "#333",
    opacity: 0.6,
  },

  disabledActionText: {
    color: "#666",
  },

  minimumText: {
    color: "#777",
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
    fontWeight: "700",
  },

  restCard: {
    backgroundColor: "#111111",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 16,
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  restLabel: { color: "#a3a3a3", fontSize: 12, fontWeight: "700" },

  restValue: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 8,
  },

  timerButton: {
    backgroundColor: "#facc15",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  timerButtonText: {
    color: "#050505",
    fontWeight: "900",
    fontSize: 12,
  },

  disabledTimer: {
    backgroundColor: "#222",
    opacity: 0.7,
  },

  disabledTimerText: {
    color: "#555",
  },

  saveButton: {
    backgroundColor: "#facc15",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 16,
  },

  saveButtonDisabled: { opacity: 0.6 },

  saveButtonText: { color: "#050505", fontSize: 13, fontWeight: "900" },

  message: {
    color: "#ffffff",
    textAlign: "center",
    marginTop: 14,
    fontWeight: "700",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  modalBox: {
    width: "100%",
    backgroundColor: "#111111",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },

  modalTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 12,
    textAlign: "center",
  },

  modalText: {
    color: "#a3a3a3",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 18,
  },

  modalButton: {
    backgroundColor: "#facc15",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },

  modalButtonText: {
    color: "#050505",
    fontWeight: "900",
  },
});