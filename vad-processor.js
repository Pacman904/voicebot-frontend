processor.port.onmessage = (event) => {
  if (event.data.type === "speech_started") {
    isSpeaking = true;
    dc.send(JSON.stringify({
      type: "input_audio_stream.start",
      timestamp: performance.now()
    }));
  } else if (event.data.type === "speech_stopped") {
    isSpeaking = false;
    dc.send(JSON.stringify({
      type: "input_audio_stream.stop",
      timestamp: performance.now()
    }));
  }
};
