import BluetoothService, {
  WeighingMachineType,
  BluetoothResponseType,
  WeightCallback,
  MessageCallback,
} from "./BluetoothService";

abstract class BluetoothBaseServiceWrapper {
  protected bluetoothService: typeof BluetoothService;

  constructor(bluetoothService: typeof BluetoothService) {
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
      console.log("Sending command:", message);
      // First send the command
      this.bluetoothService.sendDataAndForget(message, (msg, responseType) => {
        if (responseType === "SUCCESS") {
          console.log("Command sent successfully, now listening for data...");
          // Add a small delay before listening to ensure command is processed
          setTimeout(() => {
            this.bluetoothService.listenForData(
              startPart,
              endPart,
              liveMessagesCallback,
              callback
            );
          }, 500); // 500ms delay
        } else {
          console.log("Failed to send command:", responseType);
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

  // Public method to parse weight from any message
  parseWeightFromMessage(message: string, callback: WeightCallback): void {
    this.readWeightFromMessageString(message, callback);
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
      console.log("gethereeee");
      this.sendMessage(
        BluetoothServiceWrapperEssae.FETCH_WEIGHT_COMMAND,
        BluetoothServiceWrapperEssae.STOP_FETCHING_WEIGHT_COMMAND,
        "#",
        "*",
        (message: string, responseType: BluetoothResponseType) => {
          if (responseType === BluetoothResponseType.SUCCESS) {
            console.log("responseTypeeeee", responseType);
            console.log("ESSAE - Received weight message:", message);

            this.readWeightFromMessageString(message, weightCallback);
          } else {
            weightCallback(0, responseType, responseType.toString());
          }

          // Send stop command
          this.sendMessageAndForget(
            BluetoothServiceWrapperEssae.STOP_FETCHING_WEIGHT_COMMAND,
            (message: string, responseType: BluetoothResponseType) => {
              console.log("Stop weight result:", responseType);
            }
          );
        },
        liveMessagesCallback
      );
    }
  }

  protected readWeightFromMessageString(
    message: string,
    callback: WeightCallback
  ): void {
    console.log("ESSAE - Processing message:", message);
    console.log("ESSAE - Message length:", message.length);
    console.log(
      "ESSAE - Message as hex:",
      Buffer.from(message, "utf8").toString("hex")
    );

    if (message.includes("ERROR")) {
      console.log("ESSAE - Error detected in message");
      callback(0, BluetoothResponseType.ERROR, "Error received from machine");
      return;
    }

    // Try multiple parsing patterns to handle different formats
    let weightMatches: string[] | null = null;
    let weightStr = "";

    // Pattern 1: 850*#00850*#00850*#0 (from image)
    weightMatches = message.match(/(\d+)(?=\*|#|$)/g);
    console.log("ESSAE - Pattern 1 matches:", weightMatches);

    if (!weightMatches || weightMatches.length === 0) {
      // Pattern 2: Just numbers with any separators
      weightMatches = message.match(/(\d+)/g);
      console.log("ESSAE - Pattern 2 matches:", weightMatches);
    }

    if (!weightMatches || weightMatches.length === 0) {
      // Pattern 3: Look for any sequence of digits
      const digitMatch = message.match(/\d+/);
      if (digitMatch) {
        weightMatches = [digitMatch[0]];
        console.log("ESSAE - Pattern 3 matches:", weightMatches);
      }
    }

    if (weightMatches && weightMatches.length > 0) {
      // Extract the first weight value (most recent reading)
      weightStr = weightMatches[0];
      const weight = parseInt(weightStr, 10);
      console.log(
        "ESSAE - Extracted weight string:",
        weightStr,
        "Parsed weight:",
        weight
      );

      if (!isNaN(weight) && weight > 0) {
        // Based on the image, 850 likely represents 850 grams
        // The weight appears to be in grams directly
        const finalWeight = weight;
        console.log("ESSAE - Final weight:", finalWeight);
        callback(finalWeight, BluetoothResponseType.SUCCESS, "");
      } else {
        console.log("ESSAE - Invalid weight number:", weight);
        callback(
          0,
          BluetoothResponseType.NO_DATA,
          "Invalid weight data received"
        );
      }
    } else {
      console.log("ESSAE - No weight pattern found in message:", message);
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
      console.log("gethereeee");
      this.sendMessage(
        BluetoothServiceWrapperNissan.FETCH_WEIGHT_COMMAND,
        BluetoothServiceWrapperNissan.STOP_FETCHING_WEIGHT_COMMAND,
        "#",
        "*",
        (message: string, responseType: BluetoothResponseType) => {
          if (responseType === BluetoothResponseType.SUCCESS) {
            this.readWeightFromMessageString(message, weightCallback);
          } else {
            weightCallback(0, responseType, responseType.toString());
          }

          this.sendStopWeightAndForget();
        },
        liveMessagesCallback
      );
    }
  }

  private sendStopWeightAndForget(): void {
    this.sendMessageAndForget(
      BluetoothServiceWrapperNissan.STOP_FETCHING_WEIGHT_COMMAND,
      (message: string, responseType: BluetoothResponseType) => {
        console.log("Stop weight result:", responseType);
      }
    );
  }

  protected readWeightFromMessageString(
    message: string,
    callback: WeightCallback
  ): void {
    console.log("NISSAN - Processing message:", message);
    console.log("NISSAN - Message length:", message.length);
    console.log(
      "NISSAN - Message as hex:",
      Buffer.from(message, "utf8").toString("hex")
    );

    if (message.includes("ERROR")) {
      console.log("NISSAN - Error detected in message");
      callback(0, BluetoothResponseType.ERROR, "Error received from machine");
      return;
    }

    // Try multiple parsing patterns to handle different formats
    let weightMatches: string[] | null = null;
    let weightStr = "";

    // Pattern 1: 850*#00850*#00850*#0 (from image)
    weightMatches = message.match(/(\d+)(?=\*|#|$)/g);
    console.log("NISSAN - Pattern 1 matches:", weightMatches);

    if (!weightMatches || weightMatches.length === 0) {
      // Pattern 2: Just numbers with any separators
      weightMatches = message.match(/(\d+)/g);
      console.log("NISSAN - Pattern 2 matches:", weightMatches);
    }

    if (!weightMatches || weightMatches.length === 0) {
      // Pattern 3: Look for any sequence of digits
      const digitMatch = message.match(/\d+/);
      if (digitMatch) {
        weightMatches = [digitMatch[0]];
        console.log("NISSAN - Pattern 3 matches:", weightMatches);
      }
    }

    if (weightMatches && weightMatches.length > 0) {
      // Extract the first weight value (most recent reading)
      weightStr = weightMatches[0];
      const weight = parseInt(weightStr, 10);
      console.log(
        "NISSAN - Extracted weight string:",
        weightStr,
        "Parsed weight:",
        weight
      );

      if (!isNaN(weight) && weight > 0) {
        // Based on the image, 850 likely represents 850 grams
        // The weight appears to be in grams directly
        const finalWeight = weight;
        console.log("NISSAN - Final weight:", finalWeight);
        callback(finalWeight, BluetoothResponseType.SUCCESS, "");
      } else {
        console.log("NISSAN - Invalid weight number:", weight);
        callback(
          0,
          BluetoothResponseType.NO_DATA,
          "Invalid weight data received"
        );
      }
    } else {
      console.log("NISSAN - No weight pattern found in message:", message);
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
  bluetoothService: typeof BluetoothService
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
