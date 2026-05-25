import { useEffect, useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Pressable,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

type ActiveTab = "diet" | "supplements" | "cardio" | "options";

type MealOption = {
  label: string;
  items: string[];
};

type MealType = {
  title: string;
  subtitle?: string;
  type?: string;
  time?: string;
  image?: string;
  options?: MealOption[];
};

type SupplementType = {
  title: string;
  dosage?: string;
  timing?: string;
  notes?: string;
};

type CardioPlan = {
  title?: string;
  frequency?: string;
  duration?: string;
  intensity?: string;
  notes?: string;
};

type FoodOptionGroup = {
  title: string;
  description?: string;
  items: string[];
};

type NutritionPlan = {
  name?: string;
  calories?: string;
  protein?: string;
  carbs?: string;
  fats?: string;
  water?: string;
  meals?: MealType[];
  supplements?: SupplementType[];
  cardio?: CardioPlan;
  foodOptions?: FoodOptionGroup[];
  extras?: string[];
};

const defaultMealImage =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800";

function getMealEmoji(meal: MealType) {
  const value = `${meal.type || ""} ${meal.title || ""}`.toLowerCase();

  if (value.includes("breakfast") || value.includes("desayuno")) return "🍳";
  if (value.includes("snack") || value.includes("media")) return "🍎";
  if (value.includes("lunch") || value.includes("almuerzo")) return "🍛";
  if (value.includes("pre")) return "🏋️";
  if (value.includes("post")) return "🍽️";
  if (value.includes("dinner") || value.includes("cena")) return "🌙";

  return "🍽️";
}

function getMealImage(meal: MealType) {
  const value = `${meal.type || ""} ${meal.title || ""}`.toLowerCase();

  if (meal.image) return meal.image;

  if (value.includes("breakfast") || value.includes("desayuno")) {
    return "https://images.unsplash.com/photo-1525351484163-7529414344d8?q=80&w=800";
  }

  if (value.includes("media") || value.includes("snack")) {
    return "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?q=80&w=800";
  }

  if (value.includes("lunch") || value.includes("almuerzo")) {
    return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800";
  }

  if (value.includes("pre")) {
    return "https://images.unsplash.com/photo-1528825871115-3581a5387919?q=80&w=800";
  }

  if (value.includes("post")) {
    return "https://images.unsplash.com/photo-1579722821273-0f6c7d44362f?q=80&w=800";
  }

  if (value.includes("dinner") || value.includes("cena")) {
    return "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800";
  }

  return defaultMealImage;
}


function normalizeNutritionPlan(data: any): NutritionPlan {
  return {
    name: String(data?.name || "Plan alimenticio"),
    calories: String(data?.calories || ""),
    protein: String(data?.protein || data?.proteins || ""),
    carbs: String(data?.carbs || data?.carbohydrates || ""),
    fats: String(data?.fats || data?.fat || ""),
    water: String(data?.water || extractWaterFromExtras(data?.extras) || ""),
    meals: Array.isArray(data?.meals) ? data.meals.map(normalizeMeal) : [],
    supplements: Array.isArray(data?.supplements)
      ? data.supplements.map(normalizeSupplement)
      : [],
    cardio: normalizeCardio(data?.cardio),
    foodOptions: Array.isArray(data?.foodOptions)
      ? data.foodOptions.map(normalizeFoodOptionGroup)
      : [],
    extras: normalizeStringArray(data?.extras),
  };
}

function normalizeMeal(meal: any, index: number): MealType {
  const title = String(
    meal?.title || meal?.name || meal?.label || meal?.meal || `Comida ${index + 1}`
  );
  const time = String(meal?.time || meal?.hour || meal?.schedule || "");

  return {
    title,
    subtitle: String(meal?.subtitle || meal?.description || time || "Comida asignada"),
    type: String(meal?.type || title),
    time,
    image: String(meal?.image || meal?.imageUrl || meal?.photoUrl || ""),
    options: Array.isArray(meal?.options)
      ? meal.options.map(normalizeMealOption)
      : [],
  };
}

function normalizeMealOption(option: any, index: number): MealOption {
  return {
    label: String(option?.label || option?.name || `Opción ${index + 1}`),
    items: normalizeStringArray(option?.items || option?.foods),
  };
}

function normalizeSupplement(supplement: any, index: number): SupplementType {
  return {
    title: String(
      supplement?.title || supplement?.name || supplement?.label || `Suplemento ${index + 1}`
    ),
    dosage: String(supplement?.dosage || supplement?.dose || ""),
    timing: String(supplement?.timing || supplement?.time || supplement?.moment || ""),
    notes: String(supplement?.notes || supplement?.description || ""),
  };
}

function normalizeCardio(cardio: any): CardioPlan {
  return {
    title: String(cardio?.title || cardio?.name || ""),
    frequency: String(cardio?.frequency || cardio?.days || ""),
    duration: String(cardio?.duration || cardio?.time || ""),
    intensity: String(cardio?.intensity || cardio?.pace || ""),
    notes: String(cardio?.notes || cardio?.description || ""),
  };
}

function normalizeFoodOptionGroup(group: any, index: number): FoodOptionGroup {
  return {
    title: String(group?.title || group?.name || group?.label || `Grupo ${index + 1}`),
    description: String(group?.description || group?.notes || ""),
    items: normalizeStringArray(group?.items || group?.foods || group?.options),
  };
}

function normalizeStringArray(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return [];
}

function extractWaterFromExtras(extras: any) {
  const normalizedExtras = normalizeStringArray(extras);
  const waterLine = normalizedExtras.find((extra) =>
    extra.toLowerCase().startsWith("agua")
  );

  if (!waterLine) return "";

  return waterLine.replace(/^agua\s*:\s*/i, "").trim();
}

export default function NutritionScreen() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("diet");
  const [plan, setPlan] = useState<NutritionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMeal, setSelectedMeal] = useState<MealType | null>(null);

  useEffect(() => {
    fetchNutritionPlan();
  }, []);

  async function fetchNutritionPlan() {
    try {
      const user = auth.currentUser;

      if (!user) {
        setPlan(null);
        return;
      }

      const ref = doc(db, "students", user.uid, "nutrition", "current");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();

        setPlan(normalizeNutritionPlan(data));
      } else {
        setPlan(null);
      }
    } catch (error) {
      console.log("Error cargando nutrición:", error);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#facc15" size="large" />
          <Text style={styles.loadingText}>Cargando nutrición...</Text>
        </View>
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={styles.screen}>
        <View style={styles.emptyContainer}>
          <Ionicons name="nutrition-outline" size={48} color="#facc15" />

          <Text style={styles.title}>Nutrición</Text>

          <Text style={styles.subtitle}>Información nutricional</Text>

          <Text style={styles.emptyText}>
            Cuando tu coach cargue tu plan alimenticio, aparecerá aquí.
          </Text>
        </View>
      </View>
    );
  }

  const meals = plan.meals || [];
  const extras = plan.extras || [];
  const supplements = plan.supplements || [];
  const foodOptions = plan.foodOptions || [];
  const cardio = plan.cardio || {};

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Nutrición</Text>
        <Text style={styles.subtitle}>Información nutricional</Text>

        <View style={styles.tabs}>
          <TabButton
            label="Dieta"
            active={activeTab === "diet"}
            onPress={() => setActiveTab("diet")}
          />

          <TabButton
            label="Suplementos"
            active={activeTab === "supplements"}
            onPress={() => setActiveTab("supplements")}
          />

          <TabButton
            label="Cardio"
            active={activeTab === "cardio"}
            onPress={() => setActiveTab("cardio")}
          />

          <TabButton
            label="Opciones"
            active={activeTab === "options"}
            onPress={() => setActiveTab("options")}
          />
        </View>

        {activeTab === "diet" && (
          <>
            <View style={styles.macrosCard}>
              <View style={styles.macroRow}>
                <MacroItem
                  label="Calorías al día"
                  value={plan.calories || "No indicado"}
                />

                <MacroItem
                  label="Proteínas"
                  value={plan.protein || "No indicado"}
                />
              </View>

              <View style={styles.macroRow}>
                <MacroItem
                  label="Carbohidratos"
                  value={plan.carbs || "No indicado"}
                />

                <MacroItem label="Grasas" value={plan.fats || "No indicado"} />
              </View>

              {plan.water ? (
                <View style={styles.waterBox}>
                  <Ionicons name="water" size={17} color="#38bdf8" />
                  <Text style={styles.waterText}>Agua: {plan.water}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Comidas</Text>

              <View style={styles.mealCountBadge}>
                <Text style={styles.mealCountText}>{meals.length}</Text>
              </View>
            </View>

            <View style={styles.mealsCard}>
              {meals.length > 0 ? (
                meals.map((meal, index) => (
                  <MealCard
                    key={`${meal.title}-${index}`}
                    meal={meal}
                    onPress={() => setSelectedMeal(meal)}
                  />
                ))
              ) : (
                <EmptyBox
                  icon="fast-food-outline"
                  title="Sin comidas cargadas"
                  text="Tu coach aún no agregó comidas a este plan."
                />
              )}
            </View>

            {extras.length > 0 ? (
              <>
                <Text style={styles.sectionTitleExtra}>Extras importantes</Text>

                <View style={styles.extrasCard}>
                  {extras.map((extra, index) => (
                    <View key={`${extra}-${index}`} style={styles.extraRow}>
                      <View style={styles.extraDot} />
                      <Text style={styles.extraText}>{extra}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.readOnlyCard}>
              <Ionicons name="lock-closed-outline" size={17} color="#8a8a8a" />

              <Text style={styles.readOnlyText}>
                Este plan es solo de lectura. Si necesitas cambios, consúltalo
                con tu coach.
              </Text>
            </View>
          </>
        )}

        {activeTab === "supplements" && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Suplementos</Text>

              <View style={styles.mealCountBadge}>
                <Text style={styles.mealCountText}>{supplements.length}</Text>
              </View>
            </View>

            <View style={styles.contentCard}>
              {supplements.length > 0 ? (
                supplements.map((supplement, index) => (
                  <SupplementCard
                    key={`${supplement.title}-${index}`}
                    supplement={supplement}
                  />
                ))
              ) : (
                <EmptyBox
                  icon="medkit-outline"
                  title="Sin suplementos"
                  text="Tu coach aún no agregó suplementos a este plan."
                />
              )}
            </View>

            <View style={styles.readOnlyCard}>
              <Ionicons
                name="information-circle-outline"
                size={17}
                color="#8a8a8a"
              />

              <Text style={styles.readOnlyText}>
                Usa suplementos solo como fueron indicados por tu coach.
              </Text>
            </View>
          </>
        )}

        {activeTab === "cardio" && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Cardio</Text>
            </View>

            <View style={styles.contentCard}>
              {cardio.title ||
              cardio.frequency ||
              cardio.duration ||
              cardio.intensity ||
              cardio.notes ? (
                <View style={styles.cardioBox}>
                  <View style={styles.cardioIconBox}>
                    <Ionicons name="walk-outline" size={26} color="#050505" />
                  </View>

                  <Text style={styles.cardioTitle}>
                    {cardio.title || "Plan de cardio"}
                  </Text>

                  <View style={styles.cardioGrid}>
                    <CardioInfo
                      label="Frecuencia"
                      value={cardio.frequency || "No indicado"}
                      icon="calendar-outline"
                    />

                    <CardioInfo
                      label="Duración"
                      value={cardio.duration || "No indicado"}
                      icon="time-outline"
                    />

                    <CardioInfo
                      label="Intensidad"
                      value={cardio.intensity || "No indicado"}
                      icon="speedometer-outline"
                    />
                  </View>

                  {cardio.notes ? (
                    <View style={styles.cardioNotesBox}>
                      <Ionicons
                        name="chatbox-ellipses-outline"
                        size={16}
                        color="#facc15"
                      />
                      <Text style={styles.cardioNotes}>{cardio.notes}</Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <EmptyBox
                  icon="walk-outline"
                  title="Sin cardio asignado"
                  text="Tu coach aún no agregó indicaciones de cardio."
                />
              )}
            </View>
          </>
        )}

        {activeTab === "options" && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Opciones de cambio</Text>

              <View style={styles.mealCountBadge}>
                <Text style={styles.mealCountText}>{foodOptions.length}</Text>
              </View>
            </View>

            <View style={styles.contentCard}>
              {foodOptions.length > 0 ? (
                foodOptions.map((group, index) => (
                  <FoodOptionCard
                    key={`${group.title}-${index}`}
                    group={group}
                  />
                ))
              ) : (
                <EmptyBox
                  icon="swap-horizontal-outline"
                  title="Sin opciones cargadas"
                  text="Tu coach aún no agregó equivalencias o cambios de alimentos."
                />
              )}
            </View>

            <View style={styles.readOnlyCard}>
              <Ionicons name="lock-closed-outline" size={17} color="#8a8a8a" />

              <Text style={styles.readOnlyText}>
                Estas opciones son solo de referencia. Si necesitas cambiar
                algo, consúltalo con tu coach.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <MealModal meal={selectedMeal} onClose={() => setSelectedMeal(null)} />
    </View>
  );
}

function TabButton({
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

function MacroItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.macroItem}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>{value}</Text>
    </View>
  );
}

function MealCard({
  meal,
  onPress,
}: {
  meal: MealType;
  onPress: () => void;
}) {
  const optionCount = meal.options?.length || 0;
  const emoji = getMealEmoji(meal);
  const image = getMealImage(meal);

  return (
    <Pressable style={styles.meal} onPress={onPress}>
      <View style={styles.mealImageBox}>
        <Image source={{ uri: image }} style={styles.mealImage} />

        <View style={styles.emojiBadge}>
          <Text style={styles.emojiText}>{emoji}</Text>
        </View>
      </View>

      <View style={styles.mealInfo}>
        <Text style={styles.mealTitle}>{meal.title}</Text>

        <Text style={styles.mealDescription} numberOfLines={1}>
          {meal.subtitle || "Comida asignada"}
        </Text>

        <Text style={styles.mealOptionsText}>
          {optionCount > 0
            ? `${optionCount} opciones disponibles`
            : "Sin opciones cargadas"}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color="#8a8a8a" />
    </Pressable>
  );
}

function SupplementCard({ supplement }: { supplement: SupplementType }) {
  return (
    <View style={styles.supplementCard}>
      <View style={styles.supplementIconBox}>
        <Ionicons name="medkit-outline" size={20} color="#facc15" />
      </View>

      <View style={styles.supplementInfo}>
        <Text style={styles.supplementTitle}>{supplement.title}</Text>

        {supplement.dosage ? (
          <Text style={styles.supplementText}>Dosis: {supplement.dosage}</Text>
        ) : null}

        {supplement.timing ? (
          <Text style={styles.supplementText}>
            Momento: {supplement.timing}
          </Text>
        ) : null}

        {supplement.notes ? (
          <Text style={styles.supplementNotes}>{supplement.notes}</Text>
        ) : null}
      </View>
    </View>
  );
}

function CardioInfo({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.cardioInfo}>
      <Ionicons name={icon} size={16} color="#facc15" />
      <Text style={styles.cardioInfoLabel}>{label}</Text>
      <Text style={styles.cardioInfoValue}>{value}</Text>
    </View>
  );
}

function FoodOptionCard({ group }: { group: FoodOptionGroup }) {
  return (
    <View style={styles.foodOptionCard}>
      <View style={styles.foodOptionHeader}>
        <View style={styles.foodOptionIconBox}>
          <Ionicons name="swap-horizontal" size={19} color="#050505" />
        </View>

        <View style={styles.foodOptionTitleBox}>
          <Text style={styles.foodOptionTitle}>{group.title}</Text>

          {group.description ? (
            <Text style={styles.foodOptionDescription}>
              {group.description}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.foodOptionItems}>
        {group.items.map((item, index) => (
          <View key={`${item}-${index}`} style={styles.foodOptionItemRow}>
            <View style={styles.optionDot} />
            <Text style={styles.foodOptionItemText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function EmptyBox({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.noMealsBox}>
      <Ionicons name={icon} size={34} color="#facc15" />
      <Text style={styles.noMealsTitle}>{title}</Text>
      <Text style={styles.noMealsText}>{text}</Text>
    </View>
  );
}

function MealModal({
  meal,
  onClose,
}: {
  meal: MealType | null;
  onClose: () => void;
}) {
  if (!meal) return null;

  const options = meal.options || [];
  const emoji = getMealEmoji(meal);
  const image = getMealImage(meal);

  return (
    <Modal visible={!!meal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleBox}>
                <Text style={styles.modalEmoji}>{emoji}</Text>

                <View style={styles.modalTitleContent}>
                  <Text style={styles.modalTitle}>{meal.title}</Text>
                  <Text style={styles.modalSubtitle}>
                    {meal.subtitle || "Detalle de comida"}
                  </Text>
                </View>
              </View>

              <Pressable style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={23} color="#ffffff" />
              </Pressable>
            </View>

            <View style={styles.modalImageBox}>
              <Image source={{ uri: image }} style={styles.modalImage} />

              <View style={styles.modalImageOverlay}>
                <Text style={styles.modalImageText}>Opciones de comida</Text>
              </View>
            </View>

            {options.length > 0 ? (
              options.map((option, optionIndex) => (
                <View
                  key={`${option.label}-${optionIndex}`}
                  style={styles.optionCard}
                >
                  <View style={styles.optionHeader}>
                    <View style={styles.optionIconBox}>
                      <Text style={styles.optionLetter}>
                        {option.label.replace("Opción ", "")}
                      </Text>
                    </View>

                    <Text style={styles.optionTitle}>{option.label}</Text>
                  </View>

                  <View style={styles.optionItems}>
                    {option.items.map((item, itemIndex) => (
                      <View
                        key={`${item}-${itemIndex}`}
                        style={styles.optionItemRow}
                      >
                        <View style={styles.optionDot} />
                        <Text style={styles.optionItemText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.noOptionsBox}>
                <Ionicons
                  name="information-circle-outline"
                  size={20}
                  color="#facc15"
                />

                <Text style={styles.noOptionsText}>
                  Esta comida aún no tiene opciones cargadas.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050505",
  },

  container: {
    padding: 16,
    paddingTop: 1,
    paddingBottom: 30,
  },

  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },

  loadingText: {
    color: "#ffffff",
    fontWeight: "700",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },

  emptyText: {
    color: "#9a9a9a",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
    fontWeight: "600",
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

  macrosCard: {
    backgroundColor: "#101010",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#1c1c1c",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 10,
  },

  macroRow: {
    flexDirection: "row",
    marginBottom: 12,
  },

  macroItem: {
    flex: 1,
  },

  macroLabel: {
    color: "#8f8f8f",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 3,
  },

  macroValue: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  waterBox: {
    borderTopWidth: 1,
    borderTopColor: "#1f1f1f",
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  waterText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
    paddingHorizontal: 2,
  },

  sectionTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  sectionTitleExtra: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 14,
    marginBottom: 7,
    paddingHorizontal: 2,
  },

  mealCountBadge: {
    backgroundColor: "#1a1a1a",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#292929",
  },

  mealCountText: {
    color: "#facc15",
    fontSize: 10,
    fontWeight: "900",
  },

  mealsCard: {
    backgroundColor: "#101010",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#1c1c1c",
    overflow: "hidden",
  },

  contentCard: {
    backgroundColor: "#101010",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#1c1c1c",
    overflow: "hidden",
  },

  meal: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e1e",
  },

  mealImageBox: {
    width: 44,
    height: 44,
    marginRight: 10,
  },

  mealImage: {
    width: 44,
    height: 44,
    borderRadius: 9,
    backgroundColor: "#1f1f1f",
  },

  emojiBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 99,
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },

  emojiText: {
    fontSize: 11,
  },

  mealInfo: {
    flex: 1,
    paddingRight: 8,
  },

  mealTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },

  mealDescription: {
    color: "#facc15",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },

  mealOptionsText: {
    color: "#8a8a8a",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 3,
  },

  noMealsBox: {
    paddingVertical: 34,
    paddingHorizontal: 18,
    alignItems: "center",
  },

  noMealsTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 10,
  },

  noMealsText: {
    color: "#9a9a9a",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },

  extrasCard: {
    backgroundColor: "#101010",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#1c1c1c",
    padding: 12,
  },

  extraRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 9,
  },

  extraDot: {
    width: 5,
    height: 5,
    borderRadius: 99,
    backgroundColor: "#facc15",
    marginTop: 6,
  },

  extraText: {
    color: "#d4d4d4",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    flex: 1,
  },

  readOnlyCard: {
    backgroundColor: "#101010",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#1c1c1c",
    padding: 12,
    marginTop: 14,
    flexDirection: "row",
    gap: 9,
  },

  readOnlyText: {
    color: "#8a8a8a",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "600",
    flex: 1,
  },

  supplementCard: {
    flexDirection: "row",
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e1e",
    gap: 11,
  },

  supplementIconBox: {
    width: 38,
    height: 38,
    borderRadius: 99,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },

  supplementInfo: {
    flex: 1,
  },

  supplementTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 4,
  },

  supplementText: {
    color: "#d4d4d4",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },

  supplementNotes: {
    color: "#8a8a8a",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 7,
  },

  cardioBox: {
    padding: 14,
    alignItems: "center",
  },

  cardioIconBox: {
    width: 58,
    height: 58,
    borderRadius: 99,
    backgroundColor: "#facc15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  cardioTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },

  cardioGrid: {
    width: "100%",
    marginTop: 14,
    gap: 10,
  },

  cardioInfo: {
    backgroundColor: "#151515",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#242424",
    padding: 12,
  },

  cardioInfoLabel: {
    color: "#8a8a8a",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 6,
  },

  cardioInfoValue: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 3,
  },

  cardioNotesBox: {
    width: "100%",
    backgroundColor: "#151515",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#242424",
    padding: 12,
    marginTop: 12,
    flexDirection: "row",
    gap: 9,
  },

  cardioNotes: {
    color: "#d4d4d4",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    flex: 1,
  },

  foodOptionCard: {
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e1e",
  },

  foodOptionHeader: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },

  foodOptionIconBox: {
    width: 34,
    height: 34,
    borderRadius: 99,
    backgroundColor: "#facc15",
    alignItems: "center",
    justifyContent: "center",
  },

  foodOptionTitleBox: {
    flex: 1,
  },

  foodOptionTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  foodOptionDescription: {
    color: "#8a8a8a",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
  },

  foodOptionItems: {
    marginTop: 12,
    gap: 8,
  },

  foodOptionItemRow: {
    flexDirection: "row",
    gap: 8,
  },

  foodOptionItemText: {
    color: "#d4d4d4",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    flex: 1,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "center",
    padding: 16,
  },

  modalCard: {
    backgroundColor: "#0b0b0b",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 14,
    maxHeight: "86%",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  modalTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },

  modalEmoji: {
    fontSize: 28,
    marginRight: 10,
  },

  modalTitleContent: {
    flex: 1,
  },

  modalTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },

  modalSubtitle: {
    color: "#facc15",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 99,
    backgroundColor: "#1f1f1f",
    alignItems: "center",
    justifyContent: "center",
  },

  modalImageBox: {
    height: 135,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#171717",
    marginTop: 14,
    marginBottom: 12,
  },

  modalImage: {
    width: "100%",
    height: "100%",
  },

  modalImageOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  modalImageText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },

  optionCard: {
    backgroundColor: "#111111",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#242424",
    padding: 12,
    marginBottom: 10,
  },

  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 10,
  },

  optionIconBox: {
    width: 30,
    height: 30,
    borderRadius: 99,
    backgroundColor: "#facc15",
    alignItems: "center",
    justifyContent: "center",
  },

  optionLetter: {
    color: "#050505",
    fontSize: 13,
    fontWeight: "900",
  },

  optionTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },

  optionItems: {
    gap: 8,
  },

  optionItemRow: {
    flexDirection: "row",
    gap: 8,
  },

  optionDot: {
    width: 5,
    height: 5,
    borderRadius: 99,
    backgroundColor: "#facc15",
    marginTop: 6,
  },

  optionItemText: {
    color: "#d4d4d4",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    flex: 1,
  },

  noOptionsBox: {
    backgroundColor: "#111111",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#242424",
    padding: 12,
    flexDirection: "row",
    gap: 8,
  },

  noOptionsText: {
    color: "#a3a3a3",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    flex: 1,
  },
});