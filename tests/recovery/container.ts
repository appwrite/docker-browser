export const IMAGE = process.env.BROWSER_IMAGE ?? "appwrite/browser:local";
export const TEST_PAGE = "http://localhost:3000/v1/test";
export const HOST_GATEWAY = "host.docker.internal";

const MEMORY_LIMIT = "1g";
const STARTUP_TIMEOUT_MS = 30_000;

export const REMOVAL_TIMEOUT_MS = 30_000;

export const imageBuilt = Bun.spawnSync([
	"docker",
	"image",
	"inspect",
	IMAGE,
]).success;

export enum Status {
	Ok = 200,
	Unavailable = 503,
	InsufficientStorage = 507,
}

export interface CaptureRequest {
	readonly url: string;
	readonly sleep: number;
	readonly viewport?: { readonly width: number; readonly height: number };
	readonly deviceScaleFactor?: number;
	readonly fullPage?: boolean;
	readonly clip?: {
		readonly x: number;
		readonly y: number;
		readonly width: number;
		readonly height: number;
	};
	readonly timeout?: number;
}

export interface Outcome {
	readonly status: number;
	readonly contentType: string | null;
	readonly retryAfter: string | null;
	readonly error: string | null;
	readonly elapsed: number;
}

export async function startContainer(
	name: string,
	port: number,
	environment: Record<string, string>,
): Promise<void> {
	removeContainer(name);

	const variables = Object.entries({
		ALLOWED_HOSTS: "localhost",
		...environment,
	}).flatMap(([key, value]) => ["-e", `${key}=${value}`]);

	const run = Bun.spawnSync([
		"docker",
		"run",
		"-d",
		"--name",
		name,
		"--memory",
		MEMORY_LIMIT,
		"--add-host",
		`${HOST_GATEWAY}:host-gateway`,
		...variables,
		"-p",
		`${port}:3000`,
		IMAGE,
	]);
	if (!run.success) {
		throw new Error(`Could not start ${name}: ${run.stderr.toString()}`);
	}

	// The server listens only once Chromium is up, so any answer means ready,
	// even a 503 from a container whose idle memory is over its budget.
	const deadline = Date.now() + STARTUP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const health = await fetch(`http://localhost:${port}/v1/health`).catch(
			() => null,
		);
		if (health !== null) return;
		await Bun.sleep(500);
	}
	throw new Error(`${name} did not start.`);
}

export function removeContainer(name: string): void {
	Bun.spawnSync(["docker", "rm", "-f", name]);
}

export function logs(name: string): string {
	const result = Bun.spawnSync(["docker", "logs", name]);
	return result.stdout.toString() + result.stderr.toString();
}

export async function health(port: number): Promise<number> {
	const response = await fetch(`http://localhost:${port}/v1/health`);
	await response.arrayBuffer();
	return response.status;
}

export async function capture(
	port: number,
	body: CaptureRequest,
	signal?: AbortSignal,
): Promise<Outcome> {
	const started = performance.now();
	const response = await fetch(`http://localhost:${port}/v1/screenshots`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal,
	});
	const elapsed = performance.now() - started;

	return {
		status: response.status,
		contentType: response.headers.get("Content-Type"),
		retryAfter: response.headers.get("Retry-After"),
		error: await readError(response),
		elapsed,
	};
}

async function readError(response: Response): Promise<string | null> {
	if (response.headers.get("Content-Type") !== "application/json") {
		await response.arrayBuffer();
		return null;
	}

	const body = (await response.json()) as { error: string };
	return body.error;
}
