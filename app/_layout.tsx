import { Stack } from "expo-router";
import { StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#050505"
          translucent={false}
        />

        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: "#050505",
              },
            }}
          >
            <Stack.Screen name="login" options={{ animation: "fade" }} />

            <Stack.Screen name="(tabs)" />

            <Stack.Screen
              name="training/register-series"
              options={{
                presentation: "transparentModal",
                animation: "fade",
                contentStyle: {
                  backgroundColor: "#050505",
                },
              }}
            />
          </Stack>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050505",
  },

  safeArea: {
    flex: 1,
    backgroundColor: "#050505",
  },
});