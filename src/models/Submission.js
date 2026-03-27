import mongoose from "mongoose";

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    selectedIndex: { type: Number, required: true }
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
    username: { type: String, required: true },
    answers: [answerSchema],
    score: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    wasAutoSubmitted: { type: Boolean, default: false },
    submitReason: { type: String, default: "MANUAL_SUBMIT" }
  },
  { timestamps: true }
);

const Submission = mongoose.model("Submission", submissionSchema);

export default Submission;

