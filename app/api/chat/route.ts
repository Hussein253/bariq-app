// app/api/chat/route.ts — example usage in a Route Handler
import { NextRequest, NextResponse } from "next/server";
import { guardUserMessage } from "@/lib/security/promptGuard";

export async function POST(req: NextRequest) {
  const { userMessage } = await req.json().catch(() => ({}));

  const guard = await guardUserMessage(userMessage);
  if (!guard.isSafe) {
    console.warn("[prompt-guard] blocked", { score: guard.riskScore, categories: guard.categories });
    return NextResponse.json(
      { isSafe: false, message: guard.message },
      { status: 400 }
    );
  }

  // ... safe: forward userMessage to the LLM.
  // Prices must always be read from the DB on the server, never from model output.
  return NextResponse.json({ isSafe: true });
}
