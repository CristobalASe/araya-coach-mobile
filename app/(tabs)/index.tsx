import {
  Text,
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Modal,
  AppState,
} from "react-native";
import type { AppStateStatus } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { router, useFocusEffect } from "expo-router";

const motivationalQuotes = [
  "La constancia vence al talento cuando el talento no es constante.",
  "No necesitas motivación, necesitas disciplina.",
  "Cada repetición cuenta.",
  "Hoy compites contra tu versión de ayer.",
  "Tu cuerpo puede, tu mente decide.",
  "Sé más fuerte que tus excusas.",
  "Confía en el proceso.",
];

type ExerciseType = {
  exerciseId?: string;
  id?: string;
  name?: string;
  sets?: string;
};

type RoutineDay = {
  key?: string;
  day?: string;
  label?: string;
  title?: string;
  exercises?: ExerciseType[];
};

type CoachActivity = {
  title: string;
  sub: string;
  detail: string;
  ms: number;
};

function getDailyMotivation() {
  const today = new Date();
  const dayNumber = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
  return motivationalQuotes[dayNumber % motivationalQuotes.length];
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

export default function HomeScreen() {
  const [uid, setUid] = useState<string | null>(null);
  const [name, setName] = useState("Alumno");
  const [currentWeight, setCurrentWeight] = useState("--");
  const [routineTitle, setRoutineTitle] = useState("Rutina");
  const [routineExercisesCount, setRoutineExercisesCount] =
    useState("Ver entrenamiento");
  const [todayRoutineIndex, setTodayRoutineIndex] = useState(-1);

  const [weeklyTotalExercises, setWeeklyTotalExercises] = useState(0);
  const [weeklyCompletedExercises, setWeeklyCompletedExercises] = useState(0);
  const [weeklyProgressPercent, setWeeklyProgressPercent] = useState(0);

  const [nextCheckIn, setNextCheckIn] = useState("Por definir");
  const [isAdmin, setIsAdmin] = useState(false);

  const [coachActivity, setCoachActivity] = useState<CoachActivity>({
    title: "Sin novedades",
    sub: "Sin actividad reciente",
    detail:
      "Cuando tu coach actualice tu rutina, nutrición o indicaciones, aparecerá aquí.",
    ms: 0,
  });
  const [hasUnreadCoachActivity, setHasUnreadCoachActivity] = useState(false);

  const [coachModalVisible, setCoachModalVisible] = useState(false);

  const activeLoadRef = useRef(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState || "active");
  const insets = useSafeAreaInsets();
  const motivation = getDailyMotivation();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUid(null);
        resetHomeData();
        return;
      }

      setUid(user.uid);
    });

    return unsub;
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;

      const requestId = activeLoadRef.current + 1;
      activeLoadRef.current = requestId;

      loadHomeData(uid, requestId);
    }, [uid])
  );

  useEffect(() => {
    if (!uid) return;

    const activeUid = uid;

    function handleAppStateChange(nextAppState: AppStateStatus) {
      const previousAppState = appStateRef.current;
      const appWasInBackground =
        previousAppState === "background" || previousAppState === "inactive";

      if (appWasInBackground && nextAppState === "active") {
        const requestId = activeLoadRef.current + 1;
        activeLoadRef.current = requestId;

        loadHomeData(activeUid, requestId);
      }

      appStateRef.current = nextAppState;
    }

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, [uid]);

  function resetHomeData() {
    setName("Alumno");
    setCurrentWeight("--");
    setRoutineTitle("Rutina");
    setRoutineExercisesCount("Ver entrenamiento");
    setTodayRoutineIndex(-1);
    setWeeklyTotalExercises(0);
    setWeeklyCompletedExercises(0);
    setWeeklyProgressPercent(0);
    setNextCheckIn("Por definir");
    setIsAdmin(false);
    setCoachActivity({
      title: "Sin novedades",
      sub: "Sin actividad reciente",
      detail:
        "Cuando tu coach actualice tu rutina, nutrición o indicaciones, aparecerá aquí.",
      ms: 0,
    });
    setHasUnreadCoachActivity(false);
  }

  async function loadHomeData(userId: string, requestId: number) {
    try {
      const studentRef = doc(db, "students", userId);
      const trainingRef = doc(db, "students", userId, "training", "current");
      const nutritionRef = doc(db, "students", userId, "nutrition", "current");

      const [studentSnap, trainingSnap, nutritionSnap] = await Promise.all([
        getDoc(studentRef),
        getDoc(trainingRef),
        getDoc(nutritionRef),
      ]);

      if (requestId !== activeLoadRef.current) return;

      if (!studentSnap.exists()) {
        resetHomeData();
        return;
      }

      const studentData = studentSnap.data();
      const trainingData = trainingSnap.exists() ? trainingSnap.data() : null;
      const nutritionData = nutritionSnap.exists() ? nutritionSnap.data() : null;

      const checkups = await loadCheckups(userId);

      if (requestId !== activeLoadRef.current) return;

      const latestCheckup = getLatestCheckup(checkups);

      updateStudentState(studentData, latestCheckup);
      updateRoutineState(trainingData);
      updateCoachState(studentData, trainingData, nutritionData, latestCheckup);
      setNextCheckIn(getNextCheckInLabel(studentData, checkups));

      const progress = await calculateWeeklyProgress(userId, trainingData);

      if (requestId !== activeLoadRef.current) return;

      setWeeklyTotalExercises(progress.total);
      setWeeklyCompletedExercises(progress.completed);
      setWeeklyProgressPercent(progress.percent);
    } catch (error) {
      console.log("Error cargando home:", error);
      resetHomeData();
    }
  }

  async function loadCheckups(userId: string) {
    try {
      const checkupsRef = collection(db, "students", userId, "checkups");
      const checkupsSnap = await getDocs(checkupsRef);

      return checkupsSnap.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .sort((a: any, b: any) => getDateMs(a) - getDateMs(b));
    } catch (error) {
      console.log("Error cargando checkups:", error);
      return [];
    }
  }

  function updateStudentState(studentData: any, latestCheckup: any) {
    setName(studentData.name || "Alumno");

    const weight = getFirstValid([
      latestCheckup?.weight,
      studentData.current?.weight,
      studentData.anamnesis?.initialWeight,
      studentData.initialWeight,
    ]);

    setCurrentWeight(formatCleanValue(weight));

    const admin =
      studentData.role === "admin" ||
      studentData.type === "admin" ||
      studentData.isAdmin === true;

    setIsAdmin(admin);
  }

  function updateRoutineState(trainingData: any) {
    if (!trainingData) {
      setRoutineTitle("Rutina");
      setRoutineExercisesCount("Sin rutina asignada");
      setTodayRoutineIndex(-1);
      return;
    }

    const days: RoutineDay[] = Array.isArray(trainingData.days)
      ? trainingData.days
      : [];

    if (days.length === 0) {
      setRoutineTitle("Rutina");
      setRoutineExercisesCount("Sin ejercicios");
      setTodayRoutineIndex(-1);
      return;
    }

    const routineResult = getTodayRoutine(days);
    const todayRoutine = routineResult.day;

    if (!todayRoutine) {
      setRoutineTitle("Día de descanso");
      setRoutineExercisesCount("Sin rutina asignada para hoy");
      setTodayRoutineIndex(-1);
      return;
    }

    const exercises = todayRoutine.exercises || [];

    setTodayRoutineIndex(routineResult.index);

    setRoutineTitle(
      todayRoutine.title || todayRoutine.label || todayRoutine.day || "Rutina"
    );

    setRoutineExercisesCount(
      exercises.length === 1 ? "1 ejercicio" : `${exercises.length} ejercicios`
    );
  }



  function updateCoachState(
    studentData: any,
    trainingData: any,
    nutritionData: any,
    latestCheckup: any
  ) {
    const candidates = [
      {
        title: "Rutina actualizada",
        detail:
          "Tu coach realizó cambios recientes en tu plan de entrenamiento.",
        ms: getDateMs(trainingData?.updatedAt || trainingData?.createdAt),
      },
      {
        title: "Nutrición actualizada",
        detail: "Tu coach realizó cambios recientes en tu plan nutricional.",
        ms: getDateMs(nutritionData?.updatedAt || nutritionData?.createdAt),
      },
      {
        title: "Checkup actualizado",
        detail: "Tu coach registró un nuevo checkup o evaluación física.",
        ms: getDateMs(latestCheckup?.createdAt || latestCheckup?.date),
      },
      {
        title: "Plan actualizado",
        detail: "Tu coach realizó una actualización reciente en tu plan.",
        ms: getDateMs(
          studentData?.coachActivity?.updatedAt ||
            studentData?.lastCoachActivityAt ||
            studentData?.updatedAt
        ),
      },
    ].filter((item) => item.ms > 0);

    if (candidates.length === 0) {
      setCoachActivity({
        title: "Sin novedades",
        sub: "Sin actividad reciente",
        detail:
          "Cuando tu coach actualice tu rutina, nutrición o indicaciones, aparecerá aquí.",
        ms: 0,
      });
      setHasUnreadCoachActivity(false);
      return;
    }

    const latest = candidates.sort((a, b) => b.ms - a.ms)[0];

    const lastSeenActivityMs = getFirstValid([
      studentData?.home?.lastSeenCoachActivityMs,
      studentData?.lastSeenCoachActivityMs,
      studentData?.coachActivity?.lastSeenAt,
    ]);

    const lastSeenMs = getDateMs(lastSeenActivityMs) || Number(lastSeenActivityMs) || 0;

    setCoachActivity({
      title: latest.title,
      sub: formatRelativeTime(latest.ms),
      detail: latest.detail,
      ms: latest.ms,
    });

    setHasUnreadCoachActivity(latest.ms > lastSeenMs);
  }


  async function handleCoachActivityUnderstood() {
    setCoachModalVisible(false);

    if (!hasUnreadCoachActivity) return;

    setHasUnreadCoachActivity(false);

    if (!uid || !coachActivity.ms) return;

    try {
      await updateDoc(doc(db, "students", uid), {
        "home.lastSeenCoachActivityMs": coachActivity.ms,
      });
    } catch (error) {
      console.log("Error marcando actividad como vista:", error);
    }
  }

  async function calculateWeeklyProgress(userId: string, trainingData: any) {
    try {
      const days: RoutineDay[] = Array.isArray(trainingData?.days)
        ? trainingData.days
        : [];

      const totalExercises = days.reduce((total, day) => {
        return total + (day.exercises?.length || 0);
      }, 0);

      if (totalExercises === 0) {
        return {
          total: 0,
          completed: 0,
          percent: 0,
        };
      }

      const weekDays = getWeekDaysIds();

      const snapshots = await Promise.all(
        weekDays.map((dayId) => {
          const exercisesRef = collection(
            db,
            "students",
            userId,
            "trainingLogs",
            dayId,
            "exercises"
          );

          return getDocs(exercisesRef).then((snap) => ({
            dayId,
            snap,
          }));
        })
      );

      const completedKeys = new Set<string>();

      snapshots.forEach(({ dayId, snap }) => {
        snap.docs.forEach((exerciseDoc) => {
          const data = exerciseDoc.data();

          const explicitlyIncomplete =
            data.completed === false ||
            data.done === false ||
            data.status === "pending" ||
            data.status === "incomplete";

          if (explicitlyIncomplete) return;

          const exerciseKey =
            data.exerciseId ||
            data.id ||
            data.name ||
            data.exerciseName ||
            exerciseDoc.id;

          completedKeys.add(`${dayId}:${String(exerciseKey)}`);
        });
      });

      const completed = Math.min(completedKeys.size, totalExercises);
      const percent = Math.round((completed / totalExercises) * 100);

      return {
        total: totalExercises,
        completed,
        percent: clamp(percent, 0, 100),
      };
    } catch (error) {
      console.log("Error calculando progreso semanal:", error);

      return {
        total: 0,
        completed: 0,
        percent: 0,
      };
    }
  }

  function goToTodayRoutine() {
    if (todayRoutineIndex < 0) return;

    router.push({
      pathname: "/training",
      params: {
        dayIndex: String(todayRoutineIndex),
      },
    });
  }

  const pendingExercises = Math.max(
    weeklyTotalExercises - weeklyCompletedExercises,
    0
  );

  const progressWidth = `${weeklyProgressPercent}%` as `${number}%`;

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        contentContainerStyle={{
          paddingTop: 1,
          paddingBottom: insets.bottom + 20,
          paddingHorizontal: 16,
        }}
      >
        <View style={styles.header}>
          <View style={styles.headerTextBox}>
            <Text style={styles.greeting}>Hola, {name} 👋</Text>
            <Text style={styles.week}>Listo para avanzar hoy</Text>
          </View>

          <View style={styles.headerRight}>
            {isAdmin && (
              <Pressable
                style={styles.adminButton}
                onPress={() => router.push("/admin/seed-exercises")}
              >
                <Text style={styles.adminText}>⚙️</Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.bell,
                hasUnreadCoachActivity && styles.bellUnread,
                pressed && styles.bellPressed,
              ]}
              onPress={() => setCoachModalVisible(true)}
            >
              <Text style={styles.bellIcon}>🔔</Text>
              {hasUnreadCoachActivity && <View style={styles.dot} />}
            </Pressable>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />

          <View style={styles.heroContent}>
            <View style={styles.heroInfo}>
              <View>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>Rutina de hoy</Text>
                </View>

                <Text style={styles.heroTitle}>{routineTitle}</Text>
                <Text style={styles.heroSub}>{routineExercisesCount}</Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.button,
                  todayRoutineIndex < 0 && styles.buttonDisabled,
                ]}
                activeOpacity={0.85}
                onPress={goToTodayRoutine}
                disabled={todayRoutineIndex < 0}
              >
                <Text
                  style={[
                    styles.buttonText,
                    todayRoutineIndex < 0 && styles.buttonDisabledText,
                  ]}
                >
                  {todayRoutineIndex < 0 ? "Descanso" : "Ver rutina"}
                </Text>

                {todayRoutineIndex >= 0 && (
                  <Text style={styles.buttonArrow}>→</Text>
                )}
              </TouchableOpacity>
            </View>

            <Image
              source={{
                uri: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?q=80&w=600",
              }}
              style={styles.heroImage}
            />

            <View style={styles.imageOverlay} />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Resumen</Text>
          <Text style={styles.sectionSubtitle}>Tu estado actual</Text>
        </View>

        <View style={styles.grid}>
          <Card title="Próximo check-in" value={nextCheckIn} icon="📅" />

          <Card
            title="Peso actual"
            value={currentWeight}
            unit={currentWeight !== "--" ? "kg" : undefined}
            icon="📈"
          />

          <Card
            title="Actividad coach"
            value={coachActivity.title}
            sub={coachActivity.sub}
            icon="💬"
            highlight={hasUnreadCoachActivity}
            fullWidth
            onPress={() => setCoachModalVisible(true)}
          />
        </View>

        <View style={styles.motivationCard}>
          <View style={styles.motivationIconBox}>
            <Text style={styles.motivationIcon}>⚡</Text>
          </View>

          <View style={styles.motivationContent}>
            <Text style={styles.motivationLabel}>Motivación del día</Text>
            <Text style={styles.motivationText}>{motivation}</Text>
          </View>
        </View>

        <View style={styles.progress}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.progressTitle}>Progreso semanal</Text>
              <Text style={styles.progressSubtitle}>
                {weeklyCompletedExercises} de {weeklyTotalExercises} ejercicios
                completados
              </Text>
            </View>

            <View style={styles.progressPercentBox}>
              <Text style={styles.progressPercent}>
                {weeklyProgressPercent}%
              </Text>
            </View>
          </View>

          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: progressWidth }]} />
          </View>

          <View style={styles.progressStats}>
            <View style={styles.progressStatItem}>
              <Text style={styles.progressStatValue}>
                {weeklyCompletedExercises}
              </Text>
              <Text style={styles.progressStatLabel}>Completados</Text>
            </View>

            <View style={styles.progressStatDivider} />

            <View style={styles.progressStatItem}>
              <Text style={styles.progressStatValue}>{pendingExercises}</Text>
              <Text style={styles.progressStatLabel}>Pendientes</Text>
            </View>
          </View>

          <Text style={styles.progressHint}>
            {weeklyProgressPercent >= 100
              ? "Semana completada. Excelente trabajo."
              : weeklyTotalExercises === 0
              ? "Aún no tienes una rutina semanal asignada."
              : "Sigue registrando tus ejercicios para completar la semana."}
          </Text>
        </View>
      </ScrollView>

      <CoachActivityModal
        visible={coachModalVisible}
        activity={coachActivity}
        onClose={handleCoachActivityUnderstood}
      />
    </View>
  );
}

