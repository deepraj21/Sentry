import express from "express";
import { errorEnvelope, successEnvelope } from "../../lib/errors.js";

const router = express.Router();

router.get("/", (_req, res) => {
  return res.status(200).json(
    successEnvelope({
      status: "ok",
      service: "sentry"
    })
  );
});

router.all("/", (_req, res) => {
  return res
    .status(405)
    .json(errorEnvelope("METHOD_NOT_ALLOWED", "Method not allowed."));
});

export default router;
