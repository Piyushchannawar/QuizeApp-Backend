import express from "express";
import Quiz from "../models/Quiz.js";
import Submission from "../models/Submission.js";
import { requireAdmin } from "../middleware/auth.js";
import { generateQuizFromContent } from "../services/geminiQuiz.js";

const router = express.Router();

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Create quiz (DRAFT)
router.post("/", requireAdmin, async (req, res) => {
  const { title, description, questions } = req.body;
  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ message: "Title and at least one question are required" });
  }
  try {
    let code;
    // ensure unique code
    // eslint-disable-next-line no-constant-condition
    while (true) {
      code = generateCode();
      const exists = await Quiz.findOne({ code });
      if (!exists) break;
    }
    const quiz = await Quiz.create({
      title,
      description,
      questions,
      code,
      createdBy: req.adminId
    });
    res.status(201).json(quiz);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create quiz" });
  }
});

// Generate quiz draft content with Gemini (client fills editor; does not persist until Save)
router.post("/generate", requireAdmin, async (req, res) => {
  const { content, numQuestions, title: titleHint } = req.body;
  try {
    const generated = await generateQuizFromContent({
      content,
      numQuestions,
      titleHint
    });
    res.json(generated);
  } catch (err) {
    console.error(err);
    if (err.code === "NO_API_KEY") {
      return res.status(503).json({
        message: "AI quiz generation is not configured. Set GEMINI_API_KEY on the server."
      });
    }
    const msg = err.message || "Failed to generate quiz";
    const clientErr =
      msg.includes("API key") ||
      msg.includes("GEMINI") ||
      msg.includes("quota") ||
      msg.includes("429");
    if (clientErr) {
      return res.status(502).json({ message: msg });
    }
    if (
      msg.includes("at least") ||
      msg.includes("at most") ||
      msg.includes("between") ||
      msg.includes("produced only") ||
      msg.includes("Invalid") ||
      msg.includes("missing")
    ) {
      return res.status(400).json({ message: msg });
    }
    res.status(500).json({ message: "Failed to generate quiz" });
  }
});

// Edit quiz only while DRAFT
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    if (quiz.status !== "DRAFT") {
      return res.status(400).json({ message: "Only DRAFT quizzes can be edited" });
    }
    const { title, description, questions } = req.body;
    if (title !== undefined) quiz.title = title;
    if (description !== undefined) quiz.description = description;
    if (questions !== undefined) quiz.questions = questions;
    await quiz.save();
    res.json(quiz);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update quiz" });
  }
});

// List quizzes for admin
router.get("/", requireAdmin, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ createdBy: req.adminId }).sort({ createdAt: -1 });
    res.json(quizzes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to list quizzes" });
  }
});

// Get single quiz with submissions summary
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    if (quiz.createdBy.toString() !== req.adminId) {
      return res.status(403).json({ message: "Not allowed" });
    }
    const submissions = await Submission.find({ quiz: quiz._id });
    res.json({ quiz, submissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch quiz" });
  }
});

// Start quiz
router.post("/:id/start", requireAdmin, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    if (quiz.createdBy.toString() !== req.adminId) {
      return res.status(403).json({ message: "Not allowed" });
    }
    quiz.status = "ACTIVE";
    quiz.startedAt = new Date();
    await quiz.save();
    res.json(quiz);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to start quiz" });
  }
});

// Stop quiz
router.post("/:id/stop", requireAdmin, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    if (quiz.createdBy.toString() !== req.adminId) {
      return res.status(403).json({ message: "Not allowed" });
    }
    quiz.status = "STOPPED";
    quiz.stoppedAt = new Date();
    await quiz.save();
    res.json(quiz);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to stop quiz" });
  }
});

export default router;