function Card({
  title,
  value,
  unit,
  sub,
  icon,
  highlight = false,
  fullWidth = false,
  onPress,
}: {
  title: string;
  value: string;
  unit?: string;
  sub?: string;
  icon: string;
  highlight?: boolean;
  fullWidth?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        fullWidth && styles.cardWide,
        highlight && styles.cardHighlight,
        onPress && styles.cardPressable,
        pressed && onPress && styles.cardPressed,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.cardTop}>
        <Text
          style={[styles.cardTitle, highlight && styles.cardTitleHighlight]}
          numberOfLines={1}
        >
          {title}
        </Text>

        <View
          style={[styles.cardIconBox, highlight && styles.cardIconBoxHighlight]}
        >
          <Text style={styles.icon}>{icon}</Text>
        </View>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.valueRow}>
          <Text
            style={[
              styles.cardValue,
              fullWidth && styles.cardValueWide,
              highlight && styles.cardValueHighlight,
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>

          {unit && (
            <Text style={[styles.unit, highlight && styles.unitHighlight]}>
              {unit}
            </Text>
          )}
        </View>

        {sub && (
          <Text
            style={[
              styles.sub,
              fullWidth && styles.subWide,
              highlight && styles.subHighlight,
            ]}
            numberOfLines={1}
          >
            {sub}
          </Text>
        )}

        {highlight && (
          <View style={styles.newActivityBadge}>
            <Text style={styles.newActivityBadgeText}>Nuevo</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function CoachActivityModal({
  visible,
  activity,
  onClose,
}: {
  visible: boolean;
  activity: CoachActivity;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.coachModal}>
          <View style={styles.modalIconBox}>
            <Text style={styles.modalIcon}>💬</Text>
          </View>

          <Text style={styles.modalTitle}>Actividad del coach</Text>

          <Text style={styles.modalSubtitle}>{activity.detail}</Text>

          <View style={styles.modalInfoCard}>
            <View style={styles.modalInfoRow}>
              <Text style={styles.modalInfoLabel}>Estado</Text>
              <Text style={styles.modalInfoValue}>{activity.title}</Text>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.modalInfoRow}>
              <Text style={styles.modalInfoLabel}>Actualización</Text>
              <Text style={styles.modalInfoValue}>{activity.sub}</Text>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.modalInfoRow}>
              <Text style={styles.modalInfoLabel}>Detalle</Text>
              <Text style={styles.modalInfoValue}>{activity.detail}</Text>
            </View>
          </View>

          <Pressable style={styles.modalButton} onPress={onClose}>
            <Text style={styles.modalButtonText}>Entendido</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function getTodayRoutine(days: RoutineDay[]) {
  const todayNumber = getTodayNumberMondayBased();

  const explicitIndex = days.findIndex((item, index) => {
    const text = normalizeText(
      `${item.key || ""} ${item.day || ""} ${item.label || ""} ${
        item.title || ""
      }`
    );

    const dayNumber = getRoutineDayNumber(text);

    if (dayNumber) {
      return dayNumber === todayNumber;
    }

    return index + 1 === todayNumber;
  });

  if (explicitIndex >= 0) {
    return {
      index: explicitIndex,
      day: days[explicitIndex],
    };
  }

  return {
    index: -1,
    day: null,
  };
}

function getTodayNumberMondayBased() {
  const day = new Date().getDay();

  if (day === 0) return 7;

  return day;
}

function getRoutineDayNumber(text: string) {
  const normalized = normalizeText(text);

  const dayMatch =
    normalized.match(/dia\s*(\d+)/) ||
    normalized.match(/day\s*(\d+)/) ||
    normalized.match(/\b(\d+)\b/);

  if (dayMatch?.[1]) {
    const number = Number(dayMatch[1]);

    if (number >= 1 && number <= 7) {
      return number;
    }
  }

  if (
    normalized.includes("lunes") ||
    normalized.includes("lun") ||
    normalized.includes("monday") ||
    normalized.includes("mon")
  ) {
    return 1;
  }

  if (
    normalized.includes("martes") ||
    normalized.includes("mar") ||
    normalized.includes("tuesday") ||
    normalized.includes("tue")
  ) {
    return 2;
  }

  if (
    normalized.includes("miercoles") ||
    normalized.includes("mie") ||
    normalized.includes("wednesday") ||
    normalized.includes("wed")
  ) {
    return 3;
  }

  if (
    normalized.includes("jueves") ||
    normalized.includes("jue") ||
    normalized.includes("thursday") ||
    normalized.includes("thu")
  ) {
    return 4;
  }

  if (
    normalized.includes("viernes") ||
    normalized.includes("vie") ||
    normalized.includes("friday") ||
    normalized.includes("fri")
  ) {
    return 5;
  }

  if (
    normalized.includes("sabado") ||
    normalized.includes("sab") ||
    normalized.includes("saturday") ||
    normalized.includes("sat")
  ) {
    return 6;
  }

  if (
    normalized.includes("domingo") ||
    normalized.includes("dom") ||
    normalized.includes("sunday") ||
    normalized.includes("sun")
  ) {
    return 7;
  }

  return null;
}

function getLatestCheckup(checkups: any[]) {
  if (!Array.isArray(checkups) || checkups.length === 0) return null;

  return checkups[checkups.length - 1];
}

function getNextCheckInLabel(studentData: any, checkups: any[]) {
  const rawNextCheckIn = getFirstValid([
    studentData.nextCheckIn,
    studentData.nextCheckInDate,
    studentData.current?.nextCheckIn,
    studentData.current?.nextCheckInDate,
    studentData.checkin?.nextDate,
    studentData.checkIn?.nextDate,
  ]);

  const nextDate = getDateFromAny(rawNextCheckIn);

  if (nextDate) {
    return nextDate.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
    });
  }

  const latestCheckup = getLatestCheckup(checkups);
  const latestDate = getDateFromAny(
    latestCheckup?.date || latestCheckup?.createdAt
  );

  if (!latestDate) return "Por definir";

  const suggested = new Date(latestDate);
  suggested.setDate(suggested.getDate() + 14);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (suggested < today) return "Por definir";

  return suggested.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });
}

