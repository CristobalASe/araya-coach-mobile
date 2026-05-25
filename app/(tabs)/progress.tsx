import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import Svg, {
  Circle,
  Line,
  Polyline,
  Text as SvgText,
} from "react-native-svg";
import { auth, db } from "../../firebaseConfig";

type TabType = "resumen" | "fotos" | "medidas";
type PhotoPose = "front" | "side" | "back";
type MeasurementKey =
  | "neck"
  | "shoulders"
  | "chest"
  | "waist"
  | "hip"
  | "arm"
  | "thigh"
  | "calf";

type SkinfoldKey = "biceps" | "triceps" | "subscapular" | "suprailiac";

type PhotoItem = {
  url: string;
  date?: string;
};

type ChartPoint = {
  label: string;
  value: number;
};

type MeasurementConfig = {
  key: MeasurementKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type SkinfoldConfig = {
  key: SkinfoldKey;
  label: string;
};

const MEASUREMENTS: MeasurementConfig[] = [
  { key: "neck", label: "Cuello", icon: "ellipse-outline" },
  { key: "shoulders", label: "Hombros", icon: "body-outline" },
  { key: "chest", label: "Pecho", icon: "fitness-outline" },
  { key: "waist", label: "Cintura", icon: "resize-outline" },
  { key: "hip", label: "Cadera", icon: "walk-outline" },
  { key: "arm", label: "Brazo", icon: "accessibility-outline" },
  { key: "thigh", label: "Muslo", icon: "footsteps-outline" },
  { key: "calf", label: "Pantorrilla", icon: "pin-outline" },
];

const SKINFOLDS: SkinfoldConfig[] = [
  { key: "biceps", label: "Bíceps" },
  { key: "triceps", label: "Tríceps" },
  { key: "subscapular", label: "Subescapular" },
  { key: "suprailiac", label: "Suprailíaco" },
];

export default function ProgressScreen() {
  const [tab, setTab] = useState<TabType>("resumen");
  const [student, setStudent] = useState<any>(null);
  const [checkups, setCheckups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewImage, setViewImage] = useState<string | null>(null);

  useEffect(() => {
    fetchProgress();
  }, []);

  async function fetchProgress() {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const studentRef = doc(db, "students", user.uid);
      const studentSnap = await getDoc(studentRef);

      if (!studentSnap.exists()) return;

      const studentData = {
        id: studentSnap.id,
        ...studentSnap.data(),
      };

      const checkupsRef = collection(db, "students", user.uid, "checkups");
      const checkupsSnap = await getDocs(checkupsRef);

      const checkupsData = checkupsSnap.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .sort((a: any, b: any) => getSortableDate(a) - getSortableDate(b));

      setStudent(studentData);
      setCheckups(checkupsData);
    } catch (error) {
      console.log("Error cargando progreso:", error);
    } finally {
      setLoading(false);
    }
  }

  const current = student?.current || {};
  const currentPhotos = current.photos || {};

  const latestCheckup =
    checkups.length > 0 ? checkups[checkups.length - 1] : null;

  const firstCheckup = checkups.length > 0 ? checkups[0] : null;

  const weight = current.weight || latestCheckup?.weight;
  const weightDifference = getDifference(weight, firstCheckup?.weight);

  const latestBodyFat = getLatestBodyFat({
    student,
    checkups,
    current,
  });
  const firstBodyFat = firstCheckup
    ? getBodyFatForItem(firstCheckup, student)
    : 0;
  const bodyFatDifference = getDifference(latestBodyFat, firstBodyFat);

  const weightChartData = useMemo(() => {
    const data = checkups
      .filter((item) => toNumber(item.weight) > 0)
      .map((item) => ({
        label: formatShortDate(item),
        value: toNumber(item.weight),
      }));

    if (data.length === 0 && weight) {
      return [
        {
          label: "Actual",
          value: toNumber(weight),
        },
      ];
    }

    return data;
  }, [checkups, weight]);

  const bodyFatChartData = useMemo(() => {
    const data = checkups
      .map((item) => ({
        label: formatShortDate(item),
        value: getBodyFatForItem(item, student),
      }))
      .filter((item) => item.value > 0);

    if (data.length === 0 && latestBodyFat) {
      return [
        {
          label: "Actual",
          value: toNumber(latestBodyFat),
        },
      ];
    }

    return data;
  }, [checkups, student, latestBodyFat]);

  const measurementCards = useMemo(() => {
    return MEASUREMENTS.map((measurement) => {
      const latestValue = getLatestMeasurementValue({
        checkups,
        current,
        key: measurement.key,
      });

      const firstValue = getFirstMeasurementValue({
        checkups,
        current,
        key: measurement.key,
      });

      return {
        ...measurement,
        latestValue,
        firstValue,
        difference: getDifference(latestValue, firstValue),
        data: getMeasurementChartData({
          checkups,
          current,
          key: measurement.key,
        }),
      };
    });
  }, [checkups, current]);

  const measurementSummary = useMemo(() => {
    return measurementCards.filter((item) =>
      ["waist", "hip", "chest", "arm"].includes(item.key)
    );
  }, [measurementCards]);

  const frontPhotos = getPhotoHistory({
    checkups,
    currentPhotos,
    key: "front",
  });

  const sidePhotos = getPhotoHistory({
    checkups,
    currentPhotos,
    key: "side",
  });

  const backPhotos = getPhotoHistory({
    checkups,
    currentPhotos,
    key: "back",
  });

  const comparisonPhotos = frontPhotos.slice(-3);


  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#facc15" size="large" />
        <Text style={styles.loadingText}>Cargando progreso...</Text>
      </View>
    );
  }

  if (!student) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>No se encontró información.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Progreso</Text>
          <Text style={styles.subtitle}>Información progreso</Text>
        </View>

        <View style={styles.tabs}>
          <ProgressTab
            label="Resumen"
            active={tab === "resumen"}
            onPress={() => setTab("resumen")}
          />

          <ProgressTab
            label="Fotos"
            active={tab === "fotos"}
            onPress={() => setTab("fotos")}
          />

          <ProgressTab
            label="Medidas"
            active={tab === "medidas"}
            onPress={() => setTab("medidas")}
          />
        </View>

        {tab === "resumen" && (
          <>
            <View style={styles.summaryGrid}>
              <SummaryMetricCard
                icon="scale-outline"
                label="Peso actual"
                value={formatUnit(weight, "kg")}
                difference={formatDifference(weightDifference, "kg")}
                positive={weightDifference >= 0}
              />

              <SummaryMetricCard
                icon="body-outline"
                label="% grasa"
                value={formatUnit(latestBodyFat, "%")}
                difference={formatDifference(bodyFatDifference, "%")}
                positive={bodyFatDifference <= 0}
              />
            </View>

            <View style={styles.weightCard}>
              <Text style={styles.cardTitle}>Peso corporal (kg)</Text>

              <View style={styles.weightHeader}>
                <Text style={styles.weightValue}>
                  {formatPlainNumber(weight)}
                </Text>

                <Text
                  style={[
                    styles.weightDiff,
                    weightDifference >= 0
                      ? styles.weightDiffPositive
                      : styles.weightDiffNegative,
                  ]}
                >
                  {formatDifference(weightDifference, "kg")}
                </Text>
              </View>

              <ProgressLineChart data={weightChartData} />
            </View>

            <View style={styles.weightCard}>
              <Text style={styles.cardTitle}>Grasa corporal (%)</Text>

              <View style={styles.weightHeader}>
                <Text style={styles.weightValue}>
                  {formatPlainNumber(latestBodyFat)}
                </Text>

                <Text
                  style={[
                    styles.weightDiff,
                    bodyFatDifference <= 0
                      ? styles.weightDiffPositive
                      : styles.weightDiffNegative,
                  ]}
                >
                  {formatDifference(bodyFatDifference, "%")}
                </Text>
              </View>

              <ProgressLineChart data={bodyFatChartData} />
            </View>

            <View style={styles.photoCompareCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Comparación de fotos</Text>

                <Pressable onPress={() => setTab("fotos")}>
                  <Text style={styles.seeAllText}>Ver todas</Text>
                </Pressable>
              </View>

              {comparisonPhotos.length > 0 ? (
                <View style={styles.comparePhotos}>
                  {comparisonPhotos.map((item, index) => (
                    <Pressable
                      key={`${item.url}-${index}`}
                      style={styles.comparePhotoItem}
                      onPress={() => setViewImage(item.url)}
                    >
                      <Image
                        source={{ uri: item.url }}
                        style={styles.compareImage}
                      />

                      <View style={styles.compareDateBox}>
                        <Text style={styles.compareDateText}>
                          {item.date || `Foto ${index + 1}`}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <EmptyBox text="Aún no hay fotos registradas para comparar." />
              )}
            </View>
          </>
        )}

        {tab === "fotos" && (
          <>
            <PhotoSection
              title="Frente"
              images={frontPhotos}
              onPress={setViewImage}
            />

            <PhotoSection
              title="Lado"
              images={sidePhotos}
              onPress={setViewImage}
            />

            <PhotoSection
              title="Espalda"
              images={backPhotos}
              onPress={setViewImage}
            />
          </>
        )}

        {tab === "medidas" && (
          <>
            <View style={styles.measureSummaryCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Resumen de medidas</Text>
                  <Text style={styles.measureSubtitle}>
                    Comparación entre el primer registro y el último checkup.
                  </Text>
                </View>
              </View>

              <View style={styles.measureSummaryGrid}>
                {measurementSummary.map((item) => (
                  <View key={item.key} style={styles.measureSummaryItem}>
                    <Text style={styles.measureSummaryLabel}>{item.label}</Text>
                    <Text style={styles.measureSummaryValue}>
                      {formatUnit(item.latestValue, "cm")}
                    </Text>
                    <Text
                      style={[
                        styles.measureSummaryDiff,
                        item.difference >= 0
                          ? styles.measureDiffUp
                          : styles.measureDiffDown,
                      ]}
                    >
                      {formatDifference(item.difference, "cm")}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {measurementCards.some((item) => item.latestValue > 0) ? (
              measurementCards.map((item) => (
                <MeasurementProgressCard key={item.key} item={item} />
              ))
            ) : (
              <EmptyCard
                icon="resize-outline"
                title="Sin medidas registradas"
                text="Cuando existan medidas en los checkups, aparecerá aquí la evolución de cintura, cadera, pecho, brazo y más."
              />
            )}

            <View style={styles.measureSummaryCard}>
              <Text style={styles.sectionTitle}>Pliegues actuales</Text>
              <Text style={styles.measureSubtitle}>
                Datos usados para estimar el porcentaje de grasa.
              </Text>

              <View style={styles.skinfoldGrid}>
                {SKINFOLDS.map((item) => (
                  <SkinfoldItem
                    key={item.key}
                    label={item.label}
                    value={getLatestSkinfoldValue({
                      checkups,
                      current,
                      key: item.key,
                    })}
                  />
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={!!viewImage} transparent animationType="fade">
        <View style={styles.imageViewerOverlay}>
          <Pressable
            style={styles.closeViewerButton}
            onPress={() => setViewImage(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>

          {viewImage && (
            <Image
              source={{ uri: viewImage }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function ProgressTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
    >
      <Text
        style={[styles.tabText, active && styles.tabTextActive]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryMetricCard({
  icon,
  label,
  value,
  difference,
  positive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  difference: string;
  positive: boolean;
}) {
  return (
    <View style={styles.summaryMetricCard}>
      <View style={styles.summaryMetricIcon}>
        <Ionicons name={icon} size={18} color="#facc15" />
      </View>

      <Text style={styles.summaryMetricLabel}>{label}</Text>
      <Text style={styles.summaryMetricValue}>{value}</Text>
      <Text
        style={[
          styles.summaryMetricDiff,
          positive ? styles.measureDiffDown : styles.measureDiffUp,
        ]}
      >
        {difference}
      </Text>
    </View>
  );
}

function ProgressLineChart({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const width = 320;
  const height = 155;
  const paddingLeft = 28;
  const paddingRight = 10;
  const paddingTop = 18;
  const paddingBottom = 34;

  if (!data || data.length === 0) {
    return <EmptyBox text="Aún no hay datos suficientes para graficar." />;
  }

  if (data.length === 1) {
    return (
      <View style={styles.singleChartValue}>
        <Text style={styles.singleChartNumber}>{formatPlainNumber(data[0].value)}</Text>
        <Text style={styles.singleChartDate}>{data[0].label}</Text>
      </View>
    );
  }

  const values = data.map((item) => Number(item.value));
  const maxRaw = Math.max(...values);
  const minRaw = Math.min(...values);

  const max = Math.ceil(maxRaw / 2) * 2;
  const min = Math.floor(minRaw / 2) * 2;
  const range = max - min || 1;

  function getX(index: number) {
    return (
      paddingLeft +
      (index * (width - paddingLeft - paddingRight)) / (data.length - 1)
    );
  }

  function getY(value: number) {
    return (
      paddingTop +
      ((max - value) / range) * (height - paddingTop - paddingBottom)
    );
  }

  const points = data
    .map((item, index) => `${getX(index)},${getY(item.value)}`)
    .join(" ");

  const yTop = paddingTop;
  const yMiddle = paddingTop + (height - paddingTop - paddingBottom) / 2;
  const yBottom = height - paddingBottom;

  const middleValue = Number(((max + min) / 2).toFixed(1));

  return (
    <View style={styles.chartWrapper}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Line
          x1={paddingLeft}
          y1={yTop}
          x2={width - paddingRight}
          y2={yTop}
          stroke="#242424"
          strokeWidth="1"
        />

        <Line
          x1={paddingLeft}
          y1={yMiddle}
          x2={width - paddingRight}
          y2={yMiddle}
          stroke="#242424"
          strokeWidth="1"
        />

        <Line
          x1={paddingLeft}
          y1={yBottom}
          x2={width - paddingRight}
          y2={yBottom}
          stroke="#242424"
          strokeWidth="1"
        />

        {data.map((_, index) => {
          const x = getX(index);

          return (
            <Line
              key={`vertical-${index}`}
              x1={x}
              y1={yTop}
              x2={x}
              y2={yBottom}
              stroke="#1f1f1f"
              strokeWidth="1"
            />
          );
        })}

        <SvgText
          x={0}
          y={yTop + 4}
          fill="#737373"
          fontSize="10"
          fontWeight="700"
        >
          {max}
        </SvgText>

        <SvgText
          x={0}
          y={yMiddle + 4}
          fill="#737373"
          fontSize="10"
          fontWeight="700"
        >
          {middleValue}
        </SvgText>

        <SvgText
          x={0}
          y={yBottom + 4}
          fill="#737373"
          fontSize="10"
          fontWeight="700"
        >
          {min}
        </SvgText>

        <Polyline
          points={points}
          fill="none"
          stroke="#eab308"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {data.map((item, index) => {
          const x = getX(index);
          const y = getY(item.value);

          return (
            <Circle
              key={`${item.label}-${index}`}
              cx={x}
              cy={y}
              r="4.5"
              fill="#eab308"
              stroke="#111111"
              strokeWidth="2"
            />
          );
        })}
      </Svg>

      <View style={styles.chartLabels}>
        {data.map((item, index) => (
          <Text key={`${item.label}-${index}`} style={styles.chartLabel}>
            {item.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function MiniLineChart({ data }: { data: ChartPoint[] }) {
  const width = 128;
  const height = 62;
  const paddingX = 8;
  const paddingTop = 18;
  const paddingBottom = 8;

  if (data.length <= 1) {
    return (
      <View style={styles.miniChartEmpty}>
        <Text style={styles.miniChartEmptyText}>Sin gráfico</Text>
      </View>
    );
  }

  const values = data.map((item) => item.value);
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

  function shouldShowValue(index: number, value: number) {
    if (data.length <= 4) return true;

    return (
      index === 0 ||
      index === data.length - 1 ||
      value === max ||
      value === min
    );
  }

  const points = data
    .map((item, index) => `${getX(index)},${getY(item.value)}`)
    .join(" ");

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Polyline
        points={points}
        fill="none"
        stroke="#eab308"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {data.map((item, index) => {
        const x = getX(index);
        const y = getY(item.value);

        return (
          <Circle
            key={`dot-${item.label}-${index}`}
            cx={x}
            cy={y}
            r="3"
            fill="#eab308"
          />
        );
      })}

      {data.map((item, index) => {
        if (!shouldShowValue(index, item.value)) return null;

        const x = getX(index);
        const y = Math.max(10, getY(item.value) - 7);

        return (
          <SvgText
            key={`value-${item.label}-${index}`}
            x={x}
            y={y}
            fill="#ffffff"
            fontSize="9"
            fontWeight="800"
            textAnchor="middle"
          >
            {formatPlainNumber(item.value)}
          </SvgText>
        );
      })}
    </Svg>
  );
}

function MeasurementProgressCard({
  item,
}: {
  item: MeasurementConfig & {
    latestValue: number;
    firstValue: number;
    difference: number;
    data: ChartPoint[];
  };
}) {
  return (
    <View style={styles.measureCard}>
      <View style={styles.measureCardTop}>
        <View style={styles.measureCardTitleWrap}>
          <View style={styles.measureIcon}>
            <Ionicons name={item.icon} size={17} color="#facc15" />
          </View>

          <View>
            <Text style={styles.measureCardTitle}>{item.label}</Text>
            <Text style={styles.measureCardSubtitle}>
              Inicial: {formatUnit(item.firstValue, "cm")}
            </Text>
          </View>
        </View>

        <MiniLineChart data={item.data} />
      </View>

      <View style={styles.measureCardBottom}>
        <View>
          <Text style={styles.measureCurrentValue}>
            {formatUnit(item.latestValue, "cm")}
          </Text>
          <Text style={styles.measureCurrentLabel}>Último registro</Text>
        </View>

        <Text
          style={[
            styles.measureDifference,
            item.difference >= 0 ? styles.measureDiffUp : styles.measureDiffDown,
          ]}
        >
          {formatDifference(item.difference, "cm")}
        </Text>
      </View>
    </View>
  );
}

function SkinfoldItem({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.skinfoldItem}>
      <Text style={styles.skinfoldLabel}>{label}</Text>
      <Text style={styles.skinfoldValue}>{formatUnit(value, "mm")}</Text>
    </View>
  );
}


function PhotoSection({
  title,
  images,
  onPress,
}: {
  title: string;
  images: PhotoItem[];
  onPress: (url: string) => void;
}) {
  return (
    <View style={styles.photoCard}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.photoCount}>
            {images.length
              ? `${images.length} foto${images.length === 1 ? "" : "s"}`
              : "Sin fotos"}
          </Text>
        </View>
      </View>

      {images.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoScroll}
        >
          {images.map((item, index) => (
            <Pressable
              key={`${item.url}-${index}`}
              style={styles.photoItem}
              onPress={() => onPress(item.url)}
            >
              <Image source={{ uri: item.url }} style={styles.photoImage} />

              <View style={styles.photoDateBox}>
                <Text style={styles.photoDateText}>
                  {item.date || `Foto ${index + 1}`}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <EmptyBox text="No hay fotos registradas en esta categoría." />
      )}
    </View>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <View style={styles.emptyBox}>
      <Ionicons name="information-circle-outline" size={24} color="#777" />
      <Text style={styles.emptyBoxText}>{text}</Text>
    </View>
  );
}

function EmptyCard({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <Ionicons name={icon} size={34} color="#facc15" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function getSortableDate(item: any) {
  if (item?.createdAt?.toDate) {
    return item.createdAt.toDate().getTime();
  }

  if (item?.createdAt?.seconds) {
    return item.createdAt.seconds * 1000;
  }

  if (item?.date) {
    const parsedDate = new Date(`${item.date}T00:00:00`).getTime();
    return Number.isFinite(parsedDate) ? parsedDate : 0;
  }

  return 0;
}

function formatShortDate(item: any) {
  const date = getDateFromItem(item);

  if (!date) return "-";

  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });
}

function getDateFromItem(item: any): Date | null {
  if (item?.createdAt?.toDate) {
    return item.createdAt.toDate();
  }

  if (item?.createdAt?.seconds) {
    return new Date(item.createdAt.seconds * 1000);
  }

  if (item?.date) {
    const date = new Date(`${item.date}T00:00:00`);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  return null;
}

function normalizePhotoValue(value: any): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.url) return item.url;
        if (item?.uri) return item.uri;
        if (item?.image) return item.image;
        return "";
      })
      .filter(Boolean);
  }

  if (typeof value === "object") {
    if (value.url) return [value.url];
    if (value.uri) return [value.uri];
    if (value.image) return [value.image];
  }

  return [];
}

function getPhotoHistory({
  checkups,
  currentPhotos,
  key,
}: {
  checkups: any[];
  currentPhotos: any;
  key: PhotoPose;
}): PhotoItem[] {
  const photos: PhotoItem[] = [];
  const usedUrls = new Set<string>();

  checkups.forEach((checkup) => {
    const urls = normalizePhotoValue(checkup?.photos?.[key]);
    const date = formatShortDate(checkup);

    urls.forEach((url) => {
      if (!url || usedUrls.has(url)) return;

      usedUrls.add(url);
      photos.push({
        url,
        date,
      });
    });
  });

  const currentUrls = normalizePhotoValue(currentPhotos?.[key]);

  currentUrls.forEach((url) => {
    if (!url || usedUrls.has(url)) return;

    usedUrls.add(url);
    photos.push({
      url,
      date: "Actual",
    });
  });

  return photos;
}

function getLatestBodyFat({
  student,
  checkups,
  current,
}: {
  student: any;
  checkups: any[];
  current: any;
}) {
  const currentBodyFat = toNumber(current?.bodyFat);

  if (currentBodyFat > 0) return Number(currentBodyFat.toFixed(2));

  for (let index = checkups.length - 1; index >= 0; index--) {
    const value = getBodyFatForItem(checkups[index], student);

    if (value > 0) return value;
  }

  const calculated = calculateBodyFat({
    age: getAgeAtDate(student?.anamnesis?.birthDate, current?.date),
    sex: student?.anamnesis?.sex || "",
    skinfolds: current?.skinfolds || {},
  });

  return calculated;
}

function getBodyFatForItem(item: any, student: any) {
  const saved = toNumber(item?.bodyFat);

  if (saved > 0) return Number(saved.toFixed(2));

  return calculateBodyFat({
    age: getAgeAtDate(student?.anamnesis?.birthDate, item?.date || item?.createdAt),
    sex: student?.anamnesis?.sex || "",
    skinfolds: item?.skinfolds || {},
  });
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

  const bodyFat = (5.053 / density - 4.614) * 100;

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

function getLatestMeasurementValue({
  checkups,
  current,
  key,
}: {
  checkups: any[];
  current: any;
  key: MeasurementKey;
}) {
  const currentValue = toNumber(current?.measurements?.[key]);

  if (currentValue > 0) return currentValue;

  for (let index = checkups.length - 1; index >= 0; index--) {
    const value = toNumber(checkups[index]?.measurements?.[key]);

    if (value > 0) return value;
  }

  return 0;
}

function getFirstMeasurementValue({
  checkups,
  current,
  key,
}: {
  checkups: any[];
  current: any;
  key: MeasurementKey;
}) {
  for (const checkup of checkups) {
    const value = toNumber(checkup?.measurements?.[key]);

    if (value > 0) return value;
  }

  return toNumber(current?.measurements?.[key]);
}

function getMeasurementChartData({
  checkups,
  current,
  key,
}: {
  checkups: any[];
  current: any;
  key: MeasurementKey;
}): ChartPoint[] {
  const data = checkups
    .map((item) => ({
      label: formatShortDate(item),
      value: toNumber(item?.measurements?.[key]),
    }))
    .filter((item) => item.value > 0);

  if (data.length === 0) {
    const currentValue = toNumber(current?.measurements?.[key]);

    if (currentValue > 0) {
      return [{ label: "Actual", value: currentValue }];
    }
  }

  return data;
}

function getLatestSkinfoldValue({
  checkups,
  current,
  key,
}: {
  checkups: any[];
  current: any;
  key: SkinfoldKey;
}) {
  const currentValue = toNumber(current?.skinfolds?.[key]);

  if (currentValue > 0) return currentValue;

  for (let index = checkups.length - 1; index >= 0; index--) {
    const value = toNumber(checkups[index]?.skinfolds?.[key]);

    if (value > 0) return value;
  }

  return 0;
}

function getAgeAtDate(birthDate?: string, dateValue?: any) {
  if (!birthDate) return 0;

  const [year, month, day] = String(birthDate).split("-").map(Number);

  if (!year || !month || !day) return 0;

  const referenceDate = getReferenceDate(dateValue) || new Date();

  let age = referenceDate.getFullYear() - year;

  const birthdayAlreadyPassed =
    referenceDate.getMonth() + 1 > month ||
    (referenceDate.getMonth() + 1 === month && referenceDate.getDate() >= day);

  if (!birthdayAlreadyPassed) {
    age--;
  }

  return age;
}

function getReferenceDate(value: any) {
  if (!value) return null;

  if (value?.toDate) return value.toDate();

  if (value?.seconds) return new Date(value.seconds * 1000);

  if (typeof value === "string") {
    const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);

    return Number.isFinite(date.getTime()) ? date : null;
  }

  return null;
}

function toNumber(value: any) {
  if (value === undefined || value === null || value === "") return 0;

  const parsed = Number(String(value).replace(",", "."));

  return Number.isFinite(parsed) ? parsed : 0;
}

function getDifference(currentValue: any, initialValue: any) {
  const current = toNumber(currentValue);
  const initial = toNumber(initialValue);

  if (!current || !initial) return 0;

  return Number((current - initial).toFixed(2));
}

function formatDifference(value: number, unit = "") {
  if (!value) return unit ? `0 ${unit}` : "0";

  const formatted = formatPlainNumber(Math.abs(value));
  const prefix = value > 0 ? "+" : "-";

  return unit ? `${prefix} ${formatted} ${unit}` : `${prefix} ${formatted}`;
}

function formatPlainNumber(value: any) {
  if (value === undefined || value === null || value === "") return "-";

  const number = toNumber(value);

  if (!number) return String(value);

  return String(Number(number.toFixed(2))).replace(".", ",");
}

function formatUnit(value: any, unit: string) {
  const number = toNumber(value);

  if (!number) return "-";

  return `${formatPlainNumber(number)} ${unit}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050505",
  },

  container: {
    paddingHorizontal: 16,
    paddingTop: 1,
    paddingBottom: 28,
  },

  header: {
    alignItems: "center",
    marginBottom: 12,
  },

  title: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },

  subtitle: {
    color: "#a3a3a3",
    textAlign: "center",
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
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

  tabButton: {
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

  tabButtonActive: {
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

  tabTextActive: {
    color: "#050505",
    fontWeight: "900",
  },

  tabIndicator: {
    position: "absolute",
    bottom: 0,
    height: 3,
    width: "76%",
    borderRadius: 99,
    backgroundColor: "#facc15",
  },

  summaryGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },

  summaryMetricCard: {
    flex: 1,
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#202020",
    borderRadius: 20,
    padding: 13,
  },

  summaryMetricIcon: {
    width: 34,
    height: 34,
    borderRadius: 99,
    backgroundColor: "#191919",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  summaryMetricLabel: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "800",
  },

  summaryMetricValue: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 5,
  },

  summaryMetricDiff: {
    fontSize: 11,
    fontWeight: "900",
    marginTop: 5,
  },

  weightCard: {
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#202020",
    borderRadius: 22,
    padding: 14,
    marginBottom: 14,
  },

  cardTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },

  weightHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 10,
  },

  weightValue: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "900",
  },

  weightDiff: {
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
  },

  weightDiffPositive: {
    color: "#22c55e",
  },

  weightDiffNegative: {
    color: "#ef4444",
  },

  chartWrapper: {
    marginTop: 4,
  },

  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 30,
    paddingRight: 8,
    marginTop: -22,
  },

  chartLabel: {
    color: "#777777",
    fontSize: 10,
    fontWeight: "700",
  },

  singleChartValue: {
    height: 132,
    alignItems: "center",
    justifyContent: "center",
  },

  singleChartNumber: {
    color: "#facc15",
    fontSize: 30,
    fontWeight: "900",
  },

  singleChartDate: {
    color: "#8a8a8a",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
  },

  photoCompareCard: {
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#202020",
    borderRadius: 22,
    padding: 14,
    marginTop: 0,
    marginBottom: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  seeAllText: {
    color: "#facc15",
    fontSize: 11,
    fontWeight: "900",
  },

  comparePhotos: {
    flexDirection: "row",
    gap: 9,
  },

  comparePhotoItem: {
    flex: 1,
    height: 134,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },

  compareImage: {
    width: "100%",
    height: "100%",
  },

  compareDateBox: {
    position: "absolute",
    left: 5,
    right: 5,
    bottom: 5,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 99,
    paddingVertical: 5,
    alignItems: "center",
  },

  compareDateText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
  },

  photoCard: {
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#202020",
    borderRadius: 22,
    padding: 14,
    marginBottom: 14,
  },

  photoCount: {
    color: "#8a8a8a",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },

  photoScroll: {
    gap: 10,
    paddingRight: 4,
  },

  photoItem: {
    width: 112,
    height: 150,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },

  photoImage: {
    width: "100%",
    height: "100%",
  },

  photoDateBox: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 6,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 99,
    paddingVertical: 5,
    alignItems: "center",
  },

  photoDateText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
  },

  measureSummaryCard: {
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#202020",
    borderRadius: 22,
    padding: 14,
    marginBottom: 14,
  },

  measureSubtitle: {
    color: "#8a8a8a",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 16,
  },

  measureSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },

  measureSummaryItem: {
    width: "48%",
    backgroundColor: "#080808",
    borderWidth: 1,
    borderColor: "#242424",
    borderRadius: 16,
    padding: 11,
  },

  measureSummaryLabel: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "800",
  },

  measureSummaryValue: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 5,
  },

  measureSummaryDiff: {
    fontSize: 11,
    fontWeight: "900",
    marginTop: 4,
  },

  measureCard: {
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#202020",
    borderRadius: 22,
    padding: 14,
    marginBottom: 12,
  },

  measureCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  measureCardTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
  },

  measureIcon: {
    width: 38,
    height: 38,
    borderRadius: 99,
    backgroundColor: "#191919",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },

  measureCardTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  measureCardSubtitle: {
    color: "#8a8a8a",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },

  measureCardBottom: {
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#242424",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },

  measureCurrentValue: {
    color: "#facc15",
    fontSize: 20,
    fontWeight: "900",
  },

  measureCurrentLabel: {
    color: "#8a8a8a",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },

  measureDifference: {
    fontSize: 12,
    fontWeight: "900",
  },

  measureDiffUp: {
    color: "#ef4444",
  },

  measureDiffDown: {
    color: "#22c55e",
  },

  miniChartEmpty: {
    width: 110,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },

  miniChartEmptyText: {
    color: "#525252",
    fontSize: 10,
    fontWeight: "800",
  },

  skinfoldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 12,
  },

  skinfoldItem: {
    width: "48%",
    backgroundColor: "#080808",
    borderWidth: 1,
    borderColor: "#242424",
    borderRadius: 14,
    padding: 10,
  },

  skinfoldLabel: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "800",
  },

  skinfoldValue: {
    color: "#facc15",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 5,
  },

  strengthHeaderCard: {
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#202020",
    borderRadius: 22,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  strengthHeaderTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  strengthHeaderText: {
    color: "#8a8a8a",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },

  strengthCard: {
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#202020",
    borderRadius: 22,
    padding: 14,
    marginBottom: 12,
  },

  strengthCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  strengthExercise: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  strengthDate: {
    color: "#8a8a8a",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },

  strengthCardBottom: {
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#242424",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },

  strengthValue: {
    color: "#facc15",
    fontSize: 20,
    fontWeight: "900",
  },

  strengthDetails: {
    color: "#8a8a8a",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },

  strengthHistoryCard: {
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#202020",
    borderRadius: 22,
    padding: 14,
  },

  strengthHistoryItem: {
    minHeight: 54,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: "#242424",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  strengthHistoryExercise: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  strengthHistoryDate: {
    color: "#8a8a8a",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },

  strengthHistoryValue: {
    color: "#facc15",
    fontSize: 14,
    fontWeight: "900",
  },

  emptyBox: {
    minHeight: 105,
    borderRadius: 16,
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },

  emptyBoxText: {
    color: "#8a8a8a",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },

  emptyCard: {
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#202020",
    borderRadius: 22,
    padding: 20,
    alignItems: "center",
  },

  emptyTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 12,
  },

  emptyText: {
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },

  imageViewerOverlay: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },

  closeViewerButton: {
    position: "absolute",
    top: 55,
    right: 22,
    zIndex: 10,
    width: 46,
    height: 46,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },

  fullImage: {
    width: "100%",
    height: "82%",
  },

  loading: {
    flex: 1,
    backgroundColor: "#050505",
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 12,
  },
});
