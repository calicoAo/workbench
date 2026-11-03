import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

const rootEnvPath = resolve(process.cwd(), "../../.env");
config({ path: existsSync(rootEnvPath) ? rootEnvPath : resolve(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-flash"),
  DEEPSEEK_LIBRARY_SEARCH_MODEL: z.string().default("deepseek-v4-pro"),
  TMDB_API_READ_ACCESS_TOKEN: z.string().optional(),
  TMDB_PROXY_URL: z.preprocess(value => value === "" ? undefined : value, z.string().url().refine(value => {
    const url = new URL(value);
    return url.protocol === "http:" && !url.username && !url.password && !url.pathname.replace(/\/$/, "") && !url.search && !url.hash;
  }, "TMDB_PROXY_URL must be a plain HTTP CONNECT proxy URL").optional()),
  MEDIA_PUBLIC_DNS: z.string().optional(),
  MEDIA_IMPORT_TOKEN_SECRET: z.string().min(32).optional(),
  OPEN_LIBRARY_USER_AGENT: z.string().default("PersonalWorkbench/0.1")
});

export const env = envSchema.parse(process.env);
