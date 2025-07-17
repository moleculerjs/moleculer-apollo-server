/*
 * moleculer-apollo-server
 * Copyright (c) 2025 MoleculerJS (https://github.com/moleculerjs/moleculer-apollo-server)
 * MIT Licensed
 */

"use strict";

const { ApolloServer: ApolloServerBase, HeaderMap } = require("@apollo/server");
const url = require("url");

// Utility function used to set multiple headers on a response object.
function convertHeaderMapToHeaders(res, headers) {
	for (const [key, value] of headers) {
		res.setHeader(key, value);
	}
}

function convertHeadersToHeaderMap(req) {
	const headers = new HeaderMap();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value !== undefined) {
			headers.set(key, Array.isArray(value) ? value.join(", ") : value);
		}
	}
	return headers;
}

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
	constructor(options, middlewareOptions) {
		super(options);
		this.middlewareOptions = middlewareOptions;
	}

	// Extract Apollo Server options from the request.
	createGraphQLServerOptions(req, res) {
		return super.graphQLServerOptions({ req, res });
	}

	// Prepares and returns an async function that can be used to handle
	// GraphQL requests.
	createHandler({ path } = {}) {
		return async (req, res) => {
			this.graphqlPath = path || "/graphql";

			// Handle incoming GraphQL requests using Apollo Server.
			const context = this.middlewareOptions?.context ?? (async () => ({}));
			const response = await this.executeHTTPGraphQLRequest({
				httpGraphQLRequest: {
					method: req.method.toUpperCase(),
					headers: convertHeadersToHeaderMap(req),
					search: url.parse(req.url, true).query ?? "",
					body: req.body
				},
				context: () => context({ req, res })
			});

			convertHeaderMapToHeaders(res, response.headers);

			if (response?.body?.kind == "complete") {
				return send(
					req,
					res,
					response.status ?? 200,
					response.body.string,
					response.headers?.get("content-type")
				);
			}

			// TODO: Handle chunked response
		};
	}

	// This integration supports file uploads.
	supportsUploads() {
		return false;
	}

	// This integration supports subscriptions.
	supportsSubscriptions() {
		return false;
	}
}
module.exports = {
	ApolloServer
};
