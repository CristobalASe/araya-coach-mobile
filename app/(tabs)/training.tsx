import { useCallback, useEffect, useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

type ExerciseType = {
  exerciseId?: string;
  id?: string;
  name: string;
  sets: string;
  image?: string;
  imageUrl?: string;
  photoUrl?: string;
  thumbnailUrl?: string;
  muscleGroup?: string;
  equipment?: string;
  description?: string;
  tips?: string[];
};

type RoutineDay = {
  key: string;
  day: string;
  label?: string;
  title?: string;
  exercises: ExerciseType[];
};

type Routine = {
  name: string;
  days: RoutineDay[];
};

const defaultExerciseImage =
  "https://images.unsplash.com/photo-1534367610401-9f5ed68180aa?q=80&w=800";

function cleanMediaUrl(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim();
}

function getExerciseDocumentId(exercise: ExerciseType) {
  return cleanMediaUrl(exercise.exerciseId || exercise.id || "");
}

function getExerciseImage(exercise?: Partial<ExerciseType> | null) {
  if (!exercise) return "";

  return (
    cleanMediaUrl(exercise.image) ||
    cleanMediaUrl(exercise.imageUrl) ||
    cleanMediaUrl(exercise.photoUrl) ||
    cleanMediaUrl(exercise.thumbnailUrl)
  );
}

function normalizeExerciseWithMedia(exercise: ExerciseType): ExerciseType {
  return {
    ...exercise,
    image: getExerciseImage(exercise),
  };
}

async function enrichRoutineDaysWithExerciseDetails(
  days: RoutineDay[]
): Promise<RoutineDay[]> {
  const exerciseCache = new Map<string, any>();

  async function getExerciseDetails(exerciseId: string) {
    if (!exerciseId) return {};

    if (exerciseCache.has(exerciseId)) {
      return exerciseCache.get(exerciseId);
    }

    try {
      const exerciseRef = doc(db, "exercises", exerciseId);
      const exerciseSnap = await getDoc(exerciseRef);

      const data = exerciseSnap.exists() ? exerciseSnap.data() : {};

      exerciseCache.set(exerciseId, data);

      return data;
    } catch (error) {
      console.log("Error cargando detalle de ejercicio:", error);
      exerciseCache.set(exerciseId, {});

      return {};
    }
  }

  return Promise.all(
    days.map(async (day) => {
      const exercises = await Promise.all(
        day.exercises.map(async (exercise) => {
          const exerciseId = getExerciseDocumentId(exercise);
          const exerciseDetails = await getExerciseDetails(exerciseId);

          const mergedExercise = {
            ...exerciseDetails,
            ...exercise,
          } as ExerciseType;

          return normalizeExerciseWithMedia(mergedExercise);
        })
      );

      return {
        ...day,
        exercises,
      };
    })
  );
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

function getExerciseSafeId(exercise: ExerciseType) {
  return (
    getExerciseDocumentId(exercise) ||
    exercise.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  );
}

function normalizeRoutineDays(days: any[]): RoutineDay[] {
  if (!Array.isArray(days)) return [];

  return days.map((item, index) => {
    const fallbackKey = `day${index + 1}`;
    const fallbackDay = `Día ${index + 1}`;

    return {
      key: item?.key || fallbackKey,
      day: item?.day || fallbackDay,
      label: item?.label || item?.title || "Rutina",
      title: item?.title || "",
      exercises: Array.isArray(item?.exercises) ? item.exercises : [],
    };
  });
}

function getVisibleRoutineDays(days: RoutineDay[]) {
  const daysWithExercises = days.filter(
    (day) => Array.isArray(day.exercises) && day.exercises.length > 0
  );

  return daysWithExercises.length > 0 ? daysWithExercises : days;
}

export default function TrainingScreen() {
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [activeDay, setActiveDay] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] =
    useState<ExerciseType | null>(null);
  const [completedExerciseIds, setCompletedExerciseIds] = useState<string[]>(
    []
  );

  useEffect(() => {
    fetchRoutine();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCompletedExercisesThisWeek();
    }, [])
  );

  async function fetchRoutine() {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const ref = doc(db, "students", user.uid, "training", "current");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data() as Routine;
        const routineDays = normalizeRoutineDays(data.days || []);
        const enrichedRoutineDays = await enrichRoutineDaysWithExerciseDetails(
          routineDays
        );
        const visibleDays = getVisibleRoutineDays(enrichedRoutineDays);

        setRoutine({
          name: data.name || "Rutina",
          days: enrichedRoutineDays,
        });

        if (visibleDays.length > 0) {
          setActiveDay(visibleDays[0].key);
        }
      }

      await loadCompletedExercisesThisWeek();
    } catch (error) {
      console.log("Error cargando rutina:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCompletedExercisesThisWeek() {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const completedIds = new Set<string>();
      const weekDays = getWeekDaysIds();

      for (const dayId of weekDays) {
        const exercisesRef = collection(
          db,
          "students",
          user.uid,
          "trainingLogs",
          dayId,
          "exercises"
        );

        const snap = await getDocs(exercisesRef);

        snap.forEach((exerciseDoc) => {
          const data = exerciseDoc.data();

          completedIds.add(data.exerciseId || exerciseDoc.id);
        });
      }

      setCompletedExerciseIds(Array.from(completedIds));
    } catch (error) {
      console.log("Error cargando ejercicios completados:", error);
    }
  }

  async function loadExerciseDetails(exercise: ExerciseType) {
    try {
      const exerciseId = getExerciseDocumentId(exercise);

      if (!exerciseId) {
        setSelectedExercise(normalizeExerciseWithMedia(exercise));
        return;
      }

      const ref = doc(db, "exercises", exerciseId);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const mergedExercise = {
          ...snap.data(),
          ...exercise,
          name: exercise.name,
          sets: exercise.sets,
        } as ExerciseType;

        setSelectedExercise(normalizeExerciseWithMedia(mergedExercise));
      } else {
        setSelectedExercise(normalizeExerciseWithMedia(exercise));
      }
    } catch (error) {
      console.log("Error cargando ejercicio:", error);
      setSelectedExercise(normalizeExerciseWithMedia(exercise));
    }
  }

  const visibleRoutineDays = routine ? getVisibleRoutineDays(routine.days) : [];
  const selectedDay = routine?.days.find((day) => day.key === activeDay);
  const selectedRoutine = selectedDay?.exercises || [];

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>Cargando rutina...</Text>
        </View>
      </View>
    );
  }

  if (!routine || routine.days.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={styles.loadingBox}>
          <Text style={styles.title}>Entrenamiento</Text>
          <Text style={styles.subtitle}>Sin rutina asignada</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Entrenamiento</Text>
        <Text style={styles.subtitle}>Información Rutina</Text>

        <View style={styles.week}>
          {visibleRoutineDays.map((item) => (
            <Pressable
              key={item.key}
              style={[
                styles.dayBox,
                activeDay === item.key && styles.dayBoxActive,
              ]}
              onPress={() => setActiveDay(item.key)}
            >
              <Text
                style={[
                  styles.dayText,
                  activeDay === item.key && styles.activeText,
                ]}
              >
                {item.day}
              </Text>

              <Text
                style={[
                  styles.dayLabel,
                  activeDay === item.key && styles.activeText,
                ]}
                numberOfLines={1}
              >
                {item.label || item.title || "Rutina"}
              </Text>
            </Pressable>
          ))}
        </View>

        {selectedDay?.title && (
          <Text style={styles.dayTitle}>{selectedDay.title}</Text>
        )}

        <View style={styles.card}>
          {selectedRoutine.length > 0 ? (
            selectedRoutine.map((exercise, index) => {
              const exerciseSafeId = getExerciseSafeId(exercise);
              const isCompleted =
                completedExerciseIds.includes(exerciseSafeId);

              return (
                <Exercise
                  key={`${exercise.name}-${index}`}
                  number={index + 1}
                  exercise={exercise}
                  isCompleted={isCompleted}
                  onPress={() => loadExerciseDetails(exercise)}
                />
              );
            })
          ) : (
            <EmptyState
              title="Día de descanso"
              text="Hoy toca recuperar energía."
            />
          )}
        </View>
      </ScrollView>

      <ExerciseModal
        exercise={selectedExercise}
        activeDay={activeDay}
        dayTitle={selectedDay?.title || ""}
        routineName={routine.name}
        completedExerciseIds={completedExerciseIds}
        onClose={() => setSelectedExercise(null)}
      />
    </View>
  );
}

