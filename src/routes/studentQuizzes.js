import express from "express";
import Quiz from "../models/Quiz.js";
import Submission from "../models/Submission.js";

const router = express.Router();

function arraysEqualAsSet(left = [], right = []) {
  const a = [...new Set(left)].sort((x, y) => x - y);
  const b = [...new Set(right)].sort((x, y) => x - y);
  if (a.length !== b.length) return false;
  return a.every((value, idx) => value === b[idx]);
}

// Public get quiz by code (questions but not correct flags)
router.get("/:code", async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ code: req.params.code.toUpperCase() });
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    if (quiz.status !== "ACTIVE") {
      return res.status(403).json({ message: "Quiz is not available right now" });
    }

    const safeQuiz = {
      id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      code: quiz.code,
      status: quiz.status,
      isReadOnly: false,
      isActive: true,
      questions: quiz.questions.map((q) => ({
        id: q._id,
        text: q.text,
        allowsMultiple: q.options.filter((o) => o.isCorrect).length > 1,
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
  const { username, rollNumber, rollNo, answers, meta } = req.body;
  const safeUsername = typeof username === "string" ? username.trim() : "";
  const rawRollNumber = rollNumber ?? rollNo;
  const safeRollNumber = typeof rawRollNumber === "string" ? rawRollNumber.trim() : "";
  if (!safeUsername || !safeRollNumber || !answers || !Array.isArray(answers)) {
    return res.status(400).json({ message: "Name, roll number, and answers are required" });
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

      const correctIndexes = question.options
        .map((option, idx) => (option.isCorrect ? idx : null))
        .filter((idx) => idx !== null);

      const submittedIndexes = Array.isArray(ans.selectedIndexes)
        ? ans.selectedIndexes
        : Number.isInteger(ans.selectedIndex)
          ? [ans.selectedIndex]
          : [];

      if (arraysEqualAsSet(submittedIndexes, correctIndexes)) {
        score += 1;
      }
    }

    const submission = await Submission.create({
      quiz: quiz._id,
      rollNumber: safeRollNumber,
      username: safeUsername,
      answers: answers.map((a) => ({
        questionId: a.questionId,
        selectedIndex: Number.isInteger(a.selectedIndex)
          ? a.selectedIndex
          : Array.isArray(a.selectedIndexes) && a.selectedIndexes.length
            ? a.selectedIndexes[0]
            : null,
        selectedIndexes: Array.isArray(a.selectedIndexes)
          ? [...new Set(a.selectedIndexes.filter((idx) => Number.isInteger(idx)))]
          : Number.isInteger(a.selectedIndex)
            ? [a.selectedIndex]
            : []
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

