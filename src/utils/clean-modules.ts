import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

const NODE_MODULES = "/app/node_modules";

async function getDirSize(path: string): Promise<number> {
	const result = await $`du -sm ${path}`.quiet();
	return Number.parseInt(result.text().split("\t")[0]);
}

async function deleteFiles(
	pattern: string,
	description: string,
): Promise<void> {
	console.log(`${description}...`);
	await $`find ${NODE_MODULES} -name ${pattern} -delete 2>/dev/null || true`.quiet();
}

async function deleteDirectories(
	dirName: string,
	description: string,
): Promise<void> {
	console.log(`${description}...`);
	await $`find ${NODE_MODULES} -depth -type d -name ${dirName} -exec rm -rf {} + 2>/dev/null || true`.quiet();
}

async function deletePath(path: string): Promise<void> {
	try {
		await $`test -e ${path}`.quiet();
		await $`rm -rf ${path}`.quiet();
	} catch {
		// ignore
	}
}

async function removeDocumentationFiles(): Promise<void> {
	console.log("📝 Removing documentation files...");
	await deleteFiles("*.md", "  - Markdown files");
	await deleteFiles("*.d.ts", "  - TypeScript declarations");
	await deleteFiles("*.map", "  - Source maps");
	await deleteFiles("LICENSE*", "  - LICENSE files");
	await deleteFiles("README*", "  - README files");
	await deleteFiles("CHANGELOG*", "  - CHANGELOG files");
	await deleteFiles("AUTHORS*", "  - AUTHORS files");
	await deleteFiles("CONTRIBUTORS*", "  - CONTRIBUTORS files");
	await deleteFiles("NOTICE*", "  - NOTICE files");
	await deleteFiles("HISTORY*", "  - HISTORY files");
	await deleteFiles("*.txt", "  - Text files");
}

async function removeTypeScriptSources(): Promise<void> {
	console.log("🔧 Removing TypeScript sources...");
	await deleteFiles("*.ts", "  - TypeScript files");
	await deleteFiles("*.jsx", "  - JavaScript JSX files");
	await deleteFiles("*.tsx", "  - TypeScript JSX files");
	await deleteFiles("tsconfig*.json", "  - TypeScript configs");
	await deleteFiles("*.tsbuildinfo", "  - TypeScript build info");
}

async function removeTestFiles(): Promise<void> {
	console.log("🧪 Removing test files...");
	await deleteFiles("*.test.js", "  - JavaScript tests");
	await deleteFiles("*.test.ts", "  - TypeScript tests");
	await deleteFiles("*.spec.js", "  - JavaScript specs");
	await deleteFiles("*.spec.ts", "  - TypeScript specs");
	await deleteDirectories("test", "  - test/ directories");
	await deleteDirectories("tests", "  - tests/ directories");
	await deleteDirectories("__tests__", "  - __tests__/ directories");
	await deleteDirectories("__mocks__", "  - __mocks__/ directories");
	await deleteDirectories("__fixtures__", "  - __fixtures__/ directories");
	await deleteDirectories("fixtures", "  - fixtures/ directories");
	await deleteDirectories("coverage", "  - coverage/ directories");
}

async function removeDevelopmentDirectories(): Promise<void> {
	console.log("🗂️  Removing development directories...");
	await deleteDirectories(".github", "  - .github/ directories");
	await deleteDirectories("docs", "  - docs/ directories");
	await deleteDirectories("examples", "  - examples/ directories");
	await deleteDirectories("benchmark", "  - benchmark/ directories");
	await deleteDirectories("samples", "  - samples/ directories");
}

async function removeDevelopmentFiles(): Promise<void> {
	console.log("⚙️  Removing development config files...");
	await deleteFiles(".eslintrc*", "  - ESLint configs");
	await deleteFiles(".prettierrc*", "  - Prettier configs");
	await deleteFiles(".editorconfig", "  - EditorConfig files");
	await deleteFiles("jest.config.*", "  - Jest configs");
	await deleteFiles("vitest.config.*", "  - Vitest configs");
	await deleteFiles(".npmignore", "  - NPM ignore files");
	await deleteFiles(".gitignore", "  - Git ignore files");
	await deleteFiles("bun.lock", "  - Bun lock files");
	await deleteFiles("yarn.lock", "  - Yarn lock files");
	await deleteFiles("package-lock.json", "  - NPM lock files");
	await deleteFiles("pnpm-lock.yaml", "  - PNPM lock files");
}

