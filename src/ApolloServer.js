"use strict";

const { ApolloServerBase } = require("apollo-server-core");
const { processRequest } = require("graphql-upload");
const { renderPlaygroundPage } = require("@apollographql/graphql-playground-html");
const accept = require("accept");
const moleculerApollo = require("./moleculerApollo");

function send(req, res, statusCode, data, responseType = "application/json") {
	res.statusCode = statusCode;

	const ctx = res.$ctx;
	if (!ctx.meta.$responseType) {
		ctx.meta.$responseType = responseType;
	}

	const service = res.$service;
	service.sendResponse(req, res, data);
}

class ApolloServer extends ApolloServerBase {
	// Extract Apollo Server options from the request.
	createGraphQLServerOptions(req, res) {
		return super.graphQLServerOptions({ req, res });
	}

	// Prepares and returns an async function that can be used to handle
	// GraphQL requests.
	createHandler({ path, disableHealthCheck, onHealthCheck } = {}) {
		const promiseWillStart = this.willStart();
		return async (req, res) => {
			this.graphqlPath = path || "/graphql";

			await promiseWillStart;

			// If file uploads are detected, prepare them for easier handling with
			// the help of `graphql-upload`.
			if (this.uploadsConfig) {
				const contentType = req.headers["content-type"];
				if (contentType && contentType.startsWith("multipart/form-data")) {
					req.filePayload = await processRequest(req, res, this.uploadsConfig);
				}
			}

			// If health checking is enabled, trigger the `onHealthCheck`
			// function when the health check URL is requested.
			if (!disableHealthCheck && req.url === "/.well-known/apollo/server-health")
				return await this.handleHealthCheck({ req, res, onHealthCheck });

			// If the `playgroundOptions` are set, register a `graphql-playground` instance
			// (not available in production) that is then used to handle all
			// incoming GraphQL requests.
			if (this.playgroundOptions && req.method === "GET") {
				const { mediaTypes } = accept.parseAll(req.headers);
				const prefersHTML =
					mediaTypes.find(x => x === "text/html" || x === "application/json") === "text/html";

				if (prefersHTML) {
					const middlewareOptions = Object.assign(
						{
							endpoint: this.graphqlPath,
							subscriptionEndpoint: this.subscriptionsPath,
						},
						this.playgroundOptions,
					);
					return send(req, res, 200, renderPlaygroundPage(middlewareOptions), "text/html");
				}
			}

			// Handle incoming GraphQL requests using Apollo Server.
			const graphqlHandler = moleculerApollo(() => this.createGraphQLServerOptions(req, res));
			const responseData = await graphqlHandler(req, res);
			send(req, res, 200, responseData);
		};
	}

	// This integration supports file uploads.
	supportsUploads() {
		return true;
	}

	// This integration supports subscriptions.
	supportsSubscriptions() {
		return true;
	}
}
exports.ApolloServer = ApolloServer;
