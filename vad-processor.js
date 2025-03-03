class VADProcessor extends AudioWorkletProcessor {
  static get parameterDefinitions() {
    return { threshold: { type: "number", defaultValue: 0.1 } };
  }

  constructor() {
    super();
    this.speaking = false;
    this.chunkSize = 4096;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const buffer = input[0];
    const volume = Math.sqrt(buffer.reduce((sum, s) => sum + s ** 2, 0) / buffer.length);

    if (volume > this.threshold && !this.speaking) {
      this.speaking = true;
      this.port.postMessage({
        type: "speech_started",
        audio: Float32Array.from(buffer).map(s => Math.min(Math.max(s * 32767, -32768), 32767)
        )
      });
    } else if (volume < this.threshold * 0.5 && this.speaking) {
      this.speaking = false;
      this.port.postMessage({ type: "speech_stopped" });
    }
    return true;
  }
}

registerProcessor('vad-processor', VADProcessor);
