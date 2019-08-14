/*
 * moleculer-apollo-server
 * Copyright (c) 2018 MoleculerJS (https://github.com/moleculerjs/moleculer-apollo-server)
 * MIT Licensed
 */

"use strict";

const _ = require("lodash");
const { MoleculerServerError } = require("moleculer").Errors;
const { ApolloServer } = require("./ApolloServer");
const DataLoader = require("dataloader");
const { makeExecutableSchema } = require("graphql-tools");
const GraphQL = require("graphql");
const { PubSub, withFilter } = require("graphql-subscriptions");

module.exports = function(mixinOptions) {
	mixinOptions = _.defaultsDeep(mixinOptions, {
		routeOptions: {
			path: "/graphql",
		},
		schema: null,
		serverOptions: {},
		createAction: true,
		subscriptionEventName: "graphql.publish",
	});

	let shouldUpdateSchema = true;

	const serviceSchema = {
		events: {
			"$services.changed"() {
				this.invalidateGraphQLSchema();
			},
			[mixinOptions.subscriptionEventName](event) {
				if (this.pubsub) {
					this.pubsub.publish(event.tag, event.payload);
				}
			},
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
				if (action.indexOf(".") === -1) {
					return `${service}.${action}`;
				} else {
					return action;
				}
			},

			/**
			 * Create resolvers from service settings
			 *
			 * @param {String} serviceName
			 * @param {Object} resolvers
			 */
			createServiceResolvers(serviceName, resolvers) {
				return Object.entries(resolvers).reduce((acc, [name, r]) => {
					if (_.isPlainObject(r) && r.action != null) {
						// matches signature for remote action resolver
						acc[name] = this.createActionResolver(
							this.getResolverActionName(serviceName, r.action),
							r,
						);
					} else {
						// something else (enum, etc.)
						acc[name] = r;
					}

					return acc;
				}, {});
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
							const rootValue = root && _.get(root, dataLoaderKey);
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
					subscribe: filter
						? withFilter(
								() => this.pubsub.asyncIterator(tags),
								async (payload, params, ctx) =>
									payload !== undefined
										? this.broker.call(filter, { ...params, payload }, ctx)
										: false,
						  )
						: () => this.pubsub.asyncIterator(tags),
					resolve: async (payload, params, ctx) =>
						this.broker.call(actionName, { ...params, payload }, ctx),
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
					let schemaDirectives = null;

					if (mixinOptions.typeDefs) {
						typeDefs = typeDefs.concat(mixinOptions.typeDefs);
					}

					if (mixinOptions.resolvers) {
						resolvers = _.cloneDeep(mixinOptions.resolvers);
					}

					if (mixinOptions.schemaDirectives) {
						schemaDirectives = _.cloneDeep(mixinOptions.schemaDirectives);
					}

					let queries = [];
					let mutations = [];
					let subscriptions = [];
					let types = [];
					let interfaces = [];
					let unions = [];
					let enums = [];
					let inputs = [];

					const processedServices = new Set();

					services.forEach(service => {
						const serviceName = this.getServiceName(service);

						// Skip multiple instances of services
						if (processedServices.has(serviceName)) return;
						processedServices.add(serviceName);

						if (service.settings.graphql) {
							// --- COMPILE SERVICE-LEVEL DEFINITIONS ---
							if (_.isObject(service.settings.graphql)) {
								const globalDef = service.settings.graphql;

								if (globalDef.query) {
									queries = queries.concat(globalDef.query);
								}

								if (globalDef.mutation) {
									mutations = mutations.concat(globalDef.mutation);
								}

								if (globalDef.subscription) {
									subscriptions = subscriptions.concat(globalDef.subscription);
								}

								if (globalDef.type) {
									types = types.concat(globalDef.type);
								}

								if (globalDef.interface) {
									interfaces = interfaces.concat(globalDef.interface);
								}

								if (globalDef.union) {
									unions = unions.concat(globalDef.union);
								}

								if (globalDef.enum) {
									enums = enums.concat(globalDef.enum);
								}

								if (globalDef.input) {
									inputs = inputs.concat(globalDef.input);
								}

								if (globalDef.resolvers) {
									resolvers = Object.entries(globalDef.resolvers).reduce(
										(acc, [name, resolver]) => {
											acc[name] = _.merge(
												acc[name] || {},
												this.createServiceResolvers(serviceName, resolver),
											);
											return acc;
										},
										resolvers,
									);
								}
							}
						}

						// --- COMPILE ACTION-LEVEL DEFINITIONS ---
						const resolver = {};

						Object.values(service.actions).forEach(action => {
							const { graphql: def } = action;
							if (def && _.isObject(def)) {
								if (def.query) {
									if (!resolver["Query"]) resolver.Query = {};

									_.castArray(def.query).forEach(query => {
										const name = this.getFieldName(query);
										queries.push(query);
										resolver.Query[name] = this.createActionResolver(action.name);
									});
								}

								if (def.mutation) {
									if (!resolver["Mutation"]) resolver.Mutation = {};

									_.castArray(def.mutation).forEach(mutation => {
										const name = this.getFieldName(mutation);
										mutations.push(mutation);
										resolver.Mutation[name] = this.createActionResolver(action.name);
									});
								}

								if (def.subscription) {
									if (!resolver["Subscription"]) resolver.Subscription = {};

									_.castArray(def.subscription).forEach(subscription => {
										const name = this.getFieldName(subscription);
										subscriptions.push(subscription);
										resolver.Subscription[name] = this.createAsyncIteratorResolver(
											action.name,
											def.tags,
											def.filter,
										);
									});
								}

								if (def.type) {
									types = types.concat(def.type);
								}

								if (def.interface) {
									interfaces = interfaces.concat(def.interface);
								}

								if (def.union) {
									unions = unions.concat(def.union);
								}

								if (def.enum) {
									enums = enums.concat(def.enum);
								}

								if (def.input) {
									inputs = inputs.concat(def.input);
								}
							}
						});

						if (Object.keys(resolver).length > 0) {
							resolvers = _.merge(resolvers, resolver);
						}
					});

					if (
						queries.length > 0 ||
						types.length > 0 ||
						mutations.length > 0 ||
						subscriptions.length > 0 ||
						interfaces.length > 0 ||
						unions.length > 0 ||
						enums.length > 0 ||
						inputs.length > 0
					) {
						let str = "";
						if (queries.length > 0) {
							str += `
								type Query {
									${queries.join("\n")}
								}
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

						if (types.length > 0) {
							str += `
								${types.join("\n")}
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

					return makeExecutableSchema({ typeDefs, resolvers, schemaDirectives });
				} catch (err) {
					throw new MoleculerServerError(
						"Unable to compile GraphQL schema",
						500,
						"UNABLE_COMPILE_GRAPHQL_SCHEMA",
						{ err },
					);
				}
			},

			prepareGraphQLSchema() {
				// Schema is up-to-date
				if (!shouldUpdateSchema && this.graphqlHandler) {
					return;
				}

				// Create new server & regenerate GraphQL schema
				this.logger.info("♻ Recreate Apollo GraphQL server and regenerate GraphQL schema...");

				try {
					this.pubsub = new PubSub();
					const services = this.broker.registry.getServiceList({ withActions: true });
					const schema = this.generateGraphQLSchema(services);

					this.logger.debug("Generated GraphQL schema:\n\n" + GraphQL.printSchema(schema));

					this.apolloServer = new ApolloServer({
						schema,
						..._.defaultsDeep(mixinOptions.serverOptions, {
							context: ({ req, connection }) => {
								return req
									? {
											ctx: req.$ctx,
											service: req.$service,
											params: req.$params,
											loaders: this.createLoaders(req, services),
									  }
									: {
											service: connection.$service,
									  };
							},
							subscriptions: {
								onConnect: connectionParams => ({
									...connectionParams,
									$service: this,
								}),
							},
						}),
					});

					this.graphqlHandler = this.apolloServer.createHandler(mixinOptions.serverOptions);
					this.apolloServer.installSubscriptionHandlers(this.server);
					this.graphqlSchema = schema;

					shouldUpdateSchema = false;

					this.broker.broadcast("graphql.schema.updated", {
						schema: GraphQL.printSchema(schema),
					});
				} catch (err) {
					this.logger.error(err);
					throw err;
				}
			},

			/**
			 * Return the field name in a GraphQL Mutation, Query, or Subscription declaration
			 * @param {String} declaration - Mutation, Query, or Subscription declaration
			 * @returns {String} Field name of declaration
			 */
			getFieldName(declaration) {
				// Remove all multi-line/single-line descriptions and comments
				const cleanedDeclaration = declaration
					.replace(/"([\s\S]*?)"/g, "")
					.replace(/^[\s]*?#.*\n?/gm, "")
					.trim();
				return cleanedDeclaration.split(/[(:]/g)[0];
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
									const { action, dataLoader = false, params = {}, rootParams = {} } = resolver;
									const actionParam = Object.values(rootParams)[0]; // use the first root parameter
									if (dataLoader && actionParam) {
										const resolverActionName = this.getResolverActionName(serviceName, action);
										if (fieldAccum[resolverActionName] == null) {
											// create a new DataLoader instance
											fieldAccum[resolverActionName] = new DataLoader(keys =>
												req.$ctx.call(
													resolverActionName,
													_.defaultsDeep(
														{
															[actionParam]: keys,
														},
														params,
													),
												),
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
						} catch (err) {
							this.sendError(req, res, err);
						}
					},
					"/.well-known/apollo/server-health"(req, res) {
						try {
							this.prepareGraphQLSchema();
						} catch (err) {
							res.statusCode = 503;
							return this.sendResponse(
								req,
								res,
								{ status: "fail", schema: false },
								{ responseType: "application/health+json" },
							);
						}
						return this.graphqlHandler(req, res);
					},
				},

				mappingPolicy: "restrict",

				bodyParsers: {
					json: true,
					urlencoded: { extended: true },
				},
			});

			// Add route
			this.settings.routes.unshift(route);
		},

		started() {
			this.logger.info(`🚀 GraphQL server is available at ${mixinOptions.routeOptions.path}`);
		},
	};

	if (mixinOptions.createAction) {
		serviceSchema.actions = {
			graphql: {
				params: {
					query: { type: "string" },
					variables: { type: "object", optional: true },
				},
				handler(ctx) {
					this.prepareGraphQLSchema();
					return GraphQL.graphql(
						this.graphqlSchema,
						ctx.params.query,
						null,
						{ ctx },
						ctx.params.variables,
					);
				},
			},
		};
	}

	return serviceSchema;
};
