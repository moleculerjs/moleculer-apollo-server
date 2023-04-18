import { PubSubEngine } from "graphql-subscriptions";
import { ServerOptions } from "graphql-ws";

declare module "moleculer-apollo-server" {
	import { ServiceSchema, Context } from "moleculer";
	// import { Config } from "apollo-server-core";
	import { Config } from "@apollo/server";
	import { OptionsUrlencoded } from "body-parser";
	import { SchemaDirectiveVisitor, IResolvers } from "graphql-tools";
	import { RenderPageOptions } from "@apollographql/graphql-playground-html";
	export {
		GraphQLExtension,
		gql,
		ApolloError,
		toApolloError,
		SyntaxError,
		ValidationError,
		AuthenticationError,
		ForbiddenError,
		UserInputError,
		defaultPlaygroundOptions,
	} from "apollo-server-core";

	
	// export { GraphQLUpload } from "graphql-upload";

	// export * from "graphql-tools";

	export interface ApolloServerOptions {
		path: string;
		disableHealthCheck: boolean;
		onHealthCheck: () => {};
	}

	export class ApolloServer {
		createGraphQLServerOptions(req: any, res: any): Promise<any>;
		createHandler(options: ApolloServerOptions): void;
		supportsUploads(): boolean;
		supportsSubscriptions(): boolean;
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

	export interface ServiceRouteOptions {
		path?: string;
		use?: any[];
		etag?: boolean;
		whitelist?: string[];
		authorization?: boolean;
		camelCaseNames?: boolean;
		aliases?: {
			[key: string]: any; // Should discuss more on this. string | AliasSchema, ...
		};
		bodyParsers?: {
			json: boolean;
			urlencoded: OptionsUrlencoded;
		};
		cors?: boolean | ServiceRouteCorsOptions;
		mappingPolicy?: "all" | "restrict";
		authentication?: boolean;
		callOptions?: {
			timeout: number;
			fallbackResponse?: any;
		};
		onBeforeCall?: (ctx: Context, route: any, req: any, res: any) => Promise<any>;
		onAfterCall?: (ctx: Context, route: any, req: any, res: any, data: any) => Promise<any>;
	}
   // Promise<GraphQLExecutionContextValue> | GraphQLExecutionContextValue)

	export interface SubscriptionsConfig  {
		onConnect?:(ctx: Context) => Promise<Record<string, unknown> | boolean | void> | Record<string, unknown> | boolean | void;
		context?:(ctx:Context) => Promise<any>;
		createPubSub?:() => typeof PubSubEngine;
	}

	export interface ServerMixinOptions extends Config {
		playgroundOptions?:RenderPageOptions;
		subscriptions?:SubscriptionsConfig;
	}

	export interface ApolloServiceOptions {
		typeDefs?: string | string[];
		resolvers?: ServiceResolverSchema | IResolvers | Array<IResolvers>;
		schemaDirectives?: {
			[name: string]: typeof SchemaDirectiveVisitor;
		};
		routeOptions?: ServiceRouteOptions;
		serverOptions?: ServerMixinOptions;
		checkActionVisibility?: boolean;
		autoUpdateSchema?: boolean;
	}

	export function ApolloService(options: ApolloServiceOptions): ServiceSchema;

	export function moleculerGql<T>(
		typeString: TemplateStringsArray | string,
		...placeholders: T[]
	): string;
}
