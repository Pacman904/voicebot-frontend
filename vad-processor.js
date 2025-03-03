<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OpenAI VoiceBot</title>
  <style>
    body {
      font-family: Arial;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f8f9fa;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 15px;
      box-shadow: 0 4px 30px rgba(0,0,0,0.15);
      width: 90%;
      max-width: 600px;
      height: 80%;
      display: flex;
      flex-direction: column;
    }
    .mic-btn {
      background: #28a745;
      border: none;
      border-radius: 50%;
      width: 100px;
      height: 100px;
      cursor: pointer;
      font-size: 24px;
      color: white;
      outline: none;
      transition: background 0.3s;
      margin: auto 0 20px;
    }
    #statusLabel {
      text-align: center;
      margin-bottom: 30px;
      font-size: 24px;
      color: green;
      display: none;
    }
    #consoleLogs {
      flex: 1;
      padding: 15px;
      background: #212529;
      color: #cccccc;
      font-family: monospace;
      overflow-y: auto;
      white-space: pre-line;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div id="statusLabel">on Air</div>
    <div id="consoleLogs"></div>
    <button id="micButton" class="mic-btn" onclick="toggleConnection()">
      <i class="fas fa-microphone"></i>
    </button>
    <audio id="openAIAudio" style="width: 100%; margin: 15px 0;" crossorigin="anonymous"></audio>
  </div>

  <!-- Font Awesome -->
  <script src="https://kit.fontawesome.com/845924f09c.js" crossorigin="anonymous"></script>
  
  <!-- Parse.js -->
  <script src="https://unpkg.com/parse@latest/dist/parse.min.js"></script>
  <script>
    Parse.initialize("uNEbQKjymSX8qmK9gorQNRbSuaV23eMHriF2Yeoi", "NY08Fa7grB4I1AOOcrjKN2b9w6sWke5GCA8rpxBM"); // YOUR_JAVASCRIPT_KEY
    Parse.serverURL = "https://parseapi.back4app.com/";

    let peerConnection = null;
    let userStream = null;
    let dc = null;
    let audioContext = null;
    let isSpeaking = false;

    function logMessage(message) {
      const logsDiv = document.getElementById('consoleLogs');
      logsDiv.textContent += `[${new Date().toISOString()}] ${message}\n`;
      logsDiv.scrollTop = logsDiv.scrollHeight;
    }

    async function initializeWebRTC(iceServers) {
      const configuration = {
        iceServers: iceServers || [
          { urls: "stun:stun.l.google.com:19302" },
          { 
            urls: "turn:turn.anyfirewall.com:443?transport=tcp", 
            username: "webrtc", 
            credential: "webrtc" 
          }
        ]
      };

      peerConnection = new RTCPeerConnection(configuration);
      const audioEl = document.getElementById('openAIAudio');

      peerConnection.ontrack = (event) => {
        if (audioEl && event.streams[0]) {
          audioEl.srcObject = event.streams[0];
          logMessage("OpenAI Audio-Stream aktiv");
        }
      };

      dc = peerConnection.createDataChannel("oaiControlEvents");
      dc.onopen = () => {
        logMessage("Data-Channel verbunden");
        startAudioProcessing();
      };

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          logMessage(`OpenAI Event: ${JSON.stringify(event)}`);
          if (event.type === "error") {
            logMessage("OpenAI-Fehler: " + event.error.message, "error");
          }
        } catch (error) {
          logMessage("Fehler beim Parsen von OpenAI Events");
        }
      };

      return peerConnection;
    }

    async function startConnection() {
      try {
        userStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        userStream.getAudioTracks().forEach(track => track.applyConstraints({ echoCancellation: true }));

        const response = await Parse.Cloud.run("createEphemeralSession", {
          model: "gpt-4o-mini-realtime-preview-2024-12-17",
          voice: "verse"
        });

        peerConnection = await initializeWebRTC(response.iceServers);
        userStream.getAudioTracks().forEach(track => peerConnection.addTrack(track));

        const offer = await peerConnection.createOffer({ offerToReceiveAudio: true });
        await peerConnection.setLocalDescription(offer);

        await Parse.Cloud.run("sendSignalingData", {
          sessionId: response.sessionId,
          data: { type: "offer", sdp: offer.sdp }
        });

        //珊瑚修正：Endpunkt ohne "/offer"
        const answerResponse = await fetch(`https://api.openai.com/v1/realtime/sessions/${response.openaiSessionId}`, {
          method: "POST",
          body: JSON.stringify({ sdp: offer.sdp }),
          headers: {
            Authorization: `Bearer ${response.clientSecret}`,
            "Content-Type": "application/json"
          }
        });

        if (!answerResponse.ok) {
          throw new Error("Fehler bei OpenAI-SDP-Verarbeitung");
        }

        const answerData = await answerResponse.json();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answerData.sdp));

        const signalingData = await Parse.Cloud.run("getSignalingData", { sessionId: response.sessionId });
        signalingData.forEach(data => {
          if (data.type === "candidate") {
            peerConnection.addIceCandidate(new RTCIceCandidate(data));
          }
        });

        updateUIConnectionState(peerConnection.connectionState);
      } catch (error) {
        logMessage(`Verbindungsfehler: ${error.message}`);
      }
    }

    async function startAudioProcessing() {
      audioContext = new AudioContext();
      await audioContext.audioWorklet.addModule('https://pacman904.github.io/voicebot-frontend/vad-processor.js');

      const processor = new AudioWorkletNode(audioContext, 'vad-processor');
      processor.port.onmessage = (event) => {
        if (event.data.type === "speech_started") {
          isSpeaking = true;
          dc.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: event.data.audio,
            timestamp: performance.now()
          }));
        } else if (event.data.type === "speech_stopped") {
          isSpeaking = false;
          dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        }
      };

      userStream.getAudioTracks().forEach(track => {
        const source = audioContext.createMediaStreamTrackSource(track);
        source.connect(processor);
        processor.connect(audioContext.destination);
      });
    }

    async function toggleConnection() {
      if (peerConnection?.connectionState === 'connected') {
        await stopConnection();
      } else {
        await startConnection();
      }
    }

    async function stopConnection() {
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      if (userStream) {
        userStream.getTracks().forEach(track => track.stop());
        userStream = null;
      }
      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }
      logMessage("Verbindung beendet");
      updateUIConnectionState('disconnected');
    }

    window.addEventListener('beforeunload', stopConnection);

    function updateUIConnectionState(state) {
      const micBtn = document.getElementById('micButton');
      const statusLabel = document.getElementById('statusLabel');
      micBtn.style.backgroundColor = state === 'connected' ? '#dc3545' : '#28a745';
      statusLabel.style.display = state === 'connected' ? 'block' : 'none';
    }
  </script>
</body>
</html>
