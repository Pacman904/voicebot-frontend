class VADProcessor extends AudioWorkletProcessor {
  static get parameterDefinitions() {
    return {};
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const buffer = input[0];
    const volume = Math.sqrt(buffer.reduce((sum, sample) => sum + sample ** 2, 0) / buffer.length);

    if (volume > 0.05 && !this.speaking) {
      this.speaking = true;
      this.port.postMessage({
        type: "speech_started",
        audio: Array.from(buffer).map(sample => Math.min(Math.max(sample * 32767, -32768), 32767))
      });
    } else if (volume < 0.02 && this.speaking) {
      this.speaking = false;
      this.port.postMessage({ type: "speech_stopped" });
    }

    return true;
  }
}

registerProcessor('vad-processor', VADProcessor);