import { spawn } from "node:child_process";
import http from "node:http";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMock(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });

    if (ok) return;
    await wait(250);
  }

  throw new Error(
    `Mock server não respondeu em ${url} dentro de ${timeoutMs}ms.`,
  );
}

async function main(): Promise<void> {
  const auditScript = process.argv[2];
  if (!auditScript) {
    throw new Error(
      "Informe o script de auditoria a executar. Ex.: audit/engine-test-harness.ts",
    );
  }

  const mock = spawn(process.execPath, ["audit/mock-server.js", "8787"], {
    stdio: "inherit",
  });

  let exitCode = 0;

  try {
    await waitForMock("http://localhost:8787/stats", 10_000);

    exitCode = await new Promise<number>((resolve) => {
      const child = spawn(
        process.execPath,
        ["node_modules/tsx/dist/cli.mjs", auditScript],
        {
          stdio: "inherit",
        },
      );
      child.on("close", (code) => resolve(code ?? 1));
    });
  } finally {
    mock.kill();
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(
    "[CPX-Stress] Falha ao executar auditoria com mock server:",
    error,
  );
  process.exit(1);
});