function getFirstValid(values: any[]) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== ""
  );
}

function formatCleanValue(value: any) {
  if (value === undefined || value === null || value === "") return "--";

  return String(value).replace("kg", "").trim();
}

function getDateMs(value: any) {
  const date = getDateFromAny(value);

  if (!date) return 0;

  return date.getTime();
}

function getDateFromAny(value: any): Date | null {
  if (!value) return null;

  if (value?.toDate) {
    const date = value.toDate();
    return Number.isFinite(date.getTime()) ? date : null;
  }

  if (value?.seconds) {
    const date = new Date(value.seconds * 1000);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "string") {
    const clean = value.trim();

    if (!clean) return null;

    const date = /^\d{4}-\d{2}-\d{2}$/.test(clean)
      ? new Date(`${clean}T00:00:00`)
      : new Date(clean);

    return Number.isFinite(date.getTime()) ? date : null;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  if (value?.date) {
    const date = new Date(value.date);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  if (value?.createdAt) {
    return getDateFromAny(value.createdAt);
  }

  return null;
}

function formatRelativeTime(ms: number) {
  if (!ms) return "Sin fecha";

  const now = Date.now();
  const diff = Math.max(now - ms, 0);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < hour) return "Hace unos minutos";

  if (diff < day) {
    const hours = Math.max(Math.floor(diff / hour), 1);
    return hours === 1 ? "Hace 1 hora" : `Hace ${hours} horas`;
  }

  const days = Math.max(Math.floor(diff / day), 1);

  if (days === 1) return "Ayer";
  if (days < 30) return `Hace ${days} días`;

  const months = Math.floor(days / 30);

  return months === 1 ? "Hace 1 mes" : `Hace ${months} meses`;
}

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050505",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  headerTextBox: {
    flex: 1,
    paddingRight: 12,
  },

  greeting: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  week: {
    color: "#9ca3af",
    fontSize: 13,
    marginTop: 5,
    fontWeight: "600",
  },

  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  adminButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#141414",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },

  adminText: {
    fontSize: 16,
  },

  bell: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#141414",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },

  bellUnread: {
    backgroundColor: "rgba(250, 204, 21, 0.18)",
    borderColor: "rgba(250, 204, 21, 0.55)",
  },

  bellPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },

  bellIcon: {
    fontSize: 17,
  },

  dot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    backgroundColor: "#ef4444",
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#141414",
  },

  heroCard: {
    height: 178,
    borderRadius: 24,
    backgroundColor: "#151515",
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#242424",
  },

  heroGlow: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: "rgba(250, 204, 21, 0.16)",
    left: -55,
    top: -70,
  },

  heroContent: {
    flex: 1,
    flexDirection: "row",
  },

  heroInfo: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: "space-between",
    zIndex: 2,
  },

  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(250, 204, 21, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(250, 204, 21, 0.35)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },

  heroBadgeText: {
    color: "#facc15",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },

  heroTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.2,
    lineHeight: 24,
  },

  heroSub: {
    color: "#b5b5b5",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  button: {
    backgroundColor: "#facc15",
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 13,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },

  buttonDisabled: {
    backgroundColor: "#2a2a2a",
  },

  buttonText: {
    color: "#050505",
    fontSize: 12,
    fontWeight: "900",
  },

  buttonDisabledText: {
    color: "#8a8a8a",
  },

  buttonArrow: {
    color: "#050505",
    fontSize: 14,
    fontWeight: "900",
  },

  heroImage: {
    width: 136,
    height: "100%",
  },

  imageOverlay: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 136,
    backgroundColor: "rgba(0,0,0,0.18)",
  },

  sectionHeader: {
    marginBottom: 9,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  sectionSubtitle: {
    color: "#8a8a8a",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    marginBottom: 12,
  },

  card: {
    width: "48.5%",
    minHeight: 94,
    backgroundColor: "#141414",
    borderRadius: 17,
    padding: 11,
    borderWidth: 1,
    borderColor: "#242424",
    overflow: "hidden",
  },

  cardWide: {
    width: "100%",
    minHeight: 104,
  },

  cardHighlight: {
    backgroundColor: "#facc15",
    borderColor: "#facc15",
    shadowColor: "#facc15",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },

  cardPressable: {
    borderColor: "#333333",
  },

  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },

  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 7,
  },

  cardTitle: {
    color: "#a3a3a3",
    fontSize: 10,
    fontWeight: "700",
    flex: 1,
  },

  cardTitleHighlight: {
    color: "#4a3500",
  },

  cardIconBox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: "#1f1f1f",
    alignItems: "center",
    justifyContent: "center",
  },

  cardIconBoxHighlight: {
    backgroundColor: "rgba(0, 0, 0, 0.12)",
  },

  icon: {
    fontSize: 14,
  },

  cardContent: {
    marginTop: 10,
  },

  valueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },

  cardValue: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 2,
    maxWidth: 96,
  },

  cardValueWide: {
    maxWidth: 260,
  },

  cardValueHighlight: {
    color: "#050505",
  },

  unit: {
    color: "#9ca3af",
    fontSize: 10,
    marginLeft: 4,
    marginBottom: 4,
    fontWeight: "700",
  },

  unitHighlight: {
    color: "#4a3500",
  },

  sub: {
    color: "#6b7280",
    fontSize: 10,
    marginTop: 3,
    fontWeight: "600",
  },

  subWide: {
    maxWidth: 260,
  },

  subHighlight: {
    color: "#4a3500",
  },

  newActivityBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "#050505",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  newActivityBadgeText: {
    color: "#facc15",
    fontSize: 9,
    fontWeight: "900",
  },

  motivationCard: {
    backgroundColor: "#141414",
    borderRadius: 20,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#242424",
    flexDirection: "row",
    gap: 12,
  },

  motivationIconBox: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(250, 204, 21, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(250, 204, 21, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },

  motivationIcon: {
    fontSize: 18,
  },

  motivationContent: {
    flex: 1,
  },

  motivationLabel: {
    color: "#facc15",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 5,
  },

  motivationText: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },

  progress: {
    backgroundColor: "#141414",
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: "#242424",
  },

  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  progressTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  progressSubtitle: {
    color: "#8a8a8a",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
  },

  progressPercentBox: {
    backgroundColor: "#facc15",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  progressPercent: {
    color: "#050505",
    fontSize: 12,
    fontWeight: "900",
  },

  progressBar: {
    height: 8,
    backgroundColor: "#262626",
    borderRadius: 999,
    marginTop: 14,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    backgroundColor: "#facc15",
    borderRadius: 999,
  },

  progressStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: "#101010",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#242424",
    paddingVertical: 12,
  },

  progressStatItem: {
    flex: 1,
    alignItems: "center",
  },

  progressStatValue: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },

  progressStatLabel: {
    color: "#8a8a8a",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },

  progressStatDivider: {
    width: 1,
    height: 34,
    backgroundColor: "#242424",
  },

  progressHint: {
    color: "#8a8a8a",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    marginTop: 10,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  coachModal: {
    width: "100%",
    backgroundColor: "#111111",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 20,
    alignItems: "center",
  },

  modalIconBox: {
    width: 58,
    height: 58,
    borderRadius: 99,
    backgroundColor: "#facc15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  modalIcon: {
    fontSize: 26,
  },

  modalTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },

  modalSubtitle: {
    color: "#a3a3a3",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 16,
  },

  modalInfoCard: {
    width: "100%",
    backgroundColor: "#0b0b0b",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#242424",
    padding: 14,
  },

  modalInfoRow: {
    gap: 5,
  },

  modalInfoLabel: {
    color: "#8a8a8a",
    fontSize: 11,
    fontWeight: "800",
  },

  modalInfoValue: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },

  modalDivider: {
    height: 1,
    backgroundColor: "#242424",
    marginVertical: 12,
  },

  modalButton: {
    width: "100%",
    backgroundColor: "#facc15",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },

  modalButtonText: {
    color: "#050505",
    fontSize: 13,
    fontWeight: "900",
  },
});