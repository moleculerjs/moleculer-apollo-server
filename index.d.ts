import { IExecutableSchemaDefinition } from "@graphql-tools/schema";
import { GraphQLSchema } from "graphql";
import { PubSub } from "graphql-subscriptions";
import { WebSocketServer } from "ws";

import { ServiceSchema } from "moleculer";
import { ApiRouteSchema, GatewayResponse, IncomingRequest } from "moleculer-web";
import { ApolloServer as ApolloServerBase, BaseContext, ApolloServerOptions as BaseApolloServerOptions } from "@apollo/server";
import { ServerOptions as WsServerOptions } from "graphql-ws";

declare module "moleculer-apollo-server" {

	export { GraphQLError } from "graphql";

	export type ContextCreator = (args: { req: IncomingRequest; res: GatewayResponse }) => BaseContext | Promise<BaseContext>;

	export interface ApolloServerOptions {
		path: string;
		subscriptions?: boolean | WsServerOptions;
	}

	export class ApolloServer extends ApolloServerBase {
		createHandler(context: ContextCreator): (req: IncomingRequest, res: GatewayResponse) => Promise<void>;
	}

	export interface ActionResolverSchema {
		action: string;
		rootParams?: {
			[key: string]: string;
		};
		dataLoader?: boolean;
		nullIfError?: boolean;
		skipNullKeys?: boolean;
		params?: { [key: string]: any };
	}

	export interface GraphQLActionOptions {
		query?: string | string[];
		mutation?: string | string[];
		subscription?: string | string[];
		type?: string | string[];
		interface?: string | string[];
		union?: string | string[];
		enum?: string | string[];
		input?: string | string[];
		tags?: string[];
		filter?: string;
		dataLoaderOptions?: any;
		dataLoaderBatchParam?: string;
	}

	export interface ServiceResolverSchema {
		[key: string]: {
			[key: string]: ActionResolverSchema;
		};
	}

	export interface ServiceGraphQLSettings {
		query?: string | string[];
		mutation?: string | string[];
		subscription?: string | string[];
		type?: string | string[];
		interface?: string | string[];
		union?: string | string[];
		enum?: string | string[];
		input?: string | string[];
		resolvers?: ServiceResolverSchema;
	}

	type CorsMethods = "GET" | "POST" | "PUT" | "DELETE" | "OPTIONS";

	export interface ServiceRouteCorsOptions {
		origin?: string | string[];
		methods?: CorsMethods | CorsMethods[];
		allowedHeaders?: string[];
		exposedHeaders?: string[];
		credentials?: boolean;
		maxAge?: number;
	}

	export interface ApolloServiceOptions {
		serverOptions?: BaseApolloServerOptions<BaseContext> & {
			subscriptions?: boolean | WsServerOptions;
		};
		routeOptions?: ApiRouteSchema;

		typeDefs?: string | string[];
		resolvers?: ServiceResolverSchema;
		// schemaDirectives?: {
		// 	[name: string]: typeof SchemaDirectiveVisitor;
		// };

		subscriptionEventName?: string;
		invalidateEventName?: string;

		createAction?: boolean;
		checkActionVisibility?: boolean;
		autoUpdateSchema?: boolean;
	}

	export interface ApolloServiceMethods {
		invalidateGraphQLSchema(): void;
		getFieldName(declaration: string): string;
		getResolverActionName(service: string, action: string): string;
		createServiceResolvers(serviceName: string, resolvers: { [key: string]: ActionResolverSchema }): { [key: string]: Function };
		createActionResolver(actionName: string, def?: ActionResolverSchema): Function;
		getDataLoaderMapKey(actionName: string, staticParams: object, args: object): string;
		buildDataLoader(ctx: any, actionName: string, batchedParamKey: string, staticParams: object, args: object, options?: { hashCacheKey?: boolean }): any;
		buildLoaderOptionMap(services: ServiceSchema[]): void;
		createAsyncIteratorResolver(actionName: string, tags?: string[], filter?: string): { subscribe: Function; resolve: Function };
		generateGraphQLSchema(services: ServiceSchema[]): GraphQLSchema;
		makeExecutableSchema(schemaDef: IExecutableSchemaDefinition): GraphQLSchema;
		createPubSub(): PubSub | Promise<PubSub>;
		prepareGraphQLSchema(): Promise<void>;
		createGraphqlContext(args: { req: any }): BaseContext;
		prepareContextParams?(mergedParams: any, actionName: string, context: BaseContext, root: any, args: any): Promise<any>;
	}

	export interface ApolloServiceLocalVars {
		apolloServer?: ApolloServer;
		graphqlHandler?: Function;
		graphqlSchema?: GraphQLSchema;
		shouldUpdateGraphqlSchema: boolean;
		dataLoaderOptions: Map<string, any>;
		dataLoaderBatchParams: Map<string, any>;
		pubsub?: PubSub;
		wsServer?: WebSocketServer;
	}

	export function ApolloService(options: ApolloServiceOptions): ServiceSchema;

	export function moleculerGql(
		typeString: TemplateStringsArray | string,
		...placeholders: any[]
	): string;
}
