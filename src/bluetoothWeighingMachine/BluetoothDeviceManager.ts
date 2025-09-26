import RNBluetoothClassic from "react-native-bluetooth-classic";
import { PermissionsAndroid, Platform } from "react-native";

export interface BluetoothDevice {
  id: string;
  name: string;
  address: string;
}

export class BluetoothDeviceManager {
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === "android") {
      const apiLevel = Platform.Version as number;

      const permissions =
        apiLevel >= 31
          ? [
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, // still needed for scan
            ]
          : [
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
              PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
            ];

      try {
        const granted = await PermissionsAndroid.requestMultiple(permissions);
        return Object.values(granted).every(
          (status) => status === PermissionsAndroid.RESULTS.GRANTED
        );
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  }

  async isBluetoothEnabled(): Promise<boolean> {
    return await RNBluetoothClassic.isBluetoothEnabled();
  }

  async enableBluetooth(): Promise<boolean> {
    return await RNBluetoothClassic.requestBluetoothEnabled();
  }

  async getPairedDevices(): Promise<BluetoothDevice[]> {
    try {
      const devices = await RNBluetoothClassic.getBondedDevices();
      return devices.map((device) => ({
        id: device.id,
        name: device.name || "Unknown Device",
        address: device.id,
      }));
    } catch (error) {
      console.error("Error getting paired devices:", error);
      return [];
    }
  }

  async findDeviceByName(
    devices: BluetoothDevice[],
    name: string
  ): Promise<BluetoothDevice | null> {
    return devices.find((device) => device.name === name) || null;
  }
}

export default new BluetoothDeviceManager();
