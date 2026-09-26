import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

// Reading photos and pages with Claude (rosters, handwritten notes): one
// structured-output request with the same model, settings and error messages.

export class ClaudeReadError extends Error {}

export type ReadMessages = {
  badRequest: string;
  refusal: string;
  tooLong: string;
};

// Sends one request to Claude and returns the structured result, turning API
// failures into messages a coach can act on.
export async function readWithClaude<T extends z.ZodType>(
  schema: T,
  content: Anthropic.Beta.BetaContentBlockParam[],
  messages: ReadMessages,
): Promise<z.infer<T>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ClaudeReadError("Scanning isn't set up: ANTHROPIC_API_KEY is missing.");
  }

  const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });

  let response;
  try {
    response = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      // Reading rosters and notes is straightforward extraction; medium
      // effort keeps the wait short at an event without giving up accuracy.
      output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
      // If Claude declines the request, retry automatically on Anthropic's
      // recommended fallback model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content }],
    });
  } catch (error) {
    console.error("Claude request failed", error);
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new ClaudeReadError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ClaudeReadError("Too many scans at once or out of credit. Try again in a minute.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new ClaudeReadError(messages.badRequest);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new ClaudeReadError("Couldn't reach the scanning service. Check your connection and try again.");
    }
    throw new ClaudeReadError("The scanning service had a problem. Try again in a moment.");
  }

  if (response.stop_reason === "refusal") throw new ClaudeReadError(messages.refusal);
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new ClaudeReadError(messages.tooLong);
  }
  return response.parsed_output as z.infer<T>;
}

