import express from "express";
import Quiz from "../models/Quiz.js";
import Submission from "../models/Submission.js";

const router = express.Router();

// Public get quiz by code (questions but not correct flags)
router.get("/:code", async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ code: req.params.code.toUpperCase() });
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    const isReadOnly = quiz.status === "STOPPED";
    const isActive = quiz.status === "ACTIVE";

    const safeQuiz = {
      id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      code: quiz.code,
      status: quiz.status,
      isReadOnly,
      isActive,
      questions: quiz.questions.map((q) => ({
        id: q._id,
        text: q.text,
        options: q.options.map((o) => o.text)
      }))
    };

    res.json(safeQuiz);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load quiz" });
  }
});

// Submit answers while quiz ACTIVE
router.post("/:code/submissions", async (req, res) => {
  const { username, answers, meta } = req.body;
  const safeUsername = typeof username === "string" ? username.trim() : "";
  if (!safeUsername || !answers || !Array.isArray(answers)) {
    return res.status(400).json({ message: "Username and answers are required" });
  }

  try {
    const quiz = await Quiz.findOne({ code: req.params.code.toUpperCase() });
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    if (quiz.status !== "ACTIVE") {
      return res.status(400).json({ message: "Quiz is not accepting submissions" });
    }

    let score = 0;
    const maxScore = quiz.questions.length;

    for (const ans of answers) {
      const question = quiz.questions.id(ans.questionId);
      if (!question) continue;
      const selected = question.options[ans.selectedIndex];
      if (selected && selected.isCorrect) score += 1;
    }

    const submission = await Submission.create({
      quiz: quiz._id,
      username: safeUsername,
      answers: answers.map((a) => ({
        questionId: a.questionId,
        selectedIndex: a.selectedIndex
      })),
      score,
      maxScore,
      wasAutoSubmitted: !!meta?.wasAutoSubmitted,
      submitReason:
        typeof meta?.reason === "string" && meta.reason.trim() ? meta.reason.trim() : "MANUAL_SUBMIT"
    });

    res.status(201).json({ id: submission._id, score, maxScore });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to submit answers" });
  }
});

export default router;

