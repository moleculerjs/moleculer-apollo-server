"use strict";

const fs = require("fs");
const { Kind } = require("graphql");
const { ServiceBroker } = require("moleculer");
const ApiGateway = require("moleculer-web");
const { ApolloService } = require("../../index");
const { PubSub } = require("graphql-subscriptions");

const broker = new ServiceBroker({
	logLevel: process.env.LOGLEVEL || "info" /*, transporter: "NATS"*/,
	hotReload: true,
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
					origin: ["http://localhost:3001", "http://localhost:3000"],
					credentials: true,
					// Configures the Access-Control-Allow-Methods CORS header.
					methods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
				},
				mappingPolicy: "restrict",
				authentication: "graphql_authenticate",
				authorization: "graphql_authorize",
			},

			// https://www.apollographql.com/docs/apollo-server/v2/api/apollo-server.html
			serverOptions: {
				tracing: true,

				playgroundOptions: {
					settings: {
						"editor.theme": "dark",
					},
				},

				engine: {
					apiKey: process.env.APOLLO_ENGINE_KEY,
				},

				subscriptions: {
					async onConnect($ctx) {
						const {
							params: {
								connectionParams,
								extra: { request },
							},
						} = $ctx;
						return true;
					},
					async context($ctx) {
						const {
							params: {
								connectionParams,
								extra: { request },
							},
						} = $ctx;
						// will be set to ctx.meta.user ( for subsciption filters )
						return this.graphql_authenticate($ctx, undefined, request)
							.then(user => {
								return user;
							})
							.catch(e => null);
					},
				},
			},
		}),
	],

	settings: {
		path: "/",
		cors: {
			origin: ["http://localhost:3000"],
			credentials: true,
			// Configures the Access-Control-Allow-Methods CORS header.
			methods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
		},
		port: 3001,
	},

	actions: {},

	methods: {
		createPubSub() {
			return new PubSub();
		},
		prepareContextParams(mergedParams, actionName, context, args, root) {
			return mergedParams;
		},

		async graphql_authenticate(ctx, route, req, res) {
			return this.Promise.resolve({ username: "john", email: "john.doe@gmail.com" });
		},
		async graphql_authorize(ctx, route, req, res) {},
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