function Exercise({
  number,
  exercise,
  isCompleted,
  onPress,
}: {
  number: number;
  exercise: ExerciseType;
  isCompleted: boolean;
  onPress: () => void;
}) {
  const exerciseImage = getExerciseImage(exercise);

  return (
    <Pressable
      style={[styles.exercise, isCompleted && styles.exerciseCompleted]}
      onPress={onPress}
    >
      <View style={styles.numberBox}>
        {isCompleted ? (
          <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
        ) : (
          <Text style={styles.number}>{number}</Text>
        )}
      </View>

      <View style={styles.exerciseInfo}>
        <View style={styles.exerciseTitleRow}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>

          {isCompleted && (
            <View style={styles.completedBadge}>
              <Text style={styles.completedBadgeText}>LISTO</Text>
            </View>
          )}
        </View>

        <Text style={styles.exerciseMeta}>{exercise.sets}</Text>
      </View>

      {exerciseImage ? (
        <Image
          source={{ uri: exerciseImage }}
          style={[
            styles.exerciseImage,
            isCompleted && styles.exerciseImageCompleted,
          ]}
        />
      ) : (
        <View
          style={[
            styles.exerciseImage,
            isCompleted && styles.exerciseImageCompleted,
          ]}
        >
          <Ionicons name="image-outline" size={22} color="#555" />
        </View>
      )}
    </Pressable>
  );
}

