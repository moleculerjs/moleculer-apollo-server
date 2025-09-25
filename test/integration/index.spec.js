"use strict";

const { Kind } = require("graphql");
const { ServiceBroker, Context, Errors } = require("moleculer");
const ApiGateway = require("moleculer-web");
const _ = require("lodash");

const { moleculerGql: gql } = require("../../index");
const ApolloServerService = require("../../src/service");

async function startService(mixinOptions, schemaMod) {
	const broker = new ServiceBroker({ logger: true, logLevel: "error" });

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
		it("Test routeOptions", async () => {
			const { broker, url } = await startService(
				{
					routeOptions: {
						path: "/gql",
						aliases: {
							async "/custom"(req, res) {
								res.setHeader("Content-Type", "application/json");
								res.end(JSON.stringify({ message: "Custom route" }));
								return;
							}
						}
					}
				},
				{
					settings: {
						graphql: {
							query: `
								test: String!
							`,
							resolvers: {
								Query: {
									test() {
										return "Test response";
									}
								}
							}
						}
					}
				}
			);

			const res = await call(url.replace(/graphql$/, "gql"), {
				query: "{ test }"
			});

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				data: {
					test: "Test response"
				}
			});

			const res2 = await call(url.replace(/graphql$/, "gql") + "/custom", {});

			expect(res2.status).toBe(200);
			expect(await res2.json()).toEqual({
				message: "Custom route"
			});

			await broker.stop();
		});

		it("Test serverOptions", async () => {
			const { broker, url } = await startService(
				{
					serverOptions: {
						formatError(formattedErr, error) {
							return {
								...formattedErr,
								retryable: error.originalError?.retryable
							};
						}
					}
				},
				{
					settings: {
						graphql: {
							query: `
								test: String!
							`,
							resolvers: {
								Query: {
									test() {
										throw new Errors.MoleculerRetryableError("Test error");
									}
								}
							}
						}
					}
				}
			);

			const res = await call(url, {
				query: "{ test }"
			});

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				data: null,
				errors: [
					{
						retryable: true,
						extensions: {
							code: "INTERNAL_SERVER_ERROR"
						},
						locations: [{ column: 3, line: 1 }],
						message: "Test error",
						path: ["test"]
					}
				]
			});

			await broker.stop();
		});
	});

	describe("Test schema preparation", () => {
		it("should generate valid GraphQL schema", async () => {
			const { broker, url } = await startService(
				{ serverOptions: { subscriptions: false } },
				{
					version: 2,
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
		it("should merge schemas", async () => {
			const { broker, url } = await startService({
				typeDefs: ["scalar Timestamp"],
				resolver: {
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
						}
					}
				}
			});

			jest.spyOn(broker, "broadcast");
			jest.spyOn(broker, "call");

			const TAGS = ["tag1", "tag2"];

			const POSTS = [
				{
					id: 1,
					title: "First post",
					author: 2,
					votes: 2,
					createdAt: new Date("2025-08-23T08:10:25Z")
				},
				{
					id: 2,
					title: "Second post",
					author: 1,
					votes: 1,
					createdAt: new Date("2025-11-23T12:59:30Z")
				},
				{
					id: 3,
					title: "Third post",
					author: 2,
					votes: 0,
					createdAt: new Date("2025-02-23T22:24:28Z")
				}
			];

			await broker.createService({
				name: "posts",
				settings: {
					graphql: {
						type: `
							"""
							This type describes a post entity.
							"""
							type Post {
								id: Int!
								title: String!
								author: User!
								votes: Int!
								createdAt: Timestamp
							}
						`,
						query: `
							tags: [String!]
						`,
						mutation: `
							addTag(tag: String!): Boolean!
						`,
						resolvers: {
							Post: {
								author: {
									action: "users.resolve",
									rootParams: {
										author: "id"
									}
								}
							},
							Query: {
								tags() {
									return TAGS;
								}
							},
							Mutation: {
								addTag(root, args) {
									TAGS.push(args.tag);
									return true;
								}
							}
						}
					}
				},

				actions: {
					posts: {
						graphql: {
							query: "posts: [Post!]!"
						},
						handler() {
							return POSTS;
						}
					},

					vote: {
						graphql: {
							mutation: "vote(postID: Int!): Post!"
						},
						handler(ctx) {
							const post = POSTS.find(p => p.id === ctx.params.postID);
							if (post) {
								post.votes++;
								return post;
							}
							throw new Error("Post not found");
						}
					}
				}
			});

			const USERS = [
				{
					id: 1,
					name: "Genaro Krueger",
					type: "1"
				},
				{
					id: 2,
					name: "Nicholas Paris",
					type: "2"
				},
				{
					id: 3,
					name: "Quinton Loden",
					type: "3"
				}
			];

			await broker.createService({
				name: "users",
				settings: {
					graphql: {
						type: gql`
							type User {
								id: Int!
								name: String!
								posts: [Post]
								postCount: Int
								type: UserType
							}
						`,
						enum: gql`
							"""
							Enumerations for user types
							"""
							enum UserType {
								ADMIN
								PUBLISHER
								READER
							}
						`,
						resolvers: {
							User: {
								posts: {
									action: "posts.findByUser",
									rootParams: {
										id: "userID"
									}
								},
								postCount: {
									// Call the "posts.count" action
									action: "posts.count",
									// Get `id` value from `root` and put it into `ctx.params.query.author`
									rootParams: {
										id: "query.author"
									}
								}
							},
							UserType: {
								ADMIN: "1",
								PUBLISHER: "2",
								READER: "3"
							}
						}
					}
				},

				actions: {
					users: {
						graphql: {
							query: "users: [User!]!"
						},
						handler() {
							return USERS;
						}
					},

					resolve(ctx) {
						if (Array.isArray(ctx.params.id)) {
							return _.cloneDeep(ctx.params.id.map(id => this.findByID(id)));
						} else {
							return _.cloneDeep(this.findByID(ctx.params.id));
						}
					}
				},

				methods: {
					findByID(id) {
						return USERS.find(user => user.id == id);
					}
				}
			});

			await broker.Promise.delay(1000);

			const res = await call(url, {
				query: "{ posts { id title author { name } createdAt } }"
			});

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				data: {
					posts: [
						{
							id: 1,
							title: "First post",
							author: { name: "Nicholas Paris" },
							createdAt: "2025-08-23T08:10:25.000Z"
						},
						{
							id: 2,
							title: "Second post",
							author: { name: "Genaro Krueger" },
							createdAt: "2025-11-23T12:59:30.000Z"
						},
						{
							id: 3,
							title: "Third post",
							author: { name: "Nicholas Paris" },
							createdAt: "2025-02-23T22:24:28.000Z"
						}
					]
				}
			});

			expect(broker.call).toHaveBeenCalledTimes(4);
			expect(broker.call).toHaveBeenNthCalledWith(1, "posts.posts", {}, expect.any(Object));
			expect(broker.call).toHaveBeenNthCalledWith(
				2,
				"users.resolve",
				{ id: 2 },
				expect.any(Object)
			);
			expect(broker.call).toHaveBeenNthCalledWith(
				3,
				"users.resolve",
				{ id: 1 },
				expect.any(Object)
			);
			expect(broker.call).toHaveBeenNthCalledWith(
				4,
				"users.resolve",
				{ id: 2 },
				expect.any(Object)
			);

			// -------

			const res2 = await call(url, {
				query: "mutation { vote(postID: 2) { id title votes author { name } } }"
			});

			expect(res2.status).toBe(200);
			expect(await res2.json()).toEqual({
				data: {
					vote: {
						id: 2,
						title: "Second post",
						votes: 2,
						author: { name: "Genaro Krueger" }
					}
				}
			});

			// -------

			const res3 = await call(url, {
				query: "{ tags }"
			});

			expect(res3.status).toBe(200);
			expect(await res3.json()).toEqual({ data: { tags: ["tag1", "tag2"] } });

			expect(broker.broadcast).toHaveBeenCalledTimes(2);
			expect(broker.broadcast).toHaveBeenCalledWith("graphql.schema.updated", {
				schema: expect.any(String)
			});
			expect(broker.broadcast.mock.calls[1][1]).toMatchSnapshot();

			const res4 = await call(url, {
				query: 'mutation { addTag(tag: "tag3") }'
			});

			expect(res4.status).toBe(200);

			const res5 = await call(url, {
				query: "{ tags }"
			});

			expect(res5.status).toBe(200);
			expect(await res5.json()).toEqual({ data: { tags: ["tag1", "tag2", "tag3"] } });

			await broker.stop();
		});
	});

	describe("Test resolvers", () => {
		const POSTS = [
			{
				id: 1,
				title: "First post",
				author: 2,
				reviewer: 3,
				voters: [1, 3],
				likers: [1, 3]
			},
			{
				id: 2,
				title: "Second post",
				author: 99,
				reviewer: null,
				voters: [2, 1, 3],
				likers: [2, 1, 3]
			},
			{
				id: 3,
				title: "Third post",
				author: 1,
				voters: [],
				likers: []
			}
		];

		const USERS = [
			{ id: 1, name: "Genaro Krueger" },
			{ id: 2, name: "Nicholas Paris" },
			{ id: 3, name: "Quinton Loden" }
		];

		it("should resolve fields", async () => {
			const { broker, url } = await startService();

			jest.spyOn(broker, "broadcast");
			jest.spyOn(broker, "call");

			await broker.createService({
				name: "posts",
				settings: {
					graphql: {
						type: `
							"""
							This type describes a post entity.
							"""
							type Post {
								id: Int!
								title: String!
								author: User
								reviewer: User
								voters: [User]
								likers: [User]
							}

							"""
							This type describes a user entity.
							"""
							type User {
								id: Int!
								name: String!
							}
						`,
						resolvers: {
							Post: {
								author: {
									action: "posts.resolveUser",
									rootParams: {
										author: "id"
									},
									nullIfError: true
								},
								reviewer: {
									action: "posts.resolveUser",
									rootParams: {
										reviewer: "id"
									},
									skipNullKeys: true,
									params: {
										a: 5
									}
								},
								voters: {
									action: "posts.resolveUser",
									rootParams: {
										voters: "id"
									}
								},
								likers: {
									action: "posts.resolveUser2",
									dataLoader: true,
									rootParams: {
										likers: "id"
									}
								}
							}
						}
					}
				},

				actions: {
					posts: {
						graphql: {
							query: "posts: [Post!]!"
						},
						handler() {
							return POSTS;
						}
					},

					resolveUser: {
						params: {
							id: [{ type: "number" }, { type: "array", items: "number" }]
						},
						handler(ctx) {
							if (Array.isArray(ctx.params.id)) {
								return _.cloneDeep(ctx.params.id.map(id => this.findByID(id)));
							} else {
								return _.cloneDeep(this.findByID(ctx.params.id));
							}
						}
					},

					resolveUser2: {
						params: {
							id: [{ type: "number" }, { type: "array", items: "number" }]
						},
						handler(ctx) {
							if (Array.isArray(ctx.params.id)) {
								return _.cloneDeep(ctx.params.id.map(id => this.findByID(id)));
							} else {
								return _.cloneDeep(this.findByID(ctx.params.id));
							}
						}
					}
				},

				methods: {
					findByID(id) {
						const found = USERS.find(user => user.id == id);
						if (found) return found;

						throw new Error("User not found");
					}
				}
			});

			const res = await call(url, {
				query: `{
					posts {
						id
						title
						author { name }
						reviewer { name }
						voters { name }
						likers { name }
					}
				}`
			});

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				data: {
					posts: [
						{
							id: 1,
							title: "First post",
							author: { name: "Nicholas Paris" },
							reviewer: { name: "Quinton Loden" },
							voters: [{ name: "Genaro Krueger" }, { name: "Quinton Loden" }],
							likers: [{ name: "Genaro Krueger" }, { name: "Quinton Loden" }]
						},
						{
							id: 2,
							title: "Second post",
							author: null,
							reviewer: null,
							voters: [
								{ name: "Nicholas Paris" },
								{ name: "Genaro Krueger" },
								{ name: "Quinton Loden" }
							],
							likers: [
								{ name: "Nicholas Paris" },
								{ name: "Genaro Krueger" },
								{ name: "Quinton Loden" }
							]
						},
						{
							id: 3,
							title: "Third post",
							author: { name: "Genaro Krueger" },
							reviewer: null,
							voters: [],
							likers: []
						}
					]
				}
			});

			const calls = _.groupBy(broker.call.mock.calls, call => call[0]);
			expect(calls["posts.posts"]).toHaveLength(1);
			expect(calls["posts.resolveUser"]).toHaveLength(7);
			expect(calls["posts.resolveUser2"]).toHaveLength(1);

			expect(calls["posts.resolveUser"][1][1]).toEqual({ a: 5, id: 3 });

			await broker.stop();
		});
	});

	describe("Test GraphQL context", () => {
		it("should call custom context function", async () => {
			const { broker, url } = await startService(
				{
					serverOptions: {
						context(args) {
							return {
								user: { id: 1, name: "Test User" }
							};
						}
					}
				},
				{
					settings: {
						graphql: {
							query: `
								currentUser: String!
							`,
							resolvers: {
								Query: {
									currentUser(root, args, context) {
										expect(context.user).toEqual({
											id: 1,
											name: "Test User"
										});
										expect(context.ctx).toBeInstanceOf(Context);
										expect(context.service.name).toBe("api");
										expect(context.params).toEqual({
											query: "query { currentUser }"
										});
										return "OK";
									}
								}
							}
						}
					}
				}
			);

			const res = await call(url, {
				query: "query { currentUser }"
			});

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				data: {
					currentUser: "OK"
				}
			});

			expect.assertions(6);
		});
	});

	describe("Test error handling", () => {
		it("should call the danger and receives an error", async () => {
			const { broker, url } = await startService(null, {
				actions: {
					danger: {
						graphql: {
							query: "danger: String!"
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

			const res = await call(url, {
				query: "query { danger }"
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
						message: "Danger action called",
						path: ["danger"]
					}
				]
			});

			await broker.stop();
		});

		it("should call the echo with wrong parameter and receives an error", async () => {
			const { broker, url } = await startService(null, {
				actions: {
					echo: {
						graphql: {
							query: "echo(input: String!): String!"
						},
						handler(ctx) {
							return ctx.params.input;
						}
					}
				}
			});

			const res = await call(url, {
				query: "query { echo(input: 123) }"
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
								column: 21,
								line: 1
							}
						],
						message: "String cannot represent a non string value: 123"
					}
				]
			});

			await broker.stop();
		});

		it("should throw error if query is not found", async () => {
			const { broker, url } = await startService(null, {
				actions: {
					echo: {
						graphql: {
							query: "echo(input: String!): String!"
						},
						handler(ctx) {
							return ctx.params.input;
						}
					}
				}
			});

			const res = await call(url, {
				query: "query { notFound }"
			});

			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({
				errors: [
					{
						extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
						locations: [{ column: 9, line: 1 }],
						message: 'Cannot query field "notFound" on type "Query".'
					}
				]
			});

			await broker.stop();
		});
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

	describe("Test schema interfaces & unions", () => {
		it("should handle interface and union types", async () => {
			const { broker, url } = await startService();

			await broker.createService({
				name: "content",
				settings: {
					graphql: {
						interface: `
							interface Node {
								id: ID!
							}
						`,
						union: `
							union SearchResult = Post | User
						`,
						type: `
							type Post implements Node {
								id: ID!
								title: String!
							}
							type User implements Node {
								id: ID!
								name: String!
							}
						`
					}
				},
				actions: {
					search: {
						graphql: {
							query: "search(term: String!): [SearchResult!]!"
						},
						handler(ctx) {
							if (ctx.params.term === "post") {
								return [{ __typename: "Post", id: "1", title: "Test Post" }];
							}
							return [{ __typename: "User", id: "1", name: "Test User" }];
						}
					}
				}
			});

			const res = await call(url, {
				query: `{
					search(term: "post") {
						... on Post {
							id
							title
						}
						... on User {
							id
							name
						}
					}
				}`
			});

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				data: {
					search: [
						{
							id: "1",
							title: "Test Post"
						}
					]
				}
			});

			const res2 = await call(url, {
				query: `{
					search(term: "user") {
						... on Post {
							id
							title
						}
						... on User {
							id
							name
						}
					}
				}`
			});

			expect(res2.status).toBe(200);
			expect(await res2.json()).toEqual({
				data: {
					search: [
						{
							id: "1",
							name: "Test User"
						}
					]
				}
			});

			await broker.stop();
		});
	});

	describe("Test service lifecycle and error handling", () => {
		it("should not publish private action", async () => {
			const { broker, url } = await startService({
				checkActionVisibility: true
			});

			await broker.createService({
				name: "visibility-test",
				actions: {
					publishedAction: {
						visibility: "published",
						graphql: {
							query: "publishedData: String!"
						},
						handler() {
							return "Published data";
						}
					},
					publicAction: {
						visibility: "public",
						graphql: {
							query: "publicData: String!"
						},
						handler() {
							return "Public data";
						}
					},
					protectedAction: {
						visibility: "protected",
						graphql: {
							query: "protectedData: String!"
						},
						handler() {
							return "Protected data";
						}
					}
				}
			});

			// Published action should be available
			const res = await call(url, {
				query: "{ publishedData }"
			});
			expect(res.status).toBe(200);

			// Public action should not be in schema
			const res2 = await call(url, {
				query: "{ publicData }"
			});
			expect(res2.status).toBe(400); // Should fail validation

			// Protected action should not be in schema
			const res3 = await call(url, {
				query: "{ protectedData }"
			});
			expect(res3.status).toBe(400); // Should fail validation

			await broker.stop();
		});

		it("should publish private actions", async () => {
			const { broker, url } = await startService({
				checkActionVisibility: false
			});

			await broker.createService({
				name: "visibility-test",
				actions: {
					publishedAction: {
						visibility: "published",
						graphql: {
							query: "publishedData: String!"
						},
						handler() {
							return "Published data";
						}
					},
					publicAction: {
						visibility: "public",
						graphql: {
							query: "publicData: String!"
						},
						handler() {
							return "Public data";
						}
					},
					protectedAction: {
						visibility: "protected",
						graphql: {
							query: "protectedData: String!"
						},
						handler() {
							return "Protected data";
						}
					}
				}
			});

			// Published action should be available
			const res = await call(url, {
				query: "{ publishedData }"
			});
			expect(res.status).toBe(200);

			// Public action should not be in schema
			const res2 = await call(url, {
				query: "{ publicData }"
			});
			expect(res2.status).toBe(200);

			// Protected action should not be in schema
			const res3 = await call(url, {
				query: "{ protectedData }"
			});
			expect(res3.status).toBe(200);

			await broker.stop();
		});
	});

	describe("Test DataLoader functionality", () => {
		it("should batch requests with DataLoader", async () => {
			const { broker, url } = await startService();

			const USERS = [
				{ id: 1, name: "User 1" },
				{ id: 2, name: "User 2" },
				{ id: 3, name: "User 3" }
			];

			await broker.createService({
				name: "dataloader-test",
				settings: {
					graphql: {
						type: `
							type Item {
								id: Int!
								name: String!
								owner: User
							}
							type User {
								id: Int!
								name: String!
							}
						`
					}
				},
				actions: {
					items: {
						graphql: {
							query: "items: [Item!]!"
						},
						handler() {
							return [
								{ id: 1, name: "Item 1", ownerId: 1 },
								{ id: 2, name: "Item 2", ownerId: 2 },
								{ id: 3, name: "Item 3", ownerId: 1 },
								{ id: 4, name: "Item 4", ownerId: 3 }
							];
						}
					},
					resolveUsers: {
						params: {
							id: [{ type: "number" }, { type: "array", items: "number" }]
						},
						handler(ctx) {
							const ids = Array.isArray(ctx.params.id)
								? ctx.params.id
								: [ctx.params.id];
							return ids.map(id => USERS.find(u => u.id === id));
						}
					}
				}
			});

			// Update the service to add resolver
			const svc = broker.getLocalService("dataloader-test");
			svc.settings.graphql.resolvers = {
				Item: {
					owner: {
						action: "dataloader-test.resolveUsers",
						dataLoader: true,
						rootParams: {
							ownerId: "id"
						}
					}
				}
			};

			// Force schema regeneration
			await broker.emit("$services.changed");
			await broker.Promise.delay(100);

			const res = await call(url, {
				query: `{
					items {
						id
						name
						owner {
							id
							name
						}
					}
				}`
			});

			expect(res.status).toBe(200);
			const result = await res.json();
			expect(result.data.items).toHaveLength(4);
			expect(result.data.items[0].owner.name).toBe("User 1");
			expect(result.data.items[2].owner.name).toBe("User 1");

			await broker.stop();
		});

		it("should handle DataLoader with complex keys", async () => {
			const { broker, url } = await startService();

			await broker.createService({
				name: "complex-dataloader",
				settings: {
					graphql: {
						type: `
							type Product {
								id: Int!
								name: String!
								price: Price
							}
							type Price {
								amount: Float!
								currency: String!
							}
						`
					}
				},
				actions: {
					products: {
						graphql: {
							query: "products: [Product!]!"
						},
						handler() {
							return [
								{ id: 1, name: "Product 1", priceId: 1, currency: "USD" },
								{ id: 2, name: "Product 2", priceId: 2, currency: "EUR" }
							];
						}
					},
					resolvePrices: {
						graphql: {
							dataLoaderBatchParam: "query",
							dataLoaderOptions: {
								cacheKeyFn: key => JSON.stringify(key)
							}
						},
						handler(ctx) {
							return ctx.params.query.map(q => ({
								amount: q.priceId * 10,
								currency: q.currency
							}));
						}
					}
				}
			});

			// Update resolver
			const svc = broker.getLocalService("complex-dataloader");
			svc.settings.graphql.resolvers = {
				Product: {
					price: {
						action: "complex-dataloader.resolvePrices",
						dataLoader: true,
						rootParams: {
							priceId: "priceId",
							currency: "currency"
						}
					}
				}
			};

			await broker.emit("$services.changed");
			await broker.Promise.delay(100);

			const res = await call(url, {
				query: `{
					products {
						id
						name
						price {
							amount
							currency
						}
					}
				}`
			});

			expect(res.status).toBe(200);
			const result = await res.json();
			expect(result.data.products[0].price).toEqual({ amount: 10, currency: "USD" });
			expect(result.data.products[1].price).toEqual({ amount: 20, currency: "EUR" });

			await broker.stop();
		});
	});

	describe("Test schema directives and custom resolvers", () => {
		it("should handle custom scalar types", async () => {
			const { broker, url } = await startService({
				typeDefs: ["scalar JSON"],
				resolvers: {
					JSON: {
						__parseValue(value) {
							return value; // value from the client
						},
						__serialize(value) {
							return value; // value sent to the client
						},
						__parseLiteral(ast) {
							if (ast.kind === "ObjectValue") {
								return parseObject(ast);
							}
							return null;
						}
					}
				}
			});

			function parseObject(ast) {
				const obj = {};
				ast.fields.forEach(field => {
					obj[field.name.value] = parseValue(field.value);
				});
				return obj;
			}

			function parseValue(ast) {
				switch (ast.kind) {
					case "StringValue":
						return ast.value;
					case "IntValue":
						return parseInt(ast.value, 10);
					case "FloatValue":
						return parseFloat(ast.value);
					case "BooleanValue":
						return ast.value;
					case "ObjectValue":
						return parseObject(ast);
					default:
						return null;
				}
			}

			await broker.createService({
				name: "json-test",
				settings: {
					graphql: {
						type: `
							type Config {
								id: ID!
								data: JSON!
							}
						`
					}
				},
				actions: {
					getConfig: {
						graphql: {
							query: "config: Config!"
						},
						handler() {
							return {
								id: "1",
								data: {
									theme: "dark",
									features: ["feature1", "feature2"],
									settings: {
										notifications: true,
										language: "en"
									}
								}
							};
						}
					}
				}
			});

			const res = await call(url, {
				query: `{
					config {
						id
						data
					}
				}`
			});

			expect(res.status).toBe(200);
			const result = await res.json();
			expect(result.data.config.data).toEqual({
				theme: "dark",
				features: ["feature1", "feature2"],
				settings: {
					notifications: true,
					language: "en"
				}
			});

			await broker.stop();
		});
	});

	describe("Test Input type & prepareContextParams", () => {
		it("should handle input types", async () => {
			const { broker, url } = await startService();

			await broker.createService({
				name: "input-test",
				settings: {
					graphql: {
						type: `
							input CreateUserInput {
								name: String!
								email: String!
								age: Int
							}

							type User {
								id: ID!
								name: String!
								email: String!
								age: Int
							}
						`,
						query: `
							dummy: String
						`,
						resolvers: {
							Query: {
								dummy: () => "dummy"
							}
						}
					}
				},
				actions: {
					createUser: {
						graphql: {
							mutation: "createUser(input: CreateUserInput!): User!"
						},
						handler(ctx) {
							return {
								id: "123",
								...ctx.params.input
							};
						}
					}
				}
			});

			await broker.Promise.delay(100);

			const res = await call(url, {
				query: `mutation {
					createUser(input: { name: "John", email: "john@example.com", age: 30 }) {
						id
						name
						email
						age
					}
				}`
			});

			expect(res.status).toBe(200);
			const result = await res.json();
			expect(result.data.createUser).toEqual({
				id: "123",
				name: "John",
				email: "john@example.com",
				age: 30
			});

			await broker.stop();
		});

		it("should unwrap input with prepareContextParams", async () => {
			const { broker, url } = await startService(null, {
				methods: {
					prepareContextParams(params, actionName) {
						if (params.input) {
							return params.input;
						}
						return params;
					}
				}
			});

			await broker.createService({
				name: "input-test",
				settings: {
					graphql: {
						type: `
							input CreateUserInput {
								name: String!
								email: String!
								age: Int
							}

							type User {
								id: ID!
								name: String!
								email: String!
								age: Int
							}
						`,
						query: `
							dummy: String
						`,
						resolvers: {
							Query: {
								dummy: () => "dummy"
							}
						}
					}
				},
				actions: {
					createUser: {
						graphql: {
							mutation: "createUser(input: CreateUserInput!): User!"
						},
						handler(ctx) {
							return {
								id: "123",
								...ctx.params
							};
						}
					}
				}
			});

			await broker.Promise.delay(100);

			const res = await call(url, {
				query: `mutation {
					createUser(input: { name: "John", email: "john@example.com", age: 30 }) {
						id
						name
						email
						age
					}
				}`
			});

			expect(res.status).toBe(200);
			const result = await res.json();
			expect(result.data.createUser).toEqual({
				id: "123",
				name: "John",
				email: "john@example.com",
				age: 30
			});

			await broker.stop();
		});
	});

	describe("Test error handling edge cases", () => {
		it("should handle resolver errors with nullIfError option", async () => {
			const { broker, url } = await startService();

			await broker.createService({
				name: "error-test",
				settings: {
					graphql: {
						type: `
							type Data {
								id: ID!
								safe: String
								unsafe: String
							}
						`,
						resolvers: {
							Data: {
								safe: {
									action: "error-test.throwError",
									nullIfError: true
								},
								unsafe: {
									action: "error-test.throwError"
								}
							}
						}
					}
				},
				actions: {
					getData: {
						graphql: {
							query: "data: Data!"
						},
						handler() {
							return { id: "1" };
						}
					},
					throwError: {
						handler() {
							throw new Error("Test error");
						}
					}
				}
			});

			const res = await call(url, {
				query: `{
					data {
						id
						safe
					}
				}`
			});

			expect(res.status).toBe(200);
			const result = await res.json();
			expect(result.data.data.id).toBe("1");
			expect(result.data.data.safe).toBeNull();

			const res2 = await call(url, {
				query: `{
					data {
						id
						unsafe
					}
				}`
			});

			expect(res2.status).toBe(200);
			const result2 = await res2.json();
			expect(result2.data.data.id).toBe("1");
			expect(result2.data.data.unsafe).toBeNull();
			expect(result2.errors).toBeDefined();
			expect(result2.errors[0].message).toBe("Test error");

			await broker.stop();
		});

		it("should handle skipNullKeys option", async () => {
			const { broker, url } = await startService();

			await broker.createService({
				name: "skip-null-test",
				settings: {
					graphql: {
						type: `
							type Item {
								id: ID!
								details: Details
							}
							type Details {
								info: String
							}
						`,
						resolvers: {
							Item: {
								details: {
									action: "skip-null-test.getDetails",
									skipNullKeys: true,
									rootParams: {
										detailsId: "id"
									}
								}
							}
						}
					}
				},
				actions: {
					items: {
						graphql: {
							query: "items: [Item!]!"
						},
						handler() {
							return [
								{ id: "1", detailsId: "d1" },
								{ id: "2", detailsId: null },
								{ id: "3" }
							];
						}
					},
					getDetails: {
						handler(ctx) {
							return { info: `Details for ${ctx.params.id}` };
						}
					}
				}
			});

			const res = await call(url, {
				query: `{
					items {
						id
						details {
							info
						}
					}
				}`
			});

			expect(res.status).toBe(200);
			const result = await res.json();
			expect(result.data.items[0].details).toEqual({ info: "Details for d1" });
			expect(result.data.items[1].details).toBeNull();
			expect(result.data.items[2].details).toBeNull();

			await broker.stop();
		});
	});

	describe("Test autoUpdateSchema disabled", () => {
		it("should not update schema when autoUpdateSchema is false", async () => {
			const { broker } = await startService({
				autoUpdateSchema: false
			});

			const svc = broker.getLocalService("api");
			svc.shouldUpdateGraphqlSchema = false;

			await broker.emit("$services.changed");
			await broker.Promise.delay(100);

			expect(svc.shouldUpdateGraphqlSchema).toBe(false);

			await broker.stop();
		});

		it("should invalidate schema on demand", async () => {
			const { broker } = await startService({
				autoUpdateSchema: false
			});

			const svc = broker.getLocalService("api");
			svc.shouldUpdateGraphqlSchema = false;

			await broker.emit("graphql.invalidate");

			expect(svc.shouldUpdateGraphqlSchema).toBe(true);

			await broker.stop();
		});
	});

	describe("Test race-condition in prepareGraphQLSchema", () => {
		it("should not prepare GQL twice", async () => {
			const { broker, url } = await startService(null, {
				actions: {
					echo: {
						graphql: {
							query: "echo(input: String!): String!"
						},
						handler(ctx) {
							return ctx.params.input;
						}
					}
				}
			});

			const svc = broker.getLocalService("api");

			// Store original method
			const originalGenerateGraphQLSchema = svc.generateGraphQLSchema.bind(svc);

			// Mock with 2 second delay
			jest.spyOn(svc, "generateGraphQLSchema").mockImplementation(async function (...args) {
				await new Promise(resolve => setTimeout(resolve, 2000));
				return originalGenerateGraphQLSchema(...args);
			});

			const query = {
				query: 'query { echo(input: "Hello") }'
			};

			const res = await call(url, query);

			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ data: { echo: "Hello" } });
			expect(svc.generateGraphQLSchema).toHaveBeenCalledTimes(1);

			// Should prepare
			svc.shouldUpdateGraphqlSchema = true;
			svc.generateGraphQLSchema.mockClear();

			const p1 = call(url, query);
			const p2 = call(url, query);
			const p3 = call(url, query);

			const results = await Promise.all([p1, p2, p3]);

			for (const r of results) {
				expect(r.status).toBe(200);
				expect(await r.json()).toEqual({ data: { echo: "Hello" } });
			}

			expect(svc.generateGraphQLSchema).toHaveBeenCalledTimes(1);

			await broker.stop();
		});
	});
});
