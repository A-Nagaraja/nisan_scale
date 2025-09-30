// BluetoothService.ts
import RNBluetoothClassic, {
  BluetoothDevice,
  BluetoothEventSubscription,
  BluetoothEvent,
} from "react-native-bluetooth-classic";

export enum WeighingMachineType {
  UNKNOWN = "UNKNOWN",
  ESSAE = "ESSAE",
  NISSAN = "NISSAN",
}

export enum BluetoothResponseType {
  SUCCESS = "SUCCESS",
  NO_DATA = "NO_DATA",
  TIME_OUT = "TIME_OUT",
  ERROR = "ERROR",
}

export type WeightCallback = (
  weight: number,
  responseType: BluetoothResponseType,
  errorMessage?: string
) => void;

export type MessageCallback = (
  message: string,
  responseType: BluetoothResponseType
) => void;

export type ConnectionCallback = (
  isConnected: boolean,
  errorMessage?: string
) => void;

class BluetoothService {
  private static readonly UUID = "00001101-0000-1000-8000-00805F9B34FB";
  private static readonly TIMEOUT_DURATION = 15000; // 15 sec
  private static readonly ERROR_STRING = "ERROR";

  private isConnected = false;
  private subscription?: BluetoothEventSubscription;
  private connectionSubscription?: BluetoothEventSubscription;

  private connectedDevice?: BluetoothDevice;

  async connectToDevice(device: BluetoothDevice, callback: ConnectionCallback) {
    try {
      if (!device?.id) throw new Error("Invalid device ID");
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      if (!enabled) throw new Error("Bluetooth is disabled");

      const connectedDevice = await RNBluetoothClassic.connectToDevice(
        device.id
      );

      console.log("Connected device:", connectedDevice);
      console.log("Connected device ID:", connectedDevice?.id);

      if (!connectedDevice) throw new Error("Failed to connect");

      if (connectedDevice) {
        this.connectedDevice = connectedDevice; // store full device object
        this.isConnected = true;

        // Set up connection monitoring
        this.setupConnectionMonitoring();

        callback(true);
      } else {
        callback(false, "Connection failed");
      }
    } catch (error: any) {
      this.isConnected = false;
      callback(false, error?.message ?? "Connection error");
      console.log("Connection error:", error);
    }
  }

  async disconnect(callback: (success: boolean) => void) {
    try {
      if (this.subscription) {
        this.subscription.remove();
        this.subscription = undefined;
      }

      if (this.connectionSubscription) {
        this.connectionSubscription.remove();
        this.connectionSubscription = undefined;
      }

      // Clear connection monitoring interval
      if ((this as any).connectionInterval) {
        clearInterval((this as any).connectionInterval);
        (this as any).connectionInterval = undefined;
      }

      if (this.connectedDevice) {
        await this.connectedDevice.disconnect(); // ✅ use stored device
        this.connectedDevice = undefined;
      }

      this.isConnected = false;
      callback(true);
    } catch (error) {
      callback(false);
    }
  }

  async sendDataAndForget(
    data: string,
    callback: MessageCallback
  ): Promise<void> {
    if (!this.isConnected || !this.connectedDevice) {
      callback("", BluetoothResponseType.ERROR);
      return;
    }
    try {
      await this.connectedDevice.write(data);
      console.log("Data sent:", data);
      callback("", BluetoothResponseType.SUCCESS);
    } catch {
      callback("", BluetoothResponseType.ERROR);
    }
  }

  async listenForData(
    startBytes: string,
    endBytes: string,
    liveMessagesCallback: (message: string) => void,
    callback: MessageCallback
  ): Promise<void> {
    if (!this.isConnected || !this.connectedDevice) {
      callback("", BluetoothResponseType.ERROR);
      return;
    }
    console.log("=== LISTENING FOR DATA ===");
    let buffer = "";
    let hasReceivedData = false;
    const timeout = setTimeout(() => {
      this.subscription?.remove();
      console.log("Timeout reached");
      if (hasReceivedData) {
        console.log("Received data before timeout:", buffer, buffer.length);
        // If we received some data but didn't get proper end marker,
        // return what we have (this handles the continuous stream case)
        callback(buffer, BluetoothResponseType.SUCCESS);
      } else {
        callback("", BluetoothResponseType.TIME_OUT);
      }
    }, BluetoothService.TIMEOUT_DURATION);

    this.subscription = this.connectedDevice.onDataReceived((event: any) => {
      console.log("=== EVENT RECEIVED ===");
      const data = event.data || event;
      console.log("=== DATA RECEIVED ===");
      console.log("Raw data:", data);
      console.log("Data type:", typeof data);
      console.log("Data length:", data.length);
      console.log("Data as string:", JSON.stringify(data));
      console.log("Looking for startBytes:", startBytes, "endBytes:", endBytes);

      liveMessagesCallback(data);
      buffer += data;
      hasReceivedData = true;

      console.log("Current buffer:", buffer);
      console.log("Buffer length:", buffer.length);
      console.log(
        "Buffer as hex:",
        Buffer.from(buffer, "utf8").toString("hex")
      );

      if (buffer.includes(BluetoothService.ERROR_STRING)) {
        console.log("Error detected in buffer");
        clearTimeout(timeout);
        this.subscription?.remove();
        callback("", BluetoothResponseType.ERROR);
        return;
      }

      // For weighing machines, we often get continuous data streams
      // Check if we have weight data (numbers with * or # separators)
      const hasWeightData = /\d+[\*#]/.test(buffer);
      console.log("Has weight data pattern:", hasWeightData);

      // Also check for any numeric data
      const hasAnyNumbers = /\d/.test(buffer);
      console.log("Has any numbers:", hasAnyNumbers);

      if (hasWeightData) {
        // If we have weight data and either:
        // 1. We have both start and end markers, OR
        // 2. We have substantial data (indicating a complete reading)
        const hasStartEnd =
          buffer.includes(startBytes) && buffer.includes(endBytes);
        const hasSubstantialData = buffer.length > 5; // Reduced threshold for testing
        console.log("Has start/end markers:", hasStartEnd);
        console.log("Has substantial data:", hasSubstantialData);

        if (hasStartEnd || hasSubstantialData) {
          console.log("Weight data detected, processing...");
          clearTimeout(timeout);
          this.subscription?.remove();
          callback(buffer, BluetoothResponseType.SUCCESS);
        }
      } else if (hasAnyNumbers && buffer.length > 3) {
        // If we have any numbers and some data, let's try to process it
        console.log("Found numeric data, attempting to process...");
        clearTimeout(timeout);
        this.subscription?.remove();
        callback(buffer, BluetoothResponseType.SUCCESS);
      }

      console.log("=== END DATA PROCESSING ===");
    });
  }

  connected(): boolean {
    return this.isConnected;
  }

  breakListenLoop(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = undefined;
    }
  }

  private setupConnectionMonitoring(): void {
    // Monitor connection status periodically
    const checkConnection = async () => {
      if (this.connectedDevice && this.isConnected) {
        try {
          const isConnected = await this.connectedDevice.isConnected();
          if (!isConnected) {
            console.log("Device disconnected");
            this.isConnected = false;
            this.connectedDevice = undefined;
            if (this.subscription) {
              this.subscription.remove();
              this.subscription = undefined;
            }
          }
        } catch (error) {
          console.log("Connection check failed:", error);
          this.isConnected = false;
          this.connectedDevice = undefined;
        }
      }
    };

    // Check connection every 5 seconds
    const interval = setInterval(checkConnection, 5000);

    // Store interval ID for cleanup
    (this as any).connectionInterval = interval;
  }
}

export default new BluetoothService();
