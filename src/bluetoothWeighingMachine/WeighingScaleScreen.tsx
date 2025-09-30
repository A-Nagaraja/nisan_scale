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
  const [isContinuousMode, setIsContinuousMode] = useState(false);
  const [continuousInterval, setContinuousInterval] =
    useState<NodeJS.Timeout | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    initializeBluetooth();

    // Cleanup function to stop continuous monitoring when component unmounts
    return () => {
      if (continuousInterval) {
        clearInterval(continuousInterval);
      }
    };
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
    console.log("Connecting to device:", device);
    try {
      setIsLoading(true);
      await BluetoothService.connectToDevice(
        device,
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
      // Stop continuous monitoring if active
      if (continuousInterval) {
        clearInterval(continuousInterval);
        setContinuousInterval(null);
        setIsContinuousMode(false);
      }

      // Stop continuous data monitoring if active
      if (isMonitoring) {
        BluetoothService.stopContinuousMonitoring();
        setIsMonitoring(false);
      }

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

      console.log("Service wrapper:", serviceWrapper);

      serviceWrapper.getWeightIfConnected(
        (weight, responseType, errorMessage) => {
          console.log("Weight callback received:", {
            weight,
            responseType,
            errorMessage,
          });
          setIsLoading(false);
          setLiveMessage("");
          if (responseType === "SUCCESS") {
            setWeight(weight);
            if (!isContinuousMode) {
              Alert.alert("Weight Reading", `Weight: ${weight} grams`);
            }
          } else if (responseType === "TIME_OUT") {
            if (!isContinuousMode) {
              Alert.alert(
                "Timeout",
                "Weight reading timed out. Please try again."
              );
            }
          } else if (responseType === "NO_DATA") {
            if (!isContinuousMode) {
              Alert.alert(
                "No Data",
                "No weight data received. Please ensure the scale is ready and try again."
              );
            }
          } else {
            if (!isContinuousMode) {
              Alert.alert("Error", errorMessage || "Failed to read weight");
            }
          }
        },
        (message) => {
          console.log("Live message received:", message);
          setLiveMessage(message);
        }
      );
    } catch (error) {
      setIsLoading(false);
      setLiveMessage("");
      console.error("Get weight error:", error);
      if (!isContinuousMode) {
        Alert.alert("Error", "Failed to read weight");
      }
    }
  };

  const testDifferentCommands = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to a device first");
      return;
    }

    // Expanded list of commands that weighing machines commonly use
    const testCommands = [
      "#E*", // Original command
      "E", // Simple E
      "#E", // E without *
      "WEIGHT", // Full word
      "W", // Single letter
      "R", // Read
      "READ", // Full read
      "S", // Status
      "STATUS", // Full status
      "D", // Data
      "DATA", // Full data
      "M", // Measure
      "MEASURE", // Full measure
      "T", // Tare
      "TARE", // Full tare
      "Z", // Zero
      "ZERO", // Full zero
      "P", // Print
      "PRINT", // Full print
      "?", // Query
      "!", // Exclamation
      "\r", // Carriage return
      "\n", // New line
      "\r\n", // CRLF
      "AT", // AT command
      "AT+", // AT+ command
      "OK", // OK command
      "START", // Start command
      "STOP", // Stop command
      "RESET", // Reset command
    ];

    console.log("=== STARTING COMMAND TESTING ===");
    setLiveMessage("Testing commands...");

    for (let i = 0; i < testCommands.length; i++) {
      const command = testCommands[i];
      console.log(
        `\n=== TESTING COMMAND ${i + 1}/${testCommands.length}: ${command} ===`
      );
      setLiveMessage(
        `Testing command ${i + 1}/${testCommands.length}: ${command}`
      );

      try {
        // Send the command
        await BluetoothService.sendDataAndForget(
          command,
          (message, responseType) => {
            console.log(`Command ${command} send result:`, responseType);
          }
        );

        // Wait a bit for the command to be processed
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Listen for any response with a shorter timeout
        let responseReceived = false;
        await BluetoothService.listenForDataWithTimeout(
          "",
          "",
          (message) => {
            console.log(`LIVE RESPONSE to ${command}:`, message);
            setLiveMessage(`Response to ${command}: ${message}`);
            responseReceived = true;
          },
          (message, responseType) => {
            console.log(`FINAL RESPONSE to ${command}:`, message, responseType);
            if (responseType === "SUCCESS" && message) {
              console.log(
                `🎉 SUCCESS! Command ${command} received response: ${message}`
              );
              setLiveMessage(`SUCCESS! ${command} -> ${message}`);
              // Don't continue testing if we found a working command
              return;
            }
          },
          3000 // 3 second timeout for command testing
        );

        // Wait between commands
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.log(`Error testing command ${command}:`, error);
      }
    }

    console.log("=== COMMAND TESTING COMPLETED ===");
    setLiveMessage("Command testing completed");
  };

  const toggleContinuousMonitoring = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to a device first");
      return;
    }

    if (isMonitoring) {
      // Stop monitoring
      BluetoothService.stopContinuousMonitoring();
      setIsMonitoring(false);
      setLiveMessage("Continuous monitoring stopped");
    } else {
      // Start monitoring
      setIsMonitoring(true);
      setLiveMessage(
        "Starting continuous monitoring... Try placing items on the scale!"
      );

      await BluetoothService.startContinuousMonitoring((message) => {
        console.log("Continuous monitoring received:", message);
        setLiveMessage(`Data received: ${message}`);

        // Try to parse the data as weight
        const serviceWrapper = createBluetoothServiceWrapper(
          machineType,
          BluetoothService
        );

        serviceWrapper.parseWeightFromMessage(
          message,
          (weight, responseType, errorMessage) => {
            if (responseType === "SUCCESS" && weight > 0) {
              setWeight(weight);
              setLiveMessage(`Weight detected: ${weight} grams`);
            }
          }
        );
      });
    }
  };

  const testContinuousData = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to a device first");
      return;
    }

    console.log("Testing continuous data from weighing machine...");
    setLiveMessage("Testing continuous data...");

    try {
      await BluetoothService.testContinuousData(
        (message) => {
          console.log("Continuous data received:", message);
          setLiveMessage(`Continuous data: ${message}`);
        },
        (message, responseType) => {
          console.log("Continuous data test result:", message, responseType);
          setLiveMessage(`Continuous test result: ${responseType}`);
          if (responseType === "SUCCESS") {
            Alert.alert("Continuous Data Found", `Data: ${message}`);
          } else {
            Alert.alert(
              "No Continuous Data",
              "The weighing machine doesn't send data automatically"
            );
          }
        }
      );
    } catch (error) {
      console.error("Continuous data test error:", error);
      setLiveMessage("Continuous data test failed");
    }
  };

  const toggleContinuousMode = () => {
    if (isContinuousMode) {
      // Stop continuous monitoring
      if (continuousInterval) {
        clearInterval(continuousInterval);
        setContinuousInterval(null);
      }
      setIsContinuousMode(false);
      setLiveMessage("");
    } else {
      // Start continuous monitoring
      setIsContinuousMode(true);
      setLiveMessage("Starting continuous monitoring...");

      // Get weight immediately
      getWeight();

      // Then set up interval for continuous readings
      const interval = setInterval(() => {
        if (isConnected && !isLoading) {
          getWeight();
        }
      }, 2000); // Read every 2 seconds

      setContinuousInterval(interval);
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
          disabled={!isConnected || isLoading || isContinuousMode}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Get Weight</Text>
          )}
        </TouchableOpacity>

        {/* <TouchableOpacity
          style={[
            styles.button,
            isMonitoring
              ? styles.stopMonitoringButton
              : styles.monitoringButton,
          ]}
          onPress={toggleContinuousMonitoring}
          disabled={!isConnected || isLoading}
        >
          <Text style={styles.buttonText}>
            {isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.testButton]}
          onPress={testContinuousData}
          disabled={!isConnected || isLoading}
        >
          <Text style={styles.buttonText}>Test Continuous Data</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.testButton]}
          onPress={testDifferentCommands}
          disabled={!isConnected || isLoading}
        >
          <Text style={styles.buttonText}>Test Commands</Text>
        </TouchableOpacity> */}

        {/* <TouchableOpacity
          style={[
            styles.button,
            isContinuousMode
              ? styles.stopContinuousButton
              : styles.continuousButton,
          ]}
          onPress={toggleContinuousMode}
          disabled={!isConnected || isLoading}
        >
          <Text style={styles.buttonText}>
            {isContinuousMode ? "Stop Monitoring" : "Continuous Mode"}
          </Text>
        </TouchableOpacity> */}

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
    flexWrap: "wrap",
  },
  button: {
    padding: 15,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
    margin: 5,
  },
  getWeightButton: {
    backgroundColor: "#28a745",
  },
  testButton: {
    backgroundColor: "#6f42c1",
  },
  monitoringButton: {
    backgroundColor: "#28a745",
  },
  stopMonitoringButton: {
    backgroundColor: "#dc3545",
  },
  continuousButton: {
    backgroundColor: "#17a2b8",
  },
  stopContinuousButton: {
    backgroundColor: "#ffc107",
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
