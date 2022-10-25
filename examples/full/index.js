"use strict";

const fs = require("fs");
const { Kind } = require("graphql");
const { ServiceBroker } = require("moleculer");
const ApiGateway = require("moleculer-web");
const { ApolloService } = require("../../index");
const E = require("moleculer-web").Errors;
const { PubSub } = require("graphql-subscriptions");

const broker = new ServiceBroker({
	hotReload: true,
	tracing:{
		enabled:true,
		exporter:"Console",
		events:true,
		stackTrace:true
	},
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
				authentication: "graphql_authenticate",
				authorization: "graphql_authorize",

				onBeforeCall(ctx, route, req, res) {
                    // Set request headers to context meta
                    // ctx.meta.userAgent = req.headers["user-agent"];
					console.log(">>>>>>>>>",req.headers);
                },				
			},

			// https://www.apollographql.com/docs/apollo-server/v2/api/apollo-server.html
			serverOptions: {
				tracing: true,

				playgroundOptions:{
					settings:{
						"editor.theme":"dark"
					}
				},
	
				engine: {
					apiKey: process.env.APOLLO_ENGINE_KEY,
				},

				subscriptions:{

					async onConnect($ctx){
						const {params:{connectionParams,extra:{request}}} = $ctx;
						// return false for drop connection
						return request.headers.cookie.indexOf("logged=1") !== -1;
					},
					async context($ctx) {
						const {params:{connectionParams,extra:{request}}} = $ctx;
						// will be set to ctx.meta.user 
						return this.graphql_authenticate($ctx,undefined,request)
							.then(user => {
								return user;
							});
					}
				}, // sub

				formatError(err){
					// console.log("formar",this);
					this.logger.error("[GraphQL.formatError]",JSON.stringify(err,null,2));
					const { message, extensions: { code,exception } } = err;
					this.broker.emit("tgError",{ message });
					return { message,code,exception };
				},
		
			},
		}),
	],

	settings: {
		path: "/",
		cors: {
			origin: ["http://localhost:3001", "http://localhost:3000"],
			credentials: false,
			// Configures the Access-Control-Allow-Methods CORS header.
			methods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
		},

		port: 3000,

		routes: [
			{
				path: "/",
				aliases: {
					"GET /login": "api.login",
					"GET /logout": "api.logout",
				},
			},
		],
	},

	actions: {
		login: {
			handler(ctx) {
				ctx.meta.$responseHeaders = {
					"Set-Cookie": `logged=1`,
				};
				ctx.meta.$statusCode = 302;
				ctx.meta.$location = "/graphql";				
				return 
			},
		},
		logout: {
			handler(ctx) {
				ctx.meta.$responseHeaders = {
					"Set-Cookie": `logged=0`,
				};
				return "Logged out !"; 
			},
		},
	},

	methods: {

		createPubSub() {
			return new PubSub();
		},
		prepareContextParams(mergedParams,actionName,context,args,root) {
			if ( root && !Object.keys(args).length && Object.keys(context.params.variables).length > 0 ) {
				const args = Object.values(context.params.variables);
				_.set(mergedParams,"$args",args);
			}
			return mergedParams;
		},

		async graphql_authenticate(ctx, route, req, res) {
			if (req.headers.cookie?.indexOf("logged=1") !== -1)
				return this.Promise.resolve({ username: "john", email: "john.doe@gmail.com" });
			return this.Promise.resolve(null);
		},
		async graphql_authorize(ctx, route, req, res) {
			if (ctx.meta.user?.username !== "john")
				return this.Promise.reject(new E.UnAuthorizedError());
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
