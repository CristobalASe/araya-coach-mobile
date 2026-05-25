import { useState } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

export default function AddNutritionPlanScreen() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function addNutritionPlan() {
    try {
      setLoading(true);
      setMessage("");

      const user = auth.currentUser;

      if (!user) {
        setMessage("No hay usuario logeado.");
        return;
      }

      await setDoc(
        doc(db, "students", user.uid, "nutrition", "current"),
        {
          name: "Cristobal minuta",
          calories: "",
          protein: "",
          carbs: "",
          fats: "",
          water: "2,5–3 L diarios",

          meals: [
            {
              title: "Desayuno",
              subtitle: "Comida 1",
              type: "breakfast",
              options: [
                {
                  label: "Opción A",
                  items: [
                    "3 huevos enteros",
                    "2 rebanadas de pan integral",
                    "Café o té sin azúcar",
                  ],
                },
                {
                  label: "Opción B",
                  items: [
                    "2 huevos enteros + 2 láminas de jamón de pavo o pollo",
                    "2 rebanadas de pan integral",
                    "Café o té",
                  ],
                },
              ],
            },
            {
              title: "Media mañana",
              subtitle: "Snack",
              type: "snack",
              options: [
                {
                  label: "Opción A",
                  items: ["1 yogurt proteico", "1 manzana o pera"],
                },
                {
                  label: "Opción B",
                  items: [
                    "1 scoop proteína en agua",
                    "15 g frutos secos, nueces o almendras",
                  ],
                },
              ],
            },
            {
              title: "Almuerzo",
              subtitle: "Comida principal",
              type: "lunch",
              options: [
                {
                  label: "Opción A",
                  items: [
                    "150 g pechuga de pollo",
                    "150 g arroz cocido",
                    "Ensalada verde libre",
                    "1 cda aceite de oliva",
                  ],
                },
                {
                  label: "Opción B",
                  items: [
                    "150 g carne magra, posta, asiento o lomo liso",
                    "200 g papas cocidas",
                    "Verduras libres",
                  ],
                },
              ],
            },
            {
              title: "Pre entrenamiento",
              subtitle: "Antes de entrenar",
              type: "pre_workout",
              options: [
                {
                  label: "Opción A",
                  items: ["1 plátano", "Café solo"],
                },
                {
                  label: "Opción B",
                  items: [
                    "2 rebanadas pan integral",
                    "1 cda mantequilla de maní",
                  ],
                },
              ],
            },
            {
              title: "Post entrenamiento",
              subtitle: "Después de entrenar",
              type: "post_workout",
              options: [
                {
                  label: "Opción A",
                  items: [
                    "1 scoop proteína",
                    "1 fruta, manzana o plátano chico",
                  ],
                },
                {
                  label: "Opción B",
                  items: ["150 g yogurt protein", "30 g avena o cereal simple"],
                },
              ],
            },
            {
              title: "Cena",
              subtitle: "Última comida",
              type: "dinner",
              options: [
                {
                  label: "Opción A",
                  items: [
                    "180 g pescado blanco o salmón",
                    "Ensalada grande, lechuga, tomate, pepino",
                    "1 cda aceite de oliva",
                  ],
                },
                {
                  label: "Opción B",
                  items: ["3 huevos enteros", "Verduras salteadas", "½ palta"],
                },
              ],
            },
          ],

          extras: [
            "Agua: 2,5–3 L diarios",
            "Sal normal, no eliminar",
            "Mantener cargas pesadas en el gym",
            "Si el peso baja muy rápido, se sube carbo leve",
          ],

          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );

      setMessage("Minuta cargada correctamente.");
    } catch (error) {
      console.log(error);
      setMessage("Error al cargar minuta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Cargar minuta</Text>

      <Text style={styles.subtitle}>Cristobal minuta</Text>

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={addNutritionPlan}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Guardando..." : "Cargar minuta"}
        </Text>
      </Pressable>

      {!!message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050505",
    justifyContent: "center",
    padding: 20,
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
    marginBottom: 22,
    fontSize: 13,
    fontWeight: "600",
  },

  button: {
    backgroundColor: "#facc15",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: "#050505",
    fontWeight: "900",
  },

  message: {
    color: "#ffffff",
    textAlign: "center",
    marginTop: 16,
    fontWeight: "700",
  },
});