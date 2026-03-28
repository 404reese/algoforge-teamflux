import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = {
  runtime: "edge",
};

export default async function handler(req: NextRequest) {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Expected websocket", { status: 400 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", // supports TTS + streaming
  });

  const session = model.startChat({
    generationConfig: {
      audio: { voice: "WaveNet-F" }, // TTS voice
    },
  });

  socket.onmessage = async (e) => {
    const userAudio = e.data; // binary audio chunks

    const reply = await session.sendAudioMessage({
      audio: {
        data: new Uint8Array(userAudio),
        mimeType: "audio/pcm",
      },
    });

    for await (const chunk of reply) {
      if (chunk.audio) {
        socket.send(chunk.audio.data); // send TTS audio back
      }
      if (chunk.text) {
        socket.send(JSON.stringify({ text: chunk.text }));
      }
    }
  };

  socket.onclose = () => {
    session.close();
  };

  return response;
}
