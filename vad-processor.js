class VADProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'threshold', defaultValue: 0.1 }];
  }

  constructor() {
    super();
    this.speaking = false;
    this.bufferSize = 512;
    this.buffer = new Float32Array(this.bufferSize);
    this.index = 0;
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;

    // Buffer füllen
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.index++] = input[i];
      if (this.index >= this.bufferSize) {
        this.analyze();
        this.index = 0;
      }
    }
    return true;
  }

  analyze() {
    const energy = this.buffer.reduce((sum, val) => sum + val ** 2, 0) / this.bufferSize;
    const threshold = this.parameters.get('threshold')[0];

    if (energy > threshold && !this.speaking) {
      this.speaking = true;
      this.port.postMessage({ type: "speech_started" });
    } else if (energy < threshold * 0.5 && this.speaking) {
      this.speaking = false;
      this.port.postMessage({ type: "speech_stopped" });
    }
  }
}

registerProcessor('vad-processor', VADProcessor);
