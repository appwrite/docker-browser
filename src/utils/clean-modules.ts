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
	const file = Bun.file(path);
	if (await file.exists()) {
		await $`rm -rf ${path}`.quiet();
	}
}

async function removeDocumentationFiles(): Promise<void> {
	console.log("📝 Removing documentation files...");
	await deleteFiles("*.md", "  - Markdown files");
	await deleteFiles("*.d.ts", "  - TypeScript declarations");
	await deleteFiles("*.map", "  - Source maps");
}

async function removeTypeScriptSources(): Promise<void> {
	console.log("🔧 Removing TypeScript sources...");
	await deleteFiles("*.ts", "  - TypeScript files");
	await deleteFiles("tsconfig.json", "  - TypeScript configs");
	await deleteFiles("*.tsbuildinfo", "  - TypeScript build info");
}

async function removeTestFiles(): Promise<void> {
	console.log("🧪 Removing test files...");
	await deleteFiles("*.test.js", "  - JavaScript tests");
	await deleteFiles("*.test.ts", "  - TypeScript tests");
	await deleteDirectories("test", "  - test/ directories");
	await deleteDirectories("tests", "  - tests/ directories");
	await deleteDirectories("__tests__", "  - __tests__/ directories");
	await deleteDirectories("coverage", "  - coverage/ directories");
}

async function removeDevelopmentDirectories(): Promise<void> {
	console.log("🗂️  Removing development directories...");
	await deleteDirectories(".github", "  - .github/ directories");
	await deleteDirectories("docs", "  - docs/ directories");
	await deleteDirectories("examples", "  - examples/ directories");
	await deleteDirectories("benchmark", "  - benchmark/ directories");
}

async function removeLighthouseLocales(): Promise<void> {
	console.log("🌐 Removing non-English Lighthouse locales...");
	const lighthouseLocalesPath = `${NODE_MODULES}/lighthouse/shared/localization/locales`;
	try {
		const locales = readdirSync(lighthouseLocalesPath);
		for (const locale of locales) {
			if (locale !== "en-US.json") {
				unlinkSync(join(lighthouseLocalesPath, locale));
			}
		}
		console.log(`  - Removed ${locales.length - 1} Lighthouse locale files`);
	} catch {
		console.log("  - Lighthouse locales not found (skipped)");
	}
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

async function removeUnnecessaryFiles(): Promise<void> {
	console.log("🎭 Removing unnecessary files...");
	await deletePath(`${NODE_MODULES}/playwright-core/lib/vite`);
	await deletePath(`${NODE_MODULES}/puppeteer-core/src`);
	await deletePath(`${NODE_MODULES}/zod/src`);
	await deletePath(`${NODE_MODULES}/third-party-web/dist/domain-map.csv`);
	await deletePath(`${NODE_MODULES}/puppeteer-core/node_modules/devtools-protocol`);
}

async function cleanModules(): Promise<void> {
	console.log("🧹 Starting node_modules cleanup...");
	const startSize = await getDirSize(NODE_MODULES);

	await Promise.all([
		removeDocumentationFiles(),
		removeTypeScriptSources(),
		removeTestFiles(),
		removeDevelopmentDirectories(),
		removeLighthouseLocales(),
		removeTraceEngineLocales(),
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
