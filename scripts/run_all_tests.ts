import { spawn } from "child_process";

type TestSuite = {
  name: string;
  command: string;
  category: "unit" | "e2e" | "smoke";
};

const TEST_SUITES: TestSuite[] = [
  { name: "Trust Score v2", command: "test:trust-v2", category: "unit" },
  { name: "Risk Telemetry", command: "test:risk-telemetry", category: "unit" },
  { name: "Admin Permissions", command: "test:admin-permissions", category: "smoke" },
  { name: "Sprint 2 E2E", command: "test:sprint-e2e", category: "e2e" },
  { name: "Risk Integration", command: "test:risk-integration", category: "e2e" },
];

type SuiteResult = {
  suite: TestSuite;
  success: boolean;
  duration: number;
  error?: string;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function runSuite(suite: TestSuite): Promise<SuiteResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🧪 Ejecutando: ${suite.name} (${suite.category})`);
    console.log(`${"=".repeat(60)}\n`);

    const child = spawn("npm", ["run", suite.command], {
      stdio: "inherit",
      shell: true,
    });

    child.on("close", (code) => {
      const duration = Date.now() - startTime;
      const success = code === 0;

      resolve({
        suite,
        success,
        duration,
        error: success ? undefined : `Exit code ${code}`,
      });
    });

    child.on("error", (error) => {
      const duration = Date.now() - startTime;
      resolve({
        suite,
        success: false,
        duration,
        error: error.message,
      });
    });
  });
}

async function runAllTests(): Promise<void> {
  const globalStart = Date.now();
  const results: SuiteResult[] = [];

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         🧪 CONECTA EMPRENDE - TEST SUITE RUNNER 🧪        ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\nEjecutando ${TEST_SUITES.length} suites de tests...`);
  console.log(`Estrategia: Continuar en caso de error (fail-safe)\n`);

  for (const suite of TEST_SUITES) {
    const result = await runSuite(suite);
    results.push(result);
  }

  const globalDuration = Date.now() - globalStart;
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const allPassed = failed === 0;

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                    📊 RESUMEN FINAL 📊                     ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");

  console.log("Resultados por suite:");
  console.log("─".repeat(60));

  for (const result of results) {
    const emoji = result.success ? "✅" : "❌";
    const status = result.success ? "PASS" : "FAIL";
    const duration = formatDuration(result.duration);
    console.log(
      `${emoji} ${result.suite.name.padEnd(25)} [${status}] ${duration}`
    );
    if (result.error) {
      console.log(`   └─ Error: ${result.error}`);
    }
  }

  console.log("─".repeat(60));
  console.log("");

  const unitResults = results.filter((r) => r.suite.category === "unit");
  const e2eResults = results.filter((r) => r.suite.category === "e2e");
  const smokeResults = results.filter((r) => r.suite.category === "smoke");

  console.log("Resumen por categoría:");
  console.log(`  Unit Tests:  ${unitResults.filter((r) => r.success).length}/${unitResults.length} pasaron`);
  console.log(`  E2E Tests:   ${e2eResults.filter((r) => r.success).length}/${e2eResults.length} pasaron`);
  console.log(`  Smoke Tests: ${smokeResults.filter((r) => r.success).length}/${smokeResults.length} pasaron`);
  console.log("");

  console.log("─".repeat(60));
  console.log(`Total:         ${passed}/${results.length} suites pasaron`);
  console.log(`Duración:      ${formatDuration(globalDuration)}`);
  console.log(`Estado final:  ${allPassed ? "✅ ÉXITO" : "❌ FALLOS DETECTADOS"}`);
  console.log("─".repeat(60));
  console.log("");

  if (!allPassed) {
    console.log("⚠️  Algunas suites fallaron. Revisa los logs anteriores para detalles.\n");
    process.exit(1);
  } else {
    console.log("🎉 ¡Todas las suites pasaron exitosamente!\n");
    process.exit(0);
  }
}

runAllTests().catch((error) => {
  console.error("\n❌ Error fatal ejecutando tests:");
  console.error(error);
  process.exit(1);
});
