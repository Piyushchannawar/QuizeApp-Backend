import { GoogleGenerativeAI } from "@google/generative-ai";

const MAX_CONTENT_CHARS = 48_000;
const MIN_CONTENT_CHARS = 20;
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 50;

const DEFAULT_MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite"
];

function isModelNotFoundError(err) {
  return err?.status === 404 || /404|not found|is not found/i.test(String(err?.message ?? ""));
}

function modelCandidates() {
  const fromEnv = process.env.GEMINI_MODEL?.trim();
  if (fromEnv) return [fromEnv];
  return DEFAULT_MODEL_CANDIDATES;
}

function normalizeQuizPayload(parsed, expectedCount) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid AI response shape");
  }
  const rawQs = parsed.questions;
  if (!Array.isArray(rawQs)) {
    throw new Error("AI response missing questions array");
  }

  const out = [];
  for (const q of rawQs) {
    if (out.length >= expectedCount) break;
    const text = String(q?.text ?? "").trim();
    if (!text) continue;

    let opts = Array.isArray(q.options) ? q.options : [];
    opts = opts.slice(0, 4).map((o) => {
      if (typeof o === "string") {
        return { text: o.trim(), isCorrect: false };
      }
      return {
        text: String(o?.text ?? "").trim(),
        isCorrect: Boolean(o?.isCorrect)
      };
    });

    while (opts.length < 4) {
      opts.push({ text: "", isCorrect: false });
    }

    if (opts.some((o) => !o.text)) {
      throw new Error("AI returned empty option text; try generating again.");
    }

    if (!opts.some((o) => o.isCorrect)) {
      const firstNonEmpty = opts.findIndex((o) => o.text.length > 0);
      const idx = firstNonEmpty >= 0 ? firstNonEmpty : 0;
      opts[idx] = { ...opts[idx], isCorrect: true };
    }

    out.push({ text, options: opts });
  }

  if (out.length < expectedCount) {
    throw new Error(
      `AI produced only ${out.length} valid question(s); need ${expectedCount}. Try again or lower the count.`
    );
  }

  return {
    title: typeof parsed.title === "string" ? parsed.title.trim() : "",
    description: typeof parsed.description === "string" ? parsed.description.trim() : "",
    questions: out
  };
}

/**
 * @param {{ content: string; numQuestions: number; titleHint?: string }} params
 */
export async function generateQuizFromContent({ content, numQuestions, titleHint }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error("GEMINI_API_KEY is not set");
    err.code = "NO_API_KEY";
    throw err;
  }

  const n = Math.min(
    MAX_QUESTIONS,
    Math.max(MIN_QUESTIONS, Number.parseInt(String(numQuestions), 10) || 0)
  );
  if (!Number.isFinite(n) || n < MIN_QUESTIONS) {
    throw new Error(`Number of questions must be between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}`);
  }

  const trimmed = String(content ?? "").trim();
  if (trimmed.length < MIN_CONTENT_CHARS) {
    throw new Error(`Content must be at least ${MIN_CONTENT_CHARS} characters`);
  }
  if (trimmed.length > MAX_CONTENT_CHARS) {
    throw new Error(`Content must be at most ${MAX_CONTENT_CHARS} characters`);
  }

  const genAI = new GoogleGenerativeAI(key);
  const candidates = modelCandidates();

  const hint =
    titleHint && String(titleHint).trim()
      ? `The teacher suggested this quiz title (use it or a close variant): "${String(titleHint).trim()}".`
      : "";

  const prompt = `You create multiple-choice quizzes strictly from the source material below.

Requirements:
- Output exactly ${n} questions.
- Each question has exactly 4 options; each option has non-empty text.
- Each question must have at least one option with isCorrect: true (multiple true is allowed if appropriate).
- Do not invent facts outside the source material; paraphrase and test understanding of the given content.
- Return ONLY JSON (no markdown) matching this shape:
{"title":"string","description":"string optional","questions":[{"text":"string","options":[{"text":"string","isCorrect":boolean}, ... 4 items]}]}

${hint}

Source material:
---
${trimmed}
---`;

  let lastError;
  for (let i = 0; i < candidates.length; i++) {
    const modelName = candidates[i];
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.35
      }
    });
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("AI returned invalid JSON");
      }
      return normalizeQuizPayload(data, n);
    } catch (err) {
      lastError = err;
      const moreFallbacks = i < candidates.length - 1;
      if (moreFallbacks && isModelNotFoundError(err)) {
        continue;
      }
      if (isModelNotFoundError(err)) {
        const hintMsg = process.env.GEMINI_MODEL?.trim()
          ? `Check GEMINI_MODEL="${process.env.GEMINI_MODEL.trim()}" — that model ID is not available for generateContent with your key.`
          : `No working default model; set GEMINI_MODEL in .env to an ID from Google AI Studio (e.g. gemini-2.5-flash).`;
        throw new Error(`${hintMsg} Last tried: ${modelName}. ${String(err.message || err)}`);
      }
      throw err;
    }
  }

  throw lastError || new Error("Gemini request failed");
}
