type HTTPMethod =
	| "GET"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE"
	| "OPTIONS"
	| "HEAD";

export type RouteHandler = (request: Request) => Promise<Response>;

type Route = {
	method: HTTPMethod;
	pattern: RegExp;
	handler: RouteHandler;
};

export class Router {
	private routes: Route[] = [];

	add(method: HTTPMethod, path: string, handler: RouteHandler): void {
		this.routes.push({
			method,
			pattern: new RegExp(`^${path}$`),
			handler,
		});
	}

	async handle(request: Request): Promise<Response> {
		const url = new URL(request.url);

		for (const route of this.routes) {
			if (route.method === request.method && route.pattern.test(url.pathname)) {
				return await route.handler(request);
			}
		}

		return new Response("Not Found", { status: 404 });
	}
}
