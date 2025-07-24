const { ServiceBroker } = require("moleculer");
const { MoleculerClientError } = require("moleculer").Errors;

const ApiGateway = require("moleculer-web");
const { ApolloService } = require("../../index");

const { createClient } = require("graphql-ws");
const ws = require("ws");

describe("Integration test for greeter service", () => {
	const broker = new ServiceBroker({ logger: false });

	let GQL_URL;
	const apiSvc = broker.createService({
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

				// https://www.apollographql.com/docs/apollo-server/v2/api/apollo-server.html
				serverOptions: {}
			})
		],

		settings: {
			ip: "0.0.0.0",
			port: 0 // Random
		},

		methods: {
			prepareContextParams(params, actionName) {
				if (actionName === "greeter.replace" && params.input) {
					return params.input;
				}
				return params;
			}
		}
	});

	broker.createService({
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
					query: `
						welcome(name: String!): String!
					`
				},
				handler(ctx) {
					return `Hello ${ctx.params.name}`;
				}
			},
			update: {
				graphql: {
					mutation: "update(id: Int!): Boolean!"
				},
				async handler(ctx) {
					await ctx.broadcast("graphql.publish", {
						tag: "UPDATED",
						payload: ctx.params.id
					});

					return true;
				}
			},
			updated: {
				graphql: {
					subscription: "updated: Int!",
					tags: ["UPDATED"],
					filter: "greeter.updatedFilter"
				},
				handler(ctx) {
					return ctx.params.payload;
				}
			},

			updatedFilter: {
				handler(ctx) {
					return ctx.params.payload % 2 === 0;
				}
			},

			replace: {
				graphql: {
					input: `input GreeterInput {
						name: String!
					}`,
					type: `type GreeterOutput {
						name: String
					}`,
					mutation: "replace(input: GreeterInput!): GreeterOutput"
				},
				handler(ctx) {
					return ctx.params;
				}
			},

			danger: {
				graphql: {
					query: "danger: String!"
				},
				async handler() {
					throw new MoleculerClientError(
						"I've said it's a danger action!",
						422,
						"DANGER"
					);
				}
			},

			secret: {
				visibility: "protected",
				graphql: {
					query: "secret: String!"
				},
				async handler() {
					return "! TOP SECRET !";
				}
			}
		}
	});

	beforeAll(async () => {
		await broker.start();
		GQL_URL = `http://127.0.0.1:${apiSvc.server.address().port}/graphql`;
	});
	afterAll(() => broker.stop());

	it("should call the greeter.hello action", async () => {
		const res = await fetch(GQL_URL, {
			method: "post",
			body: JSON.stringify({
				operationName: null,
				variables: {},
				query: "{ hello }"
			}),
			headers: { "Content-Type": "application/json" }
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			data: {
				hello: "Hello Moleculer!"
			}
		});
	});

	it("should call the greeter.welcome action with parameter", async () => {
		const res = await fetch(GQL_URL, {
			method: "post",
			body: JSON.stringify({
				operationName: null,
				variables: {},
				query: 'query { welcome(name: "GraphQL") }'
			}),
			headers: { "Content-Type": "application/json" }
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			data: {
				welcome: "Hello GraphQL"
			}
		});
	});

	it("should call the greeter.welcome action with query variable", async () => {
		const res = await fetch(GQL_URL, {
			method: "post",
			body: JSON.stringify({
				operationName: null,
				variables: { name: "Moleculer GraphQL" },
				query: "query ($name: String!) { welcome(name: $name) }"
			}),
			headers: { "Content-Type": "application/json" }
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			data: {
				welcome: "Hello Moleculer GraphQL"
			}
		});
	});

	it("should call the greeter.replace action with wrapped input params", async () => {
		const res = await fetch(GQL_URL, {
			method: "post",
			body: JSON.stringify({
				operationName: null,
				variables: { name: "Moleculer GraphQL" },
				query: "mutation ($name: String!) { replace(input: { name: $name }) { name } }"
			}),
			headers: { "Content-Type": "application/json" }
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			data: {
				replace: {
					name: "Moleculer GraphQL"
				}
			}
		});
	});

	it("should call the greeter.danger and receives an error", async () => {
		const res = await fetch(GQL_URL, {
			method: "post",
			body: JSON.stringify({
				operationName: null,
				variables: {},
				query: "query { danger }"
			}),
			headers: { "Content-Type": "application/json" }
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			data: null,
			errors: [
				{
					extensions: {
						code: "INTERNAL_SERVER_ERROR"
						// exception: {
						// 	code: 422,
						// 	retryable: false,
						// 	type: "DANGER"
						// }
					},
					locations: [
						{
							column: 9,
							line: 1
						}
					],
					message: "I've said it's a danger action!",
					path: ["danger"]
				}
			]
		});
	});

	it("should not call the greeter.secret because it's protected", async () => {
		const res = await fetch(GQL_URL, {
			method: "post",
			body: JSON.stringify({
				operationName: null,
				variables: {},
				query: "query { secret }"
			}),
			headers: { "Content-Type": "application/json" }
		});

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			errors: [
				{
					extensions: {
						code: "GRAPHQL_VALIDATION_FAILED"
						// exception: {
						// 	code: 422,
						// 	retryable: false,
						// 	type: "DANGER"
						// }
					},
					locations: [
						{
							column: 9,
							line: 1
						}
					],
					message: 'Cannot query field "secret" on type "Query".'
				}
			]
		});
	});

	it("should subscribe to the updated subscription", async () => {
		const client = createClient({
			url: GQL_URL.replace("http", "ws"),
			webSocketImpl: ws
		});
		const sub = client.iterate({
			query: "subscription { updated }"
		});

		// Wait for WS connection & subscription
		await new Promise(resolve => setTimeout(resolve, 1000));

		const update = id =>
			fetch(GQL_URL, {
				method: "post",
				body: JSON.stringify({
					query: "mutation Update($id: Int!) { update(id: $id) }",
					variables: { id }
				}),
				headers: { "Content-Type": "application/json" }
			});

		for (let i = 0; i < 5; i++) {
			await update(i + 1);
		}

		const FLOW = [];

		for await (const res of sub) {
			FLOW.push(res.data.updated);
			if (FLOW.length === 2) {
				break;
			}
		}

		expect(FLOW).toEqual([2, 4]);
	});
});
