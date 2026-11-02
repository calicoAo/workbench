import type { AiGateway } from "./ai-foundation.js";
import { env } from "./env.js";
import { BusinessError, ErrorCode } from "./errors.js";
export const deepseekGateway: AiGateway = {
    provider: "deepseek", model: env.DEEPSEEK_MODEL,
    async generateStructured(input) {
        if (!env.DEEPSEEK_API_KEY)
            throw new BusinessError(ErrorCode.PARAM_ERROR, "DeepSeek is not configured");
        const body = JSON.stringify({ model: env.DEEPSEEK_MODEL, input: [{ role: "system", content: input.system }, { role: "user", content: input.user }], stream: false, reasoning: { effort: "none" }, max_output_tokens: 8192, text: { format: { type: "json_schema", name: input.schemaName, strict: true, schema: input.schema } } });
        if (Buffer.byteLength(body) > 32768)
            throw new BusinessError(ErrorCode.PARAM_ERROR, "AI request exceeds 32 KiB; narrow the context");
        // One attempt only: an ambiguous transport failure may already have been billed.
        const response = await fetch(`${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/responses`, { method: "POST", headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" }, body, signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
        if (!response.ok)
            throw new BusinessError(ErrorCode.SERVER_ERROR, `DeepSeek request failed (${response.status}); no automatic retry`, 500);
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error("Empty provider response");
        const parts: Uint8Array[] = [];
        let size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > 2 * 1024 * 1024) {
                await reader.cancel();
                throw new Error("Provider response too large");
            }
            parts.push(value);
        }
        const data = JSON.parse(Buffer.concat(parts).toString("utf8"));
        if (data.status !== "completed")
            throw new Error("Provider response incomplete");
        const output = (data.output ?? []).filter((v: any) => v.type === "message" && v.role === "assistant").flatMap((v: any) => v.content ?? []).filter((v: any) => v.type === "output_text" && typeof v.text === "string").map((v: any) => v.text).join("\n");
        return { payload: JSON.parse(output), usage: { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens, reasoningTokens: data.usage?.output_tokens_details?.reasoning_tokens }, costMicrounits: null };
    }
};
