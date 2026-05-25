import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../firebaseConfig";

const SAVED_EMAIL_KEY = "saved_email";
const SAVED_PASSWORD_KEY = "saved_password";
const REMEMBER_KEY = "remember_login";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const [errorModal, setErrorModal] = useState(false);
  const [errorTitle, setErrorTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        router.replace("/(tabs)");
        return;
      }

      await loadSavedLogin();
      setCheckingSession(false);
    });

    return unsubscribe;
  }, []);

  async function loadSavedLogin() {
    const remember = await SecureStore.getItemAsync(REMEMBER_KEY);

    if (remember === "true") {
      const savedEmail = await SecureStore.getItemAsync(SAVED_EMAIL_KEY);
      const savedPassword = await SecureStore.getItemAsync(SAVED_PASSWORD_KEY);

      if (savedEmail) setEmail(savedEmail);
      if (savedPassword) setPassword(savedPassword);

      setRememberLogin(true);
    }
  }

  async function saveLoginData() {
    if (rememberLogin) {
      await SecureStore.setItemAsync(SAVED_EMAIL_KEY, email.trim().toLowerCase());
      await SecureStore.setItemAsync(SAVED_PASSWORD_KEY, password);
      await SecureStore.setItemAsync(REMEMBER_KEY, "true");
    } else {
      await SecureStore.deleteItemAsync(SAVED_EMAIL_KEY);
      await SecureStore.deleteItemAsync(SAVED_PASSWORD_KEY);
      await SecureStore.setItemAsync(REMEMBER_KEY, "false");
    }
  }

  function showError(title: string, message: string) {
    setErrorTitle(title);
    setErrorMessage(message);
    setErrorModal(true);
  }

  async function login() {
    if (!email.trim() || !password.trim()) {
      showError("Datos incompletos", "Ingresa tu email y contraseña para continuar.");
      return;
    }

    try {
      setLoading(true);

      await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );

      await saveLoginData();

      router.replace("/(tabs)");
    } catch {
      showError(
        "No se pudo iniciar sesión",
        "El email o la contraseña no son correctos. Verifica tus datos e intenta nuevamente."
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <ImageBackground
        source={require("../assets/images/login-bg.jpg")}
        style={styles.background}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#facc15" size="large" />
            <Text style={styles.loadingText}>Preparando tu sesión...</Text>
          </View>
        </View>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground
      source={require("../assets/images/login-bg.jpg")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.content}>
            <View style={styles.logoBox}>
              <Text style={styles.brand}>ARAYA</Text>
              <Text style={styles.brandSub}>COACH</Text>
              <Text style={styles.slogan}>
                TU MEJOR VERSIÓN,{"\n"}NUESTRO OBJETIVO
              </Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.inputBox}>
                <Ionicons name="mail-outline" size={19} color="#8a8a8a" />
                <TextInput
                  placeholder="Email"
                  placeholderTextColor="#777"
                  style={styles.input}
                  value={email}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                />
              </View>

              <View style={styles.inputBox}>
                <Ionicons name="lock-closed-outline" size={19} color="#8a8a8a" />
                <TextInput
                  placeholder="Contraseña"
                  placeholderTextColor="#777"
                  style={styles.input}
                  value={password}
                  secureTextEntry={!showPassword}
                  onChangeText={setPassword}
                />

                <Pressable onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={21}
                    color="#facc15"
                  />
                </Pressable>
              </View>

              <Pressable
                style={styles.rememberRow}
                onPress={() => setRememberLogin(!rememberLogin)}
              >
                <View
                  style={[
                    styles.checkbox,
                    rememberLogin && styles.checkboxActive,
                  ]}
                >
                  {rememberLogin && (
                    <Ionicons name="checkmark" size={14} color="#050505" />
                  )}
                </View>

                <Text style={styles.rememberText}>Recordar acceso</Text>
              </Pressable>

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={login}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#050505" />
                ) : (
                  <Text style={styles.buttonText}>INICIAR SESIÓN</Text>
                )}
              </Pressable>

              <Text style={styles.footerText}>
                Acceso exclusivo para alumnos registrados
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>

        <Modal visible={errorModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.errorCard}>
              <View style={styles.errorIcon}>
                <Ionicons name="alert-circle-outline" size={34} color="#050505" />
              </View>

              <Text style={styles.errorTitle}>{errorTitle}</Text>
              <Text style={styles.errorMessage}>{errorMessage}</Text>

              <Pressable
                style={styles.errorButton}
                onPress={() => setErrorModal(false)}
              >
                <Text style={styles.errorButtonText}>ENTENDIDO</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
  },

  keyboard: {
    flex: 1,
  },

  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  logoBox: {
    alignItems: "center",
    marginBottom: 42,
  },

  brand: {
    color: "#d4a63f",
    fontSize: 54,
    fontWeight: "900",
    letterSpacing: 2,
  },

  brandSub: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 9,
    marginTop: -6,
  },

  slogan: {
    color: "#d6d6d6",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 14,
    lineHeight: 16,
    letterSpacing: 0.5,
  },

  formCard: {
    backgroundColor: "rgba(12,12,12,0.82)",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  inputBox: {
    height: 54,
    backgroundColor: "rgba(24,24,24,0.92)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#303030",
    paddingHorizontal: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  input: {
    flex: 1,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },

  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 18,
  },

  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#555",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
    backgroundColor: "#111",
  },

  checkboxActive: {
    backgroundColor: "#facc15",
    borderColor: "#facc15",
  },

  rememberText: {
    color: "#d6d6d6",
    fontSize: 13,
    fontWeight: "700",
  },

  button: {
    height: 54,
    backgroundColor: "#facc15",
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonText: {
    color: "#050505",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  footerText: {
    color: "#b5b5b5",
    fontSize: 12,
    textAlign: "center",
    marginTop: 18,
    fontWeight: "600",
  },

  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },

  errorCard: {
    width: "100%",
    backgroundColor: "#111111",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 24,
    alignItems: "center",
  },

  errorIcon: {
    width: 62,
    height: 62,
    borderRadius: 99,
    backgroundColor: "#facc15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  errorTitle: {
    color: "#ffffff",
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
  },

  errorMessage: {
    color: "#b5b5b5",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 22,
  },

  errorButton: {
    width: "100%",
    height: 50,
    backgroundColor: "#facc15",
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  errorButtonText: {
    color: "#050505",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});