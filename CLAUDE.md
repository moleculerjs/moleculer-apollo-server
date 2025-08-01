# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm test` - Run Jest tests with coverage
- `npm run ci` - Run tests in watch mode for development
- `npm run lint` - Run ESLint on src and test directories
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run dev` - Run development server with examples/index.js (simple example)
- `npm run dev full` - Run development server with examples/full/index.js (full example)
- `npm run deps` - Update dependencies interactively using ncu
- `npm run postdeps` - Automatically run tests after dependency updates

## Project Architecture

This is a **Moleculer mixin** that integrates Apollo GraphQL Server 5 with Moleculer API Gateway. The core architecture consists of:

### Core Components
- **src/service.js** - Main service mixin factory that returns a Moleculer service schema
- **src/ApolloServer.js** - Custom ApolloServer class extending @apollo/server
- **src/gql.js** - GraphQL template literal formatter utility
- **index.js** - Main module exports

### Key Architectural Patterns

**Service Mixin Pattern**: The library exports a factory function `ApolloService(options)` that returns a Moleculer service schema to be mixed into API Gateway services.

**Auto-Schema Generation**: GraphQL schemas are dynamically generated from:
- Service action definitions with `graphql` property containing `query`, `mutation`, or `subscription` fields
- Service-level GraphQL definitions in `settings.graphql` 
- Global typeDefs and resolvers passed to the mixin

**Action-to-Resolver Mapping**: Moleculer actions automatically become GraphQL resolvers when they include GraphQL definitions. The system creates resolver functions that call `ctx.call(actionName, params)`.

**DataLoader Integration**: Built-in DataLoader support for batch loading with automatic key mapping and caching via resolver configuration.

**WebSocket Subscriptions**: GraphQL subscriptions are handled through WebSocket connections with PubSub pattern integration.

### Testing Structure
- **test/unit/** - Unit tests for individual components
- **test/integration/** - Integration tests with full service setup
- Jest snapshots for schema generation testing

### Examples Structure
- **examples/simple/** - Basic setup demonstration
- **examples/full/** - Complete setup with multiple services, DataLoader, and complex resolvers

## Important Development Notes

**Schema Regeneration**: The GraphQL schema is automatically regenerated when services change (`$services.changed` event) unless `autoUpdateSchema: false`.

**TypeScript Support**: Full TypeScript definitions in index.d.ts with comprehensive interfaces for all configuration options.

**Node.js Version**: Requires Node.js >= 20.x.x (specified in package.json engines).