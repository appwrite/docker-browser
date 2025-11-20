type HTTPMethod =
	| "GET"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE"
	| "OPTIONS"
	| "HEAD";

type RouteHandler = (req: Request) => Promise<Response>;

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

	async handle(req: Request): Promise<Response> {
		const url = new URL(req.url);

		for (const route of this.routes) {
			if (route.method === req.method && route.pattern.test(url.pathname)) {
				return await route.handler(req);
			}
		}

		return new Response("Not Found", { status: 404 });
	}
}
