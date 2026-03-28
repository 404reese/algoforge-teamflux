import { NextRequest } from "next/server";

function resolveApiKeyForModel(modelName: string): string {
  const model = (modelName || "").toLowerCase();

  if (model.startsWith("groq/")) {
    return (process.env.GROQ_API_KEY || process.env.FACTORY_GROQ_API_KEY || "").trim();
  }

  if (model.startsWith("openai/")) {
    return (process.env.OPENAI_API_KEY || process.env.FACTORY_OPENAI_API_KEY || "").trim();
  }

  if (model.startsWith("gemini/") || model.startsWith("google/")) {
    return (
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.FACTORY_GEMINI_API_KEY ||
      ""
    ).trim();
  }

  return "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, userId, builtWorkflow } = body || {};

    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
      });
    }

    if (!userId || typeof userId !== "string") {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
      });
    }

    if (!builtWorkflow || typeof builtWorkflow !== "object") {
      return new Response(
        JSON.stringify({
          error: "Workflow not built yet. Please click 'Build' first.",
        }),
        { status: 400 },
      );
    }

    const FACTORY_URL =
      process.env.FACTORY_URL ||
      "http://localhost:8001";
    const FACTORY_TOKEN = process.env.FACTORY_TOKEN || "bearer-token-2024";

    const apiKeyFromEnv = resolveApiKeyForModel(String(builtWorkflow?.model_name || ""));
    const apiKeyFromWorkflow = String(builtWorkflow?.api_key || "").trim();
    const resolvedApiKey = apiKeyFromEnv || apiKeyFromWorkflow;

    if (!resolvedApiKey) {
      return new Response(
        JSON.stringify({
          error: "Missing model API key on server",
          model: builtWorkflow?.model_name || null,
        }),
        { status: 500 },
      );
    }

    // Payload for factory /run/workflow/local endpoint
    const payload = {
      workflow_config: {
        ...builtWorkflow,
        api_key: resolvedApiKey,
      },
      user_id: userId,
      user_task: query,
    };

    const res = await fetch(`${FACTORY_URL}/run/workflow/local`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FACTORY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: "Factory run failed",
          status: res.status,
          data,
        }),
        { status: 502 },
      );
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "Internal error",
        message: err?.message || String(err),
      }),
      { status: 500 },
    );
  }
}
