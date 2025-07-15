"use strict";

const { ServiceBroker, Context, Errors } = require("moleculer");
const ApiGateway = require("moleculer-web");
const _ = require("lodash");

const ApolloServerService = require("../../src/service");

async function startService(mixinOptions, schemaMod) {
	const broker = new ServiceBroker({ logger: true, logLevel: "warn" });

	const svc = broker.createService(
		_.defaultsDeep({}, schemaMod, {
			name: "api",
			mixins: [ApiGateway, ApolloServerService(mixinOptions)],
			settings: {
				routes: [],
				ip: "0.0.0.0",
				port: 0 // Random
			}
		})
	);

	await broker.start();

	const url = `http://127.0.0.1:${svc.server.address().port}/graphql`;

	return { broker, svc, url };
}

function call(url, body) {
	return fetch(url, {
		method: "post",
		body: JSON.stringify(body),
		headers: { "Content-Type": "application/json" }
	});
}

describe("Test Apollo Service", () => {
	describe("Test service options", () => {
		// TODO: routeOptions
		// TODO: serverOptions
	});

	describe("Test schema preparation", () => {
		it("should generate valid GraphQL schema", async () => {
			const { broker, url } = await startService(
				{},
				{
					settings: {
						graphql: {
							type: `
							"""
							This type describes a post entity.
							"""
							type Post {
								id: Int!
								title: String!
								votes: Int!
							}
						`
						}
					},

					actions: {
						posts: {
							graphql: {
								query: "posts: [Post!]!"
							},
							handler() {
								return [
									{ id: 1, title: "Post 1", votes: 10 },
									{ id: 2, title: "Post 2", votes: 20 }
								];
							}
						}
					}
				}
			);

			const res = await call(url, {
				query: "{ posts { id title votes } }"
			});

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				data: {
					posts: [
						{ id: 1, title: "Post 1", votes: 10 },
						{ id: 2, title: "Post 2", votes: 20 }
					]
				}
			});

			jest.spyOn(broker, "broadcast");

			await broker.createService({
				name: "users",
				settings: {
					graphql: {
						type: `
							type User {
								id: Int!
								name: String!
							}
						`
					}
				},

				actions: {
					users: {
						graphql: {
							query: "users: [User!]!"
						},
						handler() {
							return [
								{ id: 1, name: "User 1" },
								{ id: 2, name: "User 2" }
							];
						}
					}
				}
			});

			await broker.Promise.delay(1000);

			const res2 = await call(url, {
				query: "{ users { id name } }"
			});

			expect(res2.status).toBe(200);
			expect(await res2.json()).toEqual({
				data: {
					users: [
						{ id: 1, name: "User 1" },
						{ id: 2, name: "User 2" }
					]
				}
			});

			expect(broker.broadcast).toHaveBeenCalledTimes(2);
			expect(broker.broadcast).toHaveBeenCalledWith("graphql.schema.updated", {
				schema: expect.any(String)
			});
			expect(broker.broadcast.mock.calls[1][1]).toMatchSnapshot();

			await broker.stop();
		});
	});

	describe("Test schema merging", () => {
		// TODO:
	});

	describe("Test resolvers", () => {
		// TODO: rootParams
		// TODO: nullIfError
		// TODO: skipNullKeys
		// TODO: dataLoader
	});

	describe("Test GraphQL context", () => {
		// TODO:
	});

	describe("Test error handling", () => {
		// TODO:
	});

	describe("Test GraphQL action", () => {
		it("should create the 'graphql' action", async () => {
			const { broker } = await startService(null, {
				actions: {
					echo: {
						graphql: {
							query: "echo(input: String!): String!"
						},
						handler(ctx) {
							return ctx.params.input;
						}
					},
					danger: {
						graphql: {
							query: "danger(input: String!): String!"
						},
						handler(ctx) {
							throw new Errors.MoleculerClientError(
								"Danger action called",
								400,
								"DANGER"
							);
						}
					}
				}
			});

			const res = await broker.call("api.graphql", {
				query: "query echo($a: String!) { echo(input: $a) }",
				variables: { a: "Moleculer" }
			});
			expect(res).toEqual({
				data: {
					echo: "Moleculer"
				}
			});

			const res2 = await broker.call("api.graphql", {
				query: "query danger($a: String!) { danger(input: $a) }",
				variables: { a: "Moleculer" }
			});

			expect(res2).toEqual({
				data: null,
				errors: [
					{
						extensions: { code: "INTERNAL_SERVER_ERROR" },
						locations: [{ column: 29, line: 1 }],
						message: "Danger action called",
						path: ["danger"]
					}
				]
			});

			const res3 = await broker.call("api.graphql", {
				query: "query notFound($a: String!) { notFound(input: $a) }",
				variables: { a: "Moleculer" }
			});

			expect(res3).toEqual({
				errors: [
					{
						extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
						locations: [{ column: 31, line: 1 }],
						message: 'Cannot query field "notFound" on type "Query".'
					}
				]
			});

			await broker.stop();
		});

		it("should not create the 'graphql' action", async () => {
			const { broker } = await startService({ createAction: false });

			await expect(broker.call("api.graphql")).rejects.toThrow(Errors.ServiceNotFoundError);

			await broker.stop();
		});
	});

	describe("Test healthcheck", () => {
		// TODO:
	});
});
