/*
 * moleculer-apollo-server
 * Copyright (c) 2025 MoleculerJS (https://github.com/moleculerjs/moleculer-apollo-server)
 * MIT Licensed
 */

"use strict";

//const { runHttpQuery, convertNodeHttpToRequest } = require("apollo-server-core");
const { HeaderMap } = require("@apollo/server");
const url = require("url");

// Utility function used to set multiple headers on a response object.
function setHeaders(res, headers) {
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

module.exports = function graphqlMoleculer(server, options) {
	if (!server) {
		throw new Error("Apollo Server instance is required.");
	}
	// if (!options) {
	// 	throw new Error("Apollo Server requires options.");
	// }

	return async function graphqlHandler(req, res) {
		const context = options?.context ?? (async () => ({}));

		const httpGraphQLRequest = {
			method: req.method.toUpperCase(),
			headers: convertHeadersToHeaderMap(req),
			search: url.parse(req.url, true).query ?? "",
			body: req.body
		};

		const result = await server.executeHTTPGraphQLRequest({
			httpGraphQLRequest,
			context: () => context({ req, res })
		});

		setHeaders(res, result.headers);

		return result;
	};
};
