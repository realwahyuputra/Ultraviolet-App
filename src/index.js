import { createServer } from "node:http";
import { join } from "node:path";
import { hostname } from "node:os";
import wisp from "wisp-server-node";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

// static paths
import { publicPath } from "ultraviolet-static";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const fastify = Fastify({
	logger: true,
	serverFactory: (handler) => {
		return createServer()
			.on("request", (req, res) => {
				try {
					console.log(`${req.method} ${req.url}`);
					
					// Set CORS headers first
					res.setHeader("Access-Control-Allow-Origin", "*");
					res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
					res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
					res.setHeader("Access-Control-Allow-Credentials", "true");
					
					// Handle preflight requests
					if (req.method === "OPTIONS") {
						res.writeHead(200);
						res.end();
						return;
					}
					
					// Only set these headers for non-service routes
					if (!req.url.startsWith('/uv/service/')) {
						res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
						res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
					}
					
					handler(req, res);
				} catch (error) {
					console.error("Server error:", error);
					if (!res.headersSent) {
						res.writeHead(500, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({ error: error.message }));
					}
				}
			})
			.on("upgrade", (req, socket, head) => {
				try {
					if (req.url.endsWith("/wisp/")) {
						wisp.routeRequest(req, socket, head);
					} else {
						socket.end();
					}
				} catch (error) {
					console.error("Upgrade error:", error);
					socket.end();
				}
			})
			.on("error", (error) => {
				console.error("HTTP server error:", error);
			});
	},
});

// Error handler
fastify.setErrorHandler(function (error, request, reply) {
	console.error("Fastify error:", error);
	reply.status(500).send({ 
		error: "Something went wrong!", 
		details: error.message,
		url: request.url 
	});
});

// Test route
fastify.get("/test", async (request, reply) => {
	return { message: "Server is working!", timestamp: new Date().toISOString() };
});

// Health check
fastify.get("/health", async (request, reply) => {
	return { status: "OK", ultraviolet: "ready" };
});

// Register static file serving
try {
	await fastify.register(fastifyStatic, {
		root: publicPath,
		decorateReply: true,
	});

	// UV config route with proper error handling
	fastify.get("/uv/uv.config.js", async (req, reply) => {
		try {
			return reply.sendFile("uv/uv.config.js");
		} catch (error) {
			console.error("Error serving uv.config.js:", error);
			reply.status(500).send({ error: "Failed to load UV config" });
		}
	});

	await fastify.register(fastifyStatic, {
		root: uvPath,
		prefix: "/uv/",
		decorateReply: false,
	});

	await fastify.register(fastifyStatic, {
		root: epoxyPath,
		prefix: "/epoxy/",
		decorateReply: false,
	});

	await fastify.register(fastifyStatic, {
		root: baremuxPath,
		prefix: "/baremux/",
		decorateReply: false,
	});

} catch (error) {
	console.error("Error registering static routes:", error);
}

fastify.server.on("listening", () => {
	const address = fastify.server.address();
	console.log("Listening on:");
	console.log(`\thttp://localhost:${address.port}`);
	console.log(`\thttp://${hostname()}:${address.port}`);
	console.log(
		`\thttp://${
			address.family === "IPv6" ? `[${address.address}]` : address.address
		}:${address.port}`
	);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	fastify.close();
	process.exit(0);
}

let port = parseInt(process.env.PORT || "");
if (isNaN(port)) port = 8080;

fastify.listen({
	port: port,
	host: "0.0.0.0",
});
