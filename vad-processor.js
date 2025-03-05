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
    
    // Initialisiere Parameter sicher
    this.port.onmessage = (e) => {
      if (e.data.threshold) this.threshold = e.data.threshold;
    };
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    // Sicherer Buffer-Zugriff
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.index] = input[i];
      this.index = (this.index + 1) % 512;
      if (this.index === 0) this.analyze();
    }
    return true;
  }

  analyze() {
    // Parameter mit Fallback
    const threshold = this.parameters?.get('threshold')?.[0] || this.threshold;
    
    const energy = this.buffer.reduce((sum, val) => sum + val ** 2, 0) / 512;
    
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
