import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import WeighingScaleScreen from "./src/bluetoothWeighingMachine/WeighingScaleScreen";

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="WeighingScale"
          component={WeighingScaleScreen}
          options={{ title: "Weighing Scale" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
