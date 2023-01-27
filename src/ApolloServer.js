/* eslint-disable no-console */
"use strict";

const { ApolloServer: ApolloServerBase } = require("@apollo/server");
const { renderPlaygroundPage } = require("@apollographql/graphql-playground-html");
const accept = require("@hapi/accept");
const moleculerMiddleware = require("./moleculerMiddleware");

async function send(req, res, statusCode, data, responseType = "application/json") {
	res.statusCode = statusCode;
	const ctx = res.$ctx;
	if (!ctx.meta.$responseType) {
		ctx.meta.$responseType = responseType;
	}

	const route = res.$route;
	if (route.onAfterCall) {
		data = await route.onAfterCall.call(this, ctx, route, req, res, data);
	}

	const service = res.$service;
	service.sendResponse(req, res, data);
}

class ApolloServer extends ApolloServerBase {
	// Extract Apollo Server options from the request.

	constructor(options, config) {
		super(config);
		this.contextOptions = options;
	}

	createGraphQLServerOptions(req, res) {
		return super.graphQLServerOptions({ req, res });
	}

	// Prepares and returns an async function that can be used to handle
	// GraphQL requests.
	createHandler({ path, disableHealthCheck, onHealthCheck, playgroundOptions } = {}) {
		// const promiseWillStart = this.willStart();
		return async (req, res) => {
			this.graphqlPath = path || "/graphql";

			console.log(">>>>>>>>>>>>>>>>>>>>>>> PATH", this.graphqlPath);
			// await promiseWillStart;

			// If file uploads are detected, prepare them for easier handling with
			// the help of `graphql-upload`.
			if (this.uploadsConfig) {
				const contentType = req.headers["content-type"];
				if (contentType && contentType.startsWith("multipart/form-data")) {
					throw new Error("graphql-upload not implemented");
					// req.filePayload = await processRequest(req, res, this.uploadsConfig);
				}
			}

			// If health checking is enabled, trigger the `onHealthCheck`
			// function when the health check URL is requested.
			if (!disableHealthCheck && req.url === "/.well-known/apollo/server-health")
				return await this.handleHealthCheck({ req, res, onHealthCheck });

			// If the `playgroundOptions` are set, register a `graphql-playground` instance
			// (not available in production) that is then used to handle all
			// incoming GraphQL requests.
			if (playgroundOptions && req.method === "GET") {
				const { mediaTypes } = accept.parseAll(req.headers);
				const prefersHTML =
					mediaTypes.find(x => x === "text/html" || x === "application/json") ===
					"text/html";

				if (prefersHTML) {
					const middlewareOptions = Object.assign(
						{
							endpoint: this.graphqlPath,
							subscriptionEndpoint: this.subscriptionsPath || this.graphqlPath,
						},
						playgroundOptions
					);
					console.log("Moddlwware", middlewareOptions);
					return send(
						req,
						res,
						200,
						renderPlaygroundPage(middlewareOptions),
						"text/html"
					);
				}
			}

			// Handle incoming GraphQL requests using Apollo Server.
			const graphqlHandler = moleculerMiddleware(this, this.contextOptions);
			const { statusCode, data: responseData } = await graphqlHandler(req, res);
			if (statusCode === -1) {
				// bypass websocket upgrade
				res.statusCode = 200;
				return res.end();
			}
			return send(req, res, statusCode, responseData);
		};
	}

	// This integration supports file uploads.
	supportsUploads() {
		return false;
	}

	// This integration supports subscriptions.
	supportsSubscriptions() {
		return true;
	}

	async handleHealthCheck({ req, res, onHealthCheck }) {
		onHealthCheck = onHealthCheck || (() => undefined);
		try {
			const result = await onHealthCheck(req);
			return send(req, res, 200, { status: "pass", result }, "application/health+json");
		} catch (error) {
			const result = error instanceof Error ? error.toString() : error;
			return send(req, res, 503, { status: "fail", result }, "application/health+json");
		}
	}
}
module.exports = {
	ApolloServer,
};
