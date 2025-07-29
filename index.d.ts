import { IExecutableSchemaDefinition } from "@graphql-tools/schema";
import { GraphQLSchema } from "graphql";
import { PubSub } from "graphql-subscriptions";
import { WebSocketServer } from "ws";

import { ServiceSchema } from "moleculer";
import { ApiRouteSchema, GatewayResponse, IncomingRequest } from "moleculer-web";
import { ApolloServer as ApolloServerBase, BaseContext } from "@apollo/server";
import { ServerOptions as WsServerOptions } from "graphql-ws";

declare module "moleculer-apollo-server" {

	export { GraphQLError } from "graphql";

	export type ContextCreator = (req: IncomingRequest, res: GatewayResponse,) => BaseContext | Promise<BaseContext>;

	export interface ApolloServerOptions {
		path: string;
		subscriptions?: boolean | WsServerOptions;
	}

	export class ApolloServer extends ApolloServerBase {
		createHandler(context: ContextCreator): void;
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

	export interface ServiceResolverSchema {
		[key: string]: {
			[key: string]: ActionResolverSchema;
		};
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
		serverOptions?: ApolloServerOptions;
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
		createServiceResolvers(serviceName: string, resolvers: ServiceResolverSchema): { [key: string]: ActionResolverSchema };
		createActionResolver(serviceName: string, actionName: string, resolver: ActionResolverSchema): Function;
		getDataLoaderMapKey(actionName: string, staticParams: object, args: object): string;
		// buildDataLoader();
		//buildLoaderOptionMap(services: ServiceSchema[]): void;
		// createAsyncIteratorResolver
		generateGraphQLSchema(services: ServiceSchema[]): Promise<string>;
		makeExecutableSchema(schemaDef: IExecutableSchemaDefinition): GraphQLSchema;
		createPubSub(): PubSub | Promise<PubSub>;
		prepareGraphQLSchema(): Promise<void>;
		createGraphqlContext(args: unknown): BaseContext;
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

	export function moleculerGql<T>(
		typeString: TemplateStringsArray | string,
		...placeholders: T[]
	): string;
}
