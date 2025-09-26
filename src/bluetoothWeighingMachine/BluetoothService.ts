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

  private connectedDevice?: BluetoothDevice;

  async connectToDevice(device: BluetoothDevice, callback: ConnectionCallback) {
    try {
      const connected = await device.connect({ UUID: BluetoothService.UUID });
      console.log("Connected:", connected);
      if (connected) {
        this.connectedDevice = device; // ✅ save it
        this.isConnected = true;
        callback(true);
      } else {
        callback(false, "Connection failed");
      }
    } catch (error: any) {
      this.isConnected = false;
      callback(false, error?.message ?? "Connection error");
    }
  }

  async disconnect(callback: (success: boolean) => void) {
    try {
      if (this.subscription) {
        this.subscription.remove();
        this.subscription = undefined;
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

    this.subscription = this.connectedDevice.onDataReceived(
      (event: BluetoothEvent) => {
        const data = event.data;
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
      }
    );
  }

  connected(): boolean {
    return this.isConnected;
  }
}

export default new BluetoothService();
