import { useEffect, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import {
  Image,
  Modal,
  ScrollView,
  Text,
  View,
  StyleSheet,
  Pressable,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import Svg, {
  Circle,
  Polyline,
  Text as SvgText,
} from "react-native-svg";
import { auth, db } from "../../firebaseConfig";
import { signOut } from "firebase/auth";
import { router } from "expo-router";

type PhotoPose = "front" | "side" | "back";

type PhotoCarouselState = {
  pose: PhotoPose;
  index: number;
};

type PhotoHistoryItem = {
  id: string;
  image: string;
  dateLabel: string;
  weight?: any;
  bodyFat?: any;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const CAROUSEL_SLIDE_WIDTH = SCREEN_WIDTH - 28;

export default function StudentScreen() {
  const [tab, setTab] = useState("anamnesis");
  const [student, setStudent] = useState<any>(null);
  const [checkups, setCheckups] = useState<any[]>([]);
  const [photoCarousel, setPhotoCarousel] =
    useState<PhotoCarouselState | null>(null);
  const [logoutModal, setLogoutModal] = useState(false);

  const carouselScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    fetchStudent();
  }, []);

  async function fetchStudent() {
    const user = auth.currentUser;
    if (!user) return;

    const ref = doc(db, "students", user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) return;

    const studentData = {
      id: snap.id,
      ...snap.data(),
    };

    const allCheckups = await fetchCheckups(user.uid);
    const latestCheckup = allCheckups[0] || null;
    const mergedStudent = mergeStudentWithLatestCheckup(
      studentData,
      latestCheckup
    );

    setCheckups(allCheckups);
    setStudent(mergedStudent);
  }

  async function fetchCheckups(studentId: string) {
    try {
      const checkupsRef = collection(db, "students", studentId, "checkups");
      const snap = await getDocs(checkupsRef);

      if (snap.empty) return [];

      const data = snap.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      })) as any[];

      data.sort((a, b) => {
        const dateA = getComparableDate(a);
        const dateB = getComparableDate(b);

        return dateB - dateA;
      });

      return data;
    } catch (error) {
      console.log("Error cargando checkups:", error);
      return [];
    }
  }

  if (!student) {
    return (
      <View style={styles.loading}>
        <Text style={{ color: "#fff" }}>Cargando...</Text>
      </View>
    );
  }

  const a = student.anamnesis || {};
  const current = student.current || {};

  const birthDate = a.birthDate;
  const sex = a.sex || "male";
  const age = getAge(birthDate);

  const m = current.measurements || {};
  const photos = current.photos || {};
  const skinfolds = current.skinfolds || {};
  const latestObservations = getLatestObservations({
    checkups,
    current,
    anamnesis: a,
  });

  const calculatedBodyFat = calculateBodyFat({
    age,
    sex,
    skinfolds,
  });

  const bodyFat =
    calculatedBodyFat > 0
      ? calculatedBodyFat
      : toNumber(current.bodyFat) > 0
      ? Number(toNumber(current.bodyFat).toFixed(2))
      : 0;

  const weight = current.weight || a.initialWeight || "-";

  const frontHistory = getPhotoHistoryForPose(checkups, current, "front");
  const sideHistory = getPhotoHistoryForPose(checkups, current, "side");
  const backHistory = getPhotoHistoryForPose(checkups, current, "back");

  const carouselItems = photoCarousel
    ? getPhotoHistoryForPose(checkups, current, photoCarousel.pose)
    : [];

  const activeCarouselItem =
    photoCarousel && carouselItems.length > 0
      ? carouselItems[photoCarousel.index]
      : null;

  function handlePhotoPress(pose: PhotoPose) {
    const history = getPhotoHistoryForPose(checkups, current, pose);

    if (history.length === 0) return;

    setPhotoCarousel({
      pose,
      index: 0,
    });

    setTimeout(() => {
      carouselScrollRef.current?.scrollTo({
        x: 0,
        animated: false,
      });
    }, 50);
  }

  function closePhotoCarousel() {
    setPhotoCarousel(null);
  }

  function goToCarouselIndex(nextIndex: number) {
    if (!photoCarousel) return;

    const history = getPhotoHistoryForPose(
      checkups,
      current,
      photoCarousel.pose
    );

    if (history.length === 0) return;

    const safeIndex = Math.min(Math.max(nextIndex, 0), history.length - 1);

    setPhotoCarousel({
      ...photoCarousel,
      index: safeIndex,
    });

    carouselScrollRef.current?.scrollTo({
      x: safeIndex * CAROUSEL_SLIDE_WIDTH,
      animated: true,
    });
  }

  function handleCarouselScrollEnd(
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) {
    if (!photoCarousel) return;

    const offsetX = event.nativeEvent.contentOffset.x;
    const nextIndex = Math.round(offsetX / CAROUSEL_SLIDE_WIDTH);

    if (nextIndex === photoCarousel.index) return;

    setPhotoCarousel({
      ...photoCarousel,
      index: nextIndex,
    });
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="never"
      >
        <View style={styles.header}>
          <Text style={styles.title}>
            {tab === "medidas"
              ? "Medidas antropométricas"
              : tab === "grasa"
              ? "Porcentaje de grasa"
              : tab === "fotos"
              ? "Fotos actuales"
              : "Alumno"}
          </Text>

          <Text style={styles.subtitle}>Información del alumno</Text>
        </View>

        <View style={styles.tabs}>
          <Tab
            label="Anamnesis"
            active={tab === "anamnesis"}
            onPress={() => setTab("anamnesis")}
          />

          <Tab
            label="Fotos"
            active={tab === "fotos"}
            onPress={() => setTab("fotos")}
          />

          <Tab
            label="Medidas"
            active={tab === "medidas"}
            onPress={() => setTab("medidas")}
          />

          <Tab
            label="% Grasa"
            active={tab === "grasa"}
            onPress={() => setTab("grasa")}
          />
        </View>

        {tab === "anamnesis" && (
          <>
            <View style={styles.anamnesisCard}>
              <Text style={styles.anamnesisSection}>INFORMACIÓN GENERAL</Text>

              <AnamnesisRow label="Edad" value={age ? `${age} años` : "-"} />

              <AnamnesisRow
                label="Sexo"
                value={sex === "female" ? "Mujer" : "Hombre"}
              />

              <AnamnesisRow label="Altura" value={formatUnit(a.height, "cm")} />

              <AnamnesisRow
                label="Peso actual"
                value={formatUnit(weight, "kg")}
              />

              <AnamnesisRow label="Objetivo" value={a.goal} />

              <AnamnesisRow
                label="Nivel de entrenamiento"
                value={a.trainingLevel}
              />

              <AnamnesisRow label="Lesiones / Patologías" value={a.injuries} />

              <AnamnesisRow label="Medicamentos" value={a.medications} />

              <AnamnesisRow label="Sueño (h/día)" value={a.sleep} />

              <AnamnesisRow label="Estrés" value={a.stress} />

              <AnamnesisRow label="Trabajo" value={a.work} />

              <AnamnesisRow label="Observaciones" value={latestObservations} highlight />
            </View>

            <Pressable
              style={styles.logoutButton}
              onPress={() => setLogoutModal(true)}
            >
              <Ionicons name="log-out-outline" size={18} color="#050505" />
              <Text style={styles.logoutText}>Cerrar sesión</Text>
            </Pressable>
          </>
        )}

        {tab === "fotos" && (
          <View style={styles.card}>
            <Photo
              title="Frente"
              image={photos.front}
              count={frontHistory.length}
              onPress={() => handlePhotoPress("front")}
            />

            <Photo
              title="Lado"
              image={photos.side}
              count={sideHistory.length}
              onPress={() => handlePhotoPress("side")}
            />

            <Photo
              title="Espalda"
              image={photos.back}
              count={backHistory.length}
              onPress={() => handlePhotoPress("back")}
            />
          </View>
        )}

        {tab === "medidas" && (
          <View style={styles.measureCard}>
            <Measure
              icon="ellipse-outline"
              label="Cuello"
              value={formatCm(m.neck)}
            />

            <Measure
              icon="body-outline"
              label="Hombros"
              value={formatCm(m.shoulders)}
            />

            <Measure
              icon="fitness-outline"
              label="Pecho"
              value={formatCm(m.chest)}
            />

            <Measure
              icon="accessibility-outline"
              label="Brazo (relajado)"
              value={formatCm(m.arm)}
            />

            <Measure
              icon="resize-outline"
              label="Cintura"
              value={formatCm(m.waist)}
            />

            <Measure
              icon="walk-outline"
              label="Cadera"
              value={formatCm(m.hip)}
            />

            <Measure
              icon="footsteps-outline"
              label="Muslo"
              value={formatCm(m.thigh)}
            />

            <Measure
              icon="pin-outline"
              label="Pantorrilla"
              value={formatCm(m.calf)}
            />
          </View>
        )}

        {tab === "grasa" && (
          <View style={styles.fatCard}>
            <View style={styles.fatTop}>
              <DonutChart value={bodyFat} />

              <View style={styles.fatInfo}>
                <Text style={styles.fatNumber}>{formatPercent(bodyFat)}%</Text>
                <Text style={styles.fatLabel}>Grasa corporal</Text>
                <Text style={styles.fatMethod}>
                  Durnin/Womersley · Behnke
                </Text>
              </View>
            </View>

            <CompositionRow
              icon="body-outline"
              label="Bíceps"
              value={formatMm(skinfolds.biceps)}
            />

            <CompositionRow
              icon="accessibility-outline"
              label="Tríceps"
              value={formatMm(skinfolds.triceps)}
            />

            <CompositionRow
              icon="body-outline"
              label="Subescapular"
              value={formatMm(skinfolds.subscapular)}
            />

            <CompositionRow
              icon="resize-outline"
              label="Suprailiaco"
              value={formatMm(skinfolds.suprailiac)}
            />
          </View>
        )}
      </ScrollView>

      <Modal visible={!!photoCarousel} transparent animationType="fade">
        <View style={styles.carouselOverlay}>
          <View style={styles.carouselHeader}>
            <Pressable
              style={styles.carouselCloseButton}
              onPress={closePhotoCarousel}
            >
              <Ionicons name="close" size={24} color="#ffffff" />
            </Pressable>

            <View style={styles.carouselHeaderText}>
              <Text style={styles.carouselTitle}>
                {photoCarousel
                  ? getPhotoPoseTitle(photoCarousel.pose)
                  : "Fotos"}
              </Text>

              <Text style={styles.carouselSubtitle}>
                {activeCarouselItem?.dateLabel || "-"} ·{" "}
                {carouselItems.length}{" "}
                {carouselItems.length === 1 ? "foto" : "fotos"}
              </Text>
            </View>

            <View style={styles.carouselHeaderSpacer} />
          </View>

          {activeCarouselItem && (
            <>
              <View style={styles.carouselStage}>
                <ScrollView
                  ref={carouselScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  bounces={false}
                  overScrollMode="never"
                  onMomentumScrollEnd={handleCarouselScrollEnd}
                >
                  {carouselItems.map((item) => (
                    <View
                      key={item.id}
                      style={[
                        styles.carouselSlide,
                        { width: CAROUSEL_SLIDE_WIDTH },
                      ]}
                    >
                      <Image
                        source={{ uri: item.image }}
                        style={styles.carouselImage}
                        resizeMode="contain"
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.carouselFooter}>
                <View style={styles.carouselInfoTop}>
                  <View>
                    <Text style={styles.carouselInfoDate}>
                      {activeCarouselItem.dateLabel}
                    </Text>

                    <Text style={styles.carouselInfoSubtitle}>
                      Registro {(photoCarousel?.index || 0) + 1} de{" "}
                      {carouselItems.length}
                    </Text>
                  </View>

                  <View style={styles.carouselDots}>
                    {carouselItems.map((item, index) => (
                      <Pressable
                        key={item.id}
                        style={[
                          styles.carouselDot,
                          index === photoCarousel?.index &&
                            styles.carouselDotActive,
                        ]}
                        onPress={() => goToCarouselIndex(index)}
                      />
                    ))}
                  </View>
                </View>

                <View style={styles.carouselInfoMeta}>
                  <View style={styles.carouselMetaPill}>
                    <Text style={styles.carouselMetaLabel}>Peso</Text>
                    <Text style={styles.carouselMetaValue}>
                      {formatUnit(activeCarouselItem.weight, "kg")}
                    </Text>
                  </View>

                  <View style={styles.carouselMetaPill}>
                    <Text style={styles.carouselMetaLabel}>Grasa</Text>
                    <Text style={styles.carouselMetaValue}>
                      {formatUnit(activeCarouselItem.bodyFat, "%")}
                    </Text>
                  </View>
                </View>

                <View style={styles.carouselControls}>
                  <Pressable
                    style={[
                      styles.carouselControlButton,
                      photoCarousel?.index === 0 &&
                        styles.carouselControlDisabled,
                    ]}
                    disabled={photoCarousel?.index === 0}
                    onPress={() =>
                      goToCarouselIndex((photoCarousel?.index || 0) - 1)
                    }
                  >
                    <Ionicons name="chevron-back" size={20} color="#050505" />
                    <Text style={styles.carouselControlText}>Anterior</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.carouselControlButton,
                      photoCarousel?.index === carouselItems.length - 1 &&
                        styles.carouselControlDisabled,
                    ]}
                    disabled={
                      photoCarousel?.index === carouselItems.length - 1
                    }
                    onPress={() =>
                      goToCarouselIndex((photoCarousel?.index || 0) + 1)
                    }
                  >
                    <Text style={styles.carouselControlText}>Siguiente</Text>
                    <Ionicons name="chevron-forward" size={20} color="#050505" />
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </View>
      </Modal>

      <Modal visible={logoutModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.logoutCard}>
            <View style={styles.logoutIcon}>
              <Ionicons name="log-out-outline" size={32} color="#050505" />
            </View>

            <Text style={styles.logoutTitle}>Cerrar sesión</Text>

            <Text style={styles.logoutMessage}>
              ¿Estás seguro que deseas cerrar tu sesión?
            </Text>

            <View style={styles.logoutActions}>
              <Pressable
                style={styles.logoutCancel}
                onPress={() => setLogoutModal(false)}
              >
                <Text style={styles.logoutCancelText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={styles.logoutConfirm}
                onPress={async () => {
                  setLogoutModal(false);
                  await signOut(auth);
                  router.replace("/login");
                }}
              >
                <Text style={styles.logoutConfirmText}>Salir</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}


function getLatestObservations({
  checkups,
  current,
  anamnesis,
}: {
  checkups: any[];
  current: any;
  anamnesis: any;
}) {
  for (const checkup of checkups) {
    const observation = getObservationValue(checkup);

    if (observation) return observation;
  }

  return (
    getObservationValue(current) ||
    getObservationValue(anamnesis) ||
    ""
  );
}

function getObservationValue(data: any) {
  if (!data) return "";

  const value =
    data.observations ||
    data.observation ||
    data.notes ||
    data.note ||
    data.comments ||
    data.comment ||
    "";

  if (value === undefined || value === null) return "";

  return String(value).trim();
}

function mergeStudentWithLatestCheckup(student: any, latestCheckup: any) {
  if (!latestCheckup) return student;

  const current = student.current || {};
  const checkupMeasurements = latestCheckup.measurements || {};
  const checkupSkinfolds = latestCheckup.skinfolds || {};
  const checkupPhotos = latestCheckup.photos || {};
  const checkupObservations = getObservationValue(latestCheckup);

  return {
    ...student,
    latestCheckup,
    current: {
      ...current,

      weight:
        latestCheckup.weight !== undefined &&
        latestCheckup.weight !== null &&
        latestCheckup.weight !== ""
          ? latestCheckup.weight
          : current.weight,

      bodyFat:
        latestCheckup.bodyFat !== undefined &&
        latestCheckup.bodyFat !== null &&
        latestCheckup.bodyFat !== ""
          ? latestCheckup.bodyFat
          : current.bodyFat,

      observations: checkupObservations || current.observations,

      measurements: {
        ...(current.measurements || {}),
        ...removeEmptyValues(checkupMeasurements),
      },

      skinfolds: {
        ...(current.skinfolds || {}),
        ...removeEmptyValues(checkupSkinfolds),
      },

      photos: {
        ...(current.photos || {}),
        ...removeEmptyValues(checkupPhotos),
      },
    },
  };
}

function getPhotoHistoryForPose(
  checkups: any[],
  current: any,
  pose: PhotoPose
): PhotoHistoryItem[] {
  const checkupItems = [...checkups]
    .sort((a, b) => getComparableDate(b) - getComparableDate(a))
    .filter((checkup) => {
      const image = cleanPhotoUrl(checkup?.photos?.[pose]);

      return Boolean(image);
    })
    .map((checkup) => ({
      id: checkup.id || `${pose}-${getComparableDate(checkup)}`,
      image: cleanPhotoUrl(checkup?.photos?.[pose]) || "",
      dateLabel: formatDateLabel(checkup?.date || checkup?.createdAt),
      weight: checkup?.weight,
      bodyFat: checkup?.bodyFat,
    }));

  if (checkupItems.length > 0) {
    return checkupItems;
  }

  const currentImage = cleanPhotoUrl(current?.photos?.[pose]);

  if (!currentImage) return [];

  return [
    {
      id: `current-${pose}`,
      image: currentImage,
      dateLabel: formatDateLabel(current?.date) || "Actual",
      weight: current?.weight,
      bodyFat: current?.bodyFat,
    },
  ];
}

function cleanPhotoUrl(value: any) {
  if (typeof value !== "string") return "";

  return value.trim();
}

function removeEmptyValues(data: any) {
  const clean: any = {};

  Object.entries(data || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      clean[key] = value;
    }
  });

  return clean;
}

function getComparableDate(checkup: any) {
  if (checkup?.date) {
    const date = new Date(`${checkup.date}T00:00:00`);
    const timestamp = date.getTime();

    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  if (checkup?.createdAt?.toDate) {
    return checkup.createdAt.toDate().getTime();
  }

  if (checkup?.createdAt?.seconds) {
    return checkup.createdAt.seconds * 1000;
  }

  return 0;
}

function formatDateLabel(value: any) {
  if (!value) return "";

  if (typeof value === "string") {
    const clean = value.trim();

    if (!clean) return "";

    const isoDate = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (isoDate) {
      return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
    }

    return clean;
  }

  if (value?.toDate) {
    return value.toDate().toLocaleDateString("es-CL");
  }

  if (value?.seconds) {
    return new Date(value.seconds * 1000).toLocaleDateString("es-CL");
  }

  return "";
}

function getPhotoPoseTitle(pose: PhotoPose) {
  if (pose === "front") return "Fotos de frente";
  if (pose === "side") return "Fotos de lado";
  return "Fotos de espalda";
}

function getAge(birthDate?: string) {
  if (!birthDate) return 0;

  const [year, month, day] = String(birthDate).split("-").map(Number);

  if (!year || !month || !day) return 0;

  const today = new Date();
  let age = today.getFullYear() - year;

  const birthdayAlreadyPassed =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day);

  if (!birthdayAlreadyPassed) {
    age--;
  }

  return age;
}

function toNumber(value: any) {
  if (value === undefined || value === null || value === "") return 0;

  const parsed = Number(String(value).replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateBodyFat({
  age,
  sex,
  skinfolds,
}: {
  age: number;
  sex: string;
  skinfolds: any;
}) {
  const biceps = toNumber(skinfolds.biceps);
  const triceps = toNumber(skinfolds.triceps);
  const subscapular = toNumber(skinfolds.subscapular);
  const suprailiac = toNumber(skinfolds.suprailiac);

  if (!age || !biceps || !triceps || !subscapular || !suprailiac) {
    return 0;
  }

  const sum = biceps + triceps + subscapular + suprailiac;

  if (sum <= 0) return 0;

  const logSum = Math.log10(sum);
  const normalizedSex = String(sex || "").toLowerCase();
  const isFemale =
    normalizedSex === "female" ||
    normalizedSex === "mujer" ||
    normalizedSex === "femenino";

  const density = getDurninWomersleyDensity({
    age,
    isFemale,
    logSum,
  });

  if (!density || !Number.isFinite(density)) return 0;

  const bodyFat = getBodyFatFromDensityBehnke(density);

  if (!Number.isFinite(bodyFat) || bodyFat < 0) return 0;

  return Number(bodyFat.toFixed(2));
}

function getDurninWomersleyDensity({
  age,
  isFemale,
  logSum,
}: {
  age: number;
  isFemale: boolean;
  logSum: number;
}) {
  if (isFemale) {
    if (age < 17) return 1.1369 - 0.0598 * logSum;
    if (age < 20) return 1.1549 - 0.0678 * logSum;
    if (age < 30) return 1.1599 - 0.0717 * logSum;
    if (age < 40) return 1.1423 - 0.0632 * logSum;
    if (age < 50) return 1.1333 - 0.0612 * logSum;

    return 1.1339 - 0.0645 * logSum;
  }

  if (age < 17) return 1.1533 - 0.0643 * logSum;
  if (age < 20) return 1.162 - 0.063 * logSum;
  if (age < 30) return 1.1631 - 0.0632 * logSum;
  if (age < 40) return 1.1422 - 0.0544 * logSum;
  if (age < 50) return 1.162 - 0.07 * logSum;

  return 1.1715 - 0.0779 * logSum;
}

function getBodyFatFromDensityBehnke(density: number) {
  return (5.053 / density - 4.614) * 100;
}

function formatPercent(value: any) {
  const number = toNumber(value);

  if (!number) return "0";

  return number.toFixed(2);
}

function formatUnit(value: any, unit: string) {
  if (value === undefined || value === null || value === "") return "-";
  return `${value} ${unit}`;
}

function formatCm(value: any) {
  if (value === undefined || value === null || value === "") return "-";
  return `${value} cm`;
}

function formatMm(value: any) {
  if (value === undefined || value === null || value === "") return "-";
  return `${value} mm`;
}

function DonutChart({ value }: { value: number }) {
  const radius = 48;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value, 100) / 100;
  const dashOffset = circumference * (1 - progress);

  return (
    <Svg width={130} height={130} viewBox="0 0 130 130">
      <Circle
        cx="65"
        cy="65"
        r={radius}
        stroke="#252525"
        strokeWidth={stroke}
        fill="none"
      />

      <Circle
        cx="65"
        cy="65"
        r={radius}
        stroke="#facc15"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        rotation="-90"
        origin="65,65"
      />
    </Svg>
  );
}

function FatHistoryChart({
  data = [],
}: {
  data?: Array<{ date: string; value: number }>;
}) {
  if (data.length === 0) {
    return (
      <Text style={styles.emptyHistory}>Aún no hay historial registrado.</Text>
    );
  }

  if (data.length === 1) {
    return (
      <View style={styles.singleHistory}>
        <Text style={styles.singleHistoryValue}>{data[0].value}%</Text>
        <Text style={styles.chartText}>{data[0].date}</Text>
      </View>
    );
  }

  const width = 320;
  const height = 150;
  const paddingX = 24;
  const paddingTop = 28;
  const paddingBottom = 28;

  const values = data.map((item) => Number(item.value));
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  function getX(index: number) {
    return paddingX + (index * (width - paddingX * 2)) / (data.length - 1);
  }

  function getY(value: number) {
    return (
      paddingTop +
      ((max - value) / range) * (height - paddingTop - paddingBottom)
    );
  }

  const points = data
    .map((item, index) => `${getX(index)},${getY(Number(item.value))}`)
    .join(" ");

  return (
    <View style={styles.chartWrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Polyline
          points={points}
          fill="none"
          stroke="#facc15"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {data.map((item, index) => {
          const value = Number(item.value);
          const x = getX(index);
          const y = getY(value);

          return (
            <Svg key={`${item.date}-${index}`}>
              <Polyline
                points={`${x},${y + 8} ${x},118`}
                fill="none"
                stroke="#3a3a3a"
                strokeWidth="1"
                strokeDasharray="5 6"
              />

              <Circle cx={x} cy={y} r="6" fill="#facc15" />

              <SvgText
                x={x}
                y={y - 12}
                fill="#ffffff"
                fontSize="13"
                fontWeight="700"
                textAnchor="middle"
              >
                {value}%
              </SvgText>
            </Svg>
          );
        })}

        <Polyline
          points="24,118 296,118"
          fill="none"
          stroke="#303030"
          strokeWidth="2"
        />
      </Svg>

      <View style={styles.chartLabels}>
        {data.map((item, index) => (
          <Text key={`${item.date}-${index}`} style={styles.chartText}>
            {item.date}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Tab({ label, active, onPress }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && styles.tabActiveButton]}
    >
      <Text
        style={[styles.tabText, active && styles.tabActive]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AnamnesisRow({ label, value, highlight = false }: any) {
  if (highlight) {
    return (
      <View style={styles.observationsBox}>
        <View style={styles.observationsHeader}>
          <View style={styles.observationsIcon}>
            <Ionicons name="alert-circle-outline" size={18} color="#050505" />
          </View>

          <Text style={styles.observationsLabel}>{label}</Text>
        </View>

        <Text style={styles.observationsValue}>{value || "-"}</Text>
      </View>
    );
  }

  return (
    <View style={styles.anamnesisRow}>
      <Text style={styles.anamnesisLabel}>{label}</Text>
      <Text style={styles.anamnesisValue}>{value || "-"}</Text>
    </View>
  );
}

function Measure({ icon, label, value }: any) {
  return (
    <View style={styles.measureItem}>
      <View style={styles.measureLeft}>
        <Ionicons name={icon} size={17} color="#eab308" />
        <Text style={styles.measureLabel}>{label}</Text>
      </View>

      <Text style={styles.measureValue}>{value || "-"}</Text>
    </View>
  );
}

function CompositionRow({ icon, label, value }: any) {
  return (
    <View style={styles.compositionRow}>
      <View style={styles.compositionLeft}>
        <Ionicons name={icon} size={20} color="#facc15" />
        <Text style={styles.compositionLabel}>{label}</Text>
      </View>

      <Text style={styles.compositionValue}>{value}</Text>
    </View>
  );
}

function Photo({
  title,
  image,
  count,
  onPress,
}: {
  title: string;
  image?: string;
  count: number;
  onPress: () => void;
}) {
  const hasImage = Boolean(image);

  return (
    <Pressable style={styles.photo} onPress={hasImage ? onPress : undefined}>
      <View style={styles.photoLeft}>
        <View style={styles.photoThumb}>
          {image ? (
            <Image source={{ uri: image }} style={styles.photoImage} />
          ) : (
            <Ionicons name="image-outline" size={28} color="#777" />
          )}
        </View>

        <View>
          <Text style={styles.photoText}>{title}</Text>
          <Text style={styles.photoSubText}>
            {image
              ? count > 1
                ? `Tocar para ver ${count} fotos`
                : "Tocar para ver foto"
              : "Sin foto registrada"}
          </Text>
        </View>
      </View>

      {image && <Ionicons name="images-outline" size={20} color="#facc15" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050505",
  },

  container: {
    paddingHorizontal: 16,
    paddingTop: 1,
    paddingBottom: 0,
  },

  title: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },

  tabs: {
    flexDirection: "row",
    marginTop: 18,
    marginBottom: 16,
    backgroundColor: "#0b0b0b",
    borderRadius: 22,
    padding: 4,
    borderWidth: 1,
    borderColor: "#262626",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },

  tab: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },

  tabActiveButton: {
    backgroundColor: "#facc15",
    borderColor: "#fde047",
    shadowColor: "#facc15",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  tabText: {
    color: "#9ca3af",
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "900",
    textAlign: "center",
    includeFontPadding: false,
  },

  tabActive: {
    color: "#050505",
    fontWeight: "900",
  },

  card: {
    backgroundColor: "#111111",
    borderRadius: 22,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },

  anamnesisCard: {
    backgroundColor: "#111111",
    borderRadius: 22,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },

  anamnesisSection: {
    color: "#facc15",
    fontSize: 11,
    marginBottom: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  anamnesisRow: {
    minHeight: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
  },

  anamnesisLabel: {
    color: "#c7c7c7",
    fontSize: 12,
    flex: 1,
    fontWeight: "600",
  },

  anamnesisValue: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
    flex: 1,
  },

  observationsBox: {
    marginTop: 14,
    backgroundColor: "#facc15",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fde047",
  },

  observationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 8,
  },

  observationsIcon: {
    width: 30,
    height: 30,
    borderRadius: 99,
    backgroundColor: "rgba(5, 5, 5, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  observationsLabel: {
    color: "#050505",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },

  observationsValue: {
    color: "#171717",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "800",
  },

  measureCard: {
    backgroundColor: "#111111",
    borderRadius: 22,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    overflow: "hidden",
  },

  measureItem: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
  },

  measureLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  measureLabel: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },

  measureValue: {
    color: "#facc15",
    fontSize: 14,
    fontWeight: "900",
  },

  fatCard: {
    backgroundColor: "#111111",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 20,
    marginTop: 20,
  },

  fatTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },

  fatInfo: {
    marginLeft: 18,
  },

  fatNumber: {
    color: "#ffffff",
    fontSize: 42,
    fontWeight: "900",
  },

  fatLabel: {
    color: "#9ca3af",
    fontSize: 14,
    marginTop: 4,
    fontWeight: "600",
  },

  fatMethod: {
    color: "#facc15",
    fontSize: 11,
    marginTop: 6,
    fontWeight: "900",
  },

  compositionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#242424",
  },

  compositionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  compositionLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  compositionValue: {
    color: "#facc15",
    fontSize: 14,
    fontWeight: "900",
  },

  historyCard: {
    backgroundColor: "#111111",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 18,
    marginTop: 16,
  },

  historyTitle: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 8,
  },

  chartWrap: {
    marginTop: 6,
  },

  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginTop: -16,
  },

  chartText: {
    color: "#8a8a8a",
    fontSize: 11,
    fontWeight: "600",
  },

  emptyHistory: {
    color: "#8a8a8a",
    fontSize: 13,
    marginTop: 12,
    fontWeight: "600",
  },

  singleHistory: {
    alignItems: "center",
    paddingVertical: 32,
  },

  singleHistoryValue: {
    color: "#facc15",
    fontSize: 34,
    fontWeight: "900",
    marginBottom: 6,
  },

  photo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
  },

  photoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  photoThumb: {
    width: 64,
    height: 82,
    borderRadius: 18,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#333333",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  photoImage: {
    width: "100%",
    height: "100%",
  },

  photoText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  photoSubText: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 5,
    fontWeight: "600",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },

  carouselOverlay: {
    flex: 1,
    backgroundColor: "#050505",
    paddingHorizontal: 14,
    paddingTop: 48,
    paddingBottom: 14,
  },

  carouselHeader: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  carouselCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 99,
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },

  carouselHeaderText: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
  },

  carouselHeaderSpacer: {
    width: 42,
    height: 42,
  },

  carouselTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },

  carouselSubtitle: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "center",
  },

  carouselStage: {
    flex: 1,
    minHeight: 0,
    marginTop: 12,
    borderRadius: 24,
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    overflow: "hidden",
  },

  carouselSlide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
  },

  carouselImage: {
    width: "100%",
    height: "100%",
  },

  carouselFooter: {
    backgroundColor: "#111111",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 14,
    marginTop: 12,
  },

  carouselInfoTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  carouselInfoDate: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  carouselInfoSubtitle: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },

  carouselDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    maxWidth: 130,
  },

  carouselDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: "#444444",
  },

  carouselDotActive: {
    width: 18,
    backgroundColor: "#facc15",
  },

  carouselInfoMeta: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  carouselMetaPill: {
    flex: 1,
    backgroundColor: "#080808",
    borderWidth: 1,
    borderColor: "#242424",
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },

  carouselMetaLabel: {
    color: "#9ca3af",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 3,
  },

  carouselMetaValue: {
    color: "#facc15",
    fontSize: 13,
    fontWeight: "900",
  },

  carouselControls: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },

  carouselControlButton: {
    flex: 1,
    minHeight: 44,
    backgroundColor: "#facc15",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },

  carouselControlDisabled: {
    opacity: 0.35,
  },

  carouselControlText: {
    color: "#050505",
    fontSize: 12,
    fontWeight: "900",
  },

  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#050505",
  },

  logoutButton: {
    marginTop: 20,
    marginBottom: 0,
    backgroundColor: "#facc15",
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  logoutText: {
    color: "#050505",
    fontSize: 13,
    fontWeight: "900",
  },

  logoutCard: {
    width: "100%",
    backgroundColor: "#111111",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 22,
    alignItems: "center",
  },

  logoutIcon: {
    width: 60,
    height: 60,
    borderRadius: 99,
    backgroundColor: "#facc15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  logoutTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },

  logoutMessage: {
    color: "#9ca3af",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 18,
    fontWeight: "600",
  },

  logoutActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },

  logoutCancel: {
    flex: 1,
    backgroundColor: "#1f1f1f",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },

  logoutCancelText: {
    color: "#cfcfcf",
    fontWeight: "800",
  },

  logoutConfirm: {
    flex: 1,
    backgroundColor: "#facc15",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },

  logoutConfirmText: {
    color: "#050505",
    fontWeight: "900",
  },

  subtitle: {
    color: "#a3a3a3",
    textAlign: "center",
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
  },

  header: {
    alignItems: "center",
    marginBottom: 14,
  },
});