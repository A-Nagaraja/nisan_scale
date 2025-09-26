import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import BluetoothDeviceManager, {
  BluetoothDevice,
} from "./BluetoothDeviceManager";
import BluetoothService, { WeighingMachineType } from "./BluetoothService";
import { createBluetoothServiceWrapper } from "./BluetoothServiceWrapper";

const WeighingScaleScreen = () => {
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(
    null
  );
  const [machineType, setMachineType] = useState<WeighingMachineType>(
    WeighingMachineType.ESSAE
  );
  const [isConnected, setIsConnected] = useState(false);
  const [weight, setWeight] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

  useEffect(() => {
    initializeBluetooth();
  }, []);

  const initializeBluetooth = async () => {
    try {
      const hasPermission = await BluetoothDeviceManager.requestPermissions();
      if (!hasPermission) {
        Alert.alert(
          "Permission Required",
          "Bluetooth permissions are required"
        );
        return;
      }

      const isEnabled = await BluetoothDeviceManager.isBluetoothEnabled();
      if (!isEnabled) {
        const enabled = await BluetoothDeviceManager.enableBluetooth();
        if (!enabled) {
          Alert.alert("Bluetooth Required", "Please enable Bluetooth");
          return;
        }
      }

      await loadPairedDevices();
    } catch (error) {
      console.error("Bluetooth initialization error:", error);
    }
  };

  const loadPairedDevices = async () => {
    try {
      const pairedDevices = await BluetoothDeviceManager.getPairedDevices();
      setDevices(pairedDevices);
    } catch (error) {
      console.error("Error loading devices:", error);
    }
  };

  const connectToDevice = async (device: BluetoothDevice) => {
    try {
      setIsLoading(true);
      await BluetoothService.connectToDevice(
        device.id,
        (isConnected, errorMessage) => {
          setIsConnected(isConnected);
          if (isConnected) {
            setSelectedDevice(device);
            Alert.alert("Success", `Connected to ${device.name}`);
          } else {
            Alert.alert(
              "Connection Failed",
              errorMessage || "Failed to connect"
            );
          }
          setIsLoading(false);
        }
      );
    } catch (error) {
      setIsLoading(false);
      Alert.alert("Error", "Connection failed");
    }
  };

  const disconnect = async () => {
    try {
      await BluetoothService.disconnect((success) => {
        setIsConnected(false);
        setSelectedDevice(null);
        setWeight(null);
        setLiveMessage("");
      });
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  };

  const getWeight = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to a device first");
      return;
    }

    try {
      setIsLoading(true);
      setLiveMessage("Reading weight...");

      const serviceWrapper = createBluetoothServiceWrapper(
        machineType,
        BluetoothService
      );

      serviceWrapper.getWeightIfConnected(
        (weight, responseType, errorMessage) => {
          setIsLoading(false);
          setLiveMessage("");
          if (responseType === "SUCCESS") {
            setWeight(weight);
            Alert.alert("Weight Reading", `Weight: ${weight} grams`);
          } else {
            Alert.alert("Error", errorMessage || "Failed to read weight");
          }
        },
        (message) => {
          setLiveMessage(message);
        }
      );
    } catch (error) {
      setIsLoading(false);
      setLiveMessage("");
      Alert.alert("Error", "Failed to read weight");
    }
  };

  const renderDevice = ({ item }: { item: BluetoothDevice }) => (
    <TouchableOpacity
      style={[
        styles.deviceItem,
        selectedDevice?.id === item.id && styles.selectedDevice,
      ]}
      onPress={() => connectToDevice(item)}
      disabled={isLoading}
    >
      <Text style={styles.deviceName}>{item.name}</Text>
      <Text style={styles.deviceAddress}>{item.address}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Weighing Scale</Text>

      {/* Machine Type Selection */}
      <View style={styles.machineTypeContainer}>
        <Text style={styles.label}>Machine Type:</Text>
        <TouchableOpacity
          style={[
            styles.machineTypeButton,
            machineType === WeighingMachineType.ESSAE &&
              styles.selectedMachineType,
          ]}
          onPress={() => setMachineType(WeighingMachineType.ESSAE)}
        >
          <Text>ESSAE</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.machineTypeButton,
            machineType === WeighingMachineType.NISSAN &&
              styles.selectedMachineType,
          ]}
          onPress={() => setMachineType(WeighingMachineType.NISSAN)}
        >
          <Text>NISSAN</Text>
        </TouchableOpacity>
      </View>
      {/* Device List */}
      <Text style={styles.label}>Paired Devices:</Text>
      <FlatList
        data={devices}
        renderItem={renderDevice}
        keyExtractor={(item) => item.id}
        style={styles.deviceList}
      />
      {/* Connection Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Status: {isConnected ? "Connected" : "Disconnected"}
        </Text>
        {selectedDevice && (
          <Text style={styles.deviceText}>Device: {selectedDevice.name}</Text>
        )}
      </View>

      {/* Weight Display */}
      {weight !== null && (
        <View style={styles.weightContainer}>
          <Text style={styles.weightLabel}>Weight:</Text>
          <Text style={styles.weightValue}>{weight} grams</Text>
        </View>
      )}

      {/* Live Message */}
      {liveMessage && <Text style={styles.liveMessage}>{liveMessage}</Text>}

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.getWeightButton]}
          onPress={getWeight}
          disabled={!isConnected || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Get Weight</Text>
          )}
        </TouchableOpacity>

        {isConnected && (
          <TouchableOpacity
            style={[styles.button, styles.disconnectButton]}
            onPress={disconnect}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Disconnect</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default WeighingScaleScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
  },
  machineTypeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    marginRight: 10,
  },
  machineTypeButton: {
    padding: 10,
    margin: 5,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
  },
  selectedMachineType: {
    backgroundColor: "#007bff",
  },
  deviceList: {
    maxHeight: 200,
    marginBottom: 20,
  },
  deviceItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    backgroundColor: "white",
  },
  selectedDevice: {
    backgroundColor: "#e3f2fd",
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  deviceAddress: {
    fontSize: 12,
    color: "#666",
  },
  statusContainer: {
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  deviceText: {
    fontSize: 14,
    color: "#666",
  },
  weightContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  weightLabel: {
    fontSize: 18,
    fontWeight: "bold",
  },
  weightValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#007bff",
  },
  liveMessage: {
    textAlign: "center",
    fontStyle: "italic",
    color: "#666",
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  button: {
    padding: 15,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
  },
  getWeightButton: {
    backgroundColor: "#28a745",
  },
  disconnectButton: {
    backgroundColor: "#dc3545",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});
