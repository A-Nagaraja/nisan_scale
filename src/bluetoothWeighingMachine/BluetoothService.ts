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
  private static readonly TIMEOUT_DURATION = 5000; // 5 sec
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

    let buffer = "";
    const timeout = setTimeout(() => {
      this.subscription?.remove();
      callback("", BluetoothResponseType.TIME_OUT);
    }, BluetoothService.TIMEOUT_DURATION);

    this.subscription = this.connectedDevice.onDataReceived((event: any) => {
      const data = event.data || event;
      liveMessagesCallback(data);
      buffer += data;

      if (buffer.includes(BluetoothService.ERROR_STRING)) {
        clearTimeout(timeout);
        this.subscription?.remove();
        callback("", BluetoothResponseType.ERROR);
      }

      if (buffer.includes(startBytes) && buffer.includes(endBytes)) {
        const startIndex = buffer.indexOf(startBytes);
        const endIndex = buffer.indexOf(endBytes);
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
          const finalData = buffer.substring(startIndex, endIndex);
          clearTimeout(timeout);
          this.subscription?.remove();
          callback(finalData, BluetoothResponseType.SUCCESS);
        }
      }
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
