const fs = require("fs");
const path = require("path");
const plugin = require("../src/index");

const fixturesDir = path.join(__dirname, "fixtures");

// Get all subdirectories in fixtures directory
const getTestCases = () => {
  const dirs = fs
    .readdirSync(fixturesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  return dirs.filter((dir) => {
    const inputPath = path.join(fixturesDir, dir, "input.ftl");
    const outputPath = path.join(fixturesDir, dir, "output.ftl");
    return fs.existsSync(inputPath) && fs.existsSync(outputPath);
  });
};

describe("prettier-plugin-freemarker", () => {
  let prettier;

  beforeAll(async () => {
    prettier = await import("prettier");
  });

  const testCases = getTestCases();

  if (testCases.length === 0) {
    test.skip("No test fixtures found", () => {});
    return;
  }

  test.each(testCases)("formats %s correctly", async (testCase) => {
    const inputPath = path.join(fixturesDir, testCase, "input.ftl");
    const outputPath = path.join(fixturesDir, testCase, "output.ftl");

    const input = fs.readFileSync(inputPath, "utf-8");
    const expectedOutput = fs.readFileSync(outputPath, "utf-8");

    const formatted = await prettier.format(input, {
      parser: "freemarker",
      plugins: [plugin],
    });

    expect(formatted).toBe(expectedOutput);
  });
});
