// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { test, expect } from "@microsoft/tui-test";
import process from "node:process";

test.describe("startup terminal output", () => {
  const query = "\x1b]11;?\x07";
  let output: string;
  let disposedOutput: string;
  let hooks: string[];

  test.use({
    program: {
      file: process.execPath,
      args: [
        "-e",
        String.raw`
          process.stdin.setRawMode(true);
          process.stdin.resume();
          let input = "";
          process.stdin.on("data", chunk => {
            input += chunk;
            if (input.includes("response")) {
              process.stdout.write("query answered\n");
              process.exit(0);
            }
          });
          process.stdout.write("\x1b]11;?\x07");
          setTimeout(() => {
            process.stdout.write("query timed out\n");
            process.exit(0);
          }, 1000);
        `,
      ],
    },
  });

  test.onSpawn((terminal) => {
    output = "";
    disposedOutput = "";
    hooks = ["outer"];
    terminal.onData((chunk) => {
      output += chunk;
    });
    const unsubscribe = terminal.onData((chunk) => {
      disposedOutput += chunk;
    });
    unsubscribe();
  });

  test.describe("responding terminal", () => {
    test.onSpawn((terminal) => {
      hooks.push("inner");
      let pending = "";
      let answered = false;
      terminal.onData((chunk) => {
        pending += chunk;
        if (!answered && pending.includes(query)) {
          answered = true;
          terminal.write("response");
        }
      });
    });

    test("answers a startup query before test callbacks and preserves rendering", async ({
      terminal,
    }) => {
      expect(hooks).toEqual(["outer", "inner"]);
      expect(output).toContain(query);
      expect(output).toContain("query answered");
      expect(output).not.toContain("query timed out");
      expect(disposedOutput).toBe("");
      await expect(terminal.getByText("query answered")).toBeVisible();
    });

    test("installs fresh observers for the next terminal", async ({
      terminal,
    }) => {
      expect(output.split(query)).toHaveLength(2);
      await expect(terminal.getByText("query answered")).toBeVisible();
      expect(disposedOutput).toBe("");
    });
  });

  test.describe("silent terminal", () => {
    test("captures a query that expires without responding", async ({
      terminal,
    }) => {
      expect(hooks).toEqual(["outer"]);
      expect(output).toContain(query);
      await expect(terminal.getByText("query timed out")).toBeVisible();
      expect(output).not.toContain("query answered");
    });
  });

  test.describe("delayed terminal", () => {
    test.onSpawn((terminal) => {
      let pending = "";
      let scheduled = false;
      terminal.onData((chunk) => {
        pending += chunk;
        if (!scheduled && pending.includes(query)) {
          scheduled = true;
          setTimeout(() => terminal.write("response"), 200);
        }
      });
    });

    test("delivers a delayed response during startup", async ({ terminal }) => {
      expect(output).toContain(query);
      await expect(terminal.getByText("query answered")).toBeVisible();
      expect(output).not.toContain("query timed out");
    });
  });

  test.describe("failed setup", () => {
    test.onSpawn(() => {
      throw new Error("startup observer setup failed");
    });
    test.fail("fails the test when an onSpawn hook throws", async () => {});
  });
});
