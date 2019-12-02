/*
 * moleculer-apollo-server
 * Copyright (c) 2019 MoleculerJS (https://github.com/moleculerjs/moleculer-apollo-server)
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
const hash = require("object-hash");

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
				this.shouldUpdateGraphqlSchema = true;
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
			 * Get the full name of a service including version spec.
			 *
			 * @param {Service} service - Service object
			 * @returns {String} Name of service including version spec
			 */
			getServiceName(service) {
				if (service.fullName) return service.fullName;

				if (service.version != null)
					return (
						(typeof service.version == "number"
							? "v" + service.version
							: service.version) +
						"." +
						service.name
					);

				return service.name;
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
							r
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
				const {
					dataLoader = false,
					nullIfError = false,
					params: staticParams = {},
					rootParams = {},
				} = def;
				const rootKeys = Object.keys(rootParams);

				return async (root, args, context) => {
					try {
						if (dataLoader) {
							const dataLoaderMapKey = this.getDataLoaderMapKey(
								actionName,
								staticParams,
								args
							);
							const dataLoaderRootKey = rootKeys[0]; // for dataloader, use the first root key only

							// check to see if the DataLoader has already been added to the GraphQL context; if not then add it for subsequent use
							let dataLoader;
							if (context.dataLoaders.has(dataLoaderMapKey)) {
								dataLoader = context.dataLoaders.get(dataLoaderMapKey);
							} else {
								const batchedParamKey = rootParams[dataLoaderRootKey];
								dataLoader = this.buildDataLoader(
									context.ctx,
									actionName,
									batchedParamKey,
									staticParams,
									args
								);
								context.dataLoaders.set(dataLoaderMapKey, dataLoader);
							}

							const rootValue = root && _.get(root, dataLoaderRootKey);
							if (rootValue == null) {
								return null;
							}

							return Array.isArray(rootValue)
								? await dataLoader.loadMany(rootValue)
								: await dataLoader.load(rootValue);
						} else {
							const params = {};
							if (root && rootKeys) {
								rootKeys.forEach(key =>
									_.set(params, rootParams[key], _.get(root, key))
								);
							}

							return await context.ctx.call(
								actionName,
								_.defaultsDeep({}, args, params, staticParams)
							);
						}
					} catch (err) {
						if (nullIfError) {
							return null;
						}
						/* istanbul ignore next */
						if (err && err.ctx) {
							err.ctx = null; // Avoid circular JSON in Moleculer <= 0.13
						}
						throw err;
					}
				};
			},

			/**
			 * Get the unique key assigned to the DataLoader map
			 * @param {string} actionName - Fully qualified action name to bind to dataloader
			 * @param {Object.<string, any>} staticParams - Static parameters to use in dataloader
			 * @param {Object.<string, any>} args - Arguments passed to GraphQL child resolver
			 * @returns {string} Key to the dataloader instance
			 */
			getDataLoaderMapKey(actionName, staticParams, args) {
				if (Object.keys(staticParams).length > 0 || Object.keys(args).length > 0) {
					// create a unique hash of the static params and the arguments to ensure a unique DataLoader instance
					const actionParams = _.defaultsDeep({}, args, staticParams);
					const paramsHash = hash(actionParams);
					return `${actionName}:${paramsHash}`;
				}

				// if no static params or arguments are present then the action name can serve as the key
				return actionName;
			},

			/**
			 * Build a DataLoader instance
			 *
			 * @param {Object} ctx - Moleculer context
			 * @param {string} actionName - Fully qualified action name to bind to dataloader
			 * @param {string} batchedParamKey - Parameter key to use for loaded values
			 * @param {Object} staticParams - Static parameters to use in dataloader
			 * @param {Object} args - Arguments passed to GraphQL child resolver
			 * @returns {DataLoader} Dataloader instance
			 */
			buildDataLoader(ctx, actionName, batchedParamKey, staticParams, args) {
				const batchLoadFn = keys => {
					const rootParams = { [batchedParamKey]: keys };
					return ctx.call(actionName, _.defaultsDeep({}, args, rootParams, staticParams));
				};

				if (this.dataLoaderOptions.has(actionName)) {
					// use any specified options assigned to this action
					const options = this.dataLoaderOptions.get(actionName);
					return new DataLoader(batchLoadFn, options);
				}

				return new DataLoader(batchLoadFn);
			},

			/**
			 * Create resolver for subscription
			 *
			 * @param {String} actionName
			 * @param {Array?} tags
			 * @param {String?} filter
			 */
			createAsyncIteratorResolver(actionName, tags = [], filter) {
				return {
					subscribe: filter
						? withFilter(
								() => this.pubsub.asyncIterator(tags),
								async (payload, params, ctx) =>
									payload !== undefined
										? this.broker.call(filter, { ...params, payload }, ctx)
										: false
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

						if (service.settings && service.settings.graphql) {
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
												this.createServiceResolvers(serviceName, resolver)
											);
											return acc;
										},
										resolvers
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
										resolver.Query[name] = this.createActionResolver(
											action.name
										);
									});
								}

								if (def.mutation) {
									if (!resolver["Mutation"]) resolver.Mutation = {};

									_.castArray(def.mutation).forEach(mutation => {
										const name = this.getFieldName(mutation);
										mutations.push(mutation);
										resolver.Mutation[name] = this.createActionResolver(
											action.name
										);
									});
								}

								if (def.subscription) {
									if (!resolver["Subscription"]) resolver.Subscription = {};

									_.castArray(def.subscription).forEach(subscription => {
										const name = this.getFieldName(subscription);
										subscriptions.push(subscription);
										resolver.Subscription[
											name
										] = this.createAsyncIteratorResolver(
											action.name,
											def.tags,
											def.filter
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
						{ err }
					);
				}
			},

			prepareGraphQLSchema() {
				// Schema is up-to-date
				if (!this.shouldUpdateGraphqlSchema && this.graphqlHandler) {
					return;
				}

				// Create new server & regenerate GraphQL schema
				this.logger.info(
					"♻ Recreate Apollo GraphQL server and regenerate GraphQL schema..."
				);

				try {
					this.pubsub = new PubSub();
					const services = this.broker.registry.getServiceList({ withActions: true });
					const schema = this.generateGraphQLSchema(services);

					this.logger.debug(
						"Generated GraphQL schema:\n\n" + GraphQL.printSchema(schema)
					);

					this.apolloServer = new ApolloServer({
						schema,
						..._.defaultsDeep({}, mixinOptions.serverOptions, {
							context: ({ req, connection }) => {
								return req
									? {
											ctx: req.$ctx,
											service: req.$service,
											params: req.$params,
											dataLoaders: new Map(), // create an empty map to load DataLoader instances into
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

					this.graphqlHandler = this.apolloServer.createHandler(
						mixinOptions.serverOptions
					);
					this.apolloServer.installSubscriptionHandlers(this.server);
					this.graphqlSchema = schema;

					this.buildLoaderOptionMap(services); // rebuild the options for DataLoaders

					this.shouldUpdateGraphqlSchema = false;

					this.broker.broadcast("graphql.schema.updated", {
						schema: GraphQL.printSchema(schema),
					});
				} catch (err) {
					this.logger.error(err);
					throw err;
				}
			},

			/**
			 * Build a map of options to use with DataLoader
			 *
			 * @param {Object[]} services
			 * @modifies {this.dataLoaderOptions}
			 */
			buildLoaderOptionMap(services) {
				this.dataLoaderOptions.clear(); // clear map before rebuilding

				services.forEach(service => {
					Object.values(service.actions).forEach(action => {
						const { graphql: graphqlDefinition, name: actionName } = action;
						if (graphqlDefinition && graphqlDefinition.dataLoaderOptions) {
							const serviceName = this.getServiceName(service);
							const fullActionName = this.getResolverActionName(
								serviceName,
								actionName
							);
							this.dataLoaderOptions.set(
								fullActionName,
								graphqlDefinition.dataLoaderOptions
							);
						}
					});
				});
			},
		},

		created() {
			this.apolloServer = null;
			this.graphqlHandler = null;
			this.graphqlSchema = null;
			this.pubsub = null;
			this.shouldUpdateGraphqlSchema = true;
			this.dataLoaderOptions = new Map();

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
					"GET /.well-known/apollo/server-health"(req, res) {
						try {
							this.prepareGraphQLSchema();
						} catch (err) {
							res.statusCode = 503;
							return this.sendResponse(
								req,
								res,
								{ status: "fail", schema: false },
								{ responseType: "application/health+json" }
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
						ctx.params.variables
					);
				},
			},
		};
	}

	return serviceSchema;
};
