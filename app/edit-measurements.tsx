import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

export default function EditMeasurementsScreen() {
  const [neck, setNeck] = useState("");
  const [shoulders, setShoulders] = useState("");
  const [chest, setChest] = useState("");
  const [arm, setArm] = useState("");
  const [waist, setWaist] = useState("");
  const [hip, setHip] = useState("");
  const [thigh, setThigh] = useState("");
  const [calf, setCalf] = useState("");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    async function loadMeasurements() {
      const user = auth.currentUser;
      if (!user) return;

      const ref = doc(db, "students", user.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const m = snap.data().measurements || {};

        setNeck(clean(m.neck || ""));
        setShoulders(clean(m.shoulders || ""));
        setChest(clean(m.chest || ""));
        setArm(clean(m.arm || ""));
        setWaist(clean(m.waist || ""));
        setHip(clean(m.hip || ""));
        setThigh(clean(m.thigh || ""));
        setCalf(clean(m.calf || ""));
      }
    }

    loadMeasurements();
  }, []);

  function clean(v: string) {
    return String(v).replace(/[^0-9]/g, "");
  }

  async function saveMeasurements() {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setLoading(true);

      const ref = doc(db, "students", user.uid);

      await updateDoc(ref, {
        measurements: {
          neck: clean(neck),
          shoulders: clean(shoulders),
          chest: clean(chest),
          arm: clean(arm),
          waist: clean(waist),
          hip: clean(hip),
          thigh: clean(thigh),
          calf: clean(calf),
        },
      });

      setConfirm(false);
      setSuccess(true);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#eab308" }}>Volver</Text>
        </Pressable>

        <Text style={styles.title}>Editar medidas</Text>

        <View style={styles.card}>
          <Input label="Cuello" value={neck} onChangeText={setNeck} />
          <Input label="Hombros" value={shoulders} onChangeText={setShoulders} />
          <Input label="Pecho" value={chest} onChangeText={setChest} />
          <Input label="Brazo" value={arm} onChangeText={setArm} />
          <Input label="Cintura" value={waist} onChangeText={setWaist} />
          <Input label="Cadera" value={hip} onChangeText={setHip} />
          <Input label="Muslo" value={thigh} onChangeText={setThigh} />
          <Input label="Pantorrilla" value={calf} onChangeText={setCalf} />
        </View>

        <Pressable style={styles.button} onPress={() => setConfirm(true)}>
          <Text style={styles.buttonText}>
            {loading ? "Guardando..." : "Guardar"}
          </Text>
        </Pressable>
      </ScrollView>

      {/* CONFIRM MODAL */}
      <Modal visible={confirm} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Ionicons name="alert-circle" size={50} color="#eab308" />

            <Text style={styles.modalTitle}>Confirmar cambios</Text>
            <Text style={styles.modalText}>
              ¿Seguro que quieres guardar estas medidas?
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setConfirm(false)}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>

              <Pressable style={styles.okBtn} onPress={saveMeasurements}>
                <Text style={styles.okText}>Sí, guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* SUCCESS MODAL */}
      <Modal visible={success} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Ionicons name="checkmark-circle" size={60} color="#eab308" />
            <Text style={styles.modalTitle}>Listo</Text>
            <Text style={styles.modalText}>Medidas actualizadas</Text>

            <Pressable
              style={styles.okBtn}
              onPress={() => {
                setSuccess(false);
                router.back();
              }}
            >
              <Text style={styles.okText}>Continuar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Input({ label, value, onChangeText }: any) {
  return (
    <View style={styles.row}>
      <Text style={{ color: "#fff" }}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={(t) => onChangeText(t.replace(/[^0-9]/g, ""))}
          keyboardType="numeric"
          style={styles.input}
        />
        <Text style={{ color: "#777" }}>cm</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#050505" },
  container: { padding: 20, paddingTop: 60 },

  title: { color: "#fff", fontSize: 26, fontWeight: "900" },

  card: {
    backgroundColor: "#111",
    borderRadius: 14,
    padding: 14,
    marginTop: 20,
    gap: 12,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#050505",
    paddingHorizontal: 10,
    borderRadius: 10,
  },

  input: {
    color: "#fff",
    width: 60,
    textAlign: "right",
  },

  button: {
    backgroundColor: "#eab308",
    padding: 14,
    borderRadius: 12,
    marginTop: 20,
    alignItems: "center",
  },

  buttonText: { color: "#000", fontWeight: "900" },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalCard: {
    backgroundColor: "#111",
    padding: 24,
    borderRadius: 20,
    width: "80%",
    alignItems: "center",
  },

  modalTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 10,
  },

  modalText: {
    color: "#aaa",
    textAlign: "center",
    marginTop: 8,
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },

  cancelBtn: {
    padding: 10,
  },

  cancelText: {
    color: "#888",
    fontWeight: "700",
  },

  okBtn: {
    backgroundColor: "#eab308",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },

  okText: {
    color: "#000",
    fontWeight: "900",
  },
});