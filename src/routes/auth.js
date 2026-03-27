import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import AdminUser from "../models/AdminUser.js";

const router = express.Router();

// Simple register endpoint – you may want to restrict this in production
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email and password are required" });
  }
  try {
    const existing = await AdminUser.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already in use" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await AdminUser.create({ name, email, passwordHash });
    res.status(201).json({ id: admin._id, name: admin.name, email: admin.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to register admin" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  try {
    const admin = await AdminUser.findOne({ email });
    if (!admin) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: admin._id, email: admin.email },
      process.env.JWT_SECRET || "dev_secret",
      // Keep admin login valid for at least 24 hours (as requested).
      { expiresIn: "24h" }
    );
    res.json({ token, admin: { id: admin._id, name: admin.name, email: admin.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to login" });
  }
});

export default router;

