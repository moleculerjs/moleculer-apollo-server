/*
 * moleculer-apollo-server
 * Copyright (c) 2018 MoleculerJS (https://github.com/moleculerjs/moleculer-apollo-server)
 * MIT Licensed
 */

"use strict";

const _ 						= require("lodash");
const { MoleculerServerError } 	= require("moleculer").Errors;
const { ApolloServer } 			= require("./ApolloServer");
const DataLoader = require("dataloader");
const { makeExecutableSchema }	= require("graphql-tools");
const GraphQL 					= require("graphql");
const { PubSub, withFilter }	= require("graphql-subscriptions");

module.exports = function(mixinOptions) {

	mixinOptions = _.defaultsDeep(mixinOptions, {
		routeOptions: {
			path: "/graphql",
		},
		schema: null,
		serverOptions: {},
		createAction: true,
		subscriptionEventName: "graphql.publish"
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
			createActionResolver(actionName, def = {}) {
				const { dataLoader = false, nullIfError = false, params = {}, rootParams = {} } = def;
				const rootKeys = Object.keys(rootParams);

				return async (root, args, context) => {
					try {
						if (dataLoader) {
							const dataLoaderKey = rootKeys[0]; // use the first root key
							const rootValue = root && root[dataLoaderKey];
							if (rootValue == null) {
								return null;
							}

							return Array.isArray(rootValue)
								? await Promise.all(rootValue.map(item => context.loaders[actionName].load(item)))
								: await context.loaders[actionName].load(rootValue);
						} else {
							const p = {};
							if (root && rootKeys) {
								rootKeys.forEach(k => _.set(p, def.rootParams[k], _.get(root, k)));
							}
							return await context.ctx.call(actionName, _.defaultsDeep(args, p, params));
						}
					} catch (err) {
						if (nullIfError) {
							return null;
						}
						if (err && err.ctx) {
							delete err.ctx; // Avoid circular JSON
						}
						throw err;
					}
				};
			},


			/**
			 * Create resolver for subscription
			 *
			 * @param {String} actionName
			 * @param {Array?} tags
			 * @param {Boolean?} filter
			 */
			createAsyncIteratorResolver(actionName, tags = [], filter = false) {
				return {
					subscribe: filter ? withFilter(
						() => this.pubsub.asyncIterator(tags),
						async (payload, params, ctx) => payload !== undefined ? this.broker.call(filter, { ...params, payload }, ctx) : false,
					) : () => this.pubsub.asyncIterator(tags),
					resolve: async (payload, params, ctx) => this.broker.call(actionName, { ...params, payload }, ctx),
				};
			},

			/**
			 * Generate GraphQL Schema
			 *
			 * @param {Object[]} services
			 * @returns {Object} Generated schema
			 */
			generateGraphQLSchema(services) {
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
					const subscriptions = [];
					const interfaces = [];
					const unions = [];
					const enums = [];
					const inputs = [];

					const processedServices = new Set();

					services.forEach(service => {
						if (service.settings.graphql) {
							const serviceName = this.getServiceName(service);

							// Skip multiple instances of services
							if (processedServices.has(serviceName)) return;
							processedServices.add(serviceName);

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

								if (globalDef.subscription) {
									subscriptions.push(globalDef.subscription);
								}

								if (globalDef.interface)
									interfaces.push(globalDef.interface);

								if (globalDef.union)
									unions.push(globalDef.union);

								if (globalDef.enum)
									enums.push(globalDef.enum);

								if (globalDef.input)
									inputs.push(globalDef.input);

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

									if (def.subscription) {
										const name = def.subscription.split(/[(:]/g)[0];
										subscriptions.push(def.subscription);
										if (!resolver["Subscription"]) resolver.Subscription = {};
										resolver.Subscription[name] = this.createAsyncIteratorResolver(action.name, def.tags, def.filter);
									}

									if (def.interface)
										interfaces.push(def.interface);

									if (def.union)
										unions.push(def.union);

									if (def.enum)
										enums.push(def.enum);

									if (def.input)
										inputs.push(def.input);
								}
							}
						});

						if (Object.keys(resolver).length > 0)
							resolvers = _.merge(resolvers, resolver);

					});

					if (queries.length > 0
					|| types.length > 0
					|| mutations.length > 0
					|| subscriptions.length > 0
					|| interfaces.length > 0
					|| unions.length > 0
					|| enums.length > 0
					|| inputs.length > 0) {
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

						if (subscriptions.length > 0) {
							str += `
								type Subscription {
									${subscriptions.join("\n")}
								}
							`;
						}

						if (interfaces.length > 0) {
							str += `
								${interfaces.join("\n")}
							`;
						}

						if (unions.length > 0) {
							str += `
								${unions.join("\n")}
							`;
						}

						if (enums.length > 0) {
							str += `
								${enums.join("\n")}
							`;
						}

						if (inputs.length > 0) {
							str += `
								${inputs.join("\n")}
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
					this.pubsub = new PubSub();
					const services = this.broker.registry.getServiceList({ withActions: true });
					const schema = this.generateGraphQLSchema(services);

					this.logger.debug("Generated GraphQL schema:\n\n" + GraphQL.printSchema(schema));

					this.apolloServer = new ApolloServer(_.defaultsDeep(mixinOptions.serverOptions, {
						schema,
						context: ({ req, connection }) => {
							return req ? {
								ctx: req.$ctx,
								service: req.$service,
								params: req.$params,
								loaders: this.createLoaders(req, services),
							} : {
								service: connection.$service
							};
						},
						subscriptions: {
							onConnect: connectionParams => ({ ...connectionParams, $service: this })
						}
					}));

					this.graphqlHandler = this.apolloServer.createHandler();
					this.apolloServer.installSubscriptionHandlers(this.server);
					this.graphqlSchema = schema;

					shouldUpdateSchema = false;

					this.broker.broadcast("graphql.schema.updated", {
						schema: GraphQL.printSchema(schema)
					});

				} catch(err) {
					this.logger.error(err);
					throw err;
				}
			},

			/**
			 * Get the name of a service including version spec
			 * @param {Object} service - Service object
			 * @returns {String} Name of service including version spec
			 */
			getServiceName(service) {
				return service.version ? `v${service.version}.${service.name}` : service.name;
			},

			/**
			 * Create the DataLoader instances to be used for batch resolution
			 * @param {Object} req
			 * @param {Object[]} services
			 * @returns {Object.<string, Object>} Key/value pairs of DataLoader instances
			 */
			createLoaders(req, services) {
				return services.reduce((serviceAccum, service) => {
					const serviceName = this.getServiceName(service);

					const { graphql } = service.settings;
					if (graphql && graphql.resolvers) {
						const { resolvers } = graphql;

						const typeLoaders = Object.values(resolvers).reduce((resolverAccum, type) => {
							const resolverLoaders = Object.values(type).reduce((fieldAccum, resolver) => {
								if (_.isPlainObject(resolver)) {
									const { action, dataLoader = false, rootParams = {} } = resolver;
									const actionParam = Object.values(rootParams)[0]; // use the first root parameter
									if (dataLoader && actionParam) {
										const resolverActionName = this.getResolverActionName(serviceName, action);
										if (fieldAccum[resolverActionName] == null) {
											// create a new DataLoader instance
											fieldAccum[resolverActionName] = new DataLoader(keys =>
												req.$ctx.call(resolverActionName, { [actionParam]: keys }),
											);
										}
									}
								}

								return fieldAccum;
							}, {});

							return { ...resolverAccum, ...resolverLoaders };
						}, {});

						serviceAccum = { ...serviceAccum, ...typeLoaders };
					}

					return serviceAccum;
				}, {});
			},
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
		};
	}
	serviceSchema.events = {
		[mixinOptions.subscriptionEventName](event) {
			this.pubsub.publish(event.tag, event.payload);
		}
	};
	return serviceSchema;
};
