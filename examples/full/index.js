"use strict";

const fs = require("fs");
const { Kind } = require("graphql");
const { ServiceBroker } = require("moleculer");
const ApiGateway = require("moleculer-web");
const { ApolloService } = require("../../index");
const E = require("moleculer-web").Errors;

const broker = new ServiceBroker({
	hotReload: true,
	logLevel: process.env.LOGLEVEL || "info" /*, transporter: "NATS"*/,
});

broker.createService({
	name: "api",

	mixins: [
		// Gateway
		ApiGateway,

		// GraphQL Apollo Server
		ApolloService({
			// Global GraphQL typeDefs
			typeDefs: ["scalar Date", "scalar Timestamp"],

			// Global resolvers
			resolvers: {
				Date: {
					__parseValue(value) {
						return new Date(value); // value from the client
					},
					__serialize(value) {
						return value.toISOString().split("T")[0]; // value sent to the client
					},
					__parseLiteral(ast) {
						if (ast.kind === Kind.INT) {
							return parseInt(ast.value, 10); // ast value is always in string format
						}

						return null;
					},
				},
				Timestamp: {
					__parseValue(value) {
						return new Date(value); // value from the client
					},
					__serialize(value) {
						return value.toISOString(); // value sent to the client
					},
					__parseLiteral(ast) {
						if (ast.kind === Kind.INT) {
							return parseInt(ast.value, 10); // ast value is always in string format
						}

						return null;
					},
				},
			},

			// API Gateway route options
			routeOptions: {
				path: "/graphql",
				cors: {
					origin: ["http://localhost:3001", "http://localhost:3000"], //["http://localhost:3001", "*", "localhost", "localhost:3001"],
					methods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
					credentials: true,
				},
				mappingPolicy: "restrict",
				authentication: true,
				authorization: true,
			},

			// https://www.apollographql.com/docs/apollo-server/v2/api/apollo-server.html
			serverOptions: {
				tracing: false,

				engine: {
					apiKey: process.env.APOLLO_ENGINE_KEY,
				},
			},
		}),
	],

	settings: {
		cors: {
			origin: ["http://localhost:3001", "http://localhost:3000"],
			credentials: false,
			// Configures the Access-Control-Allow-Methods CORS header.
			methods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
		},

		port: 3000,
	},

	methods: {
		async authenticate(ctx, route, req, res) {
			return { token: "1234" };
		},
		async authorize(ctx, route, req, res) {
			if (ctx.meta.user.token !== "1234")
				return this.Promise.reject(new E.UnAuthorizedError("ef"));
		},
	},

	events: {
		"graphql.schema.updated"({ schema }) {
			fs.writeFileSync(__dirname + "/generated-schema.gql", schema, "utf8");
			// this.logger.info("Generated GraphQL schema:\n\n" + schema);
		},
	},
});

broker.loadServices(__dirname);

broker.start().then(async () => {
	broker.repl();

	broker.logger.info("----------------------------------------------------------");
	broker.logger.info("Open the http://localhost:3000/graphql URL in your browser");
	broker.logger.info("----------------------------------------------------------");
});
