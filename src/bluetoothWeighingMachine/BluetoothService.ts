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
    console.log("Connected device:", this.connectedDevice);
    console.log("Device ID:", this.connectedDevice.id);
    console.log("Device name:", this.connectedDevice.name);

    // Check if device is still connected
    try {
      const isConnected = await this.connectedDevice.isConnected();
      console.log("Device connection status:", isConnected);
      if (!isConnected) {
        console.log("Device is not connected, aborting listen");
        callback("", BluetoothResponseType.ERROR);
        return;
      }
    } catch (error) {
      console.log("Error checking connection:", error);
    }

    let buffer = "";
    let hasReceivedData = false;
    let dataReceivedCount = 0;

    const timeout = setTimeout(() => {
      console.log("=== TIMEOUT REACHED ===");
      console.log("Data received count:", dataReceivedCount);
      console.log("Has received data:", hasReceivedData);
      console.log("Final buffer:", buffer);
      console.log("Buffer length:", buffer.length);

      this.subscription?.remove();
      if (hasReceivedData) {
        console.log("Returning received data despite timeout");
        callback(buffer, BluetoothResponseType.SUCCESS);
      } else {
        console.log("No data received, returning timeout");
        callback("", BluetoothResponseType.TIME_OUT);
      }
    }, BluetoothService.TIMEOUT_DURATION);

    // Set up the data listener
    console.log("Setting up data listener...");
    this.subscription = this.connectedDevice.onDataReceived((event: any) => {
      dataReceivedCount++;
      console.log("=== EVENT RECEIVED #" + dataReceivedCount + " ===");
      console.log("Event object:", event);
      console.log("Event keys:", Object.keys(event));

      const data = event.data || event;
      console.log("=== DATA RECEIVED ===");
      console.log("Raw data:", data);
      console.log("Data type:", typeof data);
      console.log("Data length:", data ? data.length : 0);
      console.log("Data as string:", JSON.stringify(data));
      console.log("Looking for startBytes:", startBytes, "endBytes:", endBytes);

      if (data) {
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
      } else {
        console.log("No data in event, but event was received");
      }

      console.log("=== END DATA PROCESSING ===");
    });

    console.log("Data listener set up, waiting for data...");
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

  async testContinuousData(
    liveMessagesCallback: (message: string) => void,
    callback: MessageCallback
  ): Promise<void> {
    if (!this.isConnected || !this.connectedDevice) {
      callback("", BluetoothResponseType.ERROR);
      return;
    }

    console.log("=== TESTING CONTINUOUS DATA ===");
    console.log("Listening for any data from the weighing machine...");

    let buffer = "";
    let hasReceivedData = false;
    let dataReceivedCount = 0;

    const timeout = setTimeout(() => {
      console.log("=== CONTINUOUS DATA TIMEOUT ===");
      console.log("Data received count:", dataReceivedCount);
      console.log("Has received data:", hasReceivedData);
      console.log("Final buffer:", buffer);

      this.subscription?.remove();
      if (hasReceivedData) {
        console.log("Returning received continuous data");
        callback(buffer, BluetoothResponseType.SUCCESS);
      } else {
        console.log("No continuous data received");
        callback("", BluetoothResponseType.TIME_OUT);
      }
    }, 10000); // 10 second timeout for continuous data test

    this.subscription = this.connectedDevice.onDataReceived((event: any) => {
      dataReceivedCount++;
      console.log("=== CONTINUOUS DATA EVENT #" + dataReceivedCount + " ===");
      console.log("Event object:", event);

      const data = event.data || event;
      console.log("Continuous data received:", data);
      console.log("Data type:", typeof data);
      console.log("Data length:", data ? data.length : 0);

      if (data) {
        liveMessagesCallback(data);
        buffer += data;
        hasReceivedData = true;
        console.log("Continuous buffer:", buffer);
      }
    });

    console.log("Continuous data listener set up, waiting...");
  }

  async testBasicConnection(): Promise<void> {
    if (!this.isConnected || !this.connectedDevice) {
      console.log("Not connected, cannot test basic connection");
      return;
    }

    console.log("=== TESTING BASIC CONNECTION ===");
    try {
      const isConnected = await this.connectedDevice.isConnected();
      console.log("Device connection status:", isConnected);

      if (isConnected) {
        console.log("Device is connected, testing data listener setup...");

        // Test if we can set up a data listener
        let listenerTestCount = 0;
        const testTimeout = setTimeout(() => {
          console.log("Basic connection test timeout - no data received");
          this.subscription?.remove();
        }, 5000);

        this.subscription = this.connectedDevice.onDataReceived(
          (event: any) => {
            listenerTestCount++;
            console.log(
              "Basic connection test - data received #" + listenerTestCount
            );
            console.log("Event:", event);
            clearTimeout(testTimeout);
            this.subscription?.remove();
          }
        );

        console.log("Basic connection test listener set up");
      } else {
        console.log("Device is not connected");
      }
    } catch (error) {
      console.log("Error testing basic connection:", error);
    }
  }

  async listenForDataWithTimeout(
    startBytes: string,
    endBytes: string,
    liveMessagesCallback: (message: string) => void,
    callback: MessageCallback,
    timeoutMs: number = 3000
  ): Promise<void> {
    if (!this.isConnected || !this.connectedDevice) {
      callback("", BluetoothResponseType.ERROR);
      return;
    }

    console.log(`=== LISTENING FOR DATA (${timeoutMs}ms timeout) ===`);

    let buffer = "";
    let hasReceivedData = false;
    let dataReceivedCount = 0;

    const timeout = setTimeout(() => {
      console.log(`=== TIMEOUT REACHED (${timeoutMs}ms) ===`);
      console.log("Data received count:", dataReceivedCount);
      console.log("Has received data:", hasReceivedData);
      console.log("Final buffer:", buffer);

      this.subscription?.remove();
      if (hasReceivedData) {
        console.log("Returning received data despite timeout");
        callback(buffer, BluetoothResponseType.SUCCESS);
      } else {
        console.log("No data received, returning timeout");
        callback("", BluetoothResponseType.TIME_OUT);
      }
    }, timeoutMs);

    this.subscription = this.connectedDevice.onDataReceived((event: any) => {
      dataReceivedCount++;
      console.log(`=== EVENT RECEIVED #${dataReceivedCount} ===`);

      const data = event.data || event;
      console.log("Data received:", data);

      if (data) {
        liveMessagesCallback(data);
        buffer += data;
        hasReceivedData = true;
        console.log("Buffer:", buffer);

        // Check for any data and return immediately for command testing
        if (buffer.length > 0) {
          console.log("Data detected, returning immediately");
          clearTimeout(timeout);
          this.subscription?.remove();
          callback(buffer, BluetoothResponseType.SUCCESS);
        }
      }
    });

    console.log("Data listener set up, waiting for data...");
  }

  async startContinuousMonitoring(
    liveMessagesCallback: (message: string) => void
  ): Promise<void> {
    if (!this.isConnected || !this.connectedDevice) {
      console.log("Not connected, cannot start continuous monitoring");
      return;
    }

    console.log("=== STARTING CONTINUOUS MONITORING ===");
    console.log("This will monitor for ANY data from the weighing machine...");
    console.log(
      "Try placing items on the scale or pressing buttons on the machine"
    );

    // Remove any existing subscription
    if (this.subscription) {
      this.subscription.remove();
    }

    this.subscription = this.connectedDevice.onDataReceived((event: any) => {
      console.log("=== CONTINUOUS MONITORING - DATA RECEIVED ===");
      console.log("Event object:", event);
      console.log("Event keys:", Object.keys(event));

      const data = event.data || event;
      console.log("Raw data:", data);
      console.log("Data type:", typeof data);
      console.log("Data length:", data ? data.length : 0);
      console.log("Data as string:", JSON.stringify(data));
      console.log(
        "Data as hex:",
        data ? Buffer.from(data, "utf8").toString("hex") : "no data"
      );

      if (data) {
        liveMessagesCallback(data);
        console.log("✅ Data forwarded to UI");
      } else {
        console.log("⚠️ Event received but no data");
      }
    });

    console.log("Continuous monitoring started - listening for any data...");
  }

  stopContinuousMonitoring(): void {
    console.log("=== STOPPING CONTINUOUS MONITORING ===");
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = undefined;
      console.log("Continuous monitoring stopped");
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
