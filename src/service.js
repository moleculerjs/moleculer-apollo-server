/*
 * moleculer-apollo-server
 * Copyright (c) 2018 MoleculerJS (https://github.com/moleculerjs/moleculer-apollo-server)
 * MIT Licensed
 */

"use strict";

const _ 						= require("lodash");
const { MoleculerServerError } 	= require("moleculer").Errors;
const { ApolloServer } 			= require("./ApolloServer");
const { makeExecutableSchema }	= require("graphql-tools");
const GraphQL 					= require("graphql");

module.exports = function(mixinOptions) {

	mixinOptions = _.defaultsDeep(mixinOptions, {
		routeOptions: {
			path: "/graphql",
		},
		schema: null,
		serverOptions: {},
		createAction: true
	});

	let shouldUpdateSchema = true;

	const serviceSchema = {
		events: {
			"$services.changed"() { this.invalidateGraphQLSchema(); },
		},

		methods: {
			/**
			 * Invalidate the generated GraphQL schema
			 */
			invalidateGraphQLSchema() {
				shouldUpdateSchema = true;
			},

			/**
			 * Get action name for resolver
			 *
			 * @param {String} service
			 * @param {String} action
			 */
			getResolverActionName(service, action) {
				if (action.indexOf(".") === -1)
					return `${service}.${action}`;
				else
					return action;
			},

			/**
			 * Create resolvers for actions.
			 * 
			 * @param {String} serviceName
			 * @param {Object} resolvers
			 */
			createActionResolvers(serviceName, resolvers) {
				const res = {};
				_.forIn(resolvers, (r, name) => {
					if (_.isString(r)) {
						// If String, it is an action name
						res[name] = this.createActionResolver(this.getResolverActionName(serviceName, r));
					}
					else if (_.isPlainObject(r)) {
						// If Object, it is a remote action resolver
						res[name] = this.createActionResolver(this.getResolverActionName(serviceName, r.action), r);
					} else {
						// Something else.
						res[name] = r;
					}
				});

				return res;
			},

			/**
			 * Create resolver for action
			 *
			 * @param {String} actionName
			 * @param {Object?} def
			 */
			createActionResolver(actionName, def) {
				let params, rootKeys;
				if (def) {
					params = def.params;
					if (def.rootParams)
						rootKeys = Object.keys(def.rootParams);
				}
				return async (root, args, context) => {
					const p = {};
					if (root && rootKeys) {
						rootKeys.forEach(k => _.set(p, def.rootParams[k], _.get(root, k)));
					}
					try {
						return await context.ctx.call(actionName, _.defaultsDeep(args, p, params));
					} catch(err) {
						if (err && err.ctx)
							delete err.ctx; // Avoid circular JSON

						throw err;
					}
				};
			},

			/**
			 * Generate GraphQL Schema
			 */
			generateGraphQLSchema() {
				try {
					let typeDefs = [];
					let resolvers = {};

					if (mixinOptions.typeDefs)
						typeDefs.push(mixinOptions.typeDefs);

					if (mixinOptions.resolvers)
						resolvers = _.cloneDeep(mixinOptions.resolvers);

					const queries = [];
					const types = [];
					const mutations = [];

					const services = this.broker.registry.getServiceList({ withActions: true });
					services.forEach(service => {
						if (service.settings.graphql) {
							const serviceName = service.version ? `v${service.version}.${service.name}` : service.name;

							// --- COMPILE SERVICE-LEVEL DEFINITIONS ---
							if (_.isObject(service.settings.graphql)) {
								const globalDef = service.settings.graphql;

								if (globalDef.query) {
									queries.push(globalDef.query);
								}

								if (globalDef.type)
									types.push(globalDef.type);

								if (globalDef.mutation) {
									mutations.push(globalDef.mutation);
								}

								if (globalDef.resolvers) {
									_.forIn(globalDef.resolvers, (r, name) => {
										resolvers[name] = _.merge(resolvers[name] || {}, this.createActionResolvers(serviceName, r));
									});
								}
							}
						}

						// --- COMPILE ACTION-LEVEL DEFINITIONS ---
						const resolver = {};

						_.forIn(service.actions, action => {
							if (action.graphql) {
								if (_.isObject(action.graphql)) {
									const def = action.graphql;

									if (def.query) {
										const name = def.query.split(/[(:]/g)[0];
										queries.push(def.query);
										if (!resolver["Query"]) resolver.Query = {};
										resolver.Query[name] = this.createActionResolver(action.name);
									}

									if (def.type)
										types.push(def.type);

									if (def.mutation) {
										const name = def.mutation.split(/[(:]/g)[0];
										mutations.push(def.mutation);
										if (!resolver["Mutation"]) resolver.Mutation = {};
										resolver.Mutation[name] = this.createActionResolver(action.name);
									}

								}
							}
						});

						if (Object.keys(resolver).length > 0)
							resolvers = _.merge(resolvers, resolver);

					});

					if (queries.length > 0 || types.length > 0 || mutations.length > 0) {
						let str = "";
						if (queries.length > 0) {
							str += `
								type Query {
									${queries.join("\n")}
								}
							`;
						}

						if (types.length > 0) {
							str += `
								${types.join("\n")}
							`;
						}

						if (mutations.length > 0) {
							str += `
								type Mutation {
									${mutations.join("\n")}
								}
							`;
						}

						typeDefs.push(str);
					}

					return makeExecutableSchema({ typeDefs, resolvers });

				} catch(err) {
					throw new MoleculerServerError("Unable to compile GraphQL schema", 500, "UNABLE_COMPILE_GRAPHQL_SCHEMA", { err });
				}
			},

			prepareGraphQLSchema() {
				// Schema is up-to-date
				if (!shouldUpdateSchema && this.graphqlHandler)
					return;

				// Create new server & regenerate GraphQL schema
				this.logger.info("♻ Recreate Apollo GraphQL server and regenerate GraphQL schema...");

				try {
					const schema = this.generateGraphQLSchema();

					this.logger.debug("Generated GraphQL schema:\n\n" + GraphQL.printSchema(schema));

					this.apolloServer = new ApolloServer(_.defaultsDeep(mixinOptions.serverOptions, {
						schema,
						context: ({ req }) => {
							return {
								ctx: req.$ctx,
								service: req.$service,
								params: req.$params,
							};
						}
					}));

					this.graphqlHandler = this.apolloServer.createHandler();
					this.graphqlSchema = schema;

					shouldUpdateSchema = false;

					this.broker.broadcast("graphql.schema.updated", {
						schema: GraphQL.printSchema(schema)
					});

				} catch(err) {
					this.logger.error(err);
					throw err;
				}
			}
		},

		created() {
			this.apolloServer = null;
			this.graphqlHandler = null;

			const route = _.defaultsDeep(mixinOptions.routeOptions, {
				aliases: {

					"/"(req, res) {
						try {
							this.prepareGraphQLSchema();
							return this.graphqlHandler(req, res);
						} catch(err) {
							this.sendError(req, res, err);
						}
					}
				},

				mappingPolicy: "restrict",

				bodyParsers: {
					json: true,
					urlencoded: { extended: true }
				},
			});

			// Add route
			this.settings.routes.unshift(route);
		},

		started() {
			this.logger.info(`🚀 GraphQL server is available at ${mixinOptions.routeOptions.path}`);
		}
	};

	if (mixinOptions.createAction) {
		serviceSchema.actions = {
			graphql: {
				params: {
					query: { type: "string" },
					variables: { type: "object", optional: true }
				},
				handler(ctx) {
					this.prepareGraphQLSchema();
					return GraphQL.graphql(this.graphqlSchema, ctx.params.query, null, { ctx }, ctx.params.variables);
				}
			}
		}
	}

	return serviceSchema;
};