async function removeScriptsAndDeclarations(): Promise<void> {
	console.log("📜 Removing scripts and declarations...");
	await deleteFiles("*.sh", "  - Shell scripts");
	await deleteFiles("*.ps1", "  - PowerShell scripts");
	await deleteFiles("*.d.cts", "  - CommonJS TypeScript declarations");
	await deleteFiles("*.d.mts", "  - ES Module TypeScript declarations");
}

async function removeTraceEngineLocales(): Promise<void> {
	console.log("🌐 Removing non-English trace_engine locales...");
	const traceEngineLocalesPath = `${NODE_MODULES}/@paulirish/trace_engine/locales`;
	try {
		const traceLocales = readdirSync(traceEngineLocalesPath);
		for (const locale of traceLocales) {
			if (locale !== "en-US.json") {
				unlinkSync(join(traceEngineLocalesPath, locale));
			}
		}
		console.log(
			`  - Removed ${traceLocales.length - 1} trace_engine locale files`,
		);
	} catch {
		console.log("  - trace_engine locales not found (skipped)");
	}
}

async function removeLighthouseLocales(): Promise<void> {
	console.log("🌍 Replacing non-English Lighthouse locales with stubs...");
	const localesPath = `${NODE_MODULES}/lighthouse/shared/localization/locales`;
	try {
		const locales = readdirSync(localesPath);
		const stubContent = "{}";
		for (const locale of locales) {
			if (locale !== "en-US.json") {
				const filePath = join(localesPath, locale);
				unlinkSync(filePath);
				await Bun.write(filePath, stubContent);
			}
		}
	} catch {
		console.log("  - Lighthouse locales not found (skipped)");
	}
}

async function removeAxeCoreLocales(): Promise<void> {
	console.log("🌍 Replacing non-English axe-core locales with stubs...");
	const localesPath = `${NODE_MODULES}/axe-core/locales`;
	try {
		const locales = readdirSync(localesPath);
		const stubContent = "{}";
		for (const locale of locales) {
			if (locale !== "en.json" && !locale.startsWith("_")) {
				const filePath = join(localesPath, locale);
				unlinkSync(filePath);
				await Bun.write(filePath, stubContent);
			}
		}
	} catch {
		console.log("  - axe-core locales not found (skipped)");
	}
}

async function removeUnnecessaryFiles(): Promise<void> {
	console.log("🎭 Removing unnecessary files...");
	await deletePath(`${NODE_MODULES}/playwright-core/lib/vite`);
	await deletePath(`${NODE_MODULES}/puppeteer-core/src`);
	await deletePath(`${NODE_MODULES}/zod/src`);
	await deletePath(`${NODE_MODULES}/third-party-web/dist/domain-map.csv`);
	await deletePath(
		`${NODE_MODULES}/puppeteer-core/node_modules/devtools-protocol`,
	);
	await deletePath(`${NODE_MODULES}/@sentry`);
	await deletePath(`${NODE_MODULES}/@opentelemetry`);
	await deletePath(`${NODE_MODULES}/axe-core/axe.js`);
	await deletePath(`${NODE_MODULES}/lighthouse/cli`);
	await deletePath(`${NODE_MODULES}/lighthouse/build-tracker.config.js`);
	await deletePath(`${NODE_MODULES}/lighthouse/commitlint.config.js`);
	await deletePath(`${NODE_MODULES}/lighthouse/eslint.config.mjs`);
}

async function cleanModules(): Promise<void> {
	console.log("🧹 Starting node_modules cleanup...");
	const startSize = await getDirSize(NODE_MODULES);

	await Promise.all([
		removeDocumentationFiles(),
		removeTypeScriptSources(),
		removeTestFiles(),
		removeDevelopmentDirectories(),
		removeDevelopmentFiles(),
		removeScriptsAndDeclarations(),
		removeTraceEngineLocales(),
		removeLighthouseLocales(),
		removeAxeCoreLocales(),
		removeUnnecessaryFiles(),
	]);

	const endSize = await getDirSize(NODE_MODULES);
	const saved = startSize - endSize;

	console.log("\n✅ Cleanup complete!");
	console.log(`📊 ${startSize}MB → ${endSize}MB (Saved: ${saved}MB)`);
}

cleanModules().catch((error) => {
	console.error("❌ Cleanup failed:", error);
	process.exit(1);
});
