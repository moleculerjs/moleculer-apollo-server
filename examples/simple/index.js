"use strict";

let { ServiceBroker } 	= require("moleculer");

const ApiGateway 	= require("moleculer-web");
const { ApolloService } = require("../../index");

const broker = new ServiceBroker({});

broker.createService({
	name: "api",

	mixins: [
		// Gateway
		ApiGateway,

		// GraphQL Apollo Server
		ApolloService({

			// Global GraphQL typeDefs
			typeDefs: ``,

			// Global resolvers
			resolvers: {},

			// API Gateway route options
			routeOptions: {
				path: "/graphql",
				cors: true,
				mappingPolicy: "restrict"
			},

			// https://www.apollographql.com/docs/apollo-server/v2/api/apollo-server.html
			serverOptions: {
				tracing: true,

				engine: {
					apiKey: process.env.APOLLO_ENGINE_KEY
				}
			}
		})
	]
});

broker.createService({
	name: "greeter", 

	actions: {
		hello: {
			graphql: {
				query: "hello: String"
			},
			handler(ctx) {
				return "Hello Moleculer!"
			}
		},
		welcome: {
			params: {
				name: "string"
			},
			graphql: {
				mutation: "welcome(name: String!): String"
			},
			handler(ctx) {
				return `Hello ${ctx.params.name}`;
			}
		}
	}
})

broker.start()
	.then(() => {
		broker.repl();
	});
