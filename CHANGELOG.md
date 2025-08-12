<a name="0.4.0"></a>
# 0.4.0 (2025-08-XX)

## Breaking Changes
- **Apollo Server 5**: Upgraded from Apollo Server 2 to Apollo Server 5
- **Node.js Requirements**: Now requires Node.js >= 20.x.x (updated from >= 10.x)
- **File Upload Removal**: Removed GraphQL file upload support because [Apollo Server 3+ no longer supports it](https://www.apollographql.com/docs/apollo-server/v3/migration#file-uploads).
- **Healthcheck Removal**: Built-in healthcheck endpoint removed because [Apollo Server 4+ no longer supports it](https://www.apollographql.com/docs/apollo-server/migration-from-v3#health-checks).
- **WebSocket Subscriptions**: Rewritten subscription function from `graphql-subscriptions` to `graphql-ws`.
- **Move from GraphQL Playground to Apollo Sandbox**: Apollo Server 3+ removes the GraphQL Playground. [It supports Apollo Sandbox.](https://www.apollographql.com/docs/apollo-server/v3/migration#graphql-playground)

## Major Updates
- **Modern Tooling**: Migrated from legacy ESLint config to flat config format
- **GitHub Actions**: Updated CI workflow to use latest GitHub Actions (v4) and test on Node.js 20.x, 22.x, 24.x
- **Dependencies**: Updated all dependencies to latest compatible versions
- **Configuration**: Replaced `.eslintrc.js` and `.prettierrc.js` with modern `eslint.config.js` and `prettier.config.js`
- **Async Methods**: Made `makeExecutableSchema` and `generateGraphQLSchema` methods async for better async/await support

## Removed Features
- Removed file upload examples and documentation
- Removed legacy Apollo Server 2/3 configuration options

## Documentation
- Updated README.md to reflect Apollo Server 5 compatibility
- Improved examples and removed outdated features

## Typescript types
- Improved Typescript d.ts file
- Exported helper interfaces `ApolloServiceSettings`, `ApolloServiceMethods`, `ApolloServiceLocalVars` to support Moleculer 0.15 Service generics
- Augmented Moleculer `ActionSchema` with graphql property.

--------------------------------------------------
<a name="0.3.8"></a>
# 0.3.8 (2023-04-23)

## Changes
- add `graphql.invalidate` event, to invalidate GraphQL Schema manually. [#122](https://github.com/moleculerjs/moleculer-apollo-server/pull/122)

--------------------------------------------------
<a name="0.3.7"></a>
# 0.3.7 (2022-10-04)

## Changes
- update dependencies
- fix CORS methods type definition. [#115](https://github.com/moleculerjs/moleculer-apollo-server/pull/115)
- add `skipNullKeys` resolver option. [#116](https://github.com/moleculerjs/moleculer-apollo-server/pull/116)
- add `checkActionVisibility` option. [#117](https://github.com/moleculerjs/moleculer-apollo-server/pull/117)

--------------------------------------------------
<a name="0.3.6"></a>
# 0.3.6 (2022-01-17)

## Changes
- custom `onConnect` issue fixed. [#105](https://github.com/moleculerjs/moleculer-apollo-server/pull/105)
- update dependencies

--------------------------------------------------
<a name="0.3.5"></a>
# 0.3.5 (2021-11-30)

## Changes
- Prepare params before action calling. [#98](https://github.com/moleculerjs/moleculer-apollo-server/pull/98)
- update dependencies

--------------------------------------------------
<a name="0.3.4"></a>
# 0.3.4 (2021-04-09)

## Changes
- disable timeout for `ws`.
- gracefully stop Apollo Server.
- add `onAfterCall` support.

--------------------------------------------------
<a name="0.3.3"></a>
# 0.3.3 (2020-09-08)

## Changes
- add `ctx.meta.$args` to store additional arguments in case of file uploading.

--------------------------------------------------
<a name="0.3.2"></a>
# 0.3.2 (2020-08-30)

## Changes
- update dependencies
- new `createPubSub` & `makeExecutableSchema` methods
- fix context in WS by [@Hugome](https://github.com/Hugome). [#73](https://github.com/moleculerjs/moleculer-apollo-server/pull/73)

--------------------------------------------------
<a name="0.3.1"></a>
# 0.3.1 (2020-06-03)

## Changes
- update dependencies
- No longer installing subscription handlers when disabled by [@Kauabunga](https://github.com/Kauabunga). [#64](https://github.com/moleculerjs/moleculer-apollo-server/pull/64)

--------------------------------------------------
<a name="0.3.0"></a>
# 0.3.0 (2020-04-04)

## Breaking changes
- transform Uploads to `Stream`s before calling action by [@dylanwulf](https://github.com/dylanwulf). [#71](https://github.com/moleculerjs/moleculer-apollo-server/pull/71)
 
## Changes
- update dependencies

--------------------------------------------------
<a name="0.2.2"></a>
# 0.2.2 (2020-03-04)

## Changes
- update dependencies

--------------------------------------------------
<a name="0.2.1"></a>
# 0.2.1 (2020-03-03)

## Changes
- add `autoUpdateSchema` option. [#63](https://github.com/moleculerjs/moleculer-apollo-server/pull/63)
- Allow multiple rootParams to be used with Dataloader child resolution. [#65](https://github.com/moleculerjs/moleculer-apollo-server/pull/65)

--------------------------------------------------
<a name="0.2.0"></a>
# 0.2.0 (2020-02-12)

## Breaking changes
- minimum required Node version is 10.x
- update dependencies and some require Node 10.x

## Changes
- Typescript definition files added.
- update dependencies
- integration & unit tests added.
- fix graphql undefined of issue when have others RESTful API node
- Avoid mutating in defaultsDeep calls and use proper key in called action params

--------------------------------------------------
<a name="0.1.3"></a>
# 0.1.3 (2019-10-16)

First initial version on NPM. UNTESTED.
