"use strict";

import { ExecutionResult } from "graphql";
import type { GraphQLRequest } from "@apollo/server";
import { ServiceBroker, Context, ServiceSchema, Errors } from "moleculer";
import ApiGateway from "moleculer-web";
import { ApolloService } from "../../";
import type {
	ApolloServiceSettings,
	ApolloServiceMethods,
	ApolloServiceLocalVars
} from "../../";

const broker = new ServiceBroker({
	logLevel: "info",
	tracing: {
		enabled: true,
		exporter: {
			type: "Console"
		}
	}
});

const ApiService: ServiceSchema<
	ApolloServiceSettings,
	ApolloServiceMethods,
	ApolloServiceLocalVars
> = {
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
				mappingPolicy: "restrict"
			},

			checkActionVisibility: true,

			// https://www.apollographql.com/docs/apollo-server/api/apollo-server#options
			serverOptions: {}
		})
	],

	events: {
		"graphql.schema.updated"(ctx: Context<{ schema: string }>) {
			this.logger.info("Generated GraphQL schema:\n\n" + ctx.params.schema);
		}
	}
};

const GreeterService: ServiceSchema = {
	name: "greeter",

	actions: {
		hello: {
			graphql: {
				query: "hello: String!"
			},
			handler() {
				return "Hello Moleculer!";
			}
		},
		welcome: {
			graphql: {
				mutation: `
					welcome(
						name: String!
					): String!
				`
			},
			handler(ctx: Context<{ name: string }>) {
				return `Hello ${ctx.params.name}`;
			}
		},

		update: {
			graphql: {
				mutation: "update(id: Int!): Boolean!"
			},
			async handler(ctx: Context<{ id: number }>) {
				await ctx.broadcast("graphql.publish", { tag: "UPDATED", payload: ctx.params.id });

				return true;
			}
		},

		updated: {
			graphql: {
				subscription: "updated: Int!",
				tags: ["UPDATED"],
				filter: "greeter.updatedFilter"
			},
			handler(ctx: Context<{ payload: number }>) {
				return ctx.params.payload;
			}
		},

		updatedFilter: {
			handler(ctx: Context<{ payload: number }>) {
				return ctx.params.payload % 2 === 0;
			}
		},

		danger: {
			graphql: {
				query: "danger: String!"
			},
			async handler() {
				throw new Errors.MoleculerClientError(
					"I've said it's a danger action!",
					422,
					"DANGER"
				);
			}
		}
	}
};

broker.createService(ApiService);
broker.createService(GreeterService);

async function start() {
	await broker.start();

	const res = await broker.call<ExecutionResult<{ hello: string }>, GraphQLRequest>("api.graphql", {
		query: "query { hello }"
	});

	broker.logger.info(res.data);
	if (res.data?.hello != "Hello Moleculer!") {
		throw new Error("Invalid hello response");
	}

	await broker.stop();
}

start();
