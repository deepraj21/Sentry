import express from "express";
import {
  errorEnvelope,
  normalizeError,
  successEnvelope
} from "../../lib/errors.js";
import { signToken, requireAuth } from "../../lib/auth.js";
import {
  registerUser,
  authenticateUser,
  findUserById
} from "../../lib/user-store.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await registerUser(username, password);
    const token = signToken(user);
    return res.status(201).json(successEnvelope({ token, user }));
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await authenticateUser(username, password);
    const token = signToken(user);
    return res.status(200).json(successEnvelope({ token, user }));
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await findUserById(req.user.sub);
    if (!user) {
      return res.status(401).json(errorEnvelope("INVALID_TOKEN", "User not found."));
    }
    return res.status(200).json(successEnvelope({ user }));
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

router.post("/logout", requireAuth, (_req, res) => {
  return res.status(200).json(successEnvelope({ message: "Logged out." }));
});

export default router;
