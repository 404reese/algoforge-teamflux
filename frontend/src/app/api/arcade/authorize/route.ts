import { NextRequest, NextResponse } from "next/server";
import { Arcade } from "@arcadeai/arcadejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, toolId, scopes, redirectUrl } = body;

    // Validate required parameters
    if (!userId) {
      return NextResponse.json(
        { error: "Missing required parameter: userId" },
        { status: 400 },
      );
    }

    if (!toolId) {
      return NextResponse.json(
        { error: "Missing required parameter: toolId" },
        { status: 400 },
      );
    }

    // Initialize Arcade client
    const client = new Arcade();

    try {
      console.log('Starting authorization flow with:', {
        userId,
        toolId,
        redirectUrl,
        scopes: scopes || [],
      });

      // Start the authorization flow with optional scopes and next_uri
      const result = await client.auth.authorize({
        auth_requirement: {
          provider_id: toolId,
          provider_type: "oauth2",
          oauth2: {
            scopes: scopes || [],
          },
        },
        user_id: userId,
        ...(redirectUrl ? { next_uri: redirectUrl } : {}),
      });

      console.log('Authorization flow started:', {
        auth_id: result.id,
        url: result.url,
        userId_sent: userId,  // Log the exact user_id sent
      });

      // Check if we got a URL to redirect to
      if (!result.url) {
        if (result.status === 'completed') {
          return NextResponse.json({
            success: true,
            completed: true,
            auth_id: result.id,
          });
        }
        throw new Error("No authorization URL returned from Arcade");
      }

      // Return the authorization URL for the client to redirect to
      return NextResponse.json({
        success: true,
        authorization_url: result.url,
        completed: false,
        auth_id: result.id,
      });
    } catch (error: any) {
      console.error(
        "Error starting authorization",
        "status code:",
        error.status,
        "message:",
        error.message,
        "error:",
        error.error,
      );

      return NextResponse.json(
        {
          error: error.message || "Failed to start authorization",
          status: error.status,
          details: error.error,
        },
        { status: error.status || 500 },
      );
    }
  } catch (err: any) {
    console.error("Error in Arcade authorize route:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: err?.message || String(err),
      },
      { status: 500 },
    );
  }
}
