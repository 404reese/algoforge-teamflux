"use client";

import { useEffect, useRef, useState } from "react";

export default function VoiceChat() {
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  const startChat = async () => {
    const ws = new WebSocket("wss://your-domain.com/api/realtime");
    ws.binaryType = "arraybuffer";
    ws.onmessage = (msg) => {
      if (typeof msg.data !== "string") {
        playAudio(msg.data);
      } else {
        const { text } = JSON.parse(msg.data);
        setMessages((p) => [...p, `🤖 ${text}`]);
      }
    };
    wsRef.current = ws;
  };

  const playAudio = (chunk: ArrayBuffer) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    audioCtxRef.current.decodeAudioData(chunk.slice(0)).then((buffer) => {
      const src = audioCtxRef.current!.createBufferSource();
      src.buffer = buffer;
      src.connect(audioCtxRef.current!.destination);
      src.start();
    });
  };

  const startRecording = async () => {
    setIsRecording(true);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioCtxRef.current = new AudioContext();
    const source = audioCtxRef.current.createMediaStreamSource(stream);
    const processor = audioCtxRef.current.createScriptProcessor(2048, 1, 1);

    processor.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(data.length);
      for (let i = 0; i < data.length; i++) {
        int16[i] = data[i] * 32767;
      }
      wsRef.current?.send(int16);
    };

    source.connect(processor);
    processor.connect(audioCtxRef.current.destination);

    sourceRef.current = source;
    processorRef.current = processor;
  };

  const stopRecording = () => {
    setIsRecording(false);
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
  };

  useEffect(() => {
    startChat();
  }, []);

  return (
    <div className="w-full max-w-2xl p-6 rounded-xl border border-orange-500 bg-black/40">
      <h1 className="text-2xl font-bold text-orange-400 mb-4">🎙️ Gemini Voice Chat</h1>

      <div className="space-y-2 h-64 overflow-y-auto p-3 bg-black/60 rounded-lg border border-orange-500">
        {messages.map((m, i) => (
          <div key={i} className="text-sm">{m}</div>
        ))}
      </div>

      <div className="mt-5 flex justify-center">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="px-6 py-3 bg-orange-500 text-black font-bold rounded-lg"
          >
            🎤 Start Talking
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-6 py-3 bg-red-500 text-white font-bold rounded-lg"
          >
            ⛔ Stop
          </button>
        )}
      </div>
    </div>
  );
}
