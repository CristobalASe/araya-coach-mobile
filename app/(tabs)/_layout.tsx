import { Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebaseConfig";

export default function TabLayout() {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
      }
    });

    return unsubscribe;
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#171717",
          borderTopColor: "#262626",
          height: 100,
          paddingBottom: 40,
          paddingTop: 10,
        },
        tabBarActiveTintColor: "#eab308",
        tabBarInactiveTintColor: "#a3a3a3",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: "Alumno",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="training"
        options={{
          title: "Entreno",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="barbell" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="nutrition"
        options={{
          title: "Nutrición",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="progress"
        options={{
          title: "Progreso",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="analytics" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}