function ExerciseModal({
  exercise,
  activeDay,
  dayTitle,
  routineName,
  completedExerciseIds,
  onClose,
}: {
  exercise: ExerciseType | null;
  activeDay: string;
  dayTitle: string;
  routineName: string;
  completedExerciseIds: string[];
  onClose: () => void;
}) {
  if (!exercise) return null;

  const exerciseSafeId = getExerciseSafeId(exercise);
  const isCompleted = completedExerciseIds.includes(exerciseSafeId);
  const exerciseImage = getExerciseImage(exercise) || defaultExerciseImage;

  return (
    <Modal visible={!!exercise} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{exercise.name}</Text>

            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#ffffff" />
            </Pressable>
          </View>

          {isCompleted && (
            <View style={styles.modalDoneBox}>
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
              <Text style={styles.modalDoneText}>
                Este ejercicio ya está registrado esta semana
              </Text>
            </View>
          )}

          <View style={styles.exerciseMediaBox}>
            <Image source={{ uri: exerciseImage }} style={styles.exerciseMediaImage} />
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Grupo muscular</Text>
            <Text style={styles.infoValue}>
              {exercise.muscleGroup || "Por definir"}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Series</Text>
            <Text style={styles.infoValue}>{exercise.sets}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Equipo</Text>
            <Text style={styles.infoValue}>
              {exercise.equipment || "Por definir"}
            </Text>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Descripción</Text>
            <Text style={styles.description}>
              {exercise.description ||
                "El coach aún no ha agregado una descripción para este ejercicio."}
            </Text>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Consejos</Text>

            {(exercise.tips || [
              "Mantén una técnica controlada.",
              "Evita movimientos bruscos.",
              "Respeta el rango de repeticiones indicado.",
            ]).map((tip, index) => (
              <Text key={index} style={styles.tip}>
                • {tip}
              </Text>
            ))}
          </View>

          <Pressable
            style={[
              styles.completeButton,
              isCompleted && styles.completeButtonDone,
            ]}
            onPress={() => {
              onClose();

              router.push({
                pathname: "/training/register-series",
                params: {
                  exerciseId: getExerciseDocumentId(exercise),
                  name: exercise.name,
                  sets: exercise.sets,
                  muscleGroup: exercise.muscleGroup || "",
                  equipment: exercise.equipment || "",
                  activeDay,
                  dayTitle,
                  routineName,
                },
              });
            }}
          >
            <Ionicons
              name={isCompleted ? "eye-outline" : "barbell-outline"}
              size={18}
              color="#050505"
            />

            <Text style={styles.completeText}>
              {isCompleted ? "Ver registro" : "Registrar rutina"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#050505" },

  container: {
    padding: 16,
    paddingTop: 1,
    paddingBottom: 120,
  },

  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    color: "#ffffff",
    fontWeight: "700",
  },

  title: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.3,
  },

  subtitle: {
    color: "#a3a3a3",
    textAlign: "center",
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
  },

  week: {
    flexDirection: "row",
    backgroundColor: "#0d0d0d",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#191919",
    marginTop: 22,
    marginBottom: 10,
    overflow: "hidden",
  },

  dayBox: {
    flex: 1,
    minHeight: 54,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#191919",
  },

  dayBoxActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#facc15",
  },

  dayText: {
    color: "#8a8a8a",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },

  dayLabel: {
    color: "#8a8a8a",
    fontSize: 10,
    marginTop: 4,
    fontWeight: "900",
    maxWidth: 80,
    lineHeight: 12,
    textAlign: "center",
  },

  activeText: {
    color: "#facc15",
  },

  dayTitle: {
    color: "#facc15",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8,
    textTransform: "uppercase",
  },

  card: {
    backgroundColor: "#111111",
    borderRadius: 22,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    overflow: "hidden",
  },

  exercise: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
  },

  exerciseCompleted: {
    backgroundColor: "#0f1a12",
  },

  numberBox: {
    width: 28,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  number: {
    color: "#facc15",
    fontSize: 16,
    fontWeight: "900",
  },

  exerciseInfo: {
    flex: 1,
    paddingRight: 10,
  },

  exerciseTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  exerciseName: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    flex: 1,
  },

  exerciseMeta: {
    color: "#9a9a9a",
    fontSize: 11,
    marginTop: 5,
    fontWeight: "600",
  },

  completedBadge: {
    backgroundColor: "#22c55e",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },

  completedBadgeText: {
    color: "#050505",
    fontSize: 9,
    fontWeight: "900",
  },

  exerciseImage: {
    width: 60,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#1f1f1f",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },

  exerciseImageCompleted: {
    opacity: 0.65,
    borderColor: "#22c55e",
  },

  empty: {
    padding: 28,
    alignItems: "center",
  },

  emptyTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },

  emptyText: {
    color: "#9a9a9a",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "center",
    padding: 16,
  },

  modalCard: {
    backgroundColor: "#0b0b0b",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 14,
    maxHeight: "88%",
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  modalTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    flex: 1,
    paddingRight: 12,
  },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 99,
    backgroundColor: "#1f1f1f",
    alignItems: "center",
    justifyContent: "center",
  },

  modalDoneBox: {
    backgroundColor: "#0f1a12",
    borderColor: "#22c55e",
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  modalDoneText: {
    color: "#22c55e",
    fontSize: 12,
    fontWeight: "900",
    flex: 1,
  },

  exerciseMediaBox: {
    height: 160,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#171717",
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  exerciseMediaImage: {
    width: "100%",
    height: "100%",
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
    paddingVertical: 12,
  },

  infoLabel: {
    color: "#a3a3a3",
    fontSize: 12,
    fontWeight: "700",
  },

  infoValue: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
    maxWidth: "55%",
  },

  sectionBlock: {
    marginTop: 12,
  },

  sectionTitle: {
    color: "#facc15",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6,
  },

  description: {
    color: "#d4d4d4",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },

  tip: {
    color: "#d4d4d4",
    fontSize: 12,
    lineHeight: 18,
  },

  completeButton: {
    backgroundColor: "#facc15",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    flexDirection: "row",
    gap: 8,
  },

  completeButtonDone: {
    backgroundColor: "#22c55e",
  },

  completeText: {
    color: "#050505",
    fontWeight: "900",
    fontSize: 13,
  },
});