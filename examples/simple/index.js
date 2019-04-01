"use strict";

let { ServiceBroker } = require("moleculer");

const ApiGateway = require("moleculer-web");
const { ApolloService } = require("../../index");

const broker = new ServiceBroker({ logLevel: "info", hotReload: true });

broker.createService({
	name: "api",

	mixins: [
		// Gateway
		ApiGateway,

		// GraphQL Apollo Server
		ApolloService({
			// API Gateway route options
			routeOptions: {
				path: "/graphql",
				cors: true,
				mappingPolicy: "restrict",
			},

			// https://www.apollographql.com/docs/apollo-server/v2/api/apollo-server.html
			serverOptions: {},
		}),
	],

	events: {
		"graphql.schema.updated"({ schema }) {
			this.logger.info("Generated GraphQL schema:\n\n" + schema);
		},
	},
});

broker.createService({
	name: "greeter",

	actions: {
		hello: {
			graphql: {
				query: "hello: String!",
			},
			handler() {
				return "Hello Moleculer!";
			},
		},
		welcome: {
			graphql: {
				mutation: "welcome(name: String!): String!",
			},
			handler(ctx) {
				return `Hello ${ctx.params.name}`;
			},
		},
		update: {
			graphql: {
				subscription: "update: String!",
				tags: ["TEST"],
			},
			handler(ctx) {
				return ctx.params.payload;
			},
		},
	},
});

broker.start().then(async () => {
	broker.repl();

	const res = await broker.call("api.graphql", {
		query: "query { hello }",
	});

	let counter = 1;
	setInterval(
		async () => broker.broadcast("graphql.publish", { tag: "TEST", payload: `test ${counter++}` }),
		5000,
	);

	if (res.errors && res.errors.length > 0) return res.errors.forEach(broker.logger.error);

	broker.logger.info(res.data);

	broker.logger.info("----------------------------------------------------------");
	broker.logger.info("Open the http://localhost:3000/graphql URL in your browser");
	broker.logger.info("----------------------------------------------------------");
});
