"use strict";

jest.mock("../../src/ApolloServer");
const { ApolloServer } = require("../../src/ApolloServer");

jest.mock("dataloader");
const DataLoader = require("dataloader");

jest.mock("graphql-tools");
const { makeExecutableSchema } = require("graphql-tools");

jest.mock("graphql");
const GraphQL = require("graphql");

jest.mock("graphql-subscriptions");
const { PubSub, withFilter } = require("graphql-subscriptions");

const ApolloServerService = require("../../src/service");

const { ServiceBroker, Context, Errors } = require("moleculer");

async function startService(mixinOptions, baseSchema) {
	const broker = new ServiceBroker({ logger: false });

	baseSchema = baseSchema || {
		name: "api",
		settings: {
			routes: [],
		},
	};

	const svc = broker.createService(baseSchema, ApolloServerService(mixinOptions));
	await broker.start();

	return { broker, svc, stop: () => broker.stop() };
}

describe("Test Service", () => {
	describe("Test created handler", () => {
		it("should register a route with default options", async () => {
			const { broker, svc, stop } = await startService();

			expect(svc.shouldUpdateGraphqlSchema).toBe(true);

			expect(svc.settings.routes[0]).toStrictEqual({
				path: "/graphql",

				aliases: {
					"/": expect.any(Function),
					"GET /.well-known/apollo/server-health": expect.any(Function),
				},

				mappingPolicy: "restrict",

				bodyParsers: {
					json: true,
					urlencoded: { extended: true },
				},
			});

			stop();
		});

		it("should register a route with custom options", async () => {
			const { broker, svc, stop } = await startService({
				routeOptions: {
					path: "/apollo-server",

					aliases: {
						"GET /my-alias": jest.fn(),
					},

					cors: true,
				},
			});

			expect(svc.settings.routes[0]).toStrictEqual({
				path: "/apollo-server",

				aliases: {
					"/": expect.any(Function),
					"GET /.well-known/apollo/server-health": expect.any(Function),
					"GET /my-alias": expect.any(Function),
				},

				mappingPolicy: "restrict",

				bodyParsers: {
					json: true,
					urlencoded: { extended: true },
				},

				cors: true,
			});

			stop();
		});
	});

	describe("Test registered events", () => {
		it("should subscribe to '$services.changed' event", async () => {
			const { broker, svc, stop } = await startService();
			svc.invalidateGraphQLSchema = jest.fn();

			await broker.broadcastLocal("$services.changed");

			expect(svc.invalidateGraphQLSchema).toBeCalledTimes(1);
			expect(svc.invalidateGraphQLSchema).toBeCalledWith();

			stop();
		});

		it("should subscribe to the default subscription event", async () => {
			const { broker, svc, stop } = await startService();

			svc.pubsub = {
				publish: jest.fn(),
			};

			await broker.broadcastLocal("graphql.publish", {
				tag: "tag",
				payload: { a: 5 },
			});

			expect(svc.pubsub.publish).toBeCalledTimes(1);
			expect(svc.pubsub.publish).toBeCalledWith("tag", { a: 5 });

			stop();
		});

		it("should subscribe to a custom subscription event", async () => {
			const { broker, svc, stop } = await startService({
				subscriptionEventName: "my.graphql.event",
			});

			svc.pubsub = {
				publish: jest.fn(),
			};

			await broker.broadcastLocal("my.graphql.event", {
				tag: "tag",
				payload: { a: 5 },
			});

			expect(svc.pubsub.publish).toBeCalledTimes(1);
			expect(svc.pubsub.publish).toBeCalledWith("tag", { a: 5 });

			stop();
		});
	});

	describe("Test action", () => {
		it("should create the 'graphql' action", async () => {
			const { broker, svc, stop } = await startService();
			svc.prepareGraphQLSchema = jest.fn();
			svc.graphqlSchema = "graphqlSchema";
			GraphQL.graphql.mockImplementation(async () => "result");

			const res = await broker.call("api.graphql", {
				query: "my-query",
				variables: { a: 5 },
			});
			expect(res).toBe("result");

			expect(svc.prepareGraphQLSchema).toBeCalledTimes(1);
			expect(svc.prepareGraphQLSchema).toBeCalledWith();

			expect(GraphQL.graphql).toBeCalledTimes(1);
			expect(GraphQL.graphql).toBeCalledWith(
				"graphqlSchema",
				"my-query",
				null,
				{ ctx: expect.any(Context) },
				{ a: 5 }
			);

			stop();
		});

		it("should not create the 'graphql' action", async () => {
			const { broker, stop } = await startService({ createAction: false });

			await expect(broker.call("api.graphql")).rejects.toThrow(Errors.ServiceNotFoundError);

			stop();
		});
	});

	describe("Test methods", () => {
		describe("Test 'invalidateGraphQLSchema'", () => {
			it("should create the 'graphql' action", async () => {
				const { broker, svc, stop } = await startService();

				svc.shouldUpdateGraphqlSchema = false;

				svc.invalidateGraphQLSchema();

				expect(svc.shouldUpdateGraphqlSchema).toBe(true);

				stop();
			});
		});

		describe("Test 'getFieldName'", () => {
			let svc, stop;

			beforeAll(async () => {
				const res = await startService();
				svc = res.svc;
				stop = res.stop;
			});

			afterAll(async () => await stop());

			it("should return field name from one-line declaration", async () => {
				expect(svc.getFieldName("posts(limit: Int): [Post]")).toBe("posts");
			});

			it("should return field name from multi-line declaration", async () => {
				expect(
					svc.getFieldName(`
						getWorkspaces(
							name: [String]
							clientId: [String]
							sort: [String]
							pageSize: Int
							page: Int
						) : [Workspace]`)
				).toBe("getWorkspaces");
			});

			it("should return field name with comments", async () => {
				expect(
					svc.getFieldName(`
					# Get all posts with limit
					# Returns an array
					posts(limit: Int): [Post]`)
				).toBe("posts");
			});
		});
	});

	describe("Test 'getServiceName'", () => {
		it("should return the service fullName", async () => {
			const { svc, stop } = await startService();

			expect(svc.getServiceName({ name: "posts" })).toBe("posts");
			expect(svc.getServiceName({ name: "posts", version: 5 })).toBe("v5.posts");
			expect(svc.getServiceName({ name: "posts", version: "staging" })).toBe("staging.posts");
			expect(
				svc.getServiceName({ name: "posts", version: "staging", fullName: "full.posts" })
			).toBe("full.posts");

			stop();
		});
	});

	describe("Test 'getResolverActionName'", () => {
		it("should return the resolver name", async () => {
			const { svc, stop } = await startService();

			expect(svc.getResolverActionName("posts", "list")).toBe("posts.list");
			expect(svc.getResolverActionName("users", "users.list")).toBe("users.list");

			stop();
		});
	});

	describe("Test 'createServiceResolvers'", () => {
		it("should call actionResolvers", async () => {
			const { svc, stop } = await startService();

			svc.createActionResolver = jest.fn((name, r) => jest.fn());

			const resolvers = {
				author: {
					// Call the `users.resolve` action with `id` params
					action: "users.resolve",
					rootParams: {
						author: "id",
					},
				},
				voters: {
					// Call the `users.resolve` action with `id` params
					action: "voters.get",
					rootParams: {
						voters: "id",
					},
				},

				UserType: {
					ADMIN: { value: "1" },
					READER: { value: "2" },
				},
			};

			expect(svc.createServiceResolvers("users", resolvers)).toStrictEqual({
				author: expect.any(Function),
				voters: expect.any(Function),
				UserType: {
					ADMIN: { value: "1" },
					READER: { value: "2" },
				},
			});

			expect(svc.createActionResolver).toBeCalledTimes(2);
			expect(svc.createActionResolver).toBeCalledWith("users.resolve", resolvers.author);
			expect(svc.createActionResolver).toBeCalledWith("voters.get", resolvers.voters);

			stop();
		});
	});

	describe("Test 'createActionResolver' without DataLoader", () => {
		let broker, svc, stop;

		beforeAll(async () => {
			const res = await startService();
			broker = res.broker;
			svc = res.svc;
			stop = res.stop;
		});

		afterAll(async () => await stop());

		it("should return a resolver Function", async () => {
			expect(svc.createActionResolver("posts.find")).toBeInstanceOf(Function);
		});

		it("should call the given action with keys", async () => {
			const resolver = svc.createActionResolver("posts.find", {
				rootParams: {
					author: "id",
				},

				params: {
					repl: false,
				},
			});

			const ctx = new Context(broker);
			ctx.call = jest.fn(() => "response from action");

			const fakeRoot = { author: 12345 };

			const res = await resolver(fakeRoot, { a: 5 }, { ctx });

			expect(res).toBe("response from action");

			expect(ctx.call).toBeCalledTimes(1);
			expect(ctx.call).toBeCalledWith("posts.find", {
				a: 5,
				id: 12345,
				repl: false,
			});
		});

		it("should throw error", async () => {
			const resolver = svc.createActionResolver("posts.find", {
				params: {
					limit: 5,
				},
			});

			const ctx = new Context(broker);
			ctx.call = jest.fn(() =>
				Promise.reject(new Errors.MoleculerError("Something happened"))
			);

			const fakeRoot = { author: 12345 };

			expect(resolver(fakeRoot, { a: 5 }, { ctx })).rejects.toThrow("Something happened");

			expect(ctx.call).toBeCalledTimes(1);
			expect(ctx.call).toBeCalledWith("posts.find", {
				limit: 5,
				a: 5,
			});
		});

		it("should not throw error if nullIfError is true", async () => {
			const resolver = svc.createActionResolver("posts.find", {
				nullIfError: true,
				rootParams: {
					author: "id",
					"company.code": "company.code",
				},
			});

			const ctx = new Context(broker);
			ctx.call = jest.fn(() =>
				Promise.reject(new Errors.MoleculerError("Something happened"))
			);

			const fakeRoot = { author: 12345, company: { code: "Moleculer" } };

			const res = await resolver(fakeRoot, { a: 5 }, { ctx });

			expect(res).toBeNull();

			expect(ctx.call).toBeCalledTimes(1);
			expect(ctx.call).toBeCalledWith("posts.find", {
				id: 12345,
				company: {
					code: "Moleculer",
				},
				a: 5,
			});
		});
	});

	describe("Test 'createActionResolver' with DataLoader", () => {
		let broker, svc, stop;

		beforeAll(async () => {
			const res = await startService();
			broker = res.broker;
			svc = res.svc;
			stop = res.stop;
		});

		afterAll(async () => await stop());

		it("should return null if no rootValue", async () => {
			const resolver = svc.createActionResolver("posts.find", {
				rootParams: {
					author: "id",
				},

				dataLoader: true,
			});

			const fakeRoot = { user: 12345 };

			const res = await resolver(fakeRoot, { a: 5 }, {});

			expect(res).toBeNull();
		});

		it("should call the loader with single value", async () => {
			const resolver = svc.createActionResolver("posts.find", {
				rootParams: {
					author: "id",
				},

				dataLoader: true,
			});

			const loaders = {
				"posts.find": {
					load: jest.fn(async () => "Response from loader"),
				},
			};

			const fakeRoot = { author: 12345 };

			const res = await resolver(fakeRoot, { a: 5 }, { loaders });

			expect(res).toBe("Response from loader");

			expect(loaders["posts.find"].load).toBeCalledTimes(1);
			expect(loaders["posts.find"].load).toBeCalledWith(12345);
		});

		it("should call the loader with multi value", async () => {
			const resolver = svc.createActionResolver("posts.find", {
				rootParams: {
					author: "id",
				},

				dataLoader: true,
			});

			const loaders = {
				"posts.find": {
					load: jest.fn(async () => "Res"),
				},
			};

			const fakeRoot = { author: [1, 2, 5] };

			const res = await resolver(fakeRoot, { a: 5 }, { loaders });

			expect(res).toEqual(["Res", "Res", "Res"]);

			expect(loaders["posts.find"].load).toBeCalledTimes(3);
			expect(loaders["posts.find"].load).toBeCalledWith(1);
			expect(loaders["posts.find"].load).toBeCalledWith(2);
			expect(loaders["posts.find"].load).toBeCalledWith(5);
		});
	});

	describe("Test 'createAsyncIteratorResolver'", () => {
		let broker, svc, stop;

		beforeAll(async () => {
			const res = await startService();
			broker = res.broker;
			svc = res.svc;
			stop = res.stop;

			svc.pubsub = { asyncIterator: jest.fn(() => "iterator-result") };
			broker.call = jest.fn(async () => "action response");
		});

		afterAll(async () => await stop());

		it("should create resolver without tags & filter", async () => {
			const res = svc.createAsyncIteratorResolver("posts.find");

			expect(res).toEqual({
				subscribe: expect.any(Function),
				resolve: expect.any(Function),
			});

			// Test subscribe
			const res2 = res.subscribe();

			expect(res2).toBe("iterator-result");
			expect(svc.pubsub.asyncIterator).toBeCalledTimes(1);
			expect(svc.pubsub.asyncIterator).toBeCalledWith([]);

			// Test resolve
			const ctx = new Context(broker);
			const res3 = await res.resolve({ a: 5 }, { b: "John" }, ctx);

			expect(res3).toBe("action response");
			expect(broker.call).toBeCalledTimes(1);
			expect(broker.call).toBeCalledWith("posts.find", { b: "John", payload: { a: 5 } }, ctx);
		});

		it("should create resolver with tags", async () => {
			svc.pubsub.asyncIterator.mockClear();

			const res = svc.createAsyncIteratorResolver("posts.find", ["a", "b"]);

			expect(res).toEqual({
				subscribe: expect.any(Function),
				resolve: expect.any(Function),
			});

			// Test subscribe
			const res2 = res.subscribe();

			expect(res2).toBe("iterator-result");
			expect(svc.pubsub.asyncIterator).toBeCalledTimes(1);
			expect(svc.pubsub.asyncIterator).toBeCalledWith(["a", "b"]);
		});

		it("should create resolver with tags & filter", async () => {
			svc.pubsub.asyncIterator.mockClear();
			broker.call.mockClear();
			withFilter.mockImplementation((fn1, fn2) => [fn1, fn2]);

			const res = svc.createAsyncIteratorResolver("posts.find", ["a", "b"], "posts.filter");

			expect(res).toEqual({
				subscribe: [expect.any(Function), expect.any(Function)],
				resolve: expect.any(Function),
			});

			// Test first function
			expect(res.subscribe[0]()).toBe("iterator-result");

			expect(svc.pubsub.asyncIterator).toBeCalledTimes(1);
			expect(svc.pubsub.asyncIterator).toBeCalledWith(["a", "b"]);

			// Test second function without payload
			expect(await res.subscribe[1]()).toBe(false);

			// Test second function with payload
			const ctx = new Context(broker);
			expect(await res.subscribe[1]({ a: 5 }, { b: "John" }, ctx)).toBe("action response");

			expect(broker.call).toBeCalledTimes(1);
			expect(broker.call).toBeCalledWith(
				"posts.filter",
				{ b: "John", payload: { a: 5 } },
				ctx
			);
		});
	});
});
