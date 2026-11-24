import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import AllUsers from "./screens/AllUsers";
import StackNavigation from "./screens/Stack";
import ImagePickerScreen from "./screens/ImagePicker";
import CameraScreen from "./screens/CameraScreen";

import { ThemeProvider, useTheme } from './context/ThemeContext';

const Tab = createBottomTabNavigator();

function AppNavigation() {
  const { mode, colors, ready } = useTheme();
  const baseTheme = mode === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.primary
    }
  };

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <NavigationContainer theme={navigationTheme}>
        <Tab.Navigator
          initialRouteName="ImagePickerScreen"
          screenOptions={{
            headerShown: false,
            tabBarHideOnKeyboard: true,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.muted,
            tabBarStyle: {
              backgroundColor: colors.surface,
              borderTopColor: colors.border
            }
          }}
        >
          <Tab.Screen name='Conversations' component={StackNavigation} />
          <Tab.Screen name='AllUsers' component={AllUsers} options={{ headerShown: true }} />
          <Tab.Screen name='ImagePickerScreen' component={ImagePickerScreen} options={{ headerShown: true }} />
          <Tab.Screen name='CameraScreen' component={CameraScreen} options={{ headerShown: false }} />
          
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppNavigation />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

