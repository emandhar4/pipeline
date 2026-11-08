import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { keywordResumeReader } from './keyword-reader';
import type { ResumeSuggestions } from './types';

export type Client = SupabaseClient<Database>;

export type ReaderContext = { client: Client; today: Date; categoryOrder: string[] };

/** Turns extracted resume text into onboarding suggestions. Never writes anything. */
export type ResumeReader = (text: string, ctx: ReaderContext) => Promise<ResumeSuggestions>;

// LLM-UPGRADE: swap for an AnthropicProvider-backed reader (Haiku, server-only, monthly cap, gated by profiles.ai_mode) at the end of the build. Same input and output types.
export const resumeReader: ResumeReader = keywordResumeReader;
