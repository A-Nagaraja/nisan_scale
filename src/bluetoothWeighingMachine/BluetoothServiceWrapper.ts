import BluetoothService, {
  WeighingMachineType,
  BluetoothResponseType,
  WeightCallback,
  MessageCallback,
} from "./BluetoothService";

abstract class BluetoothBaseServiceWrapper {
  protected bluetoothService: BluetoothService;

  constructor(bluetoothService: BluetoothService) {
    this.bluetoothService = bluetoothService;
  }

  abstract getWeightIfConnected(
    weightCallback: WeightCallback,
    liveMessagesCallback: (message: string) => void
  ): void;

  protected abstract readWeightFromMessageString(
    message: string,
    callback: WeightCallback
  ): void;

  protected sendMessageAndForget(
    message: string,
    callback: MessageCallback
  ): void {
    if (message.trim()) {
      this.bluetoothService.sendDataAndForget(message, callback);
    }
  }

  protected sendMessage(
    message: string,
    endMessage: string,
    startPart: string,
    endPart: string,
    callback: MessageCallback,
    liveMessagesCallback: (message: string) => void
  ): void {
    if (message.trim()) {
      // First send the command
      this.bluetoothService.sendDataAndForget(message, (msg, responseType) => {
        if (responseType === "SUCCESS") {
          // Then listen for response
          this.bluetoothService.listenForData(
            startPart,
            endPart,
            liveMessagesCallback,
            callback
          );
        } else {
          callback("", responseType);
        }
      });
    }
  }

  breakListenLoop(): void {
    this.bluetoothService.breakListenLoop();
  }

  connected(): boolean {
    return this.bluetoothService.connected();
  }
}

// ESSAE Implementation
export class BluetoothServiceWrapperEssae extends BluetoothBaseServiceWrapper {
  private static readonly FETCH_WEIGHT_COMMAND = "#E*";
  private static readonly STOP_FETCHING_WEIGHT_COMMAND = "#OK*";

  getWeightIfConnected(
    weightCallback: WeightCallback,
    liveMessagesCallback: (message: string) => void
  ): void {
    if (this.bluetoothService.connected()) {
      this.sendMessage(
        BluetoothServiceWrapperEssae.FETCH_WEIGHT_COMMAND,
        BluetoothServiceWrapperEssae.STOP_FETCHING_WEIGHT_COMMAND,
        "\n",
        "\n",
        {
          callback: (message: string, responseType: BluetoothResponseType) => {
            if (responseType === BluetoothResponseType.SUCCESS) {
              this.readWeightFromMessageString(message, weightCallback);
            } else {
              weightCallback(0, responseType, responseType.toString());
            }

            // Send stop command
            this.sendMessageAndForget(
              BluetoothServiceWrapperEssae.STOP_FETCHING_WEIGHT_COMMAND,
              {
                callback: (
                  message: string,
                  responseType: BluetoothResponseType
                ) => {
                  console.log("Stop weight result:", responseType);
                },
              }
            );
          },
        },
        liveMessagesCallback
      );
    }
  }

  protected readWeightFromMessageString(
    message: string,
    callback: WeightCallback
  ): void {
    if (message.includes("ERROR")) {
      callback(0, BluetoothResponseType.ERROR, "Error received from machine");
      return;
    }

    const weights = message
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => parseFloat(line))
      .filter((weight) => !isNaN(weight));

    if (weights.length > 0) {
      // Convert to grams (multiply by 1000)
      callback(
        Math.round(weights[0] * 1000),
        BluetoothResponseType.SUCCESS,
        ""
      );
    } else {
      callback(
        0,
        BluetoothResponseType.NO_DATA,
        "No weight received. Please try again"
      );
    }
  }
}

// Nissan Implementation
export class BluetoothServiceWrapperNissan extends BluetoothBaseServiceWrapper {
  private static readonly FETCH_WEIGHT_COMMAND = "#E*";
  private static readonly STOP_FETCHING_WEIGHT_COMMAND = "#OK*";

  getWeightIfConnected(
    weightCallback: WeightCallback,
    liveMessagesCallback: (message: string) => void
  ): void {
    if (this.bluetoothService.connected()) {
      this.sendMessage(
        BluetoothServiceWrapperNissan.FETCH_WEIGHT_COMMAND,
        BluetoothServiceWrapperNissan.STOP_FETCHING_WEIGHT_COMMAND,
        "#",
        "*",
        {
          callback: (message: string, responseType: BluetoothResponseType) => {
            if (responseType === BluetoothResponseType.SUCCESS) {
              this.readWeightFromMessageString(message, weightCallback);
            } else {
              weightCallback(0, responseType, responseType.toString());
            }

            this.sendStopWeightAndForget();
          },
        },
        liveMessagesCallback
      );
    }
  }

  private sendStopWeightAndForget(): void {
    this.sendMessageAndForget(
      BluetoothServiceWrapperNissan.STOP_FETCHING_WEIGHT_COMMAND,
      {
        callback: (message: string, responseType: BluetoothResponseType) => {
          console.log("Stop weight result:", responseType);
        },
      }
    );
  }

  protected readWeightFromMessageString(
    message: string,
    callback: WeightCallback
  ): void {
    if (message.includes("ERROR")) {
      callback(0, BluetoothResponseType.ERROR, "Error received from machine");
      return;
    }

    const weights = message
      .split("#")
      .map((part) => {
        if (part.includes("*")) {
          return part.substring(0, part.indexOf("*"));
        }
        return part;
      })
      .filter((part) => part.trim())
      .map((part) => parseInt(part, 10))
      .filter((weight) => !isNaN(weight));

    if (weights.length > 0) {
      callback(weights[0], BluetoothResponseType.SUCCESS, "");
    } else {
      callback(
        0,
        BluetoothResponseType.NO_DATA,
        "No weight received. Please try again"
      );
    }
  }
}

// Factory function
export function createBluetoothServiceWrapper(
  machineType: WeighingMachineType,
  bluetoothService: BluetoothService
): BluetoothBaseServiceWrapper {
  switch (machineType) {
    case WeighingMachineType.ESSAE:
      return new BluetoothServiceWrapperEssae(bluetoothService);
    case WeighingMachineType.NISSAN:
      return new BluetoothServiceWrapperNissan(bluetoothService);
    default:
      throw new Error("Unknown bluetooth device type");
  }
}
