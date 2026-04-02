import { StressEngine } from "../electron/engine/stress-engine";

async function testSSRF() {
  const blockedTargets = [
    "http://localhost:8787/ok",
    "http://127.0.0.1:8787/ok",
    "http://10.0.0.1/ok",
    "http://192.168.0.10/ok",
    "http://172.16.0.10/ok",
    "http://172.31.255.254/ok",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/ok",
    "http://[fd00::1]/ok",
    "http://[fe80::1]/ok",
  ];

  for (const target of blockedTargets) {
    const engine = new StressEngine();
    try {
      await engine.run(
        { url: target, virtualUsers: 1, duration: 5, method: "GET" },
        () => {},
      );
      console.log("FAIL: target should have been blocked:", target);
      process.exit(1);
    } catch (err: any) {
      if (
        err.message.includes("bloqueado") ||
        err.message.includes("rede interna")
      ) {
        console.log("SSRF_BLOCKED_OK:", target);
        continue;
      }

      console.log("UNEXPECTED_ERROR:", target, err.message);
      process.exit(1);
    }
  }

  process.exit(0);
}

testSSRF();
