class VADProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'threshold', defaultValue: 0.1 }];
  }

  constructor() {
    super();
    this.speaking = false;
    this.buffer = new Float32Array(512);
    this.index = 0;
    this.threshold = 0.1; // Fallback-Wert
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    // Buffer füllen
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.index] = input[i];
      this.index = (this.index + 1) % 512;
      if (this.index === 0) this.analyze();
    }
    return true;
  }

  analyze() {
    // Parameter sicher auslesen
    const thresholdParam = this.parameters.get('threshold');
    this.threshold = thresholdParam?.length > 0 ? thresholdParam[0] : 0.1;

    const energy = this.buffer.reduce((sum, val) => sum + val ** 2, 0) / 512;
    
    if (energy > this.threshold && !this.speaking) {
      this.speaking = true;
      this.port.postMessage({ type: "speech_started" });
    } else if (energy < this.threshold * 0.5 && this.speaking) {
      this.speaking = false;
      this.port.postMessage({ type: "speech_stopped" });
    }
  }
}

registerProcessor('vad-processor', VADProcessor);
