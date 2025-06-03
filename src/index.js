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
	logger: true, // Enable logging to see errors
	serverFactory: (handler) => {
		return createServer()
			.on("request", (req, res) => {
				try {
					console.log(`${req.method} ${req.url}`); // Log all requests
					
					// Existing headers
					res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
					res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
					
					// Add CORS headers
					res.setHeader("Access-Control-Allow-Origin", "*");
					res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
					res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
					res.setHeader("Access-Control-Allow-Credentials", "true");
					
					// Handle preflight requests
					if (req.method === "OPTIONS") {
						res.writeHead(200);
						res.end();
						return;
					}
					
					handler(req, res);
				} catch (error) {
					console.error("Server error:", error);
					if (!res.headersSent) {
						res.writeHead(500);
						res.end("Internal Server Error");
					}
				}
			})
			.on("upgrade", (req, socket, head) => {
				try {
					if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, socket, head);
					else socket.end();
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

// Add error handler
fastify.setErrorHandler(function (error, request, reply) {
	console.error("Fastify error:", error);
	reply.status(500).send({ error: "Something went wrong!" });
});

// Add a test route to check if the server is working
fastify.get("/test", async (request, reply) => {
	return { message: "Server is working!", timestamp: new Date().toISOString() };
});

fastify.register(fastifyStatic, {
	root: publicPath,
	decorateReply: true,
});

fastify.get("/uv/uv.config.js", (req, res) => {
	return res.sendFile("uv/uv.config.js", publicPath);
});

fastify.register(fastifyStatic, {
	root: uvPath,
	prefix: "/uv/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: epoxyPath,
	prefix: "/epoxy/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: baremuxPath,
	prefix: "/baremux/",
	decorateReply: false,
});

fastify.server.on("listening", () => {
	const address = fastify.server.address();
	// by default we are listening on 0.0.0.0 (every interface)
	// we just need to list a few
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
