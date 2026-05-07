const MAX_DIFF_CHARS = 80000;
const MAX_FILE_LINES = 300;
const TEST_FILE_PATTERN =
  /(^|\/)(__tests__|test|tests|spec|specs)(\/|\.|$)|\.(test|spec)\./i;

/**
 * Estimate token count from text length.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

/**
 * Decide how much diff to pass to the model.
 * @param {{files: Array<{filename: string, patch: string, additions: number, deletions: number, status: string}>}} prData
 * @returns {{
 *   mode: "full" | "chunked",
 *   files: Array<{filename: string, status: string, additions: number, deletions: number, patch: string, truncated: boolean}>,
 *   testSummary: Array<{filename: string, additions: number, deletions: number}>,
 *   allFilenames: string[],
 *   estimatedTokens: number
 * }}
 */
export function chunkPullRequestDiff(prData) {
  const files = prData.files || [];
  const allFilenames = files.map((f) => f.filename);
  const fullDiff = files
    .map((f) => `### ${f.filename}\n${f.patch || "[no patch available]"}`)
    .join("\n\n");
  const estimatedTokens = estimateTokens(fullDiff);

  if (fullDiff.length < MAX_DIFF_CHARS) {
    return {
      mode: "full",
      files: files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch || "[no patch available]",
        truncated: false
      })),
      testSummary: [],
      allFilenames,
      estimatedTokens
    };
  }

  /** @type {Array<{filename: string, status: string, additions: number, deletions: number, patch: string, truncated: boolean}>} */
  const prioritizedFiles = [];
  /** @type {Array<{filename: string, additions: number, deletions: number}>} */
  const testSummary = [];

  const nonTestFiles = files.filter((f) => !TEST_FILE_PATTERN.test(f.filename));
  const testFiles = files.filter((f) => TEST_FILE_PATTERN.test(f.filename));

  for (const file of nonTestFiles) {
    const patch = file.patch || "[no patch available]";
    const lines = patch.split("\n");
    const needsTruncate = lines.length > MAX_FILE_LINES;
    const kept = needsTruncate ? lines.slice(0, MAX_FILE_LINES) : lines;
    const note = needsTruncate
      ? `\n[truncated — file has ${lines.length} total lines changed]`
      : "";

    prioritizedFiles.push({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: `${kept.join("\n")}${note}`,
      truncated: needsTruncate
    });
  }

  for (const testFile of testFiles) {
    testSummary.push({
      filename: testFile.filename,
      additions: testFile.additions || 0,
      deletions: testFile.deletions || 0
    });
  }

  return {
    mode: "chunked",
    files: prioritizedFiles,
    testSummary,
    allFilenames,
    estimatedTokens
  };
}
