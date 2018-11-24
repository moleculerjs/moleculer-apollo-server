"use strict";

let { ServiceBroker } 	= require("moleculer");

const ApiGateway 	= require("moleculer-web");
const { ApolloService } = require("../../index");

const broker = new ServiceBroker({ logLevel: "info" });

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
				tracing: false,

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
	},

	events: {
		"graphql.schema.updated"({ schema }) {
			//fs.writeFileSync("./schema.gql", schema, "utf8");
			this.logger.info("Generated GraphQL schema:\n\n" + schema);
		}
	}
})

broker.start()
	.then(() => {
		broker.repl();

		// broker.call("api.graphql", {
		// 	query: `query { hello }`
		// })
		broker.call("api.graphql", {
			query: `mutation welcome($name: String!) {
				welcome(name: $name)
			}`,
			variables: {
				name: "Moleculer"
			}
		})
			.then(res => {
				if (res.errors && res.errors.length > 0)
					return res.errors.forEach(broker.logger.error);
					
				broker.logger.info(res.data);
			})
			.catch(broker.logger.error)
	});
