import express from "express";
import {
  createAppError,
  errorEnvelope,
  normalizeError,
  successEnvelope,
  ERROR_CODES
} from "../../lib/errors.js";
import { requireAuth } from "../../lib/auth.js";
import { parseRepoUrl, verifyRepository, listOpenPullRequests } from "../../lib/github.js";
import {
  listProjects,
  getProjectById,
  getProjectDoc,
  getProjectGitHubToken,
  createProject,
  deleteProject
} from "../../lib/project-store.js";
import { analyzePullRequest } from "../../lib/analyze-pr.js";
import { markCommentPosted, getProjectReports, deleteProjectReport } from "../../lib/report-store.js";
import { postReviewComment } from "../../lib/comment-poster.js";
import { buildReportUrl } from "../../lib/report-url.js";
import {
  GITHUB_APP_INSTALL_URL,
  getAppInstallationStatus
} from "../../lib/github-app.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "");
    const projects = await listProjects(req.user.sub, q);
    return res.status(200).json(successEnvelope({ projects }));
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

router.post("/verify", async (req, res) => {
  try {
    const { repoUrl, githubToken } = req.body || {};
    if (!repoUrl) {
      throw createAppError(ERROR_CODES.INVALID_REPO_URL, "repoUrl is required.", 400);
    }

    const { owner, repo } = parseRepoUrl(repoUrl);

    try {
      const repoMeta = await verifyRepository({
        owner,
        repo,
        githubToken: githubToken || undefined
      });

      return res.status(200).json(
        successEnvelope({
          verified: true,
          requiresToken: false,
          repository: repoMeta
        })
      );
    } catch (err) {
      if (err?.code === ERROR_CODES.REPO_NOT_FOUND || err?.code === ERROR_CODES.REPO_ACCESS_DENIED) {
        if (!githubToken) {
          return res.status(200).json(
            successEnvelope({
              verified: false,
              requiresToken: true,
              message:
                "Repository not accessible. If it is private, provide a GitHub personal access token."
            })
          );
        }
      }
      throw err;
    }
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

router.post("/", async (req, res) => {
  try {
    const { repoUrl, githubToken } = req.body || {};
    if (!repoUrl) {
      throw createAppError(ERROR_CODES.INVALID_REPO_URL, "repoUrl is required.", 400);
    }

    const { owner, repo } = parseRepoUrl(repoUrl);
    const repoMeta = await verifyRepository({
      owner,
      repo,
      githubToken: githubToken || undefined
    });

    if (repoMeta.isPrivate && !githubToken) {
      throw createAppError(
        ERROR_CODES.REPO_ACCESS_DENIED,
        "A GitHub token is required for private repositories.",
        400
      );
    }

    const project = await createProject(req.user.sub, {
      owner: repoMeta.owner,
      repo: repoMeta.repo,
      isPrivate: repoMeta.isPrivate,
      defaultBranch: repoMeta.defaultBranch,
      githubToken: githubToken || undefined
    });

    return res.status(201).json(successEnvelope({ project }));
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

router.get("/:id", async (req, res) => {
  try {
    const project = await getProjectById(req.user.sub, req.params.id);
    if (!project) {
      throw createAppError(ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", 404);
    }
    return res.status(200).json(successEnvelope({ project }));
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const result = await deleteProject(req.user.sub, req.params.id);
    return res.status(200).json(
      successEnvelope({
        message: "Project deleted.",
        deletedReports: result.deletedReports
      })
    );
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

router.get("/:id/github-app", async (req, res) => {
  try {
    const projectDoc = await getProjectDoc(req.user.sub, req.params.id);
    if (!projectDoc) {
      throw createAppError(ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", 404);
    }

    const status = await getAppInstallationStatus(projectDoc.owner, projectDoc.repo);
    return res.status(200).json(successEnvelope(status));
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

router.get("/:id/reports", async (req, res) => {
  try {
    const projectDoc = await getProjectDoc(req.user.sub, req.params.id);
    if (!projectDoc) {
      throw createAppError(ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", 404);
    }

    const reports = await getProjectReports(req.user.sub, req.params.id);
    return res.status(200).json(successEnvelope({ reports }));
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

router.delete("/:id/reports/:reportId", async (req, res) => {
  try {
    const projectDoc = await getProjectDoc(req.user.sub, req.params.id);
    if (!projectDoc) {
      throw createAppError(ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", 404);
    }

    const deleted = await deleteProjectReport(
      req.user.sub,
      req.params.id,
      req.params.reportId
    );

    if (!deleted) {
      throw createAppError(ERROR_CODES.REPORT_NOT_FOUND, "Report not found.", 404);
    }

    return res.status(200).json(successEnvelope({ message: "Report deleted." }));
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

router.get("/:id/pulls", async (req, res) => {
  try {
    const projectDoc = await getProjectDoc(req.user.sub, req.params.id);
    if (!projectDoc) {
      throw createAppError(ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", 404);
    }

    const githubToken = getProjectGitHubToken(projectDoc);
    const pulls = await listOpenPullRequests({
      owner: projectDoc.owner,
      repo: projectDoc.repo,
      githubToken
    });

    return res.status(200).json(successEnvelope({ pulls }));
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

router.post("/:id/analyze", async (req, res) => {
  try {
    const { pullNumber, visibility, postComment } = req.body || {};
    const pullNum = Number(pullNumber);

    if (!Number.isInteger(pullNum) || pullNum <= 0) {
      throw createAppError(ERROR_CODES.INVALID_PR_URL, "A valid pullNumber is required.", 400);
    }

    const projectDoc = await getProjectDoc(req.user.sub, req.params.id);
    if (!projectDoc) {
      throw createAppError(ERROR_CODES.PROJECT_NOT_FOUND, "Project not found.", 404);
    }

    const githubToken = getProjectGitHubToken(projectDoc);
    const prUrl = `https://github.com/${projectDoc.owner}/${projectDoc.repo}/pull/${pullNum}`;
    const reportVisibility = visibility === "public" ? "public" : "private";

    const responsePayload = await analyzePullRequest({
      prUrl,
      githubToken,
      userId: req.user.sub,
      projectId: String(projectDoc._id),
      owner: projectDoc.owner,
      repo: projectDoc.repo,
      pullNumber: pullNum,
      visibility: reportVisibility
    });

    if (postComment && responsePayload.reportId) {
      try {
        const comment = await postReviewComment({
          owner: projectDoc.owner,
          repo: projectDoc.repo,
          pullNumber: pullNum,
          report: responsePayload.report,
          prTitle: responsePayload.pr?.title,
          fallbackToken: githubToken,
          reportUrl: buildReportUrl(responsePayload.reportId),
          metadata: responsePayload.metadata
        });
        await markCommentPosted(responsePayload.reportId, {
          url: comment.url,
          githubCommentId: comment.id
        });
        responsePayload.commentUrl = comment.url;
      } catch (commentErr) {
        const msg = commentErr instanceof Error ? commentErr.message : "comment failed";
        responsePayload.commentWarning = msg;
      }
    }

    return res.status(200).json(responsePayload);
  } catch (err) {
    const normalized = normalizeError(err);
    return res
      .status(normalized.status)
      .json(errorEnvelope(normalized.code, normalized.message));
  }
});

export default router